# Session Close Protocol

Before every commit at end of session:
1. Update `CHANGELOG.md` — add all changes under `[Unreleased]` or a new version block
2. Update `README.md` if file structure or usage changed
3. Confirm any pending memory file updates are written
4. Run:
   ```bash
   git add .
   git commit -m "session: YYYY-MM-DD — <summary>"
   git push
   ```