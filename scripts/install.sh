#!/bin/bash
set -euo pipefail
useradd -m codegen
npm install -g @anthropic-ai/claude-code
npm install @aws-sdk/client-bedrock-agent
