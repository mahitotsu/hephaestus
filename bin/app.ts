#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { HephaestusStack } from '../lib/hephaestus-stack';

const app = new cdk.App();

new HephaestusStack(app, 'HephaestusStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
