#!/bin/bash
# Mr. Bridge — Update reference subtrees to latest
# Run before any feature planning session

set -e

echo "[Mr. Bridge] Updating best-practice reference..."
git subtree pull \
  --prefix .claude/references/best-practice \
  https://github.com/shanraisshan/claude-code-best-practice \
  main --squash

echo "[Mr. Bridge] Best practices reference updated."
echo "Reference path: .claude/references/best-practice/"
