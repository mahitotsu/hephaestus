#!/bin/bash
set -euo pipefail
# Fetch system and task prompts from Bedrock Prompt Management
node --input-type=module << 'EOF'
import { BedrockAgentClient, GetPromptCommand } from '@aws-sdk/client-bedrock-agent';
import { writeFileSync } from 'fs';
const client = new BedrockAgentClient({ region: process.env.AWS_REGION });
const [sys, task] = await Promise.all([
  client.send(new GetPromptCommand({ promptIdentifier: process.env.SYSTEM_PROMPT_ARN })),
  client.send(new GetPromptCommand({ promptIdentifier: process.env.TASK_PROMPT_ARN })),
]);
writeFileSync('/tmp/system_prompt.txt', sys.variants[0].templateConfiguration.text.text);
writeFileSync('/tmp/task_prompt.txt', task.variants[0].templateConfiguration.text.text);
EOF
