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

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
