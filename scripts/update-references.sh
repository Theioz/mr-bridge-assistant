#!/bin/bash
# Mr. Bridge — Update reference submodules to latest
# Run before any feature planning session

set -e

echo "[Mr. Bridge] Updating reference submodules..."
git submodule update --remote --merge .claude/references/best-practice
echo "[Mr. Bridge] Best practices reference updated."
echo ""
echo "Reference path: .claude/references/best-practice/"
echo "Commit the submodule pointer update if you want to pin this version:"
echo "  git add .gitmodules .claude/references/best-practice"
echo "  git commit -m 'chore: update best-practice reference'"
