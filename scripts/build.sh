#!/bin/bash
set -euo pipefail
# Run as non-root so --dangerously-skip-permissions is permitted.
# -E preserves env vars (Bedrock credentials, ANTHROPIC_MODEL, etc.)
# -H sets HOME to /home/codegen so Claude Code config is isolated per build.
sudo -E -H -u codegen claude -p "$(cat /tmp/task_prompt.txt)" \
  --model "$ANTHROPIC_MODEL" \
  --append-system-prompt-file /tmp/system_prompt.txt \
  --dangerously-skip-permissions \
  --max-turns 30 \
  --no-session-persistence
