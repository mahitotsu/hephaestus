import * as fs from 'fs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as yaml from 'js-yaml';

// Locked to Haiku for cost optimization — do not change without business sign-off
const HAIKU_MODEL_ID = 'jp.anthropic.claude-haiku-4-5-20251001-v1:0';
// Base model ID used by cross-region inference internally (strips the "jp." prefix)
const HAIKU_BASE_MODEL_ID = 'anthropic.claude-haiku-4-5-20251001-v1:0';

const root = path.join(__dirname, '..');

function readText(relPath: string): string {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

export class HephaestusStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── AI Observability: Bedrock invocation logging → CloudWatch ─────────────
    //
    // AWS::Bedrock::LoggingConfiguration is an account-level singleton.
    // Deploying this stack will override any existing Bedrock logging config
    // in the target account + region.
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

    // CfnLoggingConfiguration is not yet in CDK 2.x — call the Bedrock SDK directly
    // via AwsCustomResource (Lambda-backed custom resource).
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
    //
    // Prompt text is loaded from prompts/*.txt at synth time.
    // To edit prompts without redeploying, use Bedrock Console → Prompt Management.
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

    // ── CodeBuild IAM Role ────────────────────────────────────────────────────
    // Cross-region inference profiles use "inference-profile" (with account ID),
    // unlike on-demand foundation models which use "foundation-model" (no account ID).
    const haikuModelArn =
      `arn:aws:bedrock:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:inference-profile/${HAIKU_MODEL_ID}`;

    const codeBuildRole = new iam.Role(this, 'CodeBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      description: 'CodeBuild execution role: Bedrock Haiku + prompt access, no API keys',
    });

    // InvokeModel scoped to Haiku — enforces cost ceiling.
    // The jp.* cross-region inference profile routes internally to ap-northeast-1 (Tokyo)
    // and ap-northeast-3 (Osaka). Foundation-model ARNs have no account ID.
    const haikuFoundationModelArns = [
      `arn:aws:bedrock:ap-northeast-1::foundation-model/${HAIKU_BASE_MODEL_ID}`,
      `arn:aws:bedrock:ap-northeast-3::foundation-model/${HAIKU_BASE_MODEL_ID}`,
    ];
    codeBuildRole.addToPolicy(new iam.PolicyStatement({
      sid: 'BedrockInvokeHaikuOnly',
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: [haikuModelArn, ...haikuFoundationModelArns],
    }));

    // Claude Code discovers inference profiles at startup — read-only, no cost impact
    codeBuildRole.addToPolicy(new iam.PolicyStatement({
      sid: 'BedrockDiscoverInferenceProfiles',
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:ListInferenceProfiles',
        'bedrock:GetInferenceProfile',
      ],
      resources: ['*'],
    }));

    // GetPrompt scoped to the two managed prompts created above
    codeBuildRole.addToPolicy(new iam.PolicyStatement({
      sid: 'BedrockGetManagedPrompts',
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:GetPrompt'],
      resources: [
        systemPrompt.attrArn,
        taskPrompt.attrArn,
      ],
    }));

    // CloudWatch Logs for CodeBuild build output
    const buildLogGroup = new logs.LogGroup(this, 'BuildLogs', {
      logGroupName: '/aws/codebuild/hephaestus',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    buildLogGroup.grantWrite(codeBuildRole);

    // ── CodeBuild Project ─────────────────────────────────────────────────────
    //
    // Source: replace Source.noSource() with Source.gitHub({...}) (or CodeCommit,
    // S3, etc.) to point Claude Code at your target repository.
    //
    // Buildspec is read from buildspec.yml at synth time via js-yaml so the file
    // stays a proper YAML document rather than being buried in TypeScript.
    const buildSpecObj = yaml.load(readText('buildspec.yml')) as Record<string, unknown>;

    new codebuild.Project(this, 'HephaestusProject', {
      projectName: 'hephaestus',
      role: codeBuildRole,
      // source omitted → CDK defaults to NO_SOURCE (inline buildspec only).
      // Replace with e.g. codebuild.Source.gitHub({...}) for a real repo.
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0, // Node 20, boto3 pre-installed
        computeType: codebuild.ComputeType.SMALL,
      },
      environmentVariables: {
        // Switches Claude Code CLI to Bedrock — IAM role provides credentials automatically
        CLAUDE_CODE_USE_BEDROCK: { value: '1' },
        // Locks the model to Haiku — must match the IAM allow list above
        ANTHROPIC_MODEL:         { value: HAIKU_MODEL_ID },
        // Prompt ARNs resolved at deploy time from the CfnPrompt resources above
        SYSTEM_PROMPT_ARN:       { value: systemPrompt.attrArn },
        TASK_PROMPT_ARN:         { value: taskPrompt.attrArn },
      },
      logging: {
        cloudWatch: {
          logGroup: buildLogGroup,
          enabled: true,
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject(buildSpecObj),
    });

    // ── Stack Outputs ─────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'SystemPromptArn', {
      value: systemPrompt.attrArn,
      description: 'System prompt ARN — edit content in Bedrock Console without redeploying',
    });
    new cdk.CfnOutput(this, 'TaskPromptArn', {
      value: taskPrompt.attrArn,
      description: 'Task prompt ARN — edit content in Bedrock Console without redeploying',
    });
    new cdk.CfnOutput(this, 'BuildLogGroup', {
      value: buildLogGroup.logGroupName,
      description: 'CloudWatch log group for CodeBuild agent output',
    });
    new cdk.CfnOutput(this, 'BedrockObservabilityLogGroup', {
      value: bedrockLogGroup.logGroupName,
      description: 'CloudWatch log group for Bedrock AI Observability (invocation logs)',
    });
  }
}
