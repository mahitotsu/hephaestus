#!/bin/bash
set -euo pipefail
mkdir -p output
chown codegen:codegen output

# Substitute CodeBuild env vars into the task prompt before passing to Claude
TASK=$(sed \
  -e "s|\${STACK_NAME}|${STACK_NAME}|g" \
  -e "s|\${REPORTS_BUCKET}|${REPORTS_BUCKET}|g" \
  -e "s|\${AWS_REGION}|${AWS_REGION}|g" \
  /tmp/task_prompt.txt)

# Run as non-root so --dangerously-skip-permissions is permitted.
# -E preserves env vars (Bedrock credentials, ANTHROPIC_MODEL, MCP proxy, etc.)
# -H sets HOME to /home/codegen so Claude Code config is isolated per build.
sudo -E -H -u codegen claude -p "$TASK" \
  --model "$ANTHROPIC_MODEL" \
  --append-system-prompt-file /tmp/system_prompt.txt \
  --dangerously-skip-permissions \
  --max-turns 30 \
  --no-session-persistence

# Upload the generated report to S3 for the Lambda viewer
REPORT_KEY="reports/$(date -u +%Y%m%dT%H%M%SZ).md"
aws s3 cp output/report.md "s3://${REPORTS_BUCKET}/${REPORT_KEY}"
echo "Report uploaded: s3://${REPORTS_BUCKET}/${REPORT_KEY}"
