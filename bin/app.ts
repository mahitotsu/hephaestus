#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { HephaestusPipelineStack } from '../lib/pipeline-stack';

const app = new cdk.App();
new HephaestusPipelineStack(app, 'HephaestusPipelineStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
