## Summary

<!-- What does this PR do? Why? 1-3 bullets. -->

-

## Test plan

<!-- How was this tested? What should a reviewer check? -->

- [ ]

## Related issue

Closes #

---

## Security checklist

<!-- Complete this section for any PR that adds or modifies environment variables or secrets. -->

- [ ] **No new secrets added as plaintext** — all secrets live in Vercel env vars, never in source code or committed files.
- [ ] **New env vars added to Vercel with the Sensitive flag** — every non-public env var must have Sensitive checked in the Vercel dashboard before the PR merges.
- [ ] **Template files updated** — `.env.example` and `web/.env.local.example` use `<placeholder>` values, not real secrets.
- [ ] **No accidental secret commits** — ran `git log -p -S "<key-prefix>"` or checked `git diff` for real-looking values before pushing.
