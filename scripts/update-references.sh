#!/bin/bash
# Mr. Bridge — Update reference subtrees to latest
# Run before any feature planning session

set -e

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" == "main" ]]; then
  echo "ERROR: update-references.sh must not run on main — it commits to the current branch." >&2
  echo "Create a feature branch first: git checkout -b feature/<name>" >&2
  exit 1
fi

echo "[Mr. Bridge] Updating best-practice reference..."
git subtree pull \
  --prefix .claude/references/best-practice \
  https://github.com/shanraisshan/claude-code-best-practice \
  main --squash

echo "[Mr. Bridge] Best practices reference updated."
echo "Reference path: .claude/references/best-practice/"
