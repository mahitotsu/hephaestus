#!/bin/bash
set -euo pipefail

# claude is at $HOME/.npm-global/bin, uvx (MCP proxy) at $HOME/.local/bin
export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"

mkdir -p output

# Substitute CodeBuild env vars into the task prompt before passing to Claude
TASK=$(sed \
  -e "s|\${STACK_NAME}|${STACK_NAME}|g" \
  -e "s|\${REPORTS_BUCKET}|${REPORTS_BUCKET}|g" \
  -e "s|\${AWS_REGION}|${AWS_REGION}|g" \
  -e "s|\${CODEBUILD_BUILD_ID}|${CODEBUILD_BUILD_ID:-unknown}|g" \
  -e "s|\${CODEBUILD_BUILD_NUMBER}|${CODEBUILD_BUILD_NUMBER:-unknown}|g" \
  -e "s|\${CODEBUILD_RESOLVED_SOURCE_VERSION}|${CODEBUILD_RESOLVED_SOURCE_VERSION:-unknown}|g" \
  -e "s|\${CODEBUILD_INITIATOR}|${CODEBUILD_INITIATOR:-unknown}|g" \
  -e "s|\${CODEBUILD_SOURCE_REPO_URL}|${CODEBUILD_SOURCE_REPO_URL:-unknown}|g" \
  /tmp/task_prompt.txt)

# Lambda compute runs as non-root, so --dangerously-skip-permissions is permitted directly
claude -p "$TASK" \
  --model "$ANTHROPIC_MODEL" \
  --append-system-prompt-file /tmp/system_prompt.txt \
  --dangerously-skip-permissions \
  --max-turns 30 \
  --no-session-persistence

# Upload the generated report to S3 for the Lambda viewer
REPORT_KEY="reports/$(date -u +%Y%m%dT%H%M%SZ).md"
aws s3 cp output/report.md "s3://${REPORTS_BUCKET}/${REPORT_KEY}"
echo "Report uploaded: s3://${REPORTS_BUCKET}/${REPORT_KEY}"
