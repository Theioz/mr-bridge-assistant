# Mr. Bridge

@.claude/rules/core.md

## Project memory (cross-device, private)

Durable project facts — coaching/health state, self-host architecture, decisions,
gotchas — live **committed** in the **private** `jl-homelab` repo at
`.claude/memory/mrbridge/` (locally `~/jl-homelab/.claude/memory/mrbridge/`).

**This repo is public, so that memory must NEVER be written here** — it contains
personal health data. The private repo keeps it consistent across devices via `git pull`.

- At session start, read `~/jl-homelab/.claude/memory/mrbridge/README.md` (the index),
  then the files relevant to the task.
- Write durable facts THERE (committed via PR to jl-homelab), not only into the
  device-local `~/.claude` auto-memory store, which does not sync between machines.
- This is distinct from the "Memory Update Rules" in `core.md`, which govern **live app
  data** in Supabase — a different thing.
