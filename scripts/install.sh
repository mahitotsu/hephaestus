#!/bin/bash
set -euo pipefail

# Lambda compute runs as non-root — install Claude Code to a user-writable prefix
export NPM_CONFIG_PREFIX="$HOME/.npm-global"
npm install -g @anthropic-ai/claude-code

# Bedrock agent SDK used by pre_build.sh (local install, picked up from ./node_modules)
npm install @aws-sdk/client-bedrock-agent

# Install uv via binary installer (provides uvx for the MCP proxy)
curl -LsSf https://astral.sh/uv/install.sh | sh
