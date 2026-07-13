#!/usr/bin/env bash
# Launcher for the Mr Bridge MCP server (see .mcp.json).
#
# Secrets live OUTSIDE the repo, on purpose. The service-role key, ENCRYPTION_KEY
# and OAuth client secrets must never sit in the working tree of a repo that gets
# `git add -A`'d — .gitignore is one typo away from publishing them. This script
# is committed; the env file it reads is not, and never enters the tree.
#
#   MRB_ENV_FILE  path to the env file  (default: ~/.mrb-secrets/env)
#
# Populate it from Vaultwarden:  bw get notes mr-bridge-env > ~/.mrb-secrets/env
set -euo pipefail

ENV_FILE="${MRB_ENV_FILE:-$HOME/.mrb-secrets/env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "[mr-bridge-mcp] no env file at $ENV_FILE" >&2
  echo "[mr-bridge-mcp] create it with: bw get notes mr-bridge-env > $ENV_FILE && chmod 600 $ENV_FILE" >&2
  exit 1
fi

# Export only well-formed KEY=VALUE lines. Do NOT `source` the file: values can
# contain shell metacharacters (Vercel's own env dump breaks `.` for exactly this
# reason) and sourcing would execute them.
while IFS= read -r line; do
  [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
  key="${line%%=*}"
  val="${line#*=}"
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  export "$key=$val"
done < "$ENV_FILE"

cd "$(dirname "$0")/.."   # web/
exec npx tsx mcp/server.ts
