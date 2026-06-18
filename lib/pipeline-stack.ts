import * as fs from 'fs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';

// Locked to Haiku for cost optimization — do not change without business sign-off
const HAIKU_MODEL_ID = 'jp.anthropic.claude-haiku-4-5-20251001-v1:0';
const HAIKU_BASE_MODEL_ID = 'anthropic.claude-haiku-4-5-20251001-v1:0';

const root = path.join(__dirname, '..');

function readText(relPath: string): string {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

export class HephaestusPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── Bedrock AI Observability ──────────────────────────────────────────────
    const bedrockLogGroup = new logs.LogGroup(this, 'BedrockInvocationLogs', {
      logGroupName: '/aws/bedrock/invocations',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const bedrockLoggingRole = new iam.Role(this, 'BedrockLoggingRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      description: 'Allows Bedrock to write model invocation logs to CloudWatch',
    });
    bedrockLogGroup.grantWrite(bedrockLoggingRole);

    new cr.AwsCustomResource(this, 'BedrockAiObservability', {
      onCreate: {
        service: 'Bedrock',
        action: 'putModelInvocationLoggingConfiguration',
        parameters: {
          loggingConfig: {
            cloudWatchConfig: {
              logGroupName: bedrockLogGroup.logGroupName,
              roleArn: bedrockLoggingRole.roleArn,
            },
            textDataDeliveryEnabled: true,
          },
        },
        physicalResourceId: cr.PhysicalResourceId.of('BedrockModelInvocationLogging'),
      },
      onUpdate: {
        service: 'Bedrock',
        action: 'putModelInvocationLoggingConfiguration',
        parameters: {
          loggingConfig: {
            cloudWatchConfig: {
              logGroupName: bedrockLogGroup.logGroupName,
              roleArn: bedrockLoggingRole.roleArn,
            },
            textDataDeliveryEnabled: true,
          },
        },
        physicalResourceId: cr.PhysicalResourceId.of('BedrockModelInvocationLogging'),
      },
      onDelete: {
        service: 'Bedrock',
        action: 'deleteModelInvocationLoggingConfiguration',
        physicalResourceId: cr.PhysicalResourceId.of('BedrockModelInvocationLogging'),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: [
            'bedrock:PutModelInvocationLoggingConfiguration',
            'bedrock:DeleteModelInvocationLoggingConfiguration',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: ['iam:PassRole'],
          resources: [bedrockLoggingRole.roleArn],
        }),
      ]),
    });

    // ── Bedrock Prompt Management ─────────────────────────────────────────────
    const systemPrompt = new bedrock.CfnPrompt(this, 'SystemPrompt', {
      name: 'hephaestus-system-prompt',
      description: 'System prompt loaded into CLAUDE.md — defines Claude Code behaviour',
      variants: [{
        name: 'default',
        templateType: 'TEXT',
        templateConfiguration: { text: { text: readText('prompts/system-prompt.txt') } },
      }],
    });

    const taskPrompt = new bedrock.CfnPrompt(this, 'TaskPrompt', {
      name: 'hephaestus-task-prompt',
      description: 'Task prompt passed to `claude -p` — defines the specific work item',
      variants: [{
        name: 'default',
        templateType: 'TEXT',
        templateConfiguration: { text: { text: readText('prompts/task-prompt.txt') } },
      }],
    });

    // ── Pipeline ──────────────────────────────────────────────────────────────
    const connectionArn = this.node.tryGetContext('connectionArn') as string | undefined;
    if (!connectionArn) {
      throw new Error(
        'CDK context "connectionArn" is required. Set it in cdk.json under "context".',
      );
    }

    const source = pipelines.CodePipelineSource.connection(
      'mahitotsu/hephaestus',
      'main',
      { connectionArn },
    );

    const pipeline = new pipelines.CodePipeline(this, 'Pipeline', {
      pipelineName: 'hephaestus',
      selfMutation: true,
      synth: new pipelines.ShellStep('Synth', {
        input: source,
        commands: ['npm ci', 'npm run build', 'npx cdk synth'],
      }),
    });

    // ── Build wave ────────────────────────────────────────────────────────────
    const haikuModelArn =
      `arn:aws:bedrock:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:inference-profile/${HAIKU_MODEL_ID}`;
    const haikuFoundationModelArns = [
      `arn:aws:bedrock:ap-northeast-1::foundation-model/${HAIKU_BASE_MODEL_ID}`,
      `arn:aws:bedrock:ap-northeast-3::foundation-model/${HAIKU_BASE_MODEL_ID}`,
    ];

    const wave = pipeline.addWave('Hephaestus');
    wave.addPost(new pipelines.CodeBuildStep('RunClaudeCode', {
      input: source,
      partialBuildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': { nodejs: '20' },
            commands: ['bash scripts/install.sh'],
          },
          pre_build: {
            commands: ['bash scripts/pre_build.sh'],
          },
        },
      }),
      commands: ['bash scripts/build.sh'],
      buildEnvironment: {
        environmentVariables: {
          CLAUDE_CODE_USE_BEDROCK: { value: '1' },
          ANTHROPIC_MODEL:         { value: HAIKU_MODEL_ID },
          SYSTEM_PROMPT_ARN:       { value: systemPrompt.attrArn },
          TASK_PROMPT_ARN:         { value: taskPrompt.attrArn },
        },
      },
      rolePolicyStatements: [
        new iam.PolicyStatement({
          sid: 'BedrockInvokeHaikuOnly',
          actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
          resources: [haikuModelArn, ...haikuFoundationModelArns],
        }),
        new iam.PolicyStatement({
          sid: 'BedrockDiscoverInferenceProfiles',
          actions: ['bedrock:ListInferenceProfiles', 'bedrock:GetInferenceProfile'],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          sid: 'BedrockGetManagedPrompts',
          actions: ['bedrock:GetPrompt'],
          resources: [systemPrompt.attrArn, taskPrompt.attrArn],
        }),
      ],
    }));
  }
}
