import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as path from 'path';
import { Construct } from 'constructs';

export class AppStack extends cdk.Stack {
  readonly reportsBucketName: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, { stackName: 'hephaestus-app', ...props });

    const reportsBucket = new s3.Bucket(this, 'ReportsBucket', {
      bucketName: `hephaestus-reports-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    this.reportsBucketName = reportsBucket.bucketName;

    const handler = new lambda_nodejs.NodejsFunction(this, 'Handler', {
      entry: path.join(__dirname, '..', 'lambda', 'index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: {
        REPORTS_BUCKET: reportsBucket.bucketName,
      },
    });
    reportsBucket.grantRead(handler);

    const fnUrl = handler.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    new cdk.CfnOutput(this, 'FunctionUrl', { value: fnUrl.url });
    new cdk.CfnOutput(this, 'ReportsBucket', { value: reportsBucket.bucketName });
  }
}
