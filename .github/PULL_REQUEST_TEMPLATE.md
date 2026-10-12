## Summary

<!-- What does this PR do? Why? 1-3 bullets. -->

-

## Test plan

<!-- How was this tested? What should a reviewer check? -->

- [ ]

## Related issue

Closes #

## Checklist

- [ ] `CHANGELOG.md` updated under `## [Unreleased]`
- [ ] `README.md` updated if structure or usage changed; `node scripts/check-docs.mjs` passes
- [ ] UI changes: `bash scripts/lint-tokens.sh` passes
- [ ] Migrations: none, **or** listed here and applied by hand to the self-hosted Supabase **before** the container is rebuilt (then reload PostgREST's schema cache)

---

## Security checklist

<!-- Complete this section for any PR that adds or modifies environment variables or secrets. -->

- [ ] **No new secrets added as plaintext** — secrets live in the host's untracked env file on compute-core (sourced from Vaultwarden), never in source code or committed files.
- [ ] **New env vars documented** — added to the host env file before deploy and to the example templates below.
- [ ] **Template files updated** — `.env.example` and `web/.env.local.example` use `<placeholder>` values, not real secrets.
- [ ] **No accidental secret commits** — ran `git log -p -S "<key-prefix>"` or checked `git diff` for real-looking values before pushing.
