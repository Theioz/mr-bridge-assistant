# Feature Development Protocol

When planning new features or making non-trivial changes:

1. **Pull latest best practices** before starting:
   ```bash
   bash scripts/update-references.sh
   ```
2. **Create a feature branch**:
   ```bash
   git checkout -b feature/<short-description>
   ```
3. Reference `.claude/references/best-practice/` for patterns and conventions
4. Implement changes on the branch
5. Open a pull request — do not push directly to `main`
6. PR title format: `feat: <description>` / `fix: <description>` / `chore: <description>`

## Reference Index
| Resource | Location | Purpose |
|----------|----------|---------|
| Claude Code best practices | `.claude/references/best-practice/` | Patterns for agents, skills, commands, hooks, MCP |
| Update reference: | `bash scripts/update-references.sh` | Pull latest before feature work |