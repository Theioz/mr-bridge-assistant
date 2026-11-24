# Changelog

All notable changes to Mr. Bridge are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

---

## [Unreleased]

### Security

- **The public share host is scoped inside the app as well as at the reverse proxy.** On the
  share host the app now serves `GET`/`HEAD /share/*` and nothing else
  ([`lib/share-host.ts`](web/src/lib/share-host.ts), checked first in
  [`src/proxy.ts`](web/src/proxy.ts)); it is inactive unless `SHARE_BASE_URL` names a
  different host from `APP_URL`. The proxy matcher now lists static assets by name instead of
  skipping every path with an image, CSS or JS extension, so no route can bypass the proxy by
  ending in `.png`. Share pages send `robots: noindex, nofollow`.

### Added

- **Nutrition: Claude as the food-identification model, Ollama as the fallback.** Every
  `chatJSON` call — meal photo identification, nutrition-label OCR, meal-text parsing, USDA
  candidate picks, meal suggestions, scan-chat intents and exercise descriptions — goes to the
  Anthropic API (`claude-opus-5-5`, structured JSON outputs) when `ANTHROPIC_API_KEY` is set, and to
  local Ollama otherwise. `LLM_PROVIDER=ollama|anthropic` forces one; an unknown value throws. On
  compute-core (no GPU) a photo took minutes of CPU prompt-eval and still misidentified mixed
  plates. USDA still supplies every gram and calorie — the model's job is unchanged. Effort is
  `medium` for image calls and `low` for text; refusals fall back server-side
  (`fallbacks: "default"`). Labels are shrunk to the API's 2576 px edge on the Claude path only. New:
  `web/src/lib/nutrition/llm-anthropic.ts` (SDK call) and `llm-provider.ts` (dependency-free
  switch + schema helpers), `@anthropic-ai/sdk` 1.3.0.
- **Recipes: a "Makes N portions" box that rescales the ingredient list.** Both the planned-meal
  detail and the Recipes tab show it on any recipe with structured `ingredients_json`, starting at
  the recipe's `typical_portions` (the batch size Mr. Bridge wrote it for). Changing it rescales the
  amounts and the "Whole recipe (N)" macro line for display only - nothing is saved, so the stored
  recipe, its per-serving macros and the grocery list are unaffected. Weighed units (g, ml) round to
  whole numbers and counted units (tbsp, clove, can) to the nearest quarter; a scaled row hides its
  `note`, which was written about the stored amount. Steps are free text and are not rescaled; the
  detail view says so when the count differs. New `scaleIngredients` in `lib/units.ts`, tested in
  `src/__tests__/scale-ingredients.test.ts`; `typical_portions` added to the `/meals` recipes query.

- **Job Scout v3: Mr. Bridge becomes the job-application tracker, with a Jobs tab.** Notion's free
  plan caps database queries, and reading back ~1,200 filtered roles to dedupe killed the 2026-10-27
  run. Migration `20261027120000_jobs.sql` adds `jobs` (one row per posting url: the scout pipeline
  `stage` / reason / score / first + last seen / feedback, plus the tracker: `status`, applied and
  rejected dates, fit, level, req id, pay, notes, `source` job_scout / manual / notion_import and a
  link to the Notion prep page) and `job_scout_reports` (the agent's daily markdown report + stats).
  `scripts/job_scout.py` is the homelab half (no LLM): `collect` fetches the configured job boards
  (logic moved from the Notion-hosted fetcher into stdlib-only `scripts/_job_scout.py`), inserts new
  roles, bumps `last_seen` on known ones and writes the ranking agent's inbox (new roles, unsent
  feedback, preferences, the current tracker); `--dry-run` skips the database. `ingest` applies the
  agent's decisions file (rejecting a malformed one before any write), puts recommended and
  "Want this" roles in the tracker as To apply without ever downgrading a status, and stores the
  report. `scripts/import_notion_tracker.py` is the one-time import of the Notion tracker export.
  `/jobs` shows the report (with past dates), the tracker (filter by status, one-tap status change
  that stamps applied/rejected dates, edit fit/level/dates/pay/notes, add a role by hand via
  `POST /api/jobs`), applied this week vs the 8/week target, and every filtered role with its reason
  and Want this / Not for me / Wrong reason feedback (`PATCH /api/jobs/<id>`). A Workday posting
  with no title no longer drops the whole company (seen with Nvidia on 2026-10-27).

- **Android app: a sideloaded Capacitor shell over the live web app (#782).** New `android/`
  directory, with Capacitor 8.5.3 and the Gradle project in `android/native`. `server.url` loads
  `https://mr-bridge.<your-domain>/dashboard` full screen, so web deploys reach the app
  without a rebuild. `www/offline.html` is shown when the tailnet is unreachable. The launcher
  icon, themed icon and splash use vector drawables made from `web/src/app/icon.svg`'s path, with
  no raster assets. Release signing reads `~/.mrb-android/keystore.properties`, outside the
  public repo. Without it, `build.sh` refuses to build rather than sign with another key, because
  a key change forces an uninstall that wipes app data. `scripts/setup-toolchain.sh` installs
  JDK 21 and the Android command-line tools on macOS (Homebrew) or Linux/WSL (apt plus a
  SHA-1-verified Google zip), with no Android Studio. `build.sh` builds and verifies the signed
  APK, and `install.sh` installs it over Wireless debugging (`adb install -r` keeps app data).
  Runbook: `android/README.md`. Google OAuth can't run in a WebView (`disallowed_useragent`), so
  integrations are connected from Chrome.

- **Program tracking: weekly scorecard, drink logging, travel-aware coaching.** Migration
  `20261019120000_program_tracking.sql` adds `meal_log.standard_drinks` (US standard drinks, 14 g
  ethanol), `meal_log.origin` (home/restaurant/delivery/travel), `meal_plans.is_cheat`, and a
  `body_measurements` table (waist; kept out of `fitness_log` so a tape row can never read as the
  latest weigh-in). `coach_check.py --weekly` now pushes a plain-numbers scorecard built by the
  stdlib-only `scripts/_scorecard.py`. It covers: 7-day weight vs the prior week and the planned
  trajectory line, a 28-day landing projection, lifts, days at the steps goal, food averages,
  cheat meals, delivery orders, drinks vs the profile limits, and the alcohol share of the food
  deficit. Weigh-ins on trip days and the 3 days after are excluded from the weight numbers, and
  a miss on a travel day is not counted. The goal weight and the session count are read from
  `profile` instead of being hardcoded. New profile keys: `steps_goal`, `waist_goal_in`,
  `phase_start_date`, `phase_start_weight`, `target_rate_lb_wk`, `tdee_estimate`,
  `alcohol_weekly_cap`, `alcohol_dry_days_min`, `alcohol_max_per_occasion`,
  `alcohol_earliest_hour`, `cheat_meals_per_week`. The planner prompt and the `plan-week` skill
  carry the session shape, the two-formula prep system, plate limits, the flagged cheat meal and
  the travel rules. `_travel.py` gains `stay_days()` / `excluded_weigh_ins()`, and six movements are
  mapped in the validator. Tests: `tests/test_scorecard.py`.

- **Amazon Fresh listing labels are captured into `packaged_foods` at pin time (#785).** Most
  Fresh product pages carry the Nutrition Facts panel as hidden text. The `amazon-cart` skill
  reads it (`.claude/skills/amazon-cart/scripts/read-nutrition.js`) when it adds or pins a
  product, and `pin_grocery_product` stores it in the packaged-food catalog linked to the pin, so
  a product arrives with label macros instead of waiting for a photograph. Only the panel text
  crosses the tool boundary; the numbers are parsed server-side
  (`web/src/lib/nutrition/listing-label.ts`), so no model supplies a macro. Servings are
  recomputed when servings x serving size misses the title net weight by more than 15%; energy
  more than 20% off 4P+4C+9F is flagged; values that are not on FDA rounding are refused. A
  photographed or hand-edited catalog row is never overwritten, and a photo-only listing is
  reported as needing a photo on delivery.

### Fixed

- **Oura sync no longer blanks the first day of its window.** `/sleep` and `/daily_activity`
  leave out the `start_date` day, while the `daily_*` score endpoints include it. So the
  window's first day came back with readiness but no sleep or steps, and the upsert
  overwrote that day's good `recovery_metrics` row with NULL sleep, HRV, resting HR, bedtime
  and steps. Every day eventually becomes the first day of some run, so rows went blank one
  day per run: only the newest days ever looked complete, and every run logged `status: ok`.
  Reproduced with `--days 13/14/15`, each of which blanked exactly its own start date. The
  sync now fetches from one day before the window and writes only the dates inside it.
- **Oura sync looks back 14 days instead of 3** (`DEFAULT_OURA_SYNC_DAYS`, #781), so a run that
  fails is covered by the next. This was first shipped as the fix for the blank rows above,
  and it did not fix them; the window-start fix does. Late steps data can now auto-complete
  the "10,000 Steps" habit up to 14 days back. As before, it never un-completes a day.

### Changed

- **/jobs tweaks from use with real data.** The Job Scout report now separates roles: every
  `##`/`###` heading after the first gets a rule above it, and `---` renders as a rule. List
  items show real bullets (indent two spaces to nest), and report links read as links. The
  tracker and filtered tables gain a "#" column, the 1-based row number in the current
  filter/search/sort order, pinned with Role on a phone. The Notion page link is gone from the
  table and the peek (imported Notion urls open "page not found"); the column stays in the DB.

- **/jobs looks like a Notion database.** Jason's feedback on the first version: stacked cards
  fit ~3 roles per screen. The tracker and the filtered roles are now compact tables
  (`components/jobs/DataTable.tsx`): sticky header, one 38px line per role with ellipsis, hover
  highlight, click a header to sort, the Role column pinned while a phone scrolls sideways.
  Status, fit, stage and feedback are coloured pills; clicking status/fit/feedback opens a small
  keyboard-operable menu of pills (`PillSelect.tsx`; same `PATCH /api/jobs/<id>` and applied/
  rejected auto-dates). Clicking a row opens a side peek (`JobPeek.tsx`; a full-screen sheet on a
  phone) with every property editable in place, the full notes and the Job Scout reason and
  feedback note; "+ New" uses the same peek and replaces the add-role form. View tabs (Open / To
  apply / Applied / Interviewing / Rejected / All) with counts and a search over role, company
  and notes; the filtered table keeps its server-side stage / company / title / toggle filters.
  The header is a one-line stat strip and the report collapses unless it is today's.
  `notion_page_url` is now editable. Pure helpers in `lib/jobs/table.ts` (tested).

- **The three oversized client components are split into modules (#777).** No behaviour change;
  code was moved, not rewritten. `MealsClient.tsx` 2,051 → 316 lines: one file per tab
  (`TodayTab`, `RecipesTab`, `PlanTab`, `TrendsTab`), plus `MealRows`, `PastMeals` and
  `meals-shared.ts`; its type re-exports keep `meals/page.tsx` unchanged. `LibraryClient.tsx`
  2,675 → 426 lines: state, paging and the import/reorder/delete handlers move to
  `useLibraryItems.ts`, and `SearchModal`, `ItemRow`, `CoverGrid`, `SummaryStrip`,
  `LibraryFilterBar`, `ShareButton` and `TypePickerModal` to `library/components/`.
  `FoodPhotoAnalyzer.tsx` 1,952 → 422 lines: three hooks (`usePhotoQueue`, `useScanItems`,
  `useManualEntry`) and 17 section components under `meals/food-photo/`; the copy-pasted
  re-estimate/re-scan merge is now one `applyEstimate()`. Log, meal-prep and chat state stay in the
  parent because they depend on items, totals and the router. `lint-tokens.sh`: the `#fff`
  cover-overlay exemption follows the code to `CoverGrid.tsx`, and the stale `FoodPhoto` exemption
  is removed (that code has no raw hex).

### Documentation

- **Documentation reset against the code and the running deployment.** `README.md` is now a short
  description of a single-user deployment (what it is, the routes that exist, how it runs, a docs
  index, the developer quick-start); the setup guide, file tree and duplicated self-hosting
  section are gone. New `docs/OPERATIONS.md` covers deploying, applying migrations, which env
  file each process reads, the schedule and backups. `docs/ARCHITECTURE.md` and
  `docs/SECURITY.md` describe the nutrition model, the secret inventory, `CRON_SECRET`'s scope
  and the auth model as they are; the architecture diagram shows the Anthropic API.
- **Docs and templates use placeholders** (`<your-domain>`, `<user>@<host>`) in place of the
  deployment's hostnames, and name the self-hosting migration in words where they used an issue
  number from another repository.
- **`CHANGELOG.md` holds 2.0.0 onward**; 1.x moved to `docs/history/CHANGELOG-1.x.md`, and the
  2026-04 rotation log to `docs/history/`. Links in 2.0.0 entries to files since deleted are
  now plain text. The 2.0.0 date is corrected to the tag's (2026-10-12).
- **`scripts/check-docs.mjs` checks every current doc, not only the README**: tool counts,
  backticked repo paths, env vars read by code against both example files (both directions),
  stale terms, issue numbers from another repository, relative links and anchors, and real
  hostnames. The `docs` CI job runs when docs, `.claude/`, `scripts/`, `android/` or the env
  templates change.

## [2.0.0] — 2026-10-12

The self-hosted, single-user release. Since 1.1.0, Mr. Bridge has left Vercel and Supabase Cloud
for a homelab node, dropped the Anthropic API and the in-app chat in favour of Claude Code over a
local MCP server (50 tools), and dropped multi-tenancy for self-hosting. It is now a closed
plan → buy → cook → eat → train loop: USDA-pinned nutrition, batch cooks and leftovers, a kitchen
inventory, a grocery list with pinned Amazon Fresh products and an add-to-cart skill that never
checks out, training plans, recurring tasks, a media library with Plex sync, and a hardened
notification and status layer. GA hardening is tracked in #761.

### Added

- **Scheduled journal reminder (#761).** `scripts/check_journal_reminder.py` pushes at 7 PM Pacific
  only when today has no journal entry, and reports to Settings → Status. It replaces the
  `journal-reminder` Claude agent, which described a 7 PM run that nothing scheduled and checked
  the UTC date (so after 5 PM Pacific it looked at tomorrow) without filtering by user. The
  Notifications page filters now match the types actually sent: Today, Tasks, Training, Journal,
  Birthdays and System. HRV and Weather became lines in the morning summary, so no push could ever
  match those filters. Also: a dead `heatmap.tsx` exemption removed from `lint-tokens.sh`, and the
  `weekly_plan.py` usage corrected to its real subcommands.
- **Dashboard re-layout, re-entry mode, travel mode (#761).** The dashboard is now ordered for a
  phone check-in: greeting and weather, then **Today's food** (the next planned meal not yet
  logged, with a one-tap "Ate this" through the existing `POST /api/meals/eat`, plus today's
  macros against targets), today's workout, habits, recovery/health, schedule, tasks, and
  watchlist/sports last. The eat call (`lib/nutrition/eat-client.ts`), the eat-target rule
  (`lib/nutrition/next-meal.ts`), the macro sums/targets (`lib/nutrition/daily-macros.ts`) and the
  macro bars (`components/meals/MacroBars.tsx`) were extracted from the Meals page so both surfaces
  share them; a plan with no macros to log gets no button on the dashboard, so it can never be
  marked eaten without a `meal_log` row. **Re-entry:** after 3+ days with no hand-entered log
  (`meal_log`, `habits`, `strength_sessions`, `journal_entries`; `lib/reentry.ts`), one calm card
  says "Welcome back. Start from today." with two forward actions. It shows no missed-day counts,
  no streaks and no backfill prompt, and can be dismissed for the day. The same signal is exposed to
  Claude as the new **`get_logging_status`** MCP tool (49 tools). **Travel:** a "Stay at …" calendar
  event covering today (`lib/travel/stay.ts`, mirrored in `scripts/_travel.py`) shows "Traveling —
  <city> until <date>", moves the dashboard and morning-summary weather to the stay's location, and
  replaces the empty-meal-plan prompt with "Meal plans are paused". The morning summary also leads
  with "Traveling: <city>" and drops "Meals: nothing planned". Nothing is written to `profile`;
  home weather returns when the event ends.
- **Delivered groceries go into the kitchen (#4, Phase 3) and every cook draws inventory (#761).**
  New MCP tool `receive_grocery_order`: a delivered Amazon Fresh order (ASINs + packs, read from
  the order details page) becomes `inventory_items` rows in **grams** (pack grams × packs, or a
  count for per-item produce). Rows carry the pin's `fdc_id` / `packaged_food_id`, so the next
  "Cooked it" draws them by identity. Unpinned products are reported, never guessed; location
  follows where that food was last kept; and it is idempotent per Amazon order number, since a
  second receipt would double the fridge. `amazon-cart` gains the receiving step. Separately, when
  "Ate this" on a recipe-backed plan finds no leftover to spend, it cooks one portion and **now
  draws its ingredients from inventory**, as `POST /api/cooks` does. Before, the single-serving case
  (a yogurt bowl eaten straight from the plan) never took its ingredients off the shelf.
  `createItem` accepts `fdc_id`, `packaged_food_id` and `metadata`.
- **Settings → Status and an honest notification pipeline (#761).** Status (replacing the
  multi-tenant "Usage" quota tab) lists every scheduled job and data source with its last success,
  flagging late, failing and never-run ones. It reads `sync_log`, which every Python cron job now
  writes through `scripts/_joblog.py`, against a registry shared with the checker
  (`web/src/lib/status/jobs.json`). `scripts/check_stale_signals.py` covers what Uptime Kuma's cron
  heartbeats cannot: a data source going stale inside a green `/api/cron/sync` run. It fails its own
  heartbeat with the reason, so Kuma pages it. One delivery path, `scripts/_push.py`
  (`notify.sh` now wraps it), sends every push to ntfy AND the in-app Notifications history.
  Task-due and coach pushes had been firing for weeks without appearing there. It exits non-zero
  when ntfy refuses, and no longer logs the ntfy topic. **New morning summary**
  (`check_morning_summary.py`): weather (storm, heat, freeze and wind flags), last night's recovery
  (HRV-drop flag), today's workout, planned meals and due tasks in one push. It replaces
  `check_weather_alert.py`, `check_hrv_alert.py` and `check_daily_alerts.py`, which no host
  scheduled. `check_birthday_notif.py` now reads Google Calendar over plain HTTPS
  (`scripts/_google.py`): compute-core has no `googleapiclient`, so it could not even import there.
  It now exits non-zero on failure instead of 0. The recipe audit notifies only when its findings
  change (the same "8 findings" pushed four Mondays running) and records its runs. Removed: the
  macOS-only `morning-nudge` / `nightly-postmortem` agents, `install-notifications.sh` (the schedule
  lives in the host crontab), and the `/api/usage/storage` quota meter.
- **Contract tests for critical paths, and a `next build` check in CI (#761).** The API
  routes, MCP tools and the Plex sync had no tests at all. New node-runner tests (39 cases,
  no database) run the real code against an in-memory fake of the supabase-js query builder
  (`web/src/__tests__/helpers/fake-supabase.ts`):
  - `plex-sync.test.ts` — `syncPlex` with Plex + TMDB stubbed: first run records a cursor
    and imports nothing; a movie watch finishes the item, logs one session and sets
    `rate_prompt_at` when unrated; no double-log within 3h; an episode moves a show to
    `active` with `plex_progress`; a fully watched show finishes only when TMDB says
    `in_production: false`; an unreachable Plex logs a `sync_log` error and throws.
  - `meal-tools.test.ts` — `pin_grocery_product` (ASIN validation, food identity required,
    oz/lb → g, re-pin replaces, other users untouched) and `plan_meals` validation.
  - `cron-sync.test.ts` — `/api/cron/sync`: bearer auth, `?days`/`?force` parsing, Plex
    skipped (not errored) without `PLEX_URL`/`PLEX_TOKEN`, and one failing source or user
    never loses the others' results.

  To make these loadable by the bundler-free runner, with behaviour unchanged: the cron
  orchestration moved from the route into `web/src/lib/sync/cron.ts` (the route is now the
  HTTP edge only); the `plan_meals` / `pin_grocery_product` bodies moved into
  `web/src/lib/tools/meal-actions.ts`; `plex.ts` uses relative `.ts` imports and no
  constructor parameter properties.

  CI: new `build.yml` runs `next build` on PRs touching `web/**` (placeholder
  `NEXT_PUBLIC_*` values only — the build needs no env). The node unit tests now run for
  any `web/**` change, including `web/mcp/**`, not only `web/src/**`. `smoke.yml`'s a11y
  job could never run (it required `pull_request`, a trigger the workflow did not have):
  it now runs on `workflow_dispatch` and on a weekly schedule gated by the repo variable
  `SMOKE_SCHEDULE_ENABLED` (off by default, since cloud runners cannot reach the
  tailnet-only app). The a11y sweep now covers `/library`, `/calendar` and `/inventory`.

- **`amazon-cart` skill: fill the Amazon Fresh cart from the grocery list (#4, Phase 2).**
  Runs in the user's own signed-in Chrome through Claude in Chrome. **It never checks out.**
  Checkout, "Clear cart", Repeat Items, Subscribe & Save and account settings are named as
  forbidden controls. Flow: preflight (extension connected, signed in, delivery address, Fresh
  available, no CAPTCHA), each failing with a plain instruction to the user, never a
  workaround. Then: baseline the cart (pre-existing items are the user's and are never removed),
  one confirmation of the whole list, add pinned products, and search Fresh for unpinned or
  unavailable ones. Searched products are offered as alternatives and never added unchosen.
  Finally it **verifies against the Fresh cart page**, reports Added / Already in cart /
  Searched-not-found with alternatives / Needs your decision, and invites changes. Four
  read-only page scripts in `scripts/`. Mechanics were proven live on 2026-10-12 with one test
  item, added, raised to qty 2 and removed. Two traps are encoded in the skill: element refs
  on Amazon hit hidden duplicate buttons (the click silently does nothing), so it clicks visible
  coordinates and re-reads the cart; and the Fresh cart lives at `/cart/localmarket`, separate
  from the main cart. Pins updated the same day: Just Bare thighs are 1.25 lb, and 8 of 15
  pins now carry a price.
- **Grocery list from the meal plan, with pinned Amazon Fresh products (#4, Phase 1).** New
  `grocery_products` table: a food identity (`fdc_id` or `packaged_food_id`) mapped to one Fresh
  product (ASIN, pack grams read off the listing, last price). **Products are never matched by
  name**, by the same rule as the USDA pins: the 7/29 order's "House Napa Cabbage" was kimchi.
  New MCP tools: `get_grocery_list` (planned recipes scaled by portions / `typical_portions`,
  minus `inventory_items` matched the way the cook-time draw matches, rounded to whole packs
  with a 3% slack so 454 g of beef does not buy a second pound) and `pin_grocery_product`
  (re-pinning a food replaces its product). Lines report `buy`, `covered`, `staple`,
  `check-stock` (the kitchen has some in a unit with no weight), `no-weight` or `optional`. A
  `buy` with no product is `needsPin`. Planned recipes with no structured ingredients are
  returned in `unlisted` instead of silently contributing nothing. A real-data run found 3 such
  recipes in one week; 5 of 91 recipes are affected overall. `plan-week` now calls the tool
  instead of adding ingredients up by hand. Seeded with 15 pins from the 2026-09-03 / 09-20
  Fresh orders. Migration `20261012180000_grocery_products.sql`: RLS owner policy;
  `authenticated` gets CRUD only. **Applied live 2026-10-12.**
- **Plex watch sync: auto-finish, then prompt to rate (#691).** `/api/cron/sync` now polls Plex
  watch history (`lib/sync/plex.ts`) and writes it into the Library. A watched movie goes to
  `finished` with a `backlog_sessions` row. A watched episode moves its show to `active` with
  `metadata.plex_progress` (watched/total, Season 0 specials excluded). A show only goes to
  `finished` once every episode is watched **and** TMDB says it is no longer in production with no
  more episodes than Plex holds. Caught-up shows that are still airing are re-checked against
  TMDB daily, so the prompt still fires when the show ends. Unrated items get a rate prompt,
  answered from a banner on `/library` (0-10 slider plus optional review) or dismissed. A
  title watched on Plex that is not in the Library is added from its TMDB GUID; Plex GUIDs make
  this an exact match. Only watches from go-live onward count: the first run records a cursor
  (`profile.plex_sync_cursor`) and imports no history. Only the server owner's watches are
  read (`PLEX_ACCOUNT_ID`, default 1). Rewatches add a session and leave the original
  `finished_at` alone. Two history entries for one viewing (Plex writes these, observed live)
  collapse into one session. Plex unreachable: the sync logs an `error` row and the other
  sources run as usual. Config: `PLEX_URL` (LAN address) and `PLEX_TOKEN`; unset means skipped.
  Migration `20261012120000_backlog_rate_prompt.sql` adds `backlog_items.rate_prompt_at` and a
  trigger that clears it whenever a rating is written, from any path (page, MCP tool, script).
  **Apply before this code deploys.**
- **Real-user page-load metrics (#445).** The signed-in app now records LCP, FCP, CLS, INP and TTFB
  for every page load into a new `web_vitals` table, through `POST /api/vitals` with
  `navigator.sendBeacon` when the page is hidden (when CLS and INP are final). Each row carries the
  landing route with ids collapsed (`/backlog/:id`), the viewport, DPR, connection type where
  exposed, and phone vs desktop. `scripts/web_vitals_report.py` prints p50/p75 and "% good" per
  route and metric, split by device. **Why:** #445 targets a 2500 ms mobile LCP in Lighthouse's
  simulated slow-4G phone. Measured 2026-10-05, `/login` scores 2840 ms there but paints its LCP
  element in ~195 ms unthrottled, and the simulation's gap is font and JS bytes replayed over
  1.6 Mbps. Field data decides whether cutting either is worth it. Migration
  `20261005140000_web_vitals.sql`: RLS, insert/select own rows only, and **`authenticated` limited
  to SELECT + INSERT**. The default privileges grant it everything on a new table, TRUNCATE
  included, which RLS does not cover. **Apply before this code deploys.**
- **Task dependencies: one blocking task per task (#470, Phase 4 of the tasks overhaul).** New
  column `tasks.blocked_by`. A task is blocked while its blocker is **active**; completing or
  archiving the blocker releases it (archive means dropped, and a task hidden behind a dropped task
  would stay hidden with no explanation). On `/tasks` blocked tasks leave the priority groups for
  a collapsed **Blocked** section, each with a "Blocked by X" chip, and the dashboard leaves them
  out. Set or clear the blocker from the edit panel. Candidates come from every list. MCP:
  `add_task` takes `blocked_by`, the new `set_task_blocker` sets or clears it, and `get_tasks`
  returns the blocker plus a derived `blocked` flag. The briefing marks blocked tasks and adds
  a `NEWLY UNBLOCKED` section for tasks whose blocker was completed since the start of yesterday.
  **The rules live in the database** (migration `20261005120000_task_blockers.sql`), because
  tasks are written from the page, MCP and Python: a trigger rejects dependency loops, a blocker
  belonging to another user, and subtasks or repeating-task occurrences on either side. Detach an
  occurrence to block it. A deleted blocker, including one removed by the 90-day purge, clears
  the field. **Apply the migration before this code deploys**, then reload PostgREST's schema
  cache: the `/tasks` query embeds the blocker, and without the column it fails.
- **A repeating task that has silently dropped off the list is now reported (#703).** A live
  series is "silent" when its rule has a date in the next 14 days, it has no active occurrence at
  any date, and none of those dates was completed, i.e. every one in view was skipped (archived)
  or never created. Before this the chore simply had no row on `/tasks`, which is also what "on
  top of it" looks like, and the spawner printed `created 0`, its success line. Now `/tasks` shows
  a low-emphasis line per silent series with the next date it reappears, and the nightly spawner
  logs a `WARNING` per series and puts the titles in its heartbeat message. A monthly chore whose
  next date is simply beyond the window is deliberately not flagged: nothing is due, so nothing
  is missing. The rule lives in `web/src/lib/tasks/series-health.ts` and
  `scripts/_series_health.py`, pinned by the same seven cases in both languages.
  **The spawner's error paths now exit non-zero.** A connection error, a failed series query or a
  failed series used to print to stderr and exit 0, so the heartbeat reported a crash as a clean
  run.
- **Completed-task history, restore, and 90-day retention (#684).** The Completed section on
  `/tasks` now shows every task completed in the last 90 days instead of the latest 10, grouped by
  the day it was completed (in the user's timezone, so a late-evening completion files under the
  right day), with a **Restore** button on each row. Restoring sets the task back to `active` and
  clears `completed_at`, which the DB trigger never does on its own. It also re-activates the
  subtasks that completing the parent swept up (completed_at at or after the parent's); subtasks
  finished separately stay done, since the UI has no way to un-tick one. New MCP tool
  `restore_task`; `get_tasks(status='completed')` now sorts by completion date. New nightly script
  `scripts/purge_completed_tasks.py` hard-deletes top-level completed tasks older than 90 days
  (subtasks go by cascade, and completed subtasks of still-active tasks are kept). It exits non-zero on any error and supports
  `--dry-run`. Its crontab line lives in jl-homelab. **Both occurrence spawners now never
  materialize a date older than the window.** Without that, the web spawner, which recomputes
  from `starts_on` on every series create and extend, would have re-created every purged
  occurrence as an overdue chore, since it treats "a row exists" as "already done". The purge only
  takes an occurrence whose `occurrence_date` is also past the window, so the two halves meet.
  The window is one constant in `web/src/lib/tasks/retention.ts` and `scripts/_retention.py`;
  a test fails if they differ.
- **"Cooked it" draws a label-pinned line from the stock row linked to the same product (#722).**
  Matching is now `packaged_food_id`, then `fdc_id`, then name. A recipe line pinned to a catalog
  label and a stock row linked to that label are the same box by construction, so the pair
  matches even when their names share no word. **A counted row (`1 box`, `2 can`) linked to a
  label becomes drawable from the label's net weight** when no pack weight was recorded by hand.
  That is a figure read off the package, the line #723 drew. Two things are deliberately not used:
  a container rebuilt from servings (~8% light), and net weight for a non-container count
  ("1 fillet" of a 2-fillet pack). A hand-recorded `grams_per_unit` still wins. Migration
  `20260926120000_inventory_draws_match_label.sql` widens the `match_method` CHECK and **must be
  applied before this code deploys**.
- **Log a meal from a catalog label (#722).** Meals → Today → Quick log gains "From a label":
  pick a product, enter an amount, and it logs priced off the photographed panel. New route
  `POST /api/meals/log-label` takes the product, amount and unit, **never macros**. The server
  re-prices from the stored label with `priceLabelServing` (the same function the preview uses),
  writes `source = 'label'`, and keeps the working in `metadata` (product id, grams, basis, prep
  state, label date) so the row can be re-derived. Units offered are only what the label can
  price: g, oz, servings, the label's own measure (`3/4 cup`), and a whole container when its
  weight is known. **A label that is not "as sold" must be confirmed**: meal_log has no ingredient
  text to check, so "170 g" of a dry-pasta label is refused until the eater confirms it is 170 g
  dry, not 170 g on the plate (a ~3x difference). Nutrients the label did not print are logged as
  null, not 0. Deliberately **not** an MCP tool: the model still never records that food was eaten.
- **Pin a recipe line to a label from the recipe editor (#722).** Each ingredient row gets a
  second line with a picker, "Priced by USDA (no label)" or any catalog product, which sets
  `packaged_food_id`. The resolver's two refusals are **warned as you type** using the same
  functions: a line whose wording contradicts the label's prep state ("pasta" against a dry
  label: say "dry"), and a unit the label cannot price. A pin whose product was removed shows as
  "Missing product" instead of silently reading as unpinned. If the catalog fails to load, the
  editor says so and existing pins are kept as they are.

- **A Catalog tab for the label catalog (#722, capture path).** `/inventory` gains a third tab
  listing every `packaged_foods` product, with the per-serving panel it was entered from and two
  flags: a label photographed more than 365 days ago (formulations drift), and a missing net
  weight, which says whether a whole container is merely inferred from servings or cannot be
  priced at all. Products are added and edited **as the panel is printed, per serving**. The
  server divides to per 100 g once, through `labelToPer100g`, so the form does no arithmetic.
  New routes: `GET/POST /api/packaged-foods` and `PATCH/DELETE /api/packaged-foods/[id]`.

  **A photo prefills the form; it does not fill the catalog.** "Read from a photo of the label"
  reuses the scanner's label reader. Every transcribed number lands in an editable field with a
  note to check it. The serving's gram weight is left **blank** when the printed line has none
  (`1/2 cup`) rather than converted through a density nobody measured, and the prep state must
  be set by hand.

  **Guards:** input is rejected rather than coerced (bad numbers, unknown prep state, malformed
  barcode or date). Duplicate brand+product or barcode comes back as a readable 400 instead of a
  raw unique violation. **Removing a product is refused (409) while any recipe line pins it**,
  naming those recipes, because a pin lives inside `ingredients_json` where no foreign key
  reaches, and deleting under it would make every pinned line unpriceable. A catalog that fails
  to load is shown as an error in its tab, not thrown (which would take down the kitchen view)
  and not swallowed into an empty list (which would read as "no products").

- **Recipe lines can be priced off the label on the box (#722, read path).** A structured
  ingredient can now pin `packaged_food_id`, and the resolver prices that line from the
  photographed `packaged_foods` panel instead of USDA: no search, no model pick. For branded goods
  USDA is at best a proxy. It has no Barilla tri-color record at all (the numeric match is
  Reggano's), and its nearest Classico sausage sauce is 50% high on protein.

  **The pin is explicit and wins.** It is chosen, never matched from the item text: fuzzy
  matching is the wrong-food class `isPlausibleMatch` exists to stop. When a line carries both
  pins, the label wins. A label that cannot price its line is **refused and reported in
  `macro_unmatched` with the reason**; it is never quietly re-routed to USDA, which would price a
  different food and say nothing.

  **Only figures read off the package are used:** grams/oz/lb, the printed serving weight, the
  label's own household measure (`1 tsp`, `1/2 cup`, `1 fillet`), and the container weight. A
  container rebuilt from "about 5 servings" is flagged inexact, because it runs ~8% light.
  **A dry or cooked label requires the line to say so**, so an unqualified "300 g pasta" is
  refused instead of priced 2.5-3x high off a dry panel. The label's `fdc_proxy_id` never leaves
  the catalog: label-priced items carry `fdcId: null` and `source: "label"` in `macro_items`, and
  the recipe audit counts a label pin as pinned.

  No existing recipe changes until a line is pinned. Not in this change: the capture form or
  photo prefill, the catalog browser, a picker in the recipe editor, and inventory draws matched
  by catalog id (the `match_method` CHECK needs a migration).

- **The kitchen as three doors you open, not a list you read.** `/inventory` now defaults to a
  **Kitchen** view — Fridge, Freezer and Pantry as openable sections, each item a tile with its
  own illustration, dual-unit weight, expiry, and macros for the whole quantity on tap. The
  **List** tab keeps every mutation (add, edit, move, remove, used-up disclosure); the visual
  view is deliberately read-only so the edit paths are not duplicated and cannot drift.

  **Art is inline SVG, not image files.** ~30 hand-drawn foods plus category fallbacks. Forty
  tiles as files is forty requests and forty chances to render a broken-image box; inline it is
  zero, and the plate behind each icon inherits the theme tokens. Storage was never the
  constraint — request count and theming were.

  **Which icon a row gets is a database decision.** New `inventory_items.image_key`, set
  deliberately one row at a time, never matched from `name`. Names are freeform ("Chicken
  thighs, boneless skinless (Just Bare)") and name matching is the trap `inventory-draw.ts`
  already defends against by requiring _equal_ token sets — `{garlic}` is a subset of
  `{garlic, powder}`, so a subset match draws fresh garlic out of the powder jar. No key falls
  back to the category; no category falls back to a neutral plate. Nothing guesses.

  **Macros come from a cache, with the provenance kept separate.** New `packaged_food_id`
  (label) alongside `fdc_id` (USDA), plus `macros_per_100g` so the page is one query instead of
  ~21 FDC round-trips. **A label beats USDA for a branded good** — the exact recipe pin for the
  365 Greek yogurt was USDA 171312, which is _Chobani_. 32 of 37 in-stock rows now resolve.

  **A count unit yields no macros, and says so.** `3 can` of black beans is not 3 g and this
  refuses to invent the per-container weight; the recipes carry those conversions. Five rows
  are honestly blank — two need a label photo, three have nothing worth pinning. "We don't
  know" and "it has none" are different facts and a dash conflates them.

### Fixed

- **"Ate this" no longer draws inventory (reverts part of #767).** Drawing without a preview or
  confirm step reversed a deliberate #706 decision; only "Cooked it" (preview, then confirm) moves
  food out of `inventory_items`. `receive_grocery_order` is unaffected.
- **Travel mode showed home weather in Melbourne (#761).** Google Calendar writes hotel stays as
  "205 Collins Street Melbourne, Victoria 3000 Australia": two segments, with the city at the end of
  a street line. `geocodeCandidates` skipped number-led segments, found nothing, and the weather fell
  back to San Francisco under a correct "Traveling — Melbourne" note. A street line now contributes
  its trailing non-suffix word. Geocoding prefers matches in the address's country, so "Melbourne"
  can't resolve to Florida or "Victoria" to Canada. A stay that still can't be placed is logged, not
  silent. Same fix in the morning summary's Python mirror (`scripts/_travel.py`).
- **CI guard for the client/server boundary.** `scripts/check-client-boundary.py` (run in the lint
  workflow) fails when server code imports a function from a `"use client"` module, the class of
  bug below that no other check catches.
- **Every Settings tab crashed after #766.** The page called `isSettingsTab()`, which lived in a
  `"use client"` component; Next refuses a server call into a client module, and only at request
  time, so tsc, eslint and `next build` all passed. The tab list now lives in
  `web/src/lib/settings-tabs.ts`, which the server page and the client tab bar both import.
- **Settings → Status was unreachable (#761).** The settings page kept its own copy of the
  valid tab list, which still said "usage", so `?tab=status` fell back to Profile. The page now
  uses `isSettingsTab` from `settings-tabs.tsx`, the single list.
- **Status registry matched the real crontab (#761).** `series-expiring` runs weekly (Mon 16:00
  UTC), not daily, so its 48 h allowance would have marked it late, and paged, every week. It
  now allows 15 days, and the stale checker allows 14 h for its own 6-hourly run.
- **GA trust bugs from the 2026-10-12 walkthrough (#761).**
  - **Dashboard showed two readiness scores.** The hero strip read today's `recovery_metrics`
    row and Health Breakdown read the latest row capped to `date < today`, each with its own
    copy of the band table. The page now reads one row (the most recent) and every readiness
    label comes from `lib/readiness.ts`; the breakdown shows that row's date in the same
    format.
  - **Habits ring and Weekly Review disagreed about the same week.** Each page had its own
    window and its own counting (rows on /habits, distinct habit-days on /weekly). Both now call
    `lib/habits/weekly-completion.ts` with the same `getLast7Days()` list. Habit toggles also
    revalidate `/weekly`, which the 300 s client router cache otherwise served stale. Weekly
    "tasks completed" now starts at local midnight, not UTC midnight.
  - **Meals:** the tab bar is first; kitchen and week plan moved into the Today tab, and an
    empty week is one line ("Nothing planned this week") instead of seven rows.
  - **Inventory:** expired items no longer lead "Cook these first". They get an "Expired — toss
    or keep?" strip with **Tossed** (existing DELETE) and **Still good** (existing PATCH,
    `expires_on` = today + 3). Kitchen tile names get two full lines.
  - **Dashboard:** the mobile sticky range bar has a solid `--color-bg` background and a rule;
    empty charts name themselves and say why ("No weigh-ins in the last 7 days").
  - **Share links** in the Library header and item page came from `window.location.origin` /
    `APP_URL` (the tailnet host). All share URLs are now built by `lib/share-url.ts` on
    `SHARE_BASE_URL`.
- **Security: `authenticated` no longer holds TRUNCATE, TRIGGER, MAINTAIN or REFERENCES (#756).**
  The default privileges of both table-creating roles granted signed-in users every table
  privilege, and TRUNCATE, TRIGGER and MAINTAIN are not covered by row-level security. On
  2026-10-05 a signed-in session could `TRUNCATE public.notifications`; verified in a rolled-back
  transaction. It was not reachable through PostgREST or any RPC, but each new invoker RPC would
  have inherited it. Migration `20261005160000_authenticated_table_privileges.sql` revokes them
  on all 33 tables and from the default privileges of `postgres` and `supabase_admin`, then
  asserts the end state. SELECT/INSERT/UPDATE/DELETE, which RLS governs, are unchanged. **Apply
  as `supabase_admin`**, the only superuser, which owns two tables and its own defaults.
- **Web vitals were recorded several times per page load (#445 follow-up).** The reporter passed
  `useReportWebVitals` an inline callback; the hook re-subscribes when the callback changes, so
  every re-render added a listener. The first live `/tasks` load from a Pixel wrote each metric 3
  times, and a test page with 5 re-renders wrote 6. The callback is now module-level, and metrics
  are also deduplicated by their unique `id`. Verified in a browser: one row per metric.
- **`npm run smoke:perf` runs again (#445).** Lighthouse 13.1 on Chromium 147 crashes the page
  (`TARGET_CRASHED` → `FAILED_DOCUMENT_REQUEST`) on any response carrying
  `Referrer-Policy: strict-origin-when-cross-origin`, which this app sends on every route. Bisected
  with a bare server, one header at a time. The script now fronts the app with a local proxy that
  drops exactly that header. New `PERF_ROUTES` (e.g. `/login`, no test account needed) and
  `PERF_TARGET` (measure the live deployment). `/chat` is gone from the routes' baselines (deleted
  in #476). Documented as local-only: the database has been tailnet-only since the self-host
  cutover, so CI cannot sign in. Production `/login` today: mobile LCP 3035 ms, desktop 638 ms,
  CLS 0.
- **Tasks: a blocked task now shows under the task it waits on (#470 follow-up).** Blocking a task
  moved it into a collapsed "Blocked" section at the bottom of `/tasks`, which read as the task
  disappearing, and lost the link to what it was waiting on. Blocked tasks now render indented
  beneath their blocker, under a hairline like subtasks, marked "Waiting". Chains nest (A, then B,
  then C). Only a task whose blocker is not in the current view (on another list tab) still falls
  back to the collapsed section, which names the blocker. `nestBlocked` in
  `lib/tasks/blockers.ts`, unit-tested.
- **Task blockers: the blocker embed failed on PostgREST (#470 follow-up).** The query hinted the
  self-referencing join by FK name (`tasks!tasks_blocked_by_fkey`), which this PostgREST rejects
  with PGRST200; `tasks!blocked_by` resolves to the reverse side and returns an array. Both
  `BLOCKER_EMBED` copies now hint by column (`blocker:blocked_by(...)`), the many-to-one. Caught
  before the container was rebuilt: the migration was applied and the embed tested live first.
- **Tasks: the row lays out on two lines on a phone instead of wrapping its buttons to the left
  edge.** #746's 44px touch targets pushed the row past the screen width, so the edit and archive
  buttons fell onto a stray line under the checkbox, the list chip truncated to "Feature/Pr", and
  the title squeezed to ~180px. Below `sm` (640px) the title now has the first line to itself and
  a second line, aligned under it, carries the list chip, due date and series chips on the left
  and the actions on the right. From `sm` up that wrapper is `display: contents`, so desktop is
  unchanged: a 1280px screenshot diffs at 0 pixels. The add form puts the input on its own line
  on a phone with Add pinned right. Text fields are exempt from the 44px floor again; the
  always-visible "Add item…" field had gained a blank band under every task.
- **Tasks: iOS no longer zooms in when a field is tapped, and every control is a 44px target on
  touch (#688).** iOS force-zooms on focus below 16px, and every input and select in the tasks
  tree was `--t-micro` (13px). A `@media (pointer: coarse)` block in `globals.css`, scoped to the
  new `.tasks-ui` root on `/tasks`, sets form controls to 16px and floors buttons and fields at
  44x44 (WCAG 2.5.5) by growing the box, not the icon. It keys on pointer, not width, so desktop
  at any window size renders exactly as before and iPad is covered too. `maximum-scale` was
  deliberately not used: it would stop the zoom by breaking pinch-zoom (WCAG 1.4.4).
- **A draw could decrement stock with no ledger row.** `applyDraw` updated the quantity and only
  then checked for a usable pack weight, so a row that lost its pack weight between plan and
  apply was drawn down with nothing for a cook delete to reverse. The check now runs before the
  write.
- **The meal scanner's label mode has been falling into the food path since #608.** The client
  branches on `data.mode === "label"`, and the self-host rewrite dropped `mode` from the label
  response. Every label scan therefore went down the food branch, named "Unknown food", and
  **`readable: false` was never checked**, so an unreadable label became a loggable card instead
  of being refused. The route returns `mode: "label"` again.

- **Re-resolving one recipe no longer means fencing the whole library.**
  `POST /api/internal/resolve-recipe-macros` takes `?id=<uuid>` (repeatable), which resolves
  exactly those recipes and nothing else. Naming a recipe implies force for that recipe, and an id
  that matches nothing returns 404 instead of an empty success. Before this, the only per-recipe
  route needed a browser session, so a scripted re-resolve had to clear the recipe's stamp. The
  `macros_computed_at` trigger refuses that while macros are set, so its macros had to be blanked
  too, and every other unstamped row (the `Eating out` placeholder) had to be fenced so the bulk
  pass would not price it. The alternative, `?force=1`, re-resolves the whole library. The route
  also skipped a recipe with structured `ingredients_json` but no ingredient text as "no ingredient
  list", even though the resolver prices it. No live recipe is in that state today.

- **Python scripts ran a day ahead every evening.** compute-core's clock is UTC, and eleven
  scripts took "today" from `date.today()`, which rolls over at 17:00 PDT. From then until
  midnight the session briefing labelled the coming day "today", printed that morning's
  readiness as "last night", and hid the current day's meal plan rows because they fell
  before the "today forward" cutoff. The cron alerts (daily tasks, HRV, weather, task-due,
  series-expiring, birthdays), `spawn_task_occurrences`, `log_habit`'s default `--date` and
  the week planners had the same shift. All now use `today_local()` from the new
  `scripts/_dates.py`, which reads `USER_TIMEZONE` (default `America/Los_Angeles`), the same
  rule `web/src/lib/timezone.ts` already follows. `coach_check.py` had a private copy of the
  helper that fell back to `date.today()` on any error; it now shares the module. The
  birthday check's calendar window was UTC midnight-to-midnight and is now the local day.
  Pinned by `tests/test_dates.py` at the instant it was caught: 2026-09-26 03:40 UTC is
  2026-09-25 in Pacific time.

- **Task rows still collapsed to one character per line when the task had a due date or a
  repeat.** The previous fix was incomplete. It gave the title `flex: 1` so it would win
  against the chips _inside its own group_ — which it did, so tasks with no due date and no
  series rendered correctly and the fix looked complete. The due-date and recurring-series
  chips are **not** in that group: they are direct children of the row, and every chip and
  button there is `flex-shrink-0`. The title group is the only flexible child, so it absorbs
  the row's entire shortfall.

  Measured on the reported row ("Dose the aquarium with fertilizer", overdue + "every Sunday"
  - three buttons) at 390px: **title 0px wide, 24 lines tall, row 464px.** After: 225.5px,
    2 lines, 80px. At 1280px the row is a single 44px line, unchanged.

  The row is now `flex-wrap`, and the title group carries `min-width: min(60%, 14rem)`. The
  floor is what makes the wrap fire — once the title refuses to shrink past it, the metadata
  no longer fits beside it and drops to a second line instead of crushing it. On a wide screen
  everything fits anyway and the floor never binds, so desktop is untouched.

  `smoke/layout/measure-task-row.mjs` renders this row standalone and measures it, because the
  first fix was verified by reading the code and reasoning about flexbox — reasoning that was
  locally right and globally wrong. Flex shortfall is arithmetic over the whole row.

  Still distinct from #688 (iOS force-zoom on sub-16px controls, sub-44px touch targets).

- **Mobile: long notes buried the screen, and task titles broke one character per line.** Two
  separate defects on the phone, both reported 2026-09-21.

  **Notes.** Plan, session and inventory notes are written long on purpose — they carry the
  reasoning behind a decision so a later session reads it back instead of re-deriving it. But
  rendered in full mid-workout, a 90-word rationale pushes the set logger off the viewport.
  Notes now clamp to two lines with a "Show full note" toggle. **Nothing was shortened in the
  database**, which is the half that has to stay whole.

  **Task titles.** In `task-item.tsx` the title had `min-width: 0` but no `flex` basis, while
  the category and list chips beside it were `flex-shrink-0` — so every pixel the row was
  short came out of the title and none out of the metadata. At 390px it collapsed to a
  ~30px column and wrapped mid-word on nearly every character. The title now claims
  `flex: 1 1 auto` and the chips shrink and ellipsise instead, capped at 40% width.

  Distinct from #688, which is iOS force-zoom on sub-16px form controls and sub-44px touch
  targets in the same tree — that one is still open.

- **Inventory: used-up items are hidden instead of listed.** #733 stopped spent rows (0
  quantity) showing as "Use soon"; they were still listed under their location, so the fridge
  read as 25 items when 10 were real. They are now filtered out, behind a quiet
  "Show N used-up items" disclosure.

  **They are hidden, not deleted, and the disclosure is load-bearing.** Those rows carry the
  notes, `fdc_id` and unit for that food — restocking an existing row is what stops the same
  item sprouting a second, parallel row. That is exactly how the kitchen ended up with two
  MOWI salmon rows and two Just Bare thigh rows, one of them named "— frozen" while sitting
  in the fridge. Making them completely unreachable would have rebuilt that problem.

- **Inventory "Use soon" listed food that no longer exists.** The strip classified rows by
  `expires_on` alone and never looked at `quantity`, so a row at 0 g — kept for the notes on
  it after the food was eaten or thrown out — stayed "urgent" forever. The urgent test
  (`days <= USE_SOON_DAYS`) has no lower bound, so such a row looked _more_ urgent as it
  aged. Measured on Jason's kitchen 2026-09-21: **16 rows on the strip, 14 of them spent, 0
  genuinely expired.** The same classifier drove the red `expired` label on every zeroed row
  in the fridge list.

  A triage list is a do-something-now list, and one that is 87% tombstones is worse than no
  list at all, because the two real rows are invisible inside it. This is the recurring shape
  here: a signal that cannot distinguish "nothing to do" from "act now".

  Freshness now returns a `spent` kind first, and `useSoonItems()` can't surface it by
  construction. **The trap on the fix is the NULL case** — a NULL `quantity` is an untracked
  staple that is _assumed on hand_ (rice, oil, whey), not an empty row, so only an explicit 0
  counts as spent. Treating NULL as zero would have hidden every staple: the opposite bug,
  and a quieter one. Both cases are pinned by tests.

  The logic moved out of `InventoryPanel.tsx` into `lib/nutrition/inventory-freshness.ts` so
  it can be unit-tested at all — it was unreachable from the node test runner inside a
  `.tsx` component. No data was changed: the expiry dates on those rows are true, and
  nulling them to quiet a UI bug would have left a puzzle and regressed on the next restock.

### Added

- **Packaged foods: store the label off the box, and prefer it to USDA.** A new
  `packaged_foods` table holds label-verified macros for branded goods — brand, product, UPC,
  the printed serving, net weight, and macros normalised to per 100 g — plus
  `lib/nutrition/packaged-foods.ts` to read and scale them.

  **Why a branded food needs its own source.** Every macro in the app comes from USDA
  FoodData Central, which is correct for whole foods: "chicken breast, raw" is the same food
  in every kitchen. USDA's _Branded_ dataset is different — it is manufacturer-submitted, so
  it is incomplete and stale by construction, and it was wrong for both items this was built
  against. There is no Barilla record for tri-color rotini at all; the record matching the
  box to the decimal on all six macros (fdc 729736) belongs to Reggano, so pinning it would
  file an Aldi product as a Barilla one. For Classico's Italian Sausage sauce the nearest
  record (fdc 2615521, Riviana) reads 2.4 g protein and 400 mg sodium per 100 g against the
  jar's actual 1.6 and 352 — a 50% overstatement on protein, close enough to look right in a
  search result and wrong enough to matter across a four-portion batch.

  **Stored per 100 g, not per serving.** That matches every other macro path here (USDA
  records, `recipes.ingredients_json`, `metadata.macro_items`), so the label's division
  happens exactly once on the way in rather than in each caller at a slightly different
  rounding. `serving_size_g` is kept so the printed panel can be reconstructed and checked
  against the photograph; a test pins that round trip through the ragged 56 g divisor.

  **`prep_state` is NOT NULL on purpose.** A pasta or rice label is DRY weight, and the food
  roughly triples in mass cooked, so reading one as cooked overstates a meal by ~2.5-3x. This
  repo has already paid for that once, when the resolver rewrote "2 cups dry brown rice" to
  the cooked record and produced a 3x carb error reported as high confidence. Making the
  state explicit forces a caller to have an opinion about which weight the row holds.

  **What it deliberately does not claim.** FDA rounding means values under 5 g are printed to
  the nearest 0.5 g and calories above 50 to the nearest 10, so "200 calories, 1 g fat" per
  56 g is really 195-204 kcal and 0.75-1.25 g — about +/- 2.5% on energy once scaled to a
  box. Better than a wrong-brand USDA record, not a lab assay, and documented in the table
  rather than in a comment at one call site. `fdc_proxy_id` exists for downstream code that
  insists on an id, and is explicitly a proxy rather than an identity claim.

  `containerWeightG()` prefers the front-of-pack net weight over reconstructing it from
  servings, because "about 5 servings" is itself rounded: the Classico jar reconstructs to
  625 g against a true 680 g, 8% light, which is most of a portion in a batch cook. It
  returns which figure it used so a caller can say the number was inferred.

- **Library: bulk import an IMDb CSV export.** "Import" on `/library` takes a ratings,
  watchlist, or list export and loads the whole file in one pass instead of one
  search-and-click per title. Matching is by IMDb const (`tt0111161`) through TMDB's
  `/find` endpoint, so no title is guessed — a real 340-row export resolved 338/338 with
  posters. Rated titles arrive as `finished` carrying their rating and `Date Rated` as
  `finished_at`; unrated ones join the queue. The export's own `Directors` and
  `Runtime (mins)` fill the two fields `/find` does not return, so an imported movie is
  better populated than a searched one; a list export's `Description` column becomes the
  review.

  **The rating comes out of the note, not the rating column.** IMDb's `Your Rating` is a
  whole number, so a list kept at one-decimal precision has the real score written at the
  head of the note instead — `9.3 - One of the best`. When a note leads with one, it wins
  over the rating column and is lifted out of the note text, so the rating lands in
  `rating` and the note reads as prose. On a real export that recovered the precision on
  283 of 340 rows (`9` → `9.3`). The decimal point is required to match: a bare integer
  prefix is ambiguous with a note that simply opens on a number ("12 Angry Men is…"), and
  the rating column already covers whole numbers. Configured per source
  (`rating_leads_note`), because it is a property of the export, not of importing.

  Nothing is written until you have seen the whole list: the preview counts
  matched / already-present / not-found / skipped rows and every matched row can be
  unticked. Re-importing the same file inserts nothing.

  New `POST /api/backlog/import` replaces the per-item `POST /api/backlog` for batches —
  that one does three round trips per row (~1500 queries for a 500-row export) and races
  on priority when rows overlap. The bulk path is one duplicate `select` for the batch,
  one `max(priority)` per media type, and a single `insert` with the block assigned in
  memory. TMDB resolution is a separate read-only `POST /api/backlog/import/resolve`,
  called in 25-row chunks so the preview fills in progressively and no request carries 500
  lookups. Parsing is column-map driven (`web/src/lib/import/media-csv.ts`), so a second
  source — Letterboxd, Goodreads, Steam — is a config entry rather than a second parser.
  IMDb kinds map movie/TV movie -> movie and TV series/mini series -> show; episodes and
  everything else are reported in the preview, never silently dropped. (#690)

### Removed

- **Multi-tenant admin, dead code and stale docs (#761).** Mr. Bridge is a single-user,
  self-hosted app — multi-tenancy was abandoned for self-hosting (#201) — so the tenant
  console had nothing to administer. Removed `/admin` (layout, tenant list, tenant
  drill-down), `lib/admin-types.ts`, and the `is_admin` Admin link in the nav. New migration
  `20261013090000_drop_admin_tables.sql` drops `feature_flags` and `admin_audit_log`, whose
  only readers/writers were those pages (**not applied automatically** — apply by hand as
  postgres). Deleted orphan code with zero importers: `backlog/BacklogClient.tsx`,
  `backlog/[id]/BacklogDetailClient.tsx` (the `/backlog` pages remain as redirects to
  `/library`), `ui/metric-card.tsx`, `meals/MacroSummaryCard.tsx`, `lib/use-keyboard-open.ts`,
  `lib/chart-colors.ts`, `lib/fitness/recovery-rules.ts`, `lib/fitness/movement-patterns.ts`
  (`scripts/weekly_plan.py` is now the sole copy of those rules). Deleted uncalled API routes:
  `/api/cron/weekly-plan` (its GitHub workflow is gone and the crontab deliberately does not
  schedule it), `/api/notifications/push`, `/api/meals/today-totals`, `/api/stocks/refresh`,
  `/api/sports/refresh` (stocks/sports refresh via `/api/cron/sync` and the dashboard's server
  actions). Retired the study timer, unused since before June: the `study-timer` agent,
  `/stop-timer` command, `rules/study-timer.md`, and the timer steps of `weekly-review` (the
  `study_log` table and its readers stay). Stale docs/config corrected for the product that
  exists: `docs/ARCHITECTURE.md` (chat tables, residual-Anthropic claim, SaaS/multi-tenant
  roadmap and admin gate removed; table count dropped), `data-sources.md` (dropped chat
  tables), the MCP server header (48 tools, no Gmail), `next.config.ts` (`src/proxy.ts`), the
  PR template's Vercel env lines, the cron-sync comment, the `/chat` cases in
  `gate-b.spec.ts`, `ANTHROPIC_API_KEY` in `smoke.yml`, dead allowlist entries in
  `lint-tokens.sh`, `docs/smoke-testing.md`, and the README (chat seeding step, `/admin`
  step, cloud weekly-planner section replaced with `/weekly-plan`, file tree).

- **The dead tenant-quota surface in `/admin` (#720).** `tenant_quotas` and its two functions
  were dropped in #611 along with metered chat, but the admin pages still queried the table in
  eight places, each discarding the error. Nothing crashed, so the failure was invisible: the
  tenant list showed `0 / 500,000` tokens for every user, the drill-down rendered
  `QUOTA_DEFAULTS` as if they were real caps, and the token-override, tool-call-override and
  reset-usage actions upserted into the missing table (a silent no-op) and then wrote
  `admin_audit_log` rows describing changes that never happened. The audit log is meant to
  record what an admin did, so a log of fiction was worse than none. The quota card, its three
  server actions, `UsageBar`, `QUOTA_DEFAULTS`, `TenantQuotaRow`, the token and tool-call
  columns on the tenant list, and the stale doc references are gone. Nothing is recreated:
  there is nothing left to meter.

- **The demo account and all of its scaffolding (#718).** It was built for a public,
  multi-tenant launch that is not happening — the app is tailnet-only and single-user, so
  there are no visitors to demo it to. The auth user (`demo@mr-bridge.app`) had already
  been deleted from Supabase, but everything built around it was still in the tree and
  still deployed, so **"Try the demo" still rendered on the login page** and clicking it
  attempted a sign-in as a user that no longer existed.

  Gone: the login button and its credential auto-fill; both nav demo banners; the
  `isDemo` field on `ToolContext` and the 11 branches it gated (`calendar`, `workouts`,
  `equipment`); the `DEMO_USER_ID` short-circuits and hardcoded "Alex Chen" calendar
  fixtures across five `api/google/calendar/**` routes; the nightly wipe-and-reseed route
  `api/cron/reset-demo`; `scripts/seed_demo.py` and `scripts/reset_demo.py`; the
  demo-turn quota fields; the demo-email filter in `print_owner_id.py`; and the five
  `DEMO_*` env vars, the README "Demo Account" section, and the `docs/` references.

  Every in-tool `isDemo` branch was already unreachable: `web/mcp/server.ts` has been the
  only `ToolContext` construction site since the chat route was deleted in #476, and it
  passes `false`. Applied migrations that mention the demo account are history and were
  left alone, as were the dated audits and runbooks under `docs/`.

### Fixed

- **A meal plan cannot be marked "eaten" without evidence that it was.** On 2026-09-10 a lunch
  logged in the app moved no macros: `meal_log` had zero rows for the day. The cause was a single
  row written the previous afternoon — a planning write created _tomorrow's_ lunch already at
  `status='eaten'`. `KitchenPanel` only offers "Ate this" on a `planned` row, so by the time the
  meal happened the plan was already in its terminal state, the button was gone, and nothing was
  ever written to `meal_log`. The failure is silent by construction: the only symptom is a macro
  total that stays flat.

  `meal_plans.status` and `meal_log` are separate rows written by separate paths, so a plan
  reading `eaten` was never evidence the meal was logged — the same sentence that
  `20260825120000` was written for, arriving through a third door. An audit of all 64 rows that
  have ever reached `eaten` found three with no log behind them (2026-07-16, 2026-07-23,
  2026-09-10); **all three were INSERTed already eaten**, so a rule rejecting only future dates
  would have missed one of them.

  New trigger `meal_plans_check_eaten_evidence` (`20260910120000`) rejects, for every writer
  including PostgREST: a future-dated `eaten`; an INSERT arriving as `eaten` with no `meal_log`
  row for that user/date/meal_type; and a macro-backed plan flipped to `eaten` without a log row.
  Backfilling stays legal — write the `meal_log` row first, then the plan. The macro-less
  status-only path ("Eating out") is deliberately exempt and is covered by an orphan audit in the
  skill's `context.sh` instead. The two July rows are unrecoverable and were left in place rather
  than have macros invented to satisfy a constraint.

- **A food is pinned only after you log it, not when the model guesses.** The memo added in #713
  wrote a pin whenever the model picked confidently, on the reasoning that a deliberate pick is a
  safe one. It is not: asked to match "oyster" the model chose _Mushrooms, oyster, raw_ — exactly
  the "different food merely sharing a word" trap its own prompt warns about — and the pin then
  SKIPS the model, so nothing could ever revisit it. Three of the first seven pins were wrong
  (`oyster` -> mushrooms, `radish, sliced` -> radish sprouts, `soup` -> a branded canned soup).
  The write now happens in `/api/meals/log`, against the items you accepted in the review step,
  and is skipped for any card whose macros you hand-edited. The poisoned rows were deleted. (#716)

- **The model was being reloaded in the middle of every scan.** The photo asked for an 8192
  context and the USDA selections took the 4096 default, and Ollama sizes the runner from the
  request — so the same 6 GB model was torn down and re-read from disk between the two halves of
  one analysis (`n_ctx = 32768` then `n_ctx = 16384` a minute apart). Every call now asks for the
  same context size. (#716)

- **Photo identification moved back to qwen2.5vl:7b.** It briefly ran on the 3b for speed, on
  the reasoning that USDA supplies every number so a weaker identifier cannot move a macro.
  Measured on a real photo — an oyster topped with uni, ikura, caviar and a cured egg yolk —
  both models were wrong and the 3b was wronger (two of five components against three). The
  decisive part was not accuracy: the USDA selections use the same `model()`, so a split forced
  both models resident, and the second load costs ~33 s of reading 6 GB off disk on a node with
  no GPU and mmap disabled. One model is more accurate and, end to end, faster. Pairs with
  jl-homelab #681, which keeps it warm for an hour instead of five minutes — `/api/ps` showed
  nothing resident between analyses, so every analysis was paying a cold load. (#715)

- **The food photo analyzer returned 400 on every real photo.** `chatJSON` never set `num_ctx`,
  so requests ran at Ollama's 4096-token default — and qwen2.5vl charges one token per 28x28
  patch and clamps at 3.2 MP, so a phone photo is ~4100 image tokens on its own, more than the
  whole context before a word of the prompt. It fit small test images and could never fit a real
  one. Vision calls now request 8192, food photos are downscaled to a 1200 px long edge
  (`.rotate()` first, so an EXIF-sideways photo doesn't reach the model on its side), and a
  non-2xx carries Ollama's own error text instead of a bare `local model failed (400)`. Labels
  stay full-resolution — that path is OCR of small print. (#711)

- **`sharp` could not load in the runtime image**, which the fix above would have turned into a
  500 on every analyze-photo request. `output: "standalone"` traces `require` graphs, but sharp's
  addon `dlopen`s libvips from a runtime-assembled path, so `@img/sharp-libvips-linuxmusl-x64`
  shipped as a directory with no library. Silent until now because sharp only backed
  `next/image`, and an unoptimised image still renders. (#712)

### Changed

- **Docs:** Claude rules, skills, commands, agents and design-system docs brought in line with the code (#761).
- **Docs:** README and env examples brought in line with the code (#761).
- **Docs:** docs/ brought in line with the code; historical records marked as such (#761).
- **UI polish: task row actions, one name setting, Library on shared tokens (#761).**
  - _Tasks._ Each row now shows the complete circle, the edit (due date / priority) button and a
    single `⋯` overflow menu (`aria-label="More actions for <title>"`) holding Add item, Add to
    calendar / Edit calendar block, Stop repeating… and Archive. The menu is a new reusable
    primitive, `components/ui/overflow-menu.tsx` (WAI-ARIA menu button: arrow keys, Home/End,
    Escape returns focus, outside click / Tab close). Stop repeating keeps its two-step confirm as
    an inline row. The "Add item…" field no longer sits under every task: on a task with no items
    it appears on hover or keyboard focus of the row, or after choosing Add item from the menu
    (the touch path). List filter chips wrap instead of scrolling behind a hidden scrollbar.
  - _Settings → Profile._ "Display Name" and "Identity Name" collapse into one **Name** field
    (`profile.name`). The legacy `Identity/Name` key is still read as a fallback by the field, the
    dashboard greeting and the public library share page (which previously ignored it); clearing
    the field removes both keys. No data is migrated.
  - _Library._ The summary strip drops its coloured bordered stat cards and per-media-type colours
    for the house style: a `db-section-label` "Overview" heading, flat tabular figures, muted
    labels and hairline rules. Status colours move onto tokens (active = the amber accent;
    paused, previously a second amber identical to active, is now neutral; finished / dropped =
    positive / danger), as do undefined-variable fallbacks that rendered indigo and white-on-amber.
    Cover cards use the shared `card-lift` hover instead of inline mouse handlers. The detail page
    gets the same status tokens, section labels and heading scale, and leaves the
    `lint-tokens.sh` raw-hex allowlist. Visual only — no logic changes.

- **Meal photo analysis: ~2 min -> the cost of one photo.** A single meal log was 17 model calls,
  all serialized — 2 vision calls at ~50 s and 15 USDA selections at 1.2 s each, the selections
  queueing behind the photos rather than computing. Three of them hit the 60 s timeout, and a
  timed-out selection falls back to USDA's top hit, which is how "chicken breast, cooked" becomes
  breaded microwaved tenders; this was losing accuracy, not only time. The photo path now uses its
  own ~150-token prompt instead of the ~750-token text one (whose every example is a typed
  sentence), identification runs on qwen2.5vl:3b while label OCR keeps the 7b, the selections run
  concurrently rather than queueing, and `usda_food_picks` remembers what a food resolved
  to so a repeat food costs neither a search nor a selection. That memo also pins the answer:
  nothing did before, so the same food could resolve to a different USDA record on a different day
  and move a meal's macros without the meal changing. Pairs with jl-homelab #680, which raises the
  model server from one slot to four. (#713)

- **A recurring task is now one row, not a fortnight of rows.** The spawner materializes
  occurrences two weeks ahead (#468) and the list rendered every one of them, so five "Water the
  plants" rows read as five chores rather than one recurring chore. The repeat was expressed as
  duplication instead of as a property of a task, which buried the real to-do list and hid the
  recurrence itself.

  `/tasks` and the dashboard now show the **oldest outstanding occurrence** per series; completing
  it hands the row to the next one. Purely a rendering change — occurrences, history, `ends_on` and
  the expiry warning (#689) are untouched.
  - **`+N missed`** badge when earlier occurrences went by undone, so being three waterings behind
    is visible without three near-identical rows competing for attention. Only occurrences that
    were actually **due** count; future ones would otherwise make every series look permanently
    overdue.
  - The dashboard's "N active" count and top-tasks list use the same collapse — previously a
    fortnight of generated dates inflated both.
  - A **detached** occurrence ("this occurrence, not the series") keeps its own row, which is the
    point of detaching.

### Added

- **The recipe audit now checks whether an `fdc_id` names the right food (#708).** Every existing
  check verified a pin for _consistency_ — that the arithmetic adds up, that a batch declared its
  portions. None asked whether the pinned USDA record actually describes the ingredient on the line,
  which is the defect that keeps recurring and has never once been caught by tooling:
  - **#672** — gochujang priced as **sriracha** (171188) and as **condensed black bean soup**
    (171141).
  - **#707** — `frozen blueberries` pinned to **171706, "Avocados, raw, California"**.
  - Both found by a person happening to look.

  These survive because a wrong pin is invisible in the totals. In #707 the pin had never even been
  spent — the stored macros came from the right food — so **every number on the page was correct
  while the citation was wrong**. That makes it a landmine rather than an error: re-resolving is
  routine, and re-resolving that recipe would have taken it from 256 to 321 kcal and 2.1 to 9.9 g
  fat.

  Three checks, in decreasing order of how much they cost to run:
  - **`pin-inconsistent`** — one food pinned two different ways across the library. Pure, no
    network, so it runs inside `audit()` and is always available. It is also the sharpest: the
    disagreement is the signal, and a library that prices one food two ways is wrong at least once
    whichever way is right. Names are compared through `normalizeFoodName`, shared with the
    inventory draw from #706, so "chicken breast, boneless skinless" and "Chicken breast raw" count
    as one food.
  - **`pin-wrong-food`** — the stored item text and the resolved USDA description share no word.
    Costs one FDC lookup per distinct id (74 today, cached a day by `getFood`, six at a time).
  - **`pin-wrong-state`** — both sides declare a value on the same axis and they differ: the line
    says `nonfat`, the record is `lowfat`; the line says `frozen`, the record is `raw`. Both are
    real #707 cases that the head-noun check passes, since yogurt is still yogurt.

  **A note explaining the substitution silences a finding.** Some pins are deliberately not the same
  food because USDA has no record for the real one — burrata is priced on whole-milk mozzarella,
  Thai basil on sweet basil — and the library already writes that down. Honouring that convention is
  what keeps the report worth reading: an audit that flags known, documented, deliberate choices
  every week is an audit that gets muted, which is the failure `STANDING_BACKLOG` already exists to
  prevent and the one that let #673's heat check sit unread while 29 recipes drifted past it. The
  escape hatch has the right incentive too — the way to silence it is to write down why.

  `isPlausibleMatch` gained an `allowBranded` option for the one caller that is _checking_ a pin
  rather than choosing one. Rejecting branded records is correct at search time and wrong here:
  `20260823120000` pins gochujang to FDC 2113732 (SUNCHANG) precisely because USDA has no generic
  record, and re-applying the search rule would report four correct pins every week.

  **What it found on the first run over the real library** — 8 findings in 83 recipes, no false
  positives, including three genuine mis-pins nobody knew about: `scallions` pinned to
  **"Onions, canned"** (371 mg sodium/100 g vs 16), `chicken breast` pinned once to **"Chicken,
  broilers or fryers, meat only"**, and `olive oil` pinned twice to **"Oil, corn, peanut, and
  olive"** — a blend. The other five are duplicate USDA records for one food.

- **`src/__tests__/pin-audit.test.ts`** — 20 cases built from the real stored strings and the real
  USDA descriptions, covering all three historical defects, the corrected pins staying silent, the
  branded-pin exemption, the parenthetical that bridges "Thai chilies" to "Peppers, hot chili", and
  the `dry` vs `raw` pair that is the same food said two ways and must not flag.

- **"Cooked it" — cooking now moves raw ingredients out of the kitchen (#649).** `cooks` holds
  prepared leftovers and `inventory_items` holds the raw ingredients they were made from; the
  schema has called them counterparts since #641, but nothing ever moved mass between them.
  Cooking a batch spent 1149 g of chicken and the fridge went on reporting it.

  The failure is **silent and directional** — inventory only ever over-reports, so the next fridge
  audit plans a meal around food that is already eaten and the expiry flags fire on ghosts. Seen at
  least twice (broccolini 2026-08-08, red bell pepper 2026-08-12), both caught only because
  something else prompted a look. Until now the only fix was to decrement by hand in a session.

  A new **"Cooked it"** button on a recipe-backed planned meal records the batch and draws its
  ingredients down. It **previews before it commits**: every matched line with its amount, and
  every skipped line with the reason. Inventory has no second source of truth — a draw on the
  wrong row is wrong forever and looks exactly like a draw that is right — so the amounts are
  shown rather than reported after the fact.
  - **The ingredient list is the BATCH.** `ingredients_json` describes `typical_portions`
    servings while `recipes.calories` describes one, so the draw is the list scaled by
    `portionsCooked / typicalPortions`. Reading the list as per-serving would have drawn four
    times the chicken a 4-portion batch actually used.
  - **Matching is `fdc_id` first, normalized name second.** Recipe lines already pin the USDA
    record their macros came from; the new `inventory_items.fdc_id` lets a stock row carry the
    same id, which turns the match into an equality test. The name fallback strips brand
    parentheticals and state words and then requires the token sets to be **equal** — not
    overlapping, not a subset. Subset matching looks more helpful and is not: `{garlic}` is a
    subset of `{garlic, powder}`, so a recipe wanting fresh garlic would quietly draw down the
    jar of powder.
  - **Nothing is ever guessed.** Staples (`quantity` null), rows whose unit is not a weight
    (`4 can`, `1 bottle`), lines with no weight to read, and anything unmatched are skipped and
    listed with a reason. A recipe wanting 250 g of black beans against a row holding "4 can" has
    no honest conversion, and inventing a can size is exactly the fabrication the nutrition
    pipeline forbids. Most lines will be skipped most of the time — showing them is what keeps
    the panel trustworthy, since silence is indistinguishable from a draw that did nothing.
  - **Perishable-first** when the same food is in two places: fridge → counter → freezer →
    pantry, then soonest-to-expire within a location. Drawing the frozen copy first would leave
    the one with a deadline to rot while the count still looked right.
  - **Draws are reversible.** `inventory_draws` records what each cook actually took, and
    deleting the cook gives it back. The amount restored is the delta that was **applied**, not
    the amount requested: a 60 g request against a 40 g row draws 40, and recomputing "60" from
    the recipe at delete time would hand back 20 g that never left.

  The restore is a **database trigger**, not delete-handler code, for the reason `20260813120000`
  and `20260825120000` already record: cooks get deleted straight through PostgREST with the
  service key — that is how the duplicate Lamb Pasta rows were removed on 2026-08-16 — and a rule
  enforced only on the app's own path is not enforced.

  **Deliberately unchanged: "Ate this" still draws nothing.** It bundles cook-and-eat into one tap
  and has no confirmation step, and an unconfirmed draw is the exact failure this feature exists
  to avoid. Use "Cooked it" for a batch; the raw ingredients are spent when the pan comes off the
  heat, not portion by portion as the leftovers get eaten (Jason's rule, 2026-08-16).

- **`src/__tests__/inventory-draw.test.ts`** — 20 cases, most of them asserting **refusal**: that
  "Garlic, raw" does not match "Garlic powder", that 93/7 beef is not 80/20, that a count unit is
  never converted, that a staple is left alone, that two lines wanting the same row cannot
  together spend more than the row holds. Names and quantities are taken from the live library and
  live kitchen, since the matcher's whole job is to work on those exact strings.

- **Macros and `macros_computed_at` are one unit, enforced for every writer**
  (`20260825120000_recipe_macros_atomic.sql`). `macros_computed_at` is the only column the UI reads
  to decide a recipe is real — `KitchenPanel` gates `canEatRecipe` on it — and it is stamped in
  exactly one place, the USDA resolver in `recipe-macros.ts`. A writer that fills `calories`/
  `protein_g`/etc. directly never stamps it, so the row carries perfect macros, renders "Macros not
  resolved yet", hides "Ate this", and falls through to the status-only button: the plan flips to
  `eaten` and **no `meal_log` row is written**. The meal silently logs nothing.

  This happened twice, both from direct PostgREST writes with the service key — 18 recipes on
  2026-08-08 (found only because the logged meals were missing) and `Avocado Toast` on 2026-08-25,
  planned into the snack slot for 8/25 and 8/26 and caught before either was tapped. Same reasoning
  as `20260813120000`: the TypeScript guard from #670 covers the app's own editor, the one path that
  has never broken this.

  The rule extends the existing `recipes_check_invariants` trigger rather than adding a separate
  constraint, and **widens its column list** — it previously fired on
  `(ingredients_json, calories, typical_portions, name)`, so clearing `macros_computed_at` alone
  tripped nothing. Partial macros are rejected, complete macros without the stamp are rejected, and
  a stamp with nothing behind it is rejected. **All-null stays legal** — the `Eating out`
  placeholder deliberately carries no macros so a meal out still satisfies "every plan has a
  recipe" (`20260721000001`); this rejects _partial_ macros, not their absence. `fiber_g` is in the
  required set: a null reads as 0 against the 30 g daily target, an understatement that looks like a
  real number. No backfill — 83 recipes, 82 complete, 1 intentional placeholder, 0 with `fiber_g`
  null.

- **"Stop repeating" on a recurring row.** `deleteSeries` has existed since #468 but only as an MCP
  tool — the UI could _create_ a series and never end one. The only lever the app offered was
  archiving occurrences, which looks like stopping the chore and isn't: archive skips those dates,
  and the next spawn window repopulates. Two-step confirm; completed history is kept, future
  unfinished occurrences are removed.

- `src/__tests__/collapse-series.test.ts` — 7 cases pinning the two things that fail
  _plausibly_: showing the newest occurrence instead of the oldest (three days behind reads as up
  to date) and counting future occurrences as missed (every series looks overdue). Both produce a
  believable list, which is why they need a test rather than a look.

### Fixed

- **The README described a repository that no longer exists (#700), and now a CI job says so.**
  It claimed **35**, **44**, **30** and **26** tools in four places — three of them calling it
  "the same N tools" while disagreeing with each other. The migration list stopped four months
  short at 46 entries against 68 real files. `.mcp.json` was described as holding the claude.ai
  Calendar and Gmail connectors, which live on the account, not in this repo.

  The file tree was worse than the issue knew. #700 spotted one deleted route
  (`api/chat/route.ts`, gone since #476). Parsing all 234 entries and checking each against disk
  found **thirteen**, including the entire `voice/` directory and
  `dashboard/sync-button.tsx` — deleted in #296, in April. Nobody finds those by reading.

  **The fix is a check, not another correction.** The tool count had already been found wrong once
  before (#464, April) and hand-corrected; it drifted again. A number a human retypes is a number
  that goes stale, so `scripts/check-docs.mjs` now derives three facts from the repository and CI
  asserts them:
  - every `N tools` claim equals `tool(` across `web/src/lib/tools/`
  - the migration summary's count and newest filename match `supabase/migrations/`
  - every path in the file tree exists

  `--fix` rewrites the two derivable numbers; paths are left to a human, because only a human knows
  whether an entry was deleted or moved. The job depends on nothing but `node` — no `npm ci` — so
  it stays the cheapest in the workflow and cannot rot itself.

  It deliberately does **not** require every file to appear in the tree. The tree is a guided tour,
  not an inventory, and demanding exhaustiveness would fail CI on every new file until someone
  disabled the check — which is the failure this whole exercise is about.

  Also in this pass: the 46 hand-typed migration filenames collapsed to one derived summary line
  (the directory is the source of truth), and `lib/nutrition/` — the largest module in the app and
  absent from the tree entirely — documented, including `inventory-draw.ts` from #649 and the
  `recipe-audit.ts` pin checks from #708.

- **The calendar showed tomorrow every evening after 5 PM (#685).** The week and month grids are
  built entirely from local `Date` fields — `new Date(y, m, d)`, `setDate()`, `getDay()` — but each
  view then read the key back out with `toISOString().slice(0, 10)`, which re-reads those local
  fields as UTC. West of Greenwich that shifts any evening instant forward a day, so:
  - the **"today" highlight** in the week and month views moved to tomorrow's column at 5 PM PDT,
  - the **day view** fetched and rendered _tomorrow's_ events for the rest of the evening, because
    its request window is `isoDate(current)` on a `new Date()`,
  - **"Add event"** pre-filled tomorrow's date — overriding the `todayString()` default that #686
    had already put in `EventModal`.

  The three views each carried their own copy of the same wrong `isoDate` helper. All three now use
  one **`localDateString(d)`** in `lib/timezone`, which reads the local fields it was given instead
  of routing them through UTC. This also fixes the grid east of Greenwich, where the error runs the
  other way: a local-midnight cell read as UTC lands on _yesterday_, so **every cell** in the month
  grid was mislabelled — not just the evening hours. That matters for a trip to Japan, not only in
  theory.

  Same class as #686, which fixed the two _writes_ (`cooks.cooked_on`, `meal_log.date`) and left the
  read-side calendar keys as out of scope. This closes that remainder.

- **Google Calendar answered in each calendar's own timezone, not the user's.** `events.list` was
  called without a `timeZone`, so Google formatted `start.dateTime` in whatever zone each calendar
  defaults to. Jason's **Formula 1** and **Family** calendars are UTC, and their events came back as
  bare-`Z` instants — `start.slice(0, 10)`, which is the bucketing key in both calendar views and
  the filter in the `list_events` tool, then put an evening Pacific event on the next day. All three
  `events.list` call sites now pass `timeZone: USER_TZ`.

- **Two more UTC-derived "today" defaults**, the same expression #686 replaced elsewhere: the admin
  tenant quota card's `last_reset` placeholder, and the data-export filename
  (`mr-bridge-export-YYYYMMDD.zip`), which named an evening export after tomorrow.

- Not changed, and deliberately: `habits/momentum-line.tsx` was on #685's audit list but is
  **correct** — it anchors at `T00:00:00Z`, steps with `setUTCDate`, and reads back with
  `toISOString()`, so it is UTC end to end and its window comes from the already-tz-correct
  `getLastNDays()`. `addDays`, `journal/prompts.shiftDate`, `sync/google-health.dateStr` and
  `backlog/igdb` are anchored to explicit instants, as #686 recorded. `api/packages/route.ts`, also
  on the list, no longer exists — packages were dropped in `20260824120000`.

- **`src/__tests__/timezone-dates.test.ts`** gains 5 cases for `localDateString`, written to hold in
  **any** runtime timezone: each builds a `Date` from local components and asserts it formats back
  to those components. 196/196 pass under `America/Los_Angeles`, `America/New_York`, `UTC` and
  `Asia/Tokyo`. Against the **old** helper those same 5 cases fail 3/5 in Pacific, 2/5 in Tokyo and
  New York — and **0/5 under UTC**, which is why the bug survived: UTC is the only zone in which the
  wrong implementation looks right, and UTC is what the container runs.

- **Task mutations failed silently (#687).** Complete, archive, rename, add-subtask,
  complete-subtask, delete-subtask and the edit panel all greyed the row, un-greyed, and left the
  task unchanged. The write never landed, and nothing said so.

  The server actions in `tasks/page.tsx` signal failure by **returning** `{ error }` rather than
  throwing. Every consumer in `task-item.tsx` awaited them and dropped the return value, so nothing
  rejected, `useTransition` resolved normally, `isPending` flipped back, and the row un-greyed
  looking exactly as it had. **The UI reported success by omission.** A hand reload was the only
  way to discover the change was gone.

  All mutations now route through a single `runAction` helper that surfaces the outcome into **one**
  row-level error slot per row — not one per mutation. It also catches outright rejections (a
  dropped connection, an RSC transport error), which previously produced an unhandled rejection and
  the same silent grey-then-nothing.
  - Errors persist until dismissed or until the next successful mutation on that row. Not
    auto-cleared on a timer — that would make the failure invisible again, which is the bug.
  - A failed rename restores the previous title, so the row never displays a value the database
    rejected. A rename that succeeded only in the browser is the same lie as a silent failure.
  - The edit-scope chain ("this occurrence" → detach, then edit) now stops if the detach fails,
    instead of applying the edit to a row still governed by its series.
  - **13 call sites, not the 8 the issue listed** — five more arrived with the recurring-task work
    in #697, which reproduced the same pattern before this was fixed.
  - `smoke/specs/tasks-mutation-errors.spec.ts` pins the user-visible contract: a stubbed 500 shows
    a message and preserves the old value, and a subsequent success clears it.

  Out of scope, as the issue specifies: optimistic updates. The bug was that failures were
  invisible, not that success was slow.

### Fixed

- **Task due-date notifications have never once fired.** Two independent defects, either of which
  alone was enough:
  1. The tasks query used `.not_("due_date", "is", None)`. In supabase-py v2 `.not_` is a
     **property** returning a builder, not a callable, so every run raised
     `'SyncSelectRequestBuilder' object is not callable` before reading a single task. The correct
     form — `.not_.is_(col, "null")` — was already in `coach_check.py`,
     `fetch_planning_data.py` and `fetch_briefing_data.py`; this file was the lone holdout.
  2. It was scheduled nowhere. `scripts/install-notifications.sh` looks like it owns the
     scheduling, but nothing ever ran it on compute-core: `crontab -l` had **zero** `check_*.py`
     entries. The live wiring is jl-homelab's `system/cron/compute-core-crontab`.

  The failure was invisible because the except block printed to stderr and returned **0**, so cron
  saw a clean exit and "no tasks were due" was indistinguishable from "the query crashed". Both
  error paths now `sys.exit(1)`, so the next failure is loud.

  Found while wiring the recurring-task jobs from #468 — the issue told me to mirror this script,
  and mirroring it meant reading it.

  Verified live: fires an Overdue and a Due Today push for seeded tasks (both `curl_exit=0`),
  stays silent on a second same-day run via the existing 24h per-task dedup, and exits 1 against an
  unreachable database instead of pretending success.

  **Scheduling note:** `.env` sets `SUPABASE_URL` to `http://host.docker.internal:8000`, a
  container-internal address that does not resolve on the host. Host-side cron entries must
  override it to `http://localhost:8000` — the same override every existing entry already carries.
  Scheduling it without that would have reproduced the silent failure in a new way.

### Removed

- **Package tracking and important-emails widgets, and with them the `gmail.readonly` OAuth
  scope (#693).** Both carried data too unreliable to act on: packages were a heuristic scrape of
  shipping-confirmation mail that missed shipments (#572 was filed for exactly that, closed, and
  the accuracy problem persisted), and "important emails" was a keyword match on unread mail.
  Neither earned the dashboard space, and together they were the only reason the app could read a
  mailbox at all.

  Full teardown rather than hiding the widgets, because the scope only comes off once nothing
  reads Gmail: both dashboard components, `/api/packages`, `/api/sync/packages`,
  `/api/google/gmail`, `lib/sync/packages.ts`, the Gmail MCP tools, the `packages` step in the
  cron sync, the `Package` type, `packages.json` from the export archive, and the `packages`
  table.
  - **The scope does not shrink retroactively.** Google keeps an existing grant intact, so a
    refresh token issued before this change still carries Gmail until the account re-consents.
    `include_granted_scopes: false` means a fresh authorization issues a correctly narrowed
    token — so **disconnect and reconnect Google in settings after deploying**, then confirm at
    myaccount.google.com. Until you do, the integrations settings page shows
    "Still granted: Gmail. Disconnect and reconnect to drop it." on the Google row; it clears
    itself once the grant is narrowed.
  - The Google row's "last synced" line is gone. It was fed by the packages sync — the only thing
    the Google integration ever synced — so with packages removed it would have read "Never
    synced" forever.
  - `estimate_user_storage` needed no rewrite: unlike the chat-table removal in #611, it never
    enumerated `packages`. Verified against the live function rather than assumed.
  - `sync_log` keeps its historical `source='packages'` rows. Nothing reads them, and deleting log
    history is not required to drop the scope.

### Added

- **Recurring tasks (#468) — a series rule plus generated occurrences, with an end date that warns
  before it lapses (#689).** "Dose the aquarium every Sunday until 2026-12-31" and "water the
  plants every 3 days" are now expressible, and a series that is about to run out says so while you
  still remember what it was for.

  `task_series` holds the rule; `tasks` rows carry `series_id` + `occurrence_date` and are
  materialized two weeks ahead. The shape was chosen over the cheaper `repeat_days`-on-`tasks`
  option specifically because that one has no series object — nothing to hang `ends_on` off,
  nothing to warn about, and no way to extend "the series" because none exists. It also drifts:
  roll-forward-on-complete means finishing Sunday's chore on Wednesday moves every future
  occurrence, so "every Sunday" quietly stops being every Sunday. Occurrence dates here always
  derive from `starts_on`, never from the previous occurrence or its completion.
  - `tasks_series_occurrence_uniq` on `(series_id, occurrence_date)` is what makes spawning
    idempotent — a re-run, an overlapping window, or the cron racing a UI create cannot
    double-create a chore. Both spawners lean on the index rather than on their own bookkeeping.
  - **Editing an occurrence asks which you meant** — this occurrence, or the whole series. Picking
    one silently is the classic recurring-task bug. "This occurrence" detaches the row so a later
    rule change cannot overwrite it; "the whole series" regenerates future _unfinished_ occurrences
    and leaves completed ones with the title they were done under.
  - Deleting a series keeps completed occurrences as ordinary tasks (`on delete set null`) and
    removes only future unfinished ones.
  - `scripts/spawn_task_occurrences.py` (cron) keeps the window full; `web/src/lib/tasks/series.ts`
    spawns eagerly on create/extend so a new series is visible immediately instead of looking
    broken until the next cron run.
  - `scripts/check_series_expiring.py` warns at `max(14 days, 3 x interval)` — a weekly series
    gives you fewer chances to notice than a daily one — pushing via ntfy and writing a
    `series_expiring` notification. **Extend** (+3 months or a picked date) re-arms the warning for
    the new date; **Let it end** suppresses it permanently, because an explicit dismissal is not
    forgetting. Open-ended series never warn, by design.
  - Seven MCP tools: `get_task_series`, `create_task_series`, `update_task_series`,
    `extend_task_series`, `dismiss_series_expiry`, `delete_task_series`, `detach_task_occurrence`.
  - `tests/test_recurrence.py` pins the arithmetic that fails silently: month-end clamping (Jan 31
    - 1 month is Feb 28, not Mar 3), biweekly phase across a resumed window, a weekly series not
      emitting days earlier in its own first week than `starts_on`, and inclusive `ends_on`.

  **"Every 2–3 days" is stored as every 3 days.** A range is not a cadence, and a `flex_days`
  column is easy to add later but awkward to backfill meaning onto. Shipping rounded to see whether
  the imprecision actually matters.

  Calendar blocks are deliberately not applied to a series in v1 — scheduling a whole series onto
  Google Calendar is its own problem, and blocking only the first occurrence would be a lie. The
  add form says so rather than failing quietly.

### Fixed

- **The weekly recipe audit no longer notifies about its own known backlog.** Its first live run
  returned 45 findings, **43 of which were `unpinned-fdc-id`** — a documented, accepted pile that
  `20260813120000_recipe_invariants.sql` deliberately declines to enforce because those foods have
  no safe USDA match ("visible, not fatal"). Left as-is it would have pushed every Monday forever,
  and an alert that is always on is an alert that gets muted — which is exactly how #673's heat
  check sat unread while 29 recipes drifted past it. The notification now fires on **actionable**
  findings only; the backlog is still returned in the JSON and named in the message body.
- Two remaining timed steps that never said how hot (`Chicken + Black Beans + Roasted Sweet Potato`,
  `Chicken Breast + Brussels Sprouts + Black Beans`). The library is now clean on every enforced and
  advisory check except that standing backlog.

### Added

- **The recipe audit now actually runs.** `GET /api/cron/audit-recipes` runs the full library audit
  weekly from the compute-core crontab, bearer-authed exactly like `/api/cron/sync`, and pushes an
  ntfy notification plus an in-app `notifications` row **only when there are findings**. Silence is
  the normal case; a job that pings every week regardless gets muted and is worth nothing again.

  This closes the gap that produced the previous PR. `scripts/audit-recipes.ts` has existed since
  **#673**, already exited 1 "so it can gate a cron or a CI job" — and nothing ever gated on it, so
  29 recipes drifted straight past a heat check that was already implemented. Two constraints ruled
  out the obvious homes: CI can't reach the tailnet-only database from a GitHub runner, and
  **compute-core has no `node` installed**, so a TypeScript file cannot execute on the host at all.
  The app container is the only runtime available, which is why this is an endpoint.

### Changed

- The audit moves from `web/scripts/audit-recipes.ts` into `web/src/lib/nutrition/recipe-audit.ts`,
  shared by the CLI and the new route. Two copies of a drift detector is precisely the failure the
  detector exists to catch. The script keeps its human-readable output and stays the by-hand entry
  point.

### Added

- **Recipe invariants for rice naming and gochujang measurement, enforced at every writer.** Jason
  spot-checked one recipe on 2026-08-23 and found three convention breaches; a scan of all 82
  recipes found the rules had drifted library-wide. Two are now hard invariants, in
  `parseIngredientRows` **and** the `recipes_check_invariants` trigger, so PostgREST and psql are
  covered as well as the app editor.
  - **Rice must be named so `annotateRice` can fire.** The `go` is appended at render time and only
    matches `"<n> g dry <grain> rice"` or `"<n> g cooked white|brown rice"`. Nine lines across five
    recipes were stored as `Brown rice, long-grain, DRY` — correct-looking to a human, invisible to
    the annotator, so no `go` rendered at all. All 26 rice rows now render one.
  - **Gochujang keeps grams as the quantity and carries the spoon in its label.** All seven rows
    were wrong, in two _opposite_ directions: three had bare grams with no spoon, four had the spoon
    as the quantity (`2.5 tbsp gochujang (45 g)`) — the inverse error, and the one that actually
    breaks a re-resolve. The previous trigger exempted gochujang from the spoon rule outright, which
    was too blunt.

### Fixed

- **Gochujang was priced four different ways across the library — 93, 190, 210 and 230 kcal/100 g.**
  Two rows proxied it with **sriracha** (FDC 171188, 79 kcal/100 g, a 2.5x understatement) and one
  cited FDC 171141, which is _condensed black bean soup_. All re-based onto FDC **2113732**
  (SUNCHANG gochujang, 200 kcal / 5P / 45C / 5 fib per 100 g), whose 20 g serving size also confirms
  the `1 tbsp = 20 g` conversion the recipes already assumed. Net effect was small: Spicy Udon
  +25 kcal, Gochujang Beef + Kimchi +11/serving, everything else under 5.
- **Two more mis-pinned `fdc_id`s with correct arithmetic and wrong citations**, so no total looked
  off: `172346` (cited as chicken thigh) is **margarine**, and `169704` (cited as dry brown rice) is
  the **cooked** record — the latter sitting on a 100 g dry line, a latent 247 kcal loss on the next
  re-resolve.
- **Heat levels added to 31 recipes.** `timedStepsMissingHeat` has reported these since #673 and
  nothing ever ran it, so 29 recipes still gave times with no burner setting. Steps now name
  `HIGH`/`MEDIUM`/`LOW`, an oven temperature, or an explicit water state, and say when the heat
  _changes_. Four recipes had no `steps_json` at all.

### Changed

- `audit-recipes.ts` gains `gochujang-label` and `rice-not-annotatable` findings. Heat remains
  advisory rather than a trigger on purpose — inferring "this step applies heat" from prose has a
  real false-positive rate (17 of 69 on its first run, 8 of 11 again on 2026-08-23), and a trigger
  that throws on a false positive would block editing a correct recipe.

- **Task calendar scheduling: all-day blocks, explicit end time, and add-from-create.** Refines the
  Phase 2 scheduler on feedback: the per-task panel now takes a **start and end time** (15-minute
  steps) instead of a duration dropdown, and **blank times mean an all-day event**. The add-task
  form gains a **calendar toggle** — off by default — that reveals start/end time inputs, so a task
  can be dropped on the calendar as it's created (using its due-date, or today, as the date; all-day
  if no times). New `tasks.scheduled_all_day` flag; `scheduleTask` and the `schedule_task` MCP tool
  now take a discriminated block (all-day date vs timed range). All-day dates are stored as noon-UTC
  so the calendar day never shifts across time zones.

- **Schedule a task onto Google Calendar (time block).** A task can now be dropped on the calendar
  as an explicit block: a calendar button on each row opens a date + time + duration picker
  ("Add to calendar"), and the row shows a chip with the block time. New nullable columns
  `tasks.calendar_event_id / scheduled_start / scheduled_end`, and a `scheduleTask` / `unscheduleTask`
  helper that mirrors the workout_plans calendar pattern — create/patch/delete the event on
  `primary`, store the event id back on the task, and **partial-success** on failure (the block is
  saved even if Google isn't connected; the UI shows a soft warning). MCP tools added:
  `schedule_task`, `unschedule_task`; `get_tasks` now returns the block. Phase 2 of the tasks
  overhaul (lists → **calendar** → history → dependencies #470). Completing/archiving a task leaves
  its event in place for now — auto-clearing a future block is a possible follow-up.

- **Task lists (TickTick-style folders).** Tasks can now be grouped into named lists — Groceries,
  Health, etc. — instead of a flat checklist. New `task_lists` table (RLS-scoped per user) + a
  nullable `tasks.list_id` (`on delete set null`, so deleting a list never deletes its tasks — they
  fall back to Uncategorised). A migration promotes each existing distinct `tasks.category` to a
  list and backfills `list_id`. The `/tasks` page gains a scrollable tab bar (All · each list ·
  Uncategorised · + new), filters via `?list=`, and lets you create/rename/delete lists and assign
  a task's list from the add form or its edit panel. MCP tools added: `get_task_lists`,
  `create_task_list`; `add_task` gains `list_id`. List dots are neutral for now — a colored-dot
  pass (via `globals.css` tokens) is a fast-follow. First phase of the tasks overhaul (lists →
  calendar → history → dependencies #470).

### Documentation

- **`data-sources.md` mislabelled `user_metric_preferences` as a units table.** The row read
  "Unit preferences (kg/lb)", but the table has nothing to do with units — it maps a metric
  category to a preferred data source (`(user_id, metric, preferred_source)`, e.g. HRV from Oura,
  body composition from Google Health) and is written by the `/settings` integrations panel. The
  wrong label sent a session hunting a unit-conversion bug that did not exist. Corrected the row and
  added a note that units live solely in `profile.weight_unit` — storage is canonical kg, converted
  at the UI boundary by `web/src/lib/units.ts`. (#653)

### Fixed

- **Dates were logged in UTC, so anything after ~5 PM Pacific was stamped with tomorrow.** The
  container clock is UTC, so `new Date().toISOString().slice(0, 10)` — used to default
  `cooks.cooked_on` and `meal_log.date` — returned the _next_ day for the last 7-8 hours of every
  day. A shrimp dinner cooked at 5:53 PM PDT on 2026-08-19 was written as `cooked_on 2026-08-20`,
  dating the leftovers into the future in a fridge list whose whole job is "eat the oldest thing
  first"; any meal logged after 5 PM would likewise have landed on the next day's intake total.
  Both defaults now use `todayString()` from `lib/timezone`, which formats in `USER_TIMEZONE`
  (default `America/Los_Angeles`) — the helper already existed and this module simply never used it.
  Same fix applied to the two other user-facing "today" defaults: the new-calendar-event date and
  the onboarding date-of-birth `max`.

  The weekly planner (`/api/internal/plan`) had the same bug in a nastier form: it built its week
  window from `new Date()` + `getDay()` on a UTC server, so planning on a **Sunday evening Pacific**
  read the clock as Monday and returned the Monday _after_ the week that was about to start —
  silently skipping a week. Its window is now date strings throughout, via a new
  `comingMonday(from)` helper. New `src/__tests__/timezone-dates.test.ts` pins all of it, including
  DST boundaries and the exact instant that produced the bad row.

  Deliberately **not** changed: `addDays`, `journal/prompts.shiftDate` and `sync/google-health.dateStr`
  also call `toISOString()`, but each is anchored to an explicit UTC instant (noon-UTC, or an
  already-offset-shifted timestamp) and is correct as written.

- **Add-task box could "disappear" after adding, and time pickers ignored 15-min steps.** Two
  regressions from the calendar work: (1) the title input was `flex-1 min-w-0`, so the extra
  scheduling controls in the row could squeeze it to zero width — it now has a real minimum width;
  and pressing Enter fired the submit twice (the input's key handler _and_ the form's native
  submit), racing two adds — the key handler now `preventDefault`s. (2) `<input type="time"
step="900">` doesn't actually constrain the picker to quarter hours (especially on mobile), so
  start/end time are now a `TimeSelect` dropdown of 15-minute slots, identical on phone and desktop.

- **A deliberate rest day counted as a missed session.** `coach_check.py`'s miss streak keyed off
  session-existence alone and ignored `workout_plans.status`, so a `cancelled`/`skipped` day (a
  chosen rest) read as a miss — inflating the streak that escalates coaching (2 misses cuts volume,
  3 concludes the program is wrong). With the completion flip from #666 now writing real statuses,
  the count reads them: a miss is a `planned` day with no session; `cancelled`/`skipped`/`completed`
  are skipped. Extracted the count into a pure `consecutive_misses()` with unit tests, and made
  `coach_check` importable on a bare interpreter (its `_supabase` import moved into `main()`) so the
  helper can be tested without dependencies. This is the residual half of #666 — the rule that "a
  rest is not a miss" now lives in code instead of a memory note. (#666)

- **A completed workout still read as a miss.** Nothing in the app ever moved
  `workout_plans.status` off `planned` — logging the workout left the plan `planned` forever, and
  `coach_check.py` escalates off consecutive missed _planned_ days (2 misses drops volume, 3
  concludes the program is wrong). A stale past `planned` row is indistinguishable from a miss, so
  an audit found 11 past plans still `planned`, **9 of them sessions actually completed** — the
  coaching loop was reading near-total failure during a consistent training block, the same
  open-loop defect that killed the first coaching attempt.

  Logging a set (`POST /api/strength-sessions`) or saving the end-of-workout recap (`PATCH`) now
  flips the linked plan to `completed` via a shared `markPlanCompleted` helper. The recap is
  optional, so both paths write it — a sets-only workout no longer stays `planned`. The flip is
  idempotent (a `.neq('status','completed')` guard makes repeat set-logs a no-op) and non-fatal
  (a failure is surfaced as `workout_plan_update_error`, never swallowed). A migration backfills
  historical rows by FK or same-date match. (#666)

- **"Ate this" logged a fraction of a batch meal.** `cooks` stores the whole cook; `recipes` stores
  one serving. `createCook` copied the recipe's figures in unscaled, so a cook came out short by
  exactly its batch size — and `eatFromCook`, which divides the cook total by `portions` to get a
  serving, then wrote a fraction of a real plate to `meal_log`. A 902 kcal serving of Lamb Pasta was
  logged as **451**.

  This was a regression from making `recipes.calories` per-serving. Before that change the column
  held the sum of the ingredient list, so copying it straight in was correct. It survived review
  because the wrong number is the right one divided by an integer: 451 reads as a plausible small
  lunch, not as an error. The round trip is now pinned by tests — cook total ÷ portions must equal
  the serving you started from, for every batch size.

- **The effort field asked an ambiguous question.** `Perceived effort (1 easy — 10 max)` does not
  say _which set_ or _what the scale means_, and it was answered as satisfaction with the session
  rather than RPE: a lift was logged 7, then corrected to 8 with _"some of the reps I was dying — I
  thought you meant how I felt about the workout overall."_ Those readings routinely move in
  opposite directions, and this number drives load progression. Now reads **"Effort on your last
  set (8 = 1–3 reps left · 10 = failure)"**.

  Historical values remain ambiguous by construction; nothing in the data says which question a past
  number answered.

### Fixed

- **Every recipe in the library now says how hot.** The `timed-step-no-heat` check went from 41
  recipes to **zero**: 45 steps across 33 recipes were rewritten with the heat level, pan guidance,
  covered/uncovered state and doneness cue taken from the sourced technique families in
  `docs/technique-sources.md`. Quantities were not touched — only how the food is cooked.

  Three timings were corrected against the sources rather than merely annotated. Brown rice was
  written at 25-30 min in one recipe and 40 in another; ATK and The Kitchn both give **45 min**
  covered on low, and 25-30 leaves it chalky. White rice was at 15 min against their **18-20**.

  The check itself needed two precision fixes found by running it on real data. It demanded an exact
  `boiling water`, so `boiling salted water` was flagged. And it looked for cooking verbs across the
  whole step including tips, so it fired on _"wet tofu will not **brown**"_, _"pat them dry or they
  **steam** grey"_, _"the whole game in an air **fryer**"_, and a tip mentioning a _"**roasted**
  vegetable"_ on a resting step — all steps that heat nothing. It now reads the instruction (first
  sentence, tips excluded), while still flagging a step whose instruction genuinely cooks before it
  rests.

### Added

- **The audit now catches a timed cooking step that never says how hot.** A recipe step read, in
  full, `Simmer 40 min.` Jason set a 40 minute timer and walked away; the chili burned to the bottom
  of the pan and dried out, and was rescued with added water. The step was not wrong about the time
  — it never said what to set the burner to, and a thick bean-and-tomato mixture scorches on
  anything above the lowest setting long before 40 minutes.

  That failure is mechanically detectable: a duration with no heat cue. `simmer`, `boil` and `saute`
  deliberately do **not** count as cues — they name a target state without saying what to set the
  burner to, which is exactly the gap. A burner level, an oven temperature, or an explicit "off the
  heat" does count, and cues are read from a step's `tips` as well as its text. Steps under three
  minutes are exempt, because a check that cries wolf gets ignored — which is how the spoon-unit
  convention decayed twice.

  **41 of 72 recipes matched on the first run.** The four on the current meal plan were rewritten by
  hand with heat levels, pan guidance, stir intervals and doneness cues; the rest are reported.

- **Recipe invariants are enforced in the database, and audited on demand.** The write-path guard
  added previously covers `POST /api/recipes` and `PATCH /api/recipes/[id]` — the app's own editor.
  It does not cover anything talking to PostgREST with the service key, which is how every
  assistant- and script-written recipe has ever been created, and therefore how every defect these
  rules exist to prevent actually got in. A rule enforced only on the path that never broke it is
  not enforcement.

  `recipes_check_invariants` is a `BEFORE INSERT OR UPDATE` trigger that rejects a spoon-measured
  ingredient given a bare gram quantity, and a recipe storing more than 1,200 kcal as a single
  serving. It runs for every writer, psql included. Verified against the live database through
  PostgREST: both violation classes rejected with an actionable message, legitimate writes
  unaffected.

  `fdc_id` pinning is deliberately **not** enforced. 45 ingredient lines have no safe USDA match —
  gochujang has no record at all, and lines like "cod, cooked weight" need a prep-state judgement —
  so a NOT NULL rule would make those recipes uneditable. `web/scripts/audit-recipes.ts` reports
  them instead: visible, not fatal. It also reports undeclared batches, unstamped macros, single-step
  methods and unsplit instructions, exits non-zero when anything is found, and reuses the shipped
  `spoonViolations` rather than restating the rules.

  The audit's first run found **four more recipes storing a whole batch as one serving**, all with
  valid stamps and all silently overlogging: Lemon Garlic Chicken + Pasta at **4,646 kcal per
  "meal"**, Ribeye Roast Meal Prep at 3,884, Chicken/Rice/Green Beans at 2,810, and Turkey Pasta at
  1,623. Each declared its own portion count in its instructions and nothing read it. Corrected by
  division — the batch totals were right, only the divide was missing — taking the lower bound where
  a range was given, so the stored serving errs large and the log never understates.

### Fixed

- **Recipe methods rendered with no numbers, so steps and their asides looked identical.**
  `globals.css` begins with `@import "tailwindcss"`, and Tailwind v4's preflight resets
  `ol, ul { list-style: none }`. `StepList` never restated it, so its `<ol>` drew no markers —
  silently, since nothing errors and the markup is a perfectly correct ordered list. The component's
  own doc comment claimed "numbered steps" and `<li value={s.step}>` set the numbering right; the
  browser simply had nothing to draw. `IngredientList` escaped only because it happens to declare
  `listStyle: "disc outside"`, which is why ingredients looked fine while the method did not.

  The visible result was a recipe card whose method read as one undifferentiated run of lines, with
  the `BATCH OF 2` header and the USDA citation indistinguishable from the cooking steps. Fixed by
  declaring `decimal outside`, and the same latent bug is fixed in the workout plan's exercise
  tips, which had been reserving `paddingLeft` for bullets that never drew.

  The styles moved to `step-list-styles.ts` so a unit test can import them — the test runner cannot
  load `.tsx`, and **the defect was an absent property**, which nothing but an assertion of its
  presence will catch. Type checking cannot see it, and review did not.

### Added

- **Spoon-measured ingredients are now enforced at the write path, not just documented.** "Things
  normally measured by spoon lead with the volume, grams in parentheses" has been a standing rule
  since 2026-07-31 and has been broken twice — first by every recipe authored after the original
  25-recipe sweep, then again by all four recipes on the 2026-08-13 meal plan, which carried
  unmeasurable amounts like `13 g tomato paste` and `4 g avocado oil`. Both times a human caught it.
  A convention that lives only in prose gets re-broken by whoever writes the next recipe.

  `parseIngredientRows` now rejects a spoon-class ingredient given a bare gram quantity, naming the
  item and the fix: `"avocado oil" 4 g -> 1 tsp (4.5 g)`. Suggestions round to a real spoon rather
  than dividing exactly, because 1.78 tsp is not a measurement — rounding to a spoon is the entire
  point, and a gram or two of oil is noise against a meal.

  Gram weights come from each food's USDA `foodPortions` rather than a hand-kept table, because a
  spoon quantity is now _resolved_ by `gramsFor` against the pinned record: the grams printed in the
  recipe and the grams the macro path uses have to be the same number. (The hand-kept table had
  avocado oil at 1 tsp = 5 g; USDA says 4.5.) **Gochujang is exempt** — it has no USDA record at all,
  so no portion table exists to resolve a volume against, and writing `1 tbsp` would leave a
  re-resolve with no way back to grams. It keeps grams and carries the spoon in its label.

  Scoped to the two authoring routes. The backfill calls `ingredientRowsFrom` directly and is
  deliberately unaffected: it converts legacy prose and should not be blocked by a rule about how
  new recipes are written.

### Fixed

- **A batch recipe logged the whole cook as one meal.** `resolveRecipeMacros` persisted
  `total.calories` — the sum of the ingredient list — into `recipes.calories`, which every consumer
  reads as ONE serving, because that is the only reading that makes sense on a planned plate. For a
  recipe whose ingredient list is the batch, those are different numbers, and the gap went into
  `meal_log` rather than onto a screen where it could be noticed. Two recipes were live in that
  state with a valid `macros_computed_at`: the tofu rice bowl (`typical_portions` 2, stored 829 kcal,
  whose own ingredient note read _"this makes a ~1,034 g plate, which is 2 servings, not 1"_) and the
  gochujang beef batch (3, stored 1783). Every "Ate this" on them overlogged by 2× and 3×.

  The resolver now divides by `typical_portions` on write, so the ingredient list can say _1 lb of
  beef, serves 3_ while the stored plate stays ~594 kcal. Dividing on the way in rather than at each
  read is deliberate: there are eight-odd consumers across TypeScript and Python, and one of them
  forgetting is a silent 2× in a health log. The batch figure and the divisor are kept in
  `metadata.macro_batch_total` / `macro_portions` so the division stays auditable.

  `typical_portions` was documented as _"Hint only… Not a claim"_; it is now load-bearing, and
  treating it as decorative is what allowed the two rows above. A null, zero, 1, fractional or
  negative count all pass the total through untouched — a bad value must degrade to inert, never to
  a multiplier. The portion maths moved to a leaf module (`recipe-portions.ts`) so it is reachable
  by the bundler-free unit runner; `recipe-macros.ts` re-exports it, so no import site changed.

- **Single-paragraph recipes got a "method" of one step.** `stepRowsFrom` split only on newlines,
  which is right for the 49 recipes written line-per-step and a silent no-op for any recipe written
  as one prose blob — producing a single step holding the entire text. Valid JSON, so the backfill
  reported success. It hit 15 of 72 recipes, including all four on the current meal plan, which is
  why it read as wholly broken rather than as a fifth broken.

  There is now a sentence fallback for text with no newlines. USDA citations and shouty planning
  asides (`BATCH OF 3 - macros above are ONE SERVING`) are pulled out of the numbered method and
  attached as `tips` on the adjacent step, which `StepList` already renders muted — a citation is
  real and load-bearing, and actively misleading as step 6. The aside rule anchors on specific
  openers rather than on "looks like caps", because mis-classifying a real step would silently
  delete it from the method. Decimals and mid-sentence semicolons do not split.

- **"Logs no macros" was only ever said in a tooltip.** An unresolved recipe falls through to a
  status-only path that marks the plan row eaten and writes no `meal_log` row. That was already
  labelled — button copy "Ate it" rather than "Ate this", plus a `title` — but `title` never appears
  on touch, and this panel is used from the installed PWA on a phone, where the two outcomes
  differed by one word. The consequence is now stated inline in the row. The recipe "Ate this"
  tooltip also described its figure as `kcal for the batch`, which stops being true with the
  per-serving change above; it now reads _one serving_.

- **Recipe ingredients rendered as a raw JSON array, and rice lost its `go`.** Both were visible on
  the same screen. `recipes.ingredients` is a free-text column holding one ingredient per line, and
  both render sites (`PlannedMealDetail`, the `MealsClient` recipe browser) dropped it into a single
  `<p>` with `white-space: pre-line`. That held only while every writer wrote clean newline text —
  when a batch script JSON-encoded the array _into_ the text column, the page printed
  `["Chicken breast, boneless skinless - 255 g", ...]` verbatim. Eight recipes were affected,
  including four meals planned for the current week.

  Ingredients now render through a shared `IngredientList` component backed by `parseIngredients`
  (`web/src/lib/units.ts`), which recovers a JSON-array payload back into lines before display, so
  the next bad write degrades to a correct list instead of leaking storage syntax. It emits a real
  `<ul>` rather than a text blob — an ingredient list is a list, and screen readers announce the
  item count. The two call sites now share one path and cannot drift apart again.

  `parseIngredients` also annotates rice with **go** (合, the Japanese rice cup; 1 go = 150 g dry),
  which is the unit Jason actually measures at the bag. The convention had been applied by hand to
  the stored text and had drifted — 12 recipes carried it, 8 did not. Moving it to render time
  covers every row including future ones. Cooked-weight lines are converted through per-grain yields
  (white ~3.0×, brown ~2.75×) and are left alone when the line does not say which grain it is,
  rather than guessing. Lines that already carry a hand-written go keep it and are not recomputed.

  Rice annotation runs _before_ the imperial conversion: `annotateLine` splices `(2.8 oz)` in
  between the number and the word after it, which would otherwise break the `<n> g dry rice` match.
  The go is derived from the **rounded** dry weight so that the two figures shown side by side agree
  with each other. Both behaviours are pinned by tests. `addWeightConversions` had no callers left
  once the components moved to `parseIngredients` and was removed.

  Ten tests in `web/src/__tests__/ingredients.test.ts`.

### Changed

- **Journal is now a single free-write surface with contextual suggestions.** The editor had two
  inner tabs — "Reflect" (five fixed questions, each its own textarea) and "Free Write" — and
  defaulted to Reflect on every open, with a `0 / 5` progress-dot row that filled in as questions
  were answered. That framed journalling as a form with a completion state, and the entries show
  what it produced: five of the six entries on record answer the prompts dutifully and briefly
  ("Honestly not too sure", "Don't really feel gratitude for anything today"), while the single
  entry that used Free Write is the only one with anything real in it. Removed the tabs, the five
  `PROMPTS` fields and the progress dots; the page is now one textarea.

  In their place, `web/src/lib/journal/prompts.ts` derives up to three **suggestions** from the day's
  own data — alcohol habit rows, Oura recovery, strength sessions, habit streaks, weight swings,
  intake vs. targets, and time since the last entry — falling back to a date-rotated evergreen pool
  when nothing notable fires. Suggestions are tappable (they drop in as a line to write under),
  dismissible, and never required. `buildJournalPrompts` is a pure function taking `today` on its
  context object, so it can be exercised directly against real rows.

  Deterministic rules, no model — same posture as the workout planner and the nutrition pipeline.
  The `responses` column and its history rendering are retained so the six existing entries still
  display, and the editor passes `initialResponses` back through the save untouched, so editing a
  pre-2026-08 entry doesn't erase the answers it was written against. Prompts are suppressed when
  back-dating an entry, since they describe today.

### Fixed

- **Grease-the-groove sessions were being classified as lifts.** Session classification tested that
  _every_ exercise name contained `grease-the-groove`, but a GtG session also carries accessory
  movements with no such suffix (`Negative Pull-Up`, `Dead Hang`) — so real GtG sessions on 8/04,
  8/05, 8/06 and 8/07 all failed the test and read as lifting sessions. GtG is walk work and never
  appears inside a lift, so the correct test is _any_. Caught by running the new prompt engine
  against live rows, where it produced a "you trained today" suggestion on a pull-up-only day. Same
  class of bug as the GtG mis-scoring fixed in #650.

### Documentation

- **`docs/architecture.svg` regenerated.** It is generated from `docs/architecture.d2`, which
  changed in the previous entry, and no `d2` binary was available at the time. Rebuilt with
  d2 v0.7.1 using the command recorded in the `.d2` header — note that header's post-processing
  `sed -i ''` is BSD/macOS syntax and needs plain `sed -i` on Linux. The whole file rewrites
  because the previous render used an older d2; output size is comparable (25,524 → 25,263 bytes)
  and it parses as valid SVG.

  **The diagram still carries older drift this does not fix** — it predates the sync work and is
  listed here so it is recorded rather than rediscovered: the app node says "Next.js · Vercel"
  though mr-bridge moved off Vercel to compute-core on 2026-07-13 (ADR 0017); Data Sources says
  "Oura · Fitbit · Google Fit" though Fitbit and Google Fit were superseded by Google Health in
  #607; External APIs lists "Anthropic" though the app is now zero-Anthropic (USDA for macros,
  chat moved to MCP); and the "18 tables / 7 API routes / 10 pages" counts are unverified.

### Documentation

- **Second drift pass — the first one missed three, including a rule file.**
  `.claude/rules/briefing.md` still told the session-start protocol that `run-syncs.py` "runs both
  sync scripts (oura, google*health) in parallel". It runs neither: it is one HTTP call that
  refreshes five sources and needs the app container up. That file is \_read by Claude at session
  start*, so a stale instruction there is worse than a stale README.
  `docs/fitness-tracker-setup.md` opened with "Two sync scripts pull data from fitness APIs and
  write directly to Supabase" — the entire premise of the page.
  `docs/architecture.d2` described the sync layer as "Python scripts · TypeScript modules".
  **`docs/architecture.svg` is generated from that `.d2` and is now stale** — it needs a `d2`
  regeneration, which was not available in this environment.

  Lesson recorded because it cost two passes: grepping for the deleted _filenames_ found the
  obvious references. The damaging ones described the behaviour in prose without naming a file.

### Documentation

- **Swept the docs for drift left by #658.** Deleting the two Python syncs invalidated
  statements scattered well outside the files that changed: `README.md` still described the
  test workflow as "stdlib-only unittest run over `tests/`" (it now runs node too, and
  `web/src/__tests__` is CI-enforced for the first time) and referred to "the sync scripts"
  falling back to `OURA_ACCESS_TOKEN`; `docs/ARCHITECTURE.md` justified `sync_log`'s missing
  RLS policy partly on "Python scripts" that no longer exist; `docs/fitness-tracker-setup.md`
  described the Google Health sync as having "replaced `sync-fitbit.py` and `sync-googlefit.py`",
  naming a script that is itself now gone. Historical references inside CHANGELOG entries and
  the deliberate "why this is a thin client" comments in `run-syncs.py` / `workout-dedupe.ts`
  are left intact — those are the record of why, not stale instructions.

### Fixed

- **`run-syncs.py`: wrong app URL fallback, and a summary that printed one useless line.**
  Two defects shipped in #658 and caught by running it end-to-end on compute-core.
  (1) It resolved the app as `INTERNAL_APP_URL or APP_URL`. `INTERNAL_APP_URL` is exported in
  the shell but is **not in `.env`**, and `APP_URL` is the public vhost
  (`mr-bridge.<your-domain>`), which resolves to Surface's tailnet address and is
  **unreachable from compute-core** — confirmed, the request returns nothing. So a missing
  export would have turned into a confusing network failure rather than working. It now
  defaults to `http://127.0.0.1:3000`, which is correct by construction since the script runs
  on the app's own host, with `INTERNAL_APP_URL` as the only override and no `APP_URL` fallback.
  (2) The endpoint answers `{"success": true, "results": {...}}`, but `_summarize()` was handed
  the envelope, so every source collapsed into a single `results: ok {…}` line instead of one
  line per source. It now reads the nested object and fails loudly on an unexpected shape.

### Changed

- **One sync implementation instead of two.** `scripts/sync-google-health.py` (458 lines) and
  `scripts/sync-oura.py` (495 lines) are **deleted**. `scripts/run-syncs.py` is now a thin client
  that calls `/api/cron/sync` — the same endpoint the nightly cron already used — and then runs
  the alert scripts as before. The TypeScript modules under `web/src/lib/sync/` are the only
  implementation left.

  This is fallout from #656/#657, and the reason is worth stating plainly: the codebase held two
  complete sync implementations that had silently drifted. Both carried the same workout-dedup
  bug. #656 fixed the Python copy, which _read_ as fixing the system, while the nightly cron —
  running the TypeScript copy — kept writing duplicate rows until #657. The duplicated 30-minute
  skip window even carried a comment saying "same as run-syncs.py": the hazard was written down
  and then ignored. Fixing one copy of a duplicated rule is indistinguishable from fixing the
  rule, right up until it isn't.

  Preserved: `--days N` backfill, via a new bounded `?days=` (1–90) parameter on `/api/cron/sync`
  that both syncs now honour, plus `?force=1` to bypass the skip window. `run-syncs.py --days 30`
  works as `sync-google-health.py --days 30` did. **Dropped:** `--probe`, the Python dry-run.
  **Regressed:** syncing now needs the app container running — the deleted scripts reached the
  vendor APIs directly. `run-syncs.py` detects that case and says so, rather than surfacing a bare
  connection error.

  Dedup moved to `web/src/lib/sync/workout-dedupe.ts`, a leaf module with **zero imports** so it
  is unit-testable on a bare `node --test` with no dependency install and no module aliasing.

- **`web/src/__tests__` now runs in CI.** Those tests have existed since the nutrition-pipeline
  work and nothing ever enforced them. That was tolerable when the only dedup test was the Python
  one; it is not tolerable now that TypeScript holds the sole implementation — an untested single
  implementation is worse than a tested duplicated one. The `Python tests` workflow is renamed
  `Unit tests` and gains a `node` job. 39 node tests, 17 python.

  `tests/test_google_health_dedupe.py` is deleted and ported to
  `web/src/__tests__/google-health-dedupe.test.ts`, which additionally pins the ±5 min window
  edges and documents a **known limitation**: the overlap index is keyed by date only, not
  date+activity, so two _different_ activities starting within 5 minutes collapse into one. That
  predates this change (the Python sync indexed by date only too) and is asserted rather than
  fixed — narrowing the key would stop losing real sessions but would re-admit duplicates whenever
  two writers label one session differently, which is a live pattern in the 2026-07-31 data. That
  is a semantic decision about dedup and belongs in its own change.

### Fixed

- **`weekly_plan.py` — warmups no longer count as programming errors.** `shape_plan()` flattened
  `warmup + workout + cooldown` into the list feeding the recovery and same-day-redundancy checks,
  while `_work_entries()` already excluded warmups for the superset check. The two disagreed, and
  the consequence was that the RAMP protocol's **Potentiate** step was unrepresentable: it is a
  ~50% ramp-up set of the day's _first lift_, and it only potentiates if it sits immediately before
  the working sets — which the redundancy rule then read as two same-pattern exercises back-to-back
  and rejected. Week 2 (7/27-8/01) passed only by accident, because its warmup happened to end on a
  Band Pull-Apart rather than a squat. `day_plans` now counts the working block only, via the same
  `_work_entries()` the superset check uses; coverage still counts every entry, since a warmup
  movement does still demonstrate a pattern is present in the week. Verified both directions: the
  already-executed Week 2 still validates clean (no regression) and Week 3 now validates clean.

- **`log_habit.py` — the scripted habit path was broken for every call.** It upserts with
  `on_conflict="habit_id,date"`, but the table's constraint is `user_id,habit_id,date`, so Postgres
  rejected it with `42P10 there is no unique or exclusion constraint matching the ON CONFLICT
specification`. Not intermittent — it could never have succeeded.

### Documented

- **`EXERCISE_MUSCLE_MAP` now says out loud why grease-the-groove movements are absent from it.**
  They are exempt from the 24h recovery rule because GtG is submaximal and daily by design; that
  exemption was real but purely implicit (it worked only because the names were missing), so adding
  them would have silently broken every GtG week. Same failure class as PR #650.

### Removed

- **Meals page — dropped the "Recent meals" section.** It rendered inside the Today tab while
  `PastMeals` ("Past 6 Days") renders unconditionally below the tab panels, so both were on screen
  at the same time showing the same `pastMeals` rows — the first deduped to 10 by normalized name,
  the second in full chronological order. Two views of one dataset, stacked. The dedupe was the only
  thing "Recent meals" added, and it bought little: with a 6-day window most repeats are already
  adjacent in "Past 6 Days", and the deduped list silently hid the _repeat_ rows, which is exactly
  what makes a meal worth re-logging. Removed the section, the `recentMeals` `useMemo`, the now-unused
  `pastMeals` prop on `TodayTab`, and the `normalizeName` helper whose only caller it was. The
  re-log path is unaffected: `MealRowDisplay`'s `onRelog` is still wired for today's meals, and
  the Recipes tab remains the route for logging something cooked before.

- **graphify — deleted the stale knowledge graph and every rule pointing at it.** `graphify-out/`
  was last regenerated **2026-05-05** and had been tracked, unchanged, for 83 days while the repo
  absorbed the self-host cutover, the Google Health port, inventory, dual units, the service-worker
  fix, meal-plan constraints and the superset UI. The `graphify` binary is installed on **no**
  current host, so `CLAUDE.md`'s "run `graphify update .` after modifying code files" was
  unsatisfiable and the graph could only get staler. The problem was not that it had become useless
  but that it was actively misleading: `CLAUDE.md` told agents to read `GRAPH_REPORT.md` _before_
  answering architecture questions and to navigate `graphify-out/wiki/` _instead of reading raw
  files_ — a directory that does not exist — and a `PreToolUse` hook in `.claude/settings.json`
  repeated that instruction on every `Glob`/`Grep`. A three-month-stale map that agents are told to
  trust over the source is worse than no map. Removed: the 6 tracked files (2.3 MB) from this
  **public** repo, the `CLAUDE.md` section, the `core.md` session-close step, the `PreToolUse` hook,
  the `.gitignore`/`.dockerignore` entries, and two now-dead links in `docs/ARCHITECTURE.md`.
  Historical CHANGELOG and audit references are left intact. The original rationale — an unfamiliar
  codebase on the MacBook with no other index — no longer holds: `CLAUDE.md` + `.claude/rules/` are
  accurate and maintained, load automatically via the `SessionStart` hook, and live search covers a
  repo this size. Closes half of the open-cleanups list.

### Added

- **The planner validator now rejects broken superset metadata.** A superset renders only from
  per-exercise `superset` / `pair_with` fields; the plan `name` and `notes` are display text and
  control nothing. Week 2 (7/27, 7/29, 8/01) was written with neither field, so three sessions
  named "(supersets)" — whose notes described "3 pairs x 3 rounds" — rendered as six standalone
  straight sets. Nothing errored; the plan simply meant something different from what it showed,
  and only an eyeball caught it. `validate_supersets()` in `scripts/weekly_plan.py` now fails the
  plan on: a "(supersets)" day with no slots, partial slotting, malformed slots, non-contiguous
  pairs (grouping is positional — `groupBySuperset` walks _consecutive_ same-letter entries, so
  a split pair renders as two broken groups), lone or self-paired slots, `pair_with` that isn't
  reciprocal or names an exercise outside the group, out-of-order slot digits, and members of a
  pair disagreeing on `sets` (the group header shows one round count for both). Wired into both
  `validate` and the correction prompt, and the planner prompt now documents the fields so plans
  are written right rather than only caught afterward. Covered by `tests/` — the project's first
  Python tests — run in CI by a new stdlib-only `python-tests` workflow, since a guard against a
  _silent_ failure is itself worthless if it silently stops firing.

- **Sessions auto-load Mr. Bridge context on start.** A new `SessionStart` hook (wired in
  `.claude/settings.json`, handled by `.claude/hooks/scripts/hooks.py`) injects an instruction
  that makes any session launched in this repo read the rules + private project memory and run
  the Session Start Protocol (syncs → briefing data → calendar/birthday/email) automatically —
  no more manual `/session-briefing`. Committed so it works on every device via `git pull`; it
  replaces a device-local `settings.local.json` version that only existed on one machine. The
  hook dispatcher now also keys off the real `hook_event_name` field, so the existing
  `PostToolUse`/`Stop` handlers fire as intended.

- **The end-of-workout feedback box works without logging sets.** The "how did it feel?" recap
  (perceived effort + notes) only appeared once a set had been logged — it could only PATCH an
  existing `strength_session`, and a session was created by the set logger. Do your workout
  without logging every set in the app and the box never opened, so a real coaching signal went
  uncaptured. `PATCH /api/strength-sessions` now accepts `performed_on` (+ `workout_plan_id`) and
  finds-or-creates the session itself, and `EndOfWorkoutRecap` always renders on today's workout
  and fills in its session id after the first save. Effort and notes can now be logged for any
  workout, set-tracked or not.

- **Recipes show how to cook them, not just what's in them.** Recipes have carried an
  `instructions` field all along, but neither the click-in planned-meal detail nor the Recipes
  tab rendered it — you saw the ingredient list and the macros, but not the method. Both now
  show a "How to make it" section (line breaks preserved) whenever a recipe has instructions.
  Threaded `instructions` through the plan queries and the recipes query.

- **Fridge / freezer / pantry inventory.** A new `inventory_items` table and a dedicated
  `/inventory` page (with a nav entry) track raw ingredients on hand — the counterpart to
  `cooks` (prepared leftovers). Action-first layout: a "Use soon" strip lifts everything within
  three days of expiring to the top, then location sections with per-item freshness dots and
  counts. One-tap move-to-freezer, inline edit, add/remove via `/api/inventory` +
  `/api/inventory/[id]`. Weight quantities display in g, oz, and lb together
  ("1.25 lb (567 g · 20 oz)") so the fridge (lb/oz) and recipes (grams) reconcile at a glance.
  Inventory carries no macros and links to nothing, so editing it can never affect a macro or a
  plan.

- **Recipe ingredients show imperial equivalents too.** Ingredient lists (in the click-in planned
  meal and the Recipes tab) written in grams now annotate each weight with oz/lb inline —
  "200 g (7.1 oz) chicken thigh", "80 g (2.8 oz) brown rice" — so a recipe reconciles with the
  fridge (stocked in lb/oz) without mental math. Display-only via `addWeightConversions`; the
  stored text is unchanged, and counts/volumes ("2 fillets", "1 cup") and trivial amounts are
  left alone.

- **Supersets are shown as linked groups in the workout plan.** The plan carried `superset`/
  `pair_with` metadata but the UI rendered every exercise as a flat straight-set list, so it
  wasn't clear the pairs are alternated. Paired exercises now sit in a Strong-style group — an
  accent rail links them, a header states "Superset A · 3 rounds · alternate · ~20s between ·
  ~60s after the pair", and each exercise keeps an A1/A2 tag and its own set logger. The
  per-exercise set count is dropped inside a group (the round count is in the header).

### Changed

- **The rest timer no longer sends a phone push.** Every set kicked off a "Rest done" ntfy push
  when the timer hit zero — a buzz after every single set, which was just spam. Rest completion is
  now signalled on-screen only: the timer widget turns positive and pulses. The timer itself is
  unchanged.

- **Every planned meal must be backed by a recipe or a cook.** `plan_meals` no longer accepts a
  bare `name` freeform plan — it requires a `recipe_id` or a `cook_id`, and a database CHECK
  constraint (`meal_plans_recipe_or_cook_required`) enforces the same on every write path. A meal
  out is planned against a reusable "Eating out" recipe, with real macros logged afterward. A
  plan without a recipe has no instructions and no macros, which is the gap this closes.

### Fixed

- **The app-side Google Health sync had the same duplicate bug — and it is the one that runs
  nightly.** The previous entry fixed `scripts/sync-google-health.py`, but that path is only
  reached by a manual `run-syncs.py`. The daily 14:00 cron calls `/api/cron/sync`, which runs
  `syncGoogleHealth()` in `web/src/lib/sync/google-health.ts` — a parallel TypeScript
  implementation carrying **both** identical defects. Its overlap check was a `.filter()` over
  `existingList`, which structurally cannot accumulate: `dateIndex` was built once from stored
  rows and never saw a row accepted earlier in the same pass, so same-batch duplicates all
  survived. Its `WORKOUT_SOURCES` likewise omitted `"manual"`. Rewritten as an accumulating loop
  that pushes each accepted row into `dateIndex`, and reads now use a matching `DEDUPE_SOURCES`.
  Both files now carry cross-references, because the real hazard here is that a fix to one reads
  as a fix to the system. **Anyone touching dedup must change both.**

- **Google Health sync stored the same workout two and three times.** `filter_new_workouts()`
  in `scripts/sync-google-health.py` has a ±5 min same-date overlap check, and it worked —
  against rows already in the database. But `by_date` was built once from `existing` and never
  updated as candidates were accepted, so two duplicates arriving in the **same** batch were
  each measured against a database containing neither, and both passed. Google Health
  aggregates several writers (watch, phone, connected apps) and routinely emits one activity
  twice in a single response: once from the writer holding the HR sensor, with `hr_zones`
  populated, and once as a coarse copy with `hr_zones` null and a wild calorie figure. On the
  _next_ run the pair is in `existing` and further copies are suppressed — which is why the
  duplicates sat as stable pairs rather than multiplying, and why nothing looked wrong.
  Separately, `existing` was filtered to `WORKOUT_SOURCES = ["google_health", "fitbit"]`, which
  excludes `"manual"`, so a hand-logged session could neither suppress an auto-import nor be
  suppressed by one. Accepted rows now join the comparison set, and reads use a new
  `DEDUPE_SOURCES` that adds `"manual"` (`WORKOUT_SOURCES` still means "what this sync writes").
  Observed damage: 2026-07-31 held a 13-minute walk twice at 84 and 467 kcal, and one
  basketball game three times — 431 + 792 + 454 = 1677 kcal — inflating the day to 2963 active
  calories against a 2500 _weekly_ goal; 2026-08-02 held a phantom 295-minute "Cardio Workout"
  worth 1867 kcal, the watch reading alcohol-elevated resting HR as five hours of exercise.
  The affected rows were neutralised in place rather than deleted, since the 7-day lookback
  re-imports deleted rows. Covered by `tests/test_google_health_dedupe.py`, which fails on the
  pre-fix code. **The audit only covered 7/31 and 8/02 — other days likely carry the same
  pairs.** Diagnostic: of a near-simultaneous pair, the phantom is the one with `hr_zones` null.

- **The briefing stopped telling the coach to undo the current training rule.**
  `scripts/fetch_briefing_data.py` still printed `FLAG: effort >=8 — drop next session load 10%`
  and `FLAG: effort >=9 — cut a set next session` on every logged session. Those bands were
  **retired 2026-07-18**: 8-9/10 is roughly 1-3 RIR, which is the productive zone the program
  now targets, and proximity to failure matters _more_ at light loads — with the dumbbells
  capped at 25 lb, "light load, far from failure" is the one combination the evidence calls
  clearly ineffective. `coach_check.py::post_session` was updated at the time; this script was
  missed, so the two halves of the coaching loop disagreed, and the briefing kept advising a
  load cut on exactly the sessions that went well. Observed live on 2026-07-26: the 7/23
  session (effort 8, DB Reverse Lunge @ 20 lb at RPE 8-9 — on target) was flagged for a 10%
  reduction. Bands now mirror `coach_check.py`: 7-9 reads as on-target, 10 backs off, 6 and
  below prompt more reps or load, and a missing score is called out as the thing that tunes the
  next session. Load reductions remain driven solely by measured performance decrement
  (`coach_check.py::regressions`), never by a set feeling hard.

- **Deploys now actually reach the browser (service-worker stale cache).** The service worker
  cached `/_next/static/*` **cache-first** under a fixed cache name. Turbopack chunk filenames
  are not reliably content-hashed, so a deploy's changed code shipped under a name the cache
  already held — and cache-first served the old copy indefinitely, making new features look like
  they never deployed until the cache was cleared by hand. Switched to **stale-while-revalidate**
  (the cache is refreshed from the network on every request) and bumped the cache version
  (`mb-static-v1` → `v2`) so the activate handler purges the poisoned cache once. Deploys now
  self-update within a reload.

- **Logging a planned meal in the evening no longer lands it on tomorrow.** `eatFromCook` stamped
  the `meal_log` row with `new Date().toISOString().slice(0,10)` — a **UTC** date — so tapping
  "Ate this" after ~5pm PT (past UTC midnight) logged the meal on the next day, splitting it from
  the plan it satisfied and throwing off today's totals. A plan-linked meal now **inherits its
  `meal_plan.date`** (explicit `date` still wins; UTC remains only as the last resort for a
  free-form, plan-less log). Fixes a real 2026-07-19 mislog (Sunday lunch recorded on Monday).

- **An unconnected integration no longer crashes the sync with a misleading traceback.**
  `load_integration` read `.data` off `maybe_single().execute()`, which returns `None` (not a
  response object) when zero rows match in this postgrest-py version — so a provider that simply
  isn't connected (e.g. `google_health`) raised `AttributeError: 'NoneType' object has no
attribute 'data'` and looked like a code failure / "no workouts this week" instead of a
  connection gap. It now returns `None` cleanly, so callers hit their real guard (e.g. "Google
  Health not connected — authorize via /settings").

- **A meal logged from the fridge now shows what it was.** The "Logged today" list read a meal's
  name from `recipes(name) ?? notes`, but a one-tap "Ate this" writes a `cook_id`, not a recipe —
  so a logged cook had no name and rendered as "—" (or, worse, showed an internal note). The
  meal_log query now also joins `cooks(name)` and the display prefers it, so "Eggs & Spinach" and
  "Linguine…" show up as themselves. (A cook with unresolved macros still logs 0 kcal — that's a
  data gap in the cook, not this display.)

### Added

- **Click into a planned meal to see what's in it.** A planned meal showed only its label —
  "Tilapia x2 + rice" told you nothing about how much tilapia or how much rice, because a
  freeform plan records no amounts and no macros. Every planned-meal row (in both "Planned
  today" and "This week") now expands: a recipe- or cook-backed plan reveals its ingredients
  and USDA macros read THROUGH the recipe/cook (never restated on the plan), and a freeform
  plan with no amounts expands to a **"turn this into a recipe"** form. Filling the amounts
  once (`2 tilapia fillets`, `1 cup rice`) creates a reusable recipe, resolves its macros
  through USDA, and adopts the plan — which then becomes one-tap loggable. New `POST /api/recipes`
  (create + optional resolve + optional plan-link) and a shared `PlannedMealDetail` component;
  `WeekPlan` became a client component to carry the expand state. The plan queries now select the
  recipe's ingredients and full macros and the cook's macros.

- **A recipe-backed plan now logs its macros.** `PATCH /api/meal-plan` (above) records that a
  planned meal happened, but logs no macros — right for freeform text, wrong for a meal you
  actually cooked from a recipe whose macros are already known. So marking "3 eggs + spinach"
  eaten flipped a status and left the day's totals at zero: you did what the plan said and got
  nothing back, which is the same unrewarded loop that killed meal logging in May.

  `POST /api/meals/eat` now accepts `recipe_id` as an alternative to `cook_id`, backed by a new
  `eatFromRecipe` (`web/src/lib/nutrition/cooks.ts`): it creates a `cook` from the recipe and
  eats a portion in one call, so the macros land in `meal_log` and any surplus becomes
  leftovers. A recipe is "one time you made food" the moment you eat it. In `KitchenPanel`, a
  recipe-backed plan with resolved macros now shows **"Ate this"** (logs macros) instead of the
  macro-less "Ate it"; a name-only recipe stub still falls back to the status-only path, since
  there is nothing to log. `meal_plans` and the plan API now surface `recipes.macros_computed_at`
  so the panel can tell a real recipe from a stub.

### Fixed

- **`bunch` / `package` no longer resolve to the wrong weight.** `lexQuantity` documented
  "bunch" as unresolvable but didn't treat it that way: a number before any unrecognized unit
  fell through to the bare-count branch, so `1/2 bunch spinach` became `qty 0.5, unit "each"`
  and silently resolved against whatever spinach portion USDA returned first — a wrong number
  wearing a confident badge, exactly the failure mode the quantity lexer exists to prevent.
  These are real USDA portion descriptors (`1 bunch spinach = 340g`, `1 package (10 oz) = 284g`),
  so they now pass through to `gramsFor` like `large` does for eggs. Added: `bunch`, `package`,
  `bag`, `head`, `stalk`, `sprig`. A bare `handful` (no USDA portion) is still unquantified.

- **A plan you can contradict.** `POST /api/meals/eat` requires a `cook_id` — it exists to log
  macros that are already known. But most planned meals point at no cook: a recipe not yet
  made, or freeform text. Those could be marked **nothing at all**, so `meal_plans` could
  only ever describe intent, never outcome — and a day you ate something else looked
  identical to a day that never happened.

  Adds `PATCH /api/meal-plan` (`{id, status}` → `planned` | `eaten` | `skipped`) and
  **Ate it / Skip** buttons on every planned meal in `KitchenPanel`. Cook-backed meals keep
  the existing "Ate this", which also decrements the fridge; everything else records the
  outcome without inventing macros for it.

  A skip is data, not a failure — it's how the plan finds out it was wrong, and a plan nobody
  can contradict is a plan nobody corrects. It gets a quiet button, not a red one.

- **The coaching loop answers back.** 33 `workout_plans` were written between May and June
  2026 and never once opened; the user logged 7 sessions with real notes and the system
  responded with nothing. An unrewarded loop decays, and this one did — training stopped
  2026-05-06. The plans were never the missing piece; the reply was.

  New `scripts/coach_check.py`, driven by cron **on compute-core** (not a cloud routine —
  the self-hosted Supabase is tailnet-only and unreachable from an Anthropic cloud sandbox,
  and health data is deliberately not publicly routable):
  - `--post-session` — Mon/Wed/Sat 20:00 PT. Did today's planned session get logged? Pushes
    the streak plus an effort verdict. Two consecutive misses drop volume automatically;
    three says the program is wrong, not the person. Silent when nothing was planned.
  - `--weekly` — Sunday 18:00 PT. 7-day weight average vs the prior week, sessions vs target,
    readiness, sleep — then pulls the user into a planning session.

  **No LLM is involved.** It reads Postgres and pushes ntfy, which is all it needs to do —
  the thinking happens in a Claude Code session. This is deliberate: compute-core is
  zero-Anthropic (ADR 0017), which is exactly why `/api/cron/weekly-plan` sits commented out
  of the crontab — it dispatches a GitHub Action running `scripts/weekly_plan.py`, which
  still does `import anthropic`.

  Filters `recovery_metrics` on `total_sleep_hrs > 0`: that table carries duplicate rows per
  date — real Oura data alongside rows with zero sleep and null readiness — so an unfiltered
  average is garbage.

- **The week you planned is now visible.** `meal_plans` shipped with a today-only read
  (`.eq("date", todayString())` in the meals page), so a week of planned meals sat in the
  table with no surface to render on — you could plan Sunday through Saturday and see none
  of it until each day became today. The planning half of "plan, cook, confirm" was
  write-only.

  The meals page now reads the **next 7 days** in the same query and splits it: `KitchenPanel`
  keeps today's slice for one-tap logging, and a new `WeekPlan` panel renders the rest.
  Empty days are shown, not hidden — a gap is the most useful thing on the panel, because
  it's the list of decisions still owed and exactly what the Sunday planning session exists
  to close.

  `WeekPlan` shows no macros, deliberately. `meal_plans` carries none of its own; a plan
  points at a cook or a recipe and those own the numbers. Restating them here would mean
  duplicating or inventing them.

  Adds `daysAheadString()` and `getNextNDays()` to `lib/timezone` — the module could only
  look backwards.

- **Food gets measured macros, and cooking gets modelled.** `recipes` gains
  calories/protein/carbs/fat/fiber for the recipe **as written**, resolved once through the
  existing pipeline — the local model identifies the foods, **USDA FoodData Central supplies
  every gram**. No macro value is model-authored.

  New `cooks` table: **one time you actually made food.** Portions live here, not on the
  recipe — you don't cook "the 6-serving chicken bowl", you cook a pile of chicken and
  eyeball it into however many containers you feel like that day, and the same recipe splits
  5 ways one week and 7 the next. This makes a one-off meal _not a special case_: it's a cook
  with 1 portion. Batch prep is a cook with 6 that drains over the week. Cooking down leftover
  ingredients is a cook with no recipe. One object, three behaviours. Leftovers become a
  trivial query — the cooks with `portions_remaining > 0` are literally what's in the fridge.

  `meal_log` gains `cook_id` + `portions`, so logging a prepped meal is a **confirm** rather
  than a photo → USDA round trip. `meal_log.recipe_id` has existed since the initial schema
  and was never once populated (0 of 44 rows); that friction is why meal logging stopped in May.

  Accuracy is deliberately bounded: the eyeballed portion split is the error bar, and no
  amount of USDA precision rescues a container that's 20% bigger than its neighbour. These
  numbers are for direction across weeks, not lab-grade accuracy — which is all a body-comp
  trend needs.

### Changed

- **Fitbit and Google Fit replaced by the Google Health API**
  ([#607](https://github.com/Theioz/mr-bridge-assistant/issues/607)). The Fitbit Web API
  is **turned down in September 2026** and the Google Fit REST API is deprecated; both
  now come through `health.googleapis.com/v4` via a single `sync-google-health.py` /
  `web/src/lib/sync/google-health.ts`. Three sync paths became one.
  - **Per-workout heart-rate zones and average HR survive the move** — they are native
    fields on `Exercise.metricsSummary` (`heartRateZoneDurations`,
    `averageHeartRateBeatsPerMinute`), better-structured than Fitbit's. The data
    regression feared in #607 does not exist.
  - **Zone names change:** Fitbit's `Fat Burn` / `Cardio` / `Peak` become Google's
    `Light` / `Moderate` / `Vigorous` / `Peak`. Rows written before the cutover keep the
    old labels — `workout_sessions.metadata.hr_zones` is intentionally mixed, not
    backfilled.
  - **BMI is now derived** from weight + height. Google Health has no `bmi` data type
    (Fitbit supplied one directly). With no `height` sample on file, BMI is null rather
    than guessed.
  - **Workout duration now excludes pauses** (`activeDuration`); Fitbit's `duration` did
    not.
  - **Recovery is Oura-only.** The Fitbit `recovery_metrics` writer is gone rather than
    ported: Oura is a strict superset (it also supplies `readiness`, `sleep_score`,
    `vo2_max`, which Fitbit never did) and no preference pointed at Fitbit.
  - **`muscle_mass_lb` and `metadata.bmr_kcal` stop being written.** Google Health has no
    lean-body-mass or BMR data type. Not a new regression — those columns were fed by the
    retired Renpho scale via Google Fit and have not received data since the switch to the
    GE CS10G / Fit Profile. See [#69](https://github.com/Theioz/mr-bridge-assistant/issues/69).

- **Google Health is consented separately from Calendar/Gmail**, against the same OAuth
  client, and stored under its own `google_health` provider row. Google revokes a refresh
  token on password change _if that token carries Gmail scopes_ — a health-only token
  keeps the unattended fitness sync alive through a password change. The `fitness.*`
  scopes were dropped from `GOOGLE_SCOPES`.

- **Self-hosted.** Mr. Bridge is off **Vercel** and off **Supabase Cloud**, running on a
  homelab node behind a tailnet ([#476](https://github.com/Theioz/jl-homelab/issues/476)).
  Three hostnames: the app and Supabase are **tailnet-only**; only token-gated `/share/*`
  is public, behind a default-deny path allowlist. Supabase is **three containers**
  (Postgres 17.6 + GoTrue + PostgREST) rather than the upstream ten — no Kong, Realtime,
  Storage, imgproxy, edge-runtime, analytics or pooler, none of which were used.

- **Macros now come from data, not from a model.** `estimate-macros`, `analyze-photo`,
  `scan-chat` (label mode) and `suggest` no longer ask Claude to _recall_ nutrition facts.
  **USDA FoodData Central** supplies every gram and calorie; a local model
  (`qwen2.5vl:7b` via Ollama) only identifies the food and reads quantity+unit. This is
  **more** accurate than before: the model was measured ~2x off on portion weight (a large
  egg at 105g; real ~50g), so it is never asked to weigh anything. The photo analyzer now
  treats your **description as authoritative** — a stated "6oz" is used verbatim rather
  than re-guessed from pixels.

- **Onboarding macro targets use the Mifflin-St Jeor equation**, not an LLM. The model was
  being handed exactly the inputs to a formula and asked to approximate its output. It now
  returns nothing on insufficient input rather than inventing targets.

### Removed

- **The in-app chat.** `/chat`, `/api/chat`, `lib/chat/*`, `components/chat/*` and
  `/api/quota` are gone. Conversation moves to an **MCP server** (`web/mcp/`) exposing the
  same **30 tools** to Claude Code on the existing subscription — no API key, no metered
  chat. Most of what went was not chat but **Vercel scar tissue**: an 80s hand-rolled
  abort, a four-pass `tool_use`/`tool_result` orphan sanitizer, a fabricated "I ran out of
  time" message and a user-facing Continue button — all built to survive the 90s Lambda
  kill. MCP has no serverless deadline, so that entire bug class ceases to exist rather
  than being ported.

- `ANTHROPIC_API_KEY` and `GROQ_API_KEY`. One residual call site remains
  (`api/meals/scan-chat`).

- `voice/` — already broken; its config pointed at `memory/*.md` and a rules file that no
  longer exist.

- `web/vercel.json`. Cron runs from the node's crontab, using the same `CRON_SECRET`
  bearer auth the handlers already had.

### Fixed

- **Push notifications had been silently dead in production.** Vercel had `NFTY_TOPIC`
  while the code reads `NTFY_TOPIC`, so `/api/notifications/push` returned
  `503 "NTFY_TOPIC unset"`. Found only by reading the real production env.

- **Google Fit sync failed intermittently.** It passed `metadata: null` into a
  `NOT NULL DEFAULT '{}'` column — a column default only applies when the column is
  _omitted_, so an explicit null violates the constraint. This was failing on Supabase
  Cloud too.

- Share links derived the app's public origin from the _database_ URL
  (`NEXT_PUBLIC_SUPABASE_URL.replace(".supabase.co", ".vercel.app")`), which produced a
  garbage hostname anywhere but Vercel. Now `SHARE_BASE_URL`.

### Added

- `web/Dockerfile` (standalone output), `web/mcp/` (the MCP server), `web/src/lib/nutrition/*`
  (USDA + local-model pipeline), `scripts/weekly_plan.py` and a `/weekly-plan` Claude Code
  command — the planner's deterministic validators stay in Python because they are _rules_,
  not judgement.

### Fixed

- **Weekly planner: equipment context now included in planner prompt.** `/api/internal/plan` now fetches `user_equipment` (type, weight, count, notes) and injects an `## EQUIPMENT` section into the planning context. Dumbbell pairs are summarised as a weight list; other equipment (pull-up bar, slider) includes any notes from the `notes` field — e.g. `"Available 5 minute walk from me"`. Previously the model had no knowledge of available weights or equipment location.
- **Weekly planner: `run_weekly_plan.py` now runs full two-pass validation matching the Vercel route.** Ported `validateWeeklyCoverage`, `checkSameDayRedundancy`, and `validateRecovery` from TypeScript to Python. First-pass plan is validated for missing movement patterns (pull_vertical mandatory when pull-up bar in inventory), same-day redundant exercise pairs, and 48h muscle group recovery conflicts. A correction prompt is sent to Claude if issues are found; the script logs whether the correction pass resolved all issues. Also updated `PLANNER_PROMPT` to use the full prompt from the Vercel route (was a stripped-down version that omitted progression ladder, goal phase, and movement pattern rules).
- **This week's plan (May 4–10): patched pull_vertical gap and Wed pull_horizontal redundancy.** Pull-Up (3×3-5) inserted on Wed May 6 Pull Day between DB Bent-Over Row and DB Single-Arm Row (fixes both missing pull_vertical and back-to-back pull_horizontal). Pull-Up (2×3-5) inserted on Sat May 10 Full Body after DB Arnold Press.

### Changed

- **Weekly planning cron: fire-and-forget via GitHub Actions dispatch (#604).** `/api/cron/weekly-plan` is now a thin endpoint that fires a `workflow_dispatch` event to `.github/workflows/weekly-plan.yml` and returns 202 immediately. The actual planning work (two Claude AI passes, Supabase writes) runs in GitHub Actions with a 30-minute timeout, eliminating Vercel's 60-second function limit. Requires a `GITHUB_PAT` (workflow scope) in Vercel env vars. The GHA workflow also runs on a fallback schedule (`15 15 * * 0`) in case the Vercel dispatch fails; the duplicate-skip guard in `/api/internal/plan` prevents double-writes. `scripts/run_weekly_plan.py` updated to load `APP_URL` from env and guard the `.env.local` loader so it runs cleanly in GHA.

### Added

- **Weekly planning cron: `week_start` override param.** Both `/api/cron/weekly-plan` and `/api/internal/plan` now accept a `week_start=YYYY-MM-DD` parameter, enabling catch-up runs when the Sunday cron is missed. The cron route forwards it to the internal plan endpoint for both context fetch and write.
- **Library/Backlog: console/platform and price paid fields in pre-add form.** When adding a game, the step-2 modal now includes "Console / Platform" (maps to `metadata.played_on`) and "Price Paid" fields. Books show "Price Paid" only. Both fields are optional and merged into the item's metadata on save.

### Changed

- **Library: default sort is now Highest Rated** (was Priority order). Unrated items sort to the bottom.
- **Library/Backlog: book genre tags are normalized.** `series:` prefixed tags are stripped, near-duplicate subjects (e.g. "sci-fi" / "science-fiction") are deduplicated, and all genres are title-cased at import time and at display time for existing items.

### Fixed

- **Chat: 400 "tool_use without tool_result" on sessions with deadline-cut turns.** When the turn deadline fired mid-tool-call, the AI SDK emitted a trailing text block ("I ran out of time...") after the `tool_use` in the same assistant message. `convertToModelMessages` then split this into two consecutive assistant messages, inserting one between the `tool_use` and its `tool_result` and causing Anthropic to reject the next request with a 400. Added Pass 3 to `sanitizeIncompleteToolCalls` in `route.ts` to collapse the extra trailing-text assistant message.
- **Share panel opaque background.** Defined `--color-bg-1` and `--color-bg-2` as aliases for `--color-surface` / `--color-surface-raised` in `globals.css` — these tokens were referenced throughout the codebase but never declared, causing all panel/card backgrounds to resolve to transparent. The share panel was the most visible breakage since it floats over other content.

### Added

- **Settings → Fitness: configurable workout time per day of the week (#556).** A 7-column time-picker grid (Mon–Sun) in the Fitness tab writes a `preferred_workout_times` JSON blob to the `profile` table. The weekly planning agent reads the per-day value when creating Google Calendar events; days left blank fall back to 16:00. The route preserves the existing `preferred_workout_time` singular key as a secondary fallback.
- **Chat: Supabase Realtime subscription for live multi-device message sync (#478).** A `postgres_changes` subscription scoped to the active session is established in the chat client. Messages sent from a second device or browser tab appear without a manual refresh. Dedup by message ID prevents optimistic inserts from appearing twice. A Supabase migration conditionally adds `chat_messages` to the `supabase_realtime` publication.
- **Library/Backlog: shows display air date range.** Show subtitles now render `2015–2022` for ended series and `2015–present` for ongoing shows. Data comes from `metadata.last_air_date` and `metadata.in_production`, populated at import time via a parallel TMDB TV detail fetch. Existing items without these fields fall back to start year only.
- **Library: public share page.** A "Share library" button in the Library header generates a public `/share/library/[token]` URL (no login required). The page shows the owner's full library grouped by media type (Games / Shows / Movies / Books), with cover art, ratings, status badges, played-on info for games, and a stats summary. Token is stored as `profile.library_share_token`. "Copy link" and "Revoke" controls in the share panel. Share button highlights when a link is active.

- **Library/Backlog: pre-add form before confirming import.** Clicking "Add" in search results now opens a step-2 form (status, rating slider 0–10, review, session start/finish/notes) before the item is created. "Confirm Add" submits; "Back" returns to search results.
- **Library/Backlog: duplicate detection on add.** Items already in the collection show a yellow "Already in library/backlog" badge in search results and an amber warning banner in the pre-add form linking to the existing item. Server-side 409 guard prevents silent duplicates on concurrent adds.
- **Library/Backlog: session-entry deletion.** Each row in the Sessions section has a trash icon; clicking deletes that individual session log entry via `DELETE /api/backlog/[id]/sessions/[sessionId]`.
- **Library/Backlog: paid price field.** Games and books show a `$` price input on the detail page, stored as `metadata.paid_price` in the existing JSONB column.
- **Library/Backlog: "Played on" field for games.** Game detail pages show a text input for the specific console the user played on (`metadata.played_on`). The input offers autocomplete suggestions from IGDB's list of platforms for that title. The value appears in the list row subtitle (e.g. "Naughty Dog · 2013 · PS5").
- **Library: URL-based tab persistence.** Active tab is reflected in the URL (`?tab=book`). "Back to Library" from the detail page uses `router.back()` so the tab-bearing URL is restored.
- **Library: delete button on list rows.** Each item row in the Library list now has a Trash2 icon button; clicking confirms and deletes the item, with optimistic UI removal and count updates.

### Fixed

- **Library/Backlog: session dates show correct local date.** Bare `YYYY-MM-DD` strings from Supabase are now parsed as `new Date(y, m-1, d)` (local time) instead of `new Date("YYYY-MM-DD")` (UTC midnight), preventing off-by-one shifts in US timezones.

### Changed

- **Library/Backlog: rating input replaced with slider.** The 0–10 rating field on both the detail page and the pre-add form is now a range slider with a numeric display and a Clear button. Step size 0.1.
- **Library/Backlog: explicit Save/Revert bar on detail page.** Status, rating, review, and paid price no longer auto-save on interaction. A sticky "Save changes / Revert" bar appears at the bottom when there are unsaved edits; all fields are patched in a single request on save.

- **Library: server-side pagination (Load More, 50 items/page) (#589).** SSR now fetches only the first 50 items for the active tab; a Load More button appends the next slice from `/api/backlog`. Summary strip and tab badges use a separate lightweight count query and always reflect global totals, not just the loaded slice.
- **Library: server-side search and filter params for library API (#590).** Search query (`?q=`), status, and year filters now round-trip to `/api/backlog` so results are correct on paginated data. Genre filter remains client-side (JSONB format inconsistency). Filter changes reset to offset 0; search is debounced at 300ms.
- **Library: per-tab lazy loading with accurate count badges (#591).** SSR returns a lightweight `media_type + status` count query plus items for the All tab only. Switching to a type tab fetches that tab's items on demand; revisiting uses session-cached data. Tab count badges are accurate immediately from the SSR count query.

### Fixed

- **Library: add modal now stays on library page after saving (#596).** `handleImport` no longer calls `router.push()` after a successful POST. The new item appears immediately via optimistic state update; `router.refresh()` syncs SSR state in the background.

### Changed

- **Library: summary strip redesigned with media type breakdown.** On the All tab, four type cards (Games / Shows / Movies / Books) each show a count, a distinct color accent on the top border, and a mini 4px status bar showing the active/finished/queued breakdown within that type. Status stat row cleaned up to only show Paused and Dropped when non-zero. Completion bar height increased to 8px. `StatusBar` extracted as a shared sub-component used by both the type cards and the main completion bar.
- **Library: list view is now flat — no collapsible sections.** Items render in status order (Active → Queued → Paused → Finished → Dropped) as a continuous list; the status badge on each row already identifies the group. Section headers and expand/collapse toggles removed entirely.

### Added

- **Library: cover grid view.** A list/grid toggle (List · LayoutGrid icons) in the header switches between the existing list view and a cover art grid. Grid renders all filtered items as 2:3 aspect-ratio cards with a hover lift, gradient title overlay, status dot, and optional media-type badge on the All tab. Drag-to-reorder and status grouping remain list-only; the grid shows all filtered items flat.

### Fixed

- **Library: new items now appear immediately when navigating back from the detail page.** Added `router.refresh()` after import so the Next.js router cache for `/library` is invalidated before the push, preventing the stale cached page from being served on return.

### Changed

- **Library: Add button shows a type picker (Game / Show / Movie / Book) when on the All tab**, preventing ambiguous imports where a title matches across multiple media types. Tabs other than All bypass the picker and go directly to search for that type.
- **Library: Queued items now appear in the Completion progress bar and legend** as a distinct segment (muted slate), giving a full-picture breakdown of total items by lifecycle state.

### Added

- **Backlog: track games, shows, movies, and books with metadata, ratings, and session logs (#582).** New `/backlog` page with four tabs (Games / Shows / Movies / Books), each showing stack-ranked items with drag-to-reorder. "Add" flow searches TMDB (movies + shows), IGDB via Twitch OAuth (games), and OpenLibrary with Google Books fallback (books) — cover art, creator, release date, and description are imported automatically. Items flow through a status lifecycle (backlog → active → paused → finished / dropped). Per-item detail page has a status chip row, 0–10 rating input, free-form review textarea, session log table with Add-session form (started_at / finished_at / notes), and a share section that generates a public read-only URL (`/share/backlog/[token]`) and revokes it by setting the token to null. Four new chat tools: `list_backlog`, `add_backlog_item`, `update_backlog_item`, `log_backlog_session`. New Supabase tables: `backlog_items` (RLS, `updated_at` trigger via `set_updated_at()`) and `backlog_sessions` (RLS). New env vars required (server-side only, add to `web/.env.local` and Vercel): `TMDB_API_KEY`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`; optional: `GOOGLE_BOOKS_API_KEY`.

### Fixed

- **Packages: filter false positives and detect delivered status at sync time.** NOTRACK rows now require shipping-context keywords (`package`, `shipment`, `tracking`, `carrier`, etc.) so Venmo transfers, newsletters, and other non-shipping emails that happen to contain "arrives today" are excluded. Emails whose subject starts with "Delivered:" or whose body says "has been delivered" now create rows with `status=delivered` / `delivered_at=now` instead of `intransit`, so they are correctly filtered out of the dashboard banner.
- **Packages: fix relative-date ETA extraction and arrives-tomorrow subject matching.** Saks Fifth Avenue emails use subject "…arrives tomorrow" and body "scheduled to be delivered tomorrow" — neither matched the previous Gmail query keywords nor the ETA regex (which required a calendar date number). Added `"arrives tomorrow"`, `"arrives today"`, `"scheduled to be delivered"` to both Gmail query passes; added `RELATIVE_ETA_PATTERNS` to `extractEta` that resolve "today"/"tomorrow" phrasing to the actual date before falling through to the numeric-date patterns.
- **Packages: widen sync to catch missed shipping emails (#572).** The Gmail scan now runs two passes: the existing subject-keyword query (expanded with `"shipping confirmation"`, `"shipment notification"`, `"order shipped"`, `"your shipment"`, `"dispatched"`) plus a second ETA-body pass (`"estimated delivery" OR "estimated arrival" OR "arrives by" OR "delivery by"`) that catches emails whose subject lines don't match any known phrase. Emails that carry a delivery ETA but have no recognizable carrier tracking number (unregistered carriers, plain retailer links) are now stored as `NOTRACK-{gmail_message_id}` rows with `carrier = "unknown"` so they surface in the dashboard banner. Dedup continues via `processedMsgIds`; no schema migration required.

### Added

- **Meal Scanner: photo-based re-analysis for scan items and past meals (#576).** Expanded ScanItem edit panel (food mode) now has a "Re-scan with photo" button that uploads a corrected photo, re-analyzes via `/api/meals/analyze-photo`, and patches the item in place while respecting per-field `*ManuallyEdited` flags. `MealRowEdit` (today's meals and past meals) gains a "Re-scan from photo" button that pre-fills macro fields from the photo result; the user must still press Save to persist. `compressImage` extracted from `FoodPhotoAnalyzer` into `web/src/lib/meal-photo.ts` and shared by both surfaces.

### Changed

- **Meal Scanner: staged photo queue with submit gate (#574).** Photos no longer analyze immediately on select. Camera and library `onChange` handlers now stage photos into a `stagedPhotos` queue; a thumbnail preview is shown for camera captures. An "Analyze N photos" submit button moves staged items into the in-flight queue and fires analysis, passing the current context textarea value to each call. Tab order fixed: "Food Photo" is now first and the default mode. `analyzeOneFile` accepts an explicit `context` param instead of reading the global closure, enabling per-submit context snapshots.

### Changed

- **Chat: enable strict mode on `update_profile` and `create_calendar_event` (#343).** Enables `strict: true` on the two highest-blast-radius mutating tools whose schemas fit within Anthropic's compilation budget. Empirical testing confirmed the ceiling: ≤5 cumulative optional params across strict tools is safe; 10 cumulative triggers "Schema is too complex for compilation" (400). `update_profile` (0 optional params) and `create_calendar_event` (5 optional params) are enabled; `update_calendar_event`, `update_workout_exercise`, and `assign_workout` remain disabled pending a budget increase from Anthropic. All schema `additionalProperties: false` constraints from PRs #359/#360 remain in place regardless of the strict flag.

### Added

- **Settings: add goal_phase selector to fitness settings UI (#564).** Surfaces the `goal_phase` profile key (Cut / Bulk / Maintain / Recomp) in the Fitness settings tab as a chip selector, matching the existing `fitness_goal` pattern. Reads from and writes to the `goal_phase` key via the existing `updateAction` server action — no schema changes. Also extends the `update_profile` chat tool description to list `goal_phase [cut|bulk|maintain|recomp]` as a canonical settable key, so Mr. Bridge can update it on the user's behalf during coaching conversations.
- **Dev: switch to Turbopack, cap Node.js heap, fix workspace root.** `next dev --turbopack` replaces webpack in the dev script; `NODE_OPTIONS='--max-old-space-size=3072'` hard-caps the heap to prevent system OOM on battery; `turbopack.root: __dirname` in `next.config.ts` pins module resolution to `web/` and eliminates spurious tailwindcss resolution errors. Deleted the accumulated 847 MB webpack cache.
- **Fitness: workout recommendation overhaul — structural validation, progression ladder, exercise history context.** Five interconnected improvements to the weekly planner and chat coaching layer. (1) `movement-patterns.ts` — exercise-to-pattern map + `validateWeeklyCoverage` (ensures squat/hinge/push×2/pull×2/core covered weekly, flags missing pull_vertical when pull-up bar is in inventory) + `checkSameDayRedundancy` (flags adjacent same-pattern exercises within a day). (2) `recovery-rules.ts` — exercise-to-muscle map + `validateRecovery` (flags any muscle group hit at >50% volume within 48 h across consecutive workout days). (3) Two-pass planner in `weekly-plan/route.ts`: first AI call generates the draft; structural violations are formatted into a correction prompt and a second call fixes them before the plan is saved. (4) `internal/plan/route.ts` context builder now queries `strength_session_sets` for the prior week and injects per-exercise performance (sets × reps × weight, avg/max RPE, forced-deload flags, under-load flags) into the planning context. (5) `equipment-validation.ts` extended with `PROGRESSION_LADDER` and `getCappedExerciseProgression` — when an exercise is at the inventory weight cap and has earned progression, the system applies a defined ladder (add reps → tempo → pause → unilateral conversion → mechanical drop → band → density) instead of repeating the same prescription. Planner model upgraded from Haiku to Sonnet. Planner prompt now incorporates movement pattern rules, progression ladder, goal phase (cut/bulk/maintain/recomp), HRV/RPE/sleep recovery flags, and exercise history. Chat system prompt updated with progression ladder and goal phase rules. Proactivity rule functions (`ruleHrvDecline`, `ruleHighRpe`, `ruleSleepDeficit`) exported for reuse by the cron planner. Workout calendar time now reads `preferred_workout_time` / `preferred_workout_end` profile keys instead of hardcoded 16:00–17:00.

### Changed

- **Dashboard: Phase B revamp — flat 2-col grid, no filled cards (#465).** Replaces the single-column `space-y-6` Phase A stack with a `flex flex-col gap-[--space-7]` outer container and three Phase B grid rows: Schedule + Inbox, Tasks + Habits, Watchlist + Sports — each `grid-cols-1 lg:grid-cols-2` with `borderBottom: 1px solid var(--rule-soft)` on all rows except the last. Removes `db-section` class from `BodyFitnessSummary`, `ScheduleToday`, and `ImportantEmails` (border-bottom moves to the row wrapper). Removes dead `[data-revamp-split]` CSS block. Charts (HealthBreakdown, BodyFitnessSummary) remain full-width. Mobile single-column stack preserved.
- **Habits: Phase B revamp — stats 2-col, full-width momentum chart, fix mobile subtitle size (#467).** Replaces the asymmetric 1:2 chart grid (`lg:grid-cols-3`) with a 2-col stats pair (`lg:grid-cols-2`) that co-locates RadialCompletion and LongestChainBadges side-by-side. MomentumLine promoted to full-width for better 30-day trend readability. Header subtitle font bumped from `--t-micro` (13px) to `--t-meta` (15px) to meet the ≥14px mobile floor. No component changes — pure layout restructuring in `page.tsx`.
- **Fitness: Phase B revamp — replace tabbed layout with flat 2-col grid (#466).** `FitnessClient.tsx` removes the three-tab navigation (Dashboard / Workouts / History) and flattens all sections into a scrollable Phase B layout: body composition + activity charts on row 1, recovery trends + personal records on row 2, this week's workout program full-width on row 3, top exercises + recent sessions on row 4, full workout history full-width on row 5. `db-section-label` hairline pattern matches the Weekly page. Lazy-loaded chart components (BodyCompTrends, RecoveryTrends, ActivityTrends) and the window selector are preserved. Inline set logging and rest timer remain functional.

### Docs

- **Infra: add key-rotation runbooks for ENCRYPTION_KEY and SUPABASE_SERVICE_ROLE_KEY (#476).** `docs/runbooks/rotate-encryption-key.md` documents the re-encryption migration (pgp_sym_decrypt → pgp_sym_encrypt in a single transaction), verification steps, and rollback. `docs/runbooks/rotate-service-role-key.md` documents the Supabase dashboard reset → Vercel env update → redeploy flow. Both referenced from `docs/SECURITY.md` under a new Key rotation runbooks table. Surfaced by the 2026-04-23 full audit (Domain F, finding F2.4).
- **Rules: guard update-references.sh against running on main; reorder features.md steps (#474).** `scripts/update-references.sh` now exits 1 with a clear error if run on `main` (the script commits to the current branch — running on main strands an unpushable commit). `features.md` reordered so branch creation is step 1 and the reference pull is step 2, with inline notes explaining the constraint.
- **Rules: fix timer state location contradiction — drop unused timer_state table (#473).** `data-sources.md` incorrectly pointed to the `timer_state` table as the study timer store; the agent has always written to `profile` (key=`timer_state`). The unused `timer_state` table is dropped via migration; `data-sources.md` is corrected (profile row updated, timer_state row removed); `timer_state` references removed from the reset-demo route, `reset_demo.py`, and the export exclusion manifest.
- **Rules: delete session-close.md, absorb close reminders into core.md (#472).** `session-close.md` described a `git add .` → `session:` commit → push-to-main flow that contradicted the feature-branch + PR workflow. File deleted; a `## Session Close` section added directly to `core.md` with correct reminders (CHANGELOG, README, graphify update, feature-branch workflow). Context-on-demand table row removed.
- **Docs: add ARCHITECTURE.md with RLS evolution plan (#477).** New `docs/ARCHITECTURE.md` captures stack overview, 28-table schema grouped by domain, RLS pattern and dual-client model, OAuth token encryption (pgp_sym_encrypt), prompt-caching architecture (1-hour TTL rationale), verified-success contract, and multi-tenant roadmap. Cross-linked from `README.md` and `graphify-out/GRAPH_REPORT.md`. Fills the gap surfaced by the 2026-04-23 audit (Domain C): no single file documented architectural intent, only current state.

### Fixed

- **Dev: RSS-based watchdog catches dev server memory leaks that `--max-old-space-size` misses.** Turbopack allocates outside the V8 heap (Rust), so `NODE_OPTIONS=--max-old-space-size` does not bound it — the dev process can balloon to many GB and swap macOS to a hard hang. New `scripts/dev-watchdog.mjs` spawns `next dev`, polls its resident memory every 5 s, warns at 75% of cap, sends SIGTERM at 100% (escalates to SIGKILL after 5 s grace). `web/package.json` now wires `dev` (Turbopack, default) and `dev:webpack` through the watchdog with `DEV_MAX_RSS_MB=6144`; `dev:raw` keeps an unmonitored escape hatch. Heap cap raised 3072 → 4096 to give Turbopack headroom inside the new RSS ceiling. Cleared accumulated 1.8 GB `web/.next` cache as part of the same fix. Complements PR #563 (which only kills lingering processes at session Stop, not during active dev).

### Refactored

- **Chat: split route.ts into focused lib/chat/ modules (#475).** `web/src/app/api/chat/route.ts` (~1010 lines) was extracted into six purpose-built modules — `select-model.ts`, `system-prompt.ts`, `build-tools.ts`, `synthesis.ts`, `middleware.ts`, and `persist.ts` — each owning one concern. `route.ts` is now pure orchestration (~385 lines). Zero behavior change; TypeScript clean.

### Performance

- **DB: replace ascending chat_messages position index with DESC NULLS LAST (#459).** The hot-path query `ORDER BY position DESC NULLS LAST LIMIT 10` on `chat_messages` ran against an ascending `(session_id, position)` index, requiring the planner to verify null ordering on every request. The old index is dropped and replaced with `chat_messages_session_position_desc_idx ON chat_messages (session_id, position DESC NULLS LAST)` — an exact match that eliminates planner ambiguity and reduces pre-stream latency by an estimated 100–150 ms per turn. The `profile(user_id, key)` index required by the name/proactivity lookup was already present via the unique constraint added in migration `20260413000001`.

### Added

- **Automation: weekly planning Vercel cron — `/api/cron/weekly-plan` (#547).** A Vercel cron job runs every Sunday at 8 AM Pacific (`0 15 * * 0` UTC). It calls `GET /api/internal/plan` to fetch prior-week workout sessions, recovery scores, body composition, meals, and habits; sends that context to Claude Haiku to produce a structured JSON workout plan and meal prep task; writes the result via `POST /api/internal/plan`; creates Google Calendar events for each workout at 4 PM PT; and fires an ntfy.sh push notification. Idempotent: skips if plans already exist for the coming week. Required env vars: `CRON_SECRET`, `OWNER_USER_ID`, `ANTHROPIC_API_KEY`, `NTFY_TOPIC`, `APP_URL` (defaults to `mr-bridge-assistant.vercel.app`).
- **Meals: day-over-day macro trend charts (#546).** A new "Trends" tab on the Meals page shows 7- and 30-day line charts for calories, protein, carbs, fat, fiber, and sugar — the same `ChartFrame` + `TrendLine` primitives used on the Fitness page. Daily totals are aggregated server-side (SSR) from `meal_log` with a parallel 30-day query; no client-side API fetch. Days with no logged meals render as null gaps rather than zero. Goal reference lines (dashed) appear when daily targets are set in the user's profile; sugar has no goal and is shown for awareness only (matching the today-view behavior).
- **Settings → Integrations: per-metric data source preferences (#435).** Users with multiple fitness integrations connected can now choose which source the assistant reads for each metric category — Sleep, HRV, Steps, Active Calories, Readiness, and Body Composition. Preferences are stored in a new `user_metric_preferences` table (additive migration, RLS-enabled). The `get_fitness_summary` chat tool now loads preferences at query time and filters `recovery_metrics` and `fitness_log` by preferred source instead of hardcoding Oura. The sync layer is unchanged — all connected sources continue writing their rows. A "Data Sources" subsection in Settings → Integrations renders a selector per metric showing only the sources the user actually has connected; single-source metrics display a static label. Changing a preference takes effect immediately with no re-sync required.
- **Chat: citation sources on assistant messages (#479).** Completed assistant messages that involved tool calls now display a collapsible "N sources" link below the response text. Clicking it reveals pill chips — one per tool call — showing the tool name and a one-line result summary (e.g. "Fetching habits — 6 items"). Failed tool calls are visually distinguished with a danger border and ✕ marker. In-flight streaming behavior is unchanged.
- **Proactive in-session intelligence (#458).** Bridge now checks recovery, training, task, and habit signals on every session start and surfaces anomalies without being asked. Six rules run in parallel: HRV 3-day decline vs 7-day baseline, RPE ≥ 9 on last 2 consecutive strength sessions, overdue task count, established habit not yet logged after 18:00, sleep < 6 h for 2 consecutive nights, and body weight trending counter to goal for 5+ weigh-ins. Signals are injected as a verified-facts block in the dynamic system prompt — Bridge references them in context without ever fabricating data not in the DB. If no signals fire, the prompt is byte-for-byte identical to today. Gated behind `proactivity_enabled` profile preference (default on); toggle added to Settings → Fitness.

### Fixed

- **Food Analyzer: replace portion fraction pills with percentage slider (#554).** The five fixed pill buttons (¼ · ⅓ · ½ · ¾ · All) in `PortionPicker` are replaced with a native `<input type="range">` slider (0–100%, step 5%). A percentage label updates live next to the thumb. The Combined total recalculates in real time as the slider moves. `ScanItem.portionFraction` type is unchanged.
- **Food Analyzer: compress Ultra HDR JPEGs from Pixel 9 Pro 50 MP mode (#545-compression).** Photos shot in 50 MP mode on Pixel 9 Pro are 40–60 MB Ultra HDR JPEGs (Google HDR Gain Map format). The `<img>`+canvas pipeline fails for these files: `img.onerror` fires on HDR gain-map parsing, or `canvas.toBlob()` returns `null` under memory pressure from a 50 MP source. `compressImage` now tries `createImageBitmap` first — it handles Ultra HDR and large modern JPEGs reliably for canvas use — and falls back to the existing `<img>` approach for older browsers. The two-pass quality logic (0.82 → 0.70) and MAX_EDGE 1920 scale-down are unchanged.
- **Food Analyzer: multi-photo upload with per-item portion control (#545).** The scanner now accepts up to 6 photos in a single session — select multiple from the library at once, or take consecutive camera shots while previous analyses run in parallel. Each photo is compressed individually via the existing two-pass `compressImage` logic (PR #544) before its own POST to `/api/meals/analyze-photo`, preserving the 10 MB per-image cap. A five-option pill picker (¼ · ⅓ · ½ · ¾ · All) appears inline under each analyzed dish so the user can set what fraction they ate. The Combined total and the final `meal_log` entry reflect those fractions — macros for each item are multiplied by its portion fraction before summing. Failed photos surface an error row with a per-photo Retry button; other photos in the batch are unaffected. The global "analyzing…" spinner is replaced by per-photo loading rows, keeping the rest of the UI interactive throughout.
- **CSP: fix style-src-elem dev mode — omit nonce so unsafe-inline is effective.** The dev CSP had `style-src-elem 'nonce-...' 'self' 'unsafe-inline'`, but per the CSP spec `unsafe-inline` is silently dropped when a nonce is present, making dev enforcement as strict as production. Next.js HMR `<style>` injections were blocked, causing intermittent smoke-pr-chat failures. Fix: omit the nonce from `style-src-elem` in dev only so `unsafe-inline` takes effect. Production nonce-only policy is unchanged.
- **Food Analyzer: client-side compression threshold + two-pass adaptive quality + raised server cap (#544).** `compressImage` now skips canvas work for files ≤ 2 MB, runs at quality 0.82 for larger photos, and falls back to a second pass at quality 0.70 if the first result is still > 4.5 MB — covering 8–15 MB JPEGs from high-resolution cameras (Pixel 10, iPhone 15 Pro) without a third-party dependency. The silent `catch { imageBlob = file }` fallback is fixed: large files (> 4 MB) that fail compression now surface a user-facing error instead of sending a doomed request. Server cap raised from 4 MB → 10 MB; photos are never stored.
- **Fitness: assign_workout always resets cancelled status and restores Google Calendar events.** Two bugs when `assign_workout` upsertes over a previously-cancelled row: (1) the upsert payload omitted `status`/`cancel_reason`/`cancelled_at`, so cancelled rows stayed `status=cancelled` in the DB even though `ok: true` was returned — the fitness tab continued showing the workout as cancelled. (2) the calendar PATCH omitted `status: "confirmed"`, so soft-deleted Google Calendar events (Google marks deleted events as `status=cancelled` rather than removing them) remained invisible on the calendar after being re-assigned. Root cause: `cancel_workout` correctly soft-deletes the calendar event but the `calendar_event_id` could remain in the DB if the clear update raced or failed silently; subsequent `assign_workout` calls would PATCH the soft-deleted event without restoring it.
- **Docs: reconcile chat tool count and refresh file tree (#481).** README feature-list now shows 26 tools (was 25); in-tree comment on `chat/route.ts` updated from 16 → 26. Migration list extended through `20260426000000`. Missing API routes (`notifications/push`, `packages`, `sports`, `strength-sessions`, `workout-plans`, `exercise-prs`, `auth`, additional `google/calendar` sub-routes) and `user_integrations` table added to the file tree.
- **Cron: per-block error recovery and schedule jitter for reset-demo (#482).** Each seed block in `seedDemoData` now runs inside a `try/catch` that logs failures and continues to the next block — a single failing upsert no longer aborts the entire reset and leaves demo state degraded for 24 h. The route always returns 200 with a `seeded` map of `{ ok, error? }` per table. Cron schedule moved from `0 11 * * *` to `17 11 * * *` (11:17 UTC) to avoid peak-load collision.
- **Dashboard: resolve text-node hydration mismatch (React #418 args[]=text) (#487).** `fmtDay`/`fmtDayTime` in `SportsCard` used timezone-unqualified `getMonth()`/`getDate()` and `toLocaleTimeString()` in the synchronous SSR render path. Vercel runs in UTC; the browser uses the user's local timezone — game times crossing midnight produced different date strings server vs client. All three callsites now pass `{ timeZone: USER_TZ }`. Smoke spec updated to explicitly reject the `args[]=text` variant.
- **Admin pages: pass `{ timeZone: USER_TZ }` to all locale date/time calls (#522).** Seven callsites in `admin/page.tsx` and `admin/tenants/[userId]/page.tsx` were calling `.toLocaleDateString()` / `.toLocaleString()` on `Date` objects without a timezone option; dates now consistently render in `USER_TZ`.
- **Replace client-side `new Date()` with DB-generated UTC timestamps (#521).** Seven `new Date().toISOString()` calls in journal, tasks, and admin-tenants server actions were passing app-layer timestamps to Supabase mutations. A new migration adds `BEFORE UPDATE` triggers on `journal_entries`, `tenant_quotas`, and `feature_flags` (auto-stamping `updated_at = now()`) and on `tasks` (setting `completed_at = now()` on the first `active → completed` status transition). The explicit timestamp arguments are removed from all seven call-sites; `DEFAULT now()` continues to handle the INSERT path, and the triggers own every UPDATE path.
- **Chat: fix persistent tool_use/tool_result orphan crash (#536).** The UIMessage sanitizer introduced in #535 missed parts emitted by `ToolLoopAgent` because they have `type: "dynamic-tool"` (not `"tool-<name>"`), so the `startsWith("tool-")` check silently skipped them. A `"dynamic-tool"` branch is added to the filter, and `convertToModelMessages` is now called with `{ ignoreIncompleteToolCalls: true }` as defense-in-depth (the SDK option strips `"input-streaming"` / `"input-available"` parts before conversion). `sanitizeIncompleteToolCalls` is also rewritten to build a global result-ID set across the entire message array instead of only scanning the immediately following message — orphaned tool-calls that appear with non-adjacent or missing result messages are now caught regardless of position.
- **Chat: sanitize incomplete tool parts at UIMessage level and fix prepareCall system-prompt corruption.** The ModelMessage-level `sanitizeIncompleteToolCalls` pass (PR #534) didn't catch tool parts stored as `"tool-<name>"` UIMessage parts with non-output states. A UIMessage-level pre-sanitizer now strips any `tool-<name>` part where `state` is not `"output-available"` or `"output-error"` before `convertToModelMessages` is called. Also fixes `prepareCall` corrupting the system prompt: `buildSystemValue` returns a `SystemEntry[]` for real users; template-literal interpolation was calling `.toString()` on the array, producing `[object Object],[object Object],[object Object]` and silently wiping the model's instructions exactly when the step-limit warning fires. The fix extracts plain text from SystemEntry blocks before concatenating the warning.
- **Chat: fix tool_use without tool_result crash on continue turns; add Continue button.** When the 80-second deadline fired mid-tool-call, the assistant message was persisted with `tool_use` blocks but no matching `tool_result` — Anthropic rejected the next request with a 400 error, surfacing "Error – try again" after every deadline hit. A `sanitizeIncompleteToolCalls` pass now strips unmatched tool calls (and their orphaned tool messages) from the incoming messages before they reach the API. A real "Continue" button now appears below any step-cap or deadline message (detected via `hitStepCap`/`deadlineExceeded` metadata + text-signal fallback for page-refresh), so users no longer have to type "continue" manually. Context window widened 10 → 20 messages so continuation turns have more history.
- **Chat: emit deadline text part before abort so client never shows error state (#519).** When the 80-second turn deadline fires, the streaming transform now intercepts the `error`/`abort` part, closes any open text block, and enqueues a `text-start` / `text-delta` / `text-end` sequence with a conversational timeout message before the stream closes cleanly. The `onError` callback suppresses the resulting `AbortError` so no error string is sent to the client. `onFinish` is unchanged — it now persists the deadline message in the `content` column instead of a synthesized fallback.
- **Chat: inject day-of-week anchor into system prompt to fix weekday scheduling (#517).** The dynamic system prompt now injects a full human-readable date (e.g. "Today is Sunday, April 27, 2026") computed in `USER_TZ` instead of a bare ISO date string. Without the weekday name the model was miscounting — it said "Mon 4/28" when 4/28 is a Tuesday. Also adds an explicit scheduling rule: resolve weekday names to the next future occurrence of that day, never assuming a name maps to "tomorrow". Three scoped timezone discrepancies found in the same audit are also fixed: `watchlist-widget.tsx` hardcoded `"America/New_York"` (replaced with `USER_TZ`), `packages-banner.tsx` called `toLocaleDateString` without a timezone option (added `{ timeZone: USER_TZ }`), and `calendar-view.tsx` used `useState(new Date())` which causes a server/client hydration mismatch (changed to the lazy initializer `useState(() => new Date())`).
- **Chat: continuous progress feedback during long multi-step turns (#516).** Adds a "Working…" spinner chip to `ToolStatusBar` so the user always sees a visible indicator from the moment the first assistant chunk arrives until the first tool-call `input-streaming` part is emitted. Previously, a dead zone existed between the typing indicator hiding (assistant message added to `messages[]`) and the first named chip appearing (`seen.size > 0`), producing a silent freeze on 9-tool turns (3× assign_workout + 6× create_calendar_event). Also adds `data-testid="tool-status-chip"` to all chips and a targeted Playwright smoke spec that asserts no dead zone exists.
- **Settings → Fitness: fitness goals now reflect onboarding selections.** `fitness_goal`, `fitness_level`, and `workout_days_per_week` set during onboarding were saved to `profile` but never shown in Settings. The Fitness tab now has a "Fitness goals" section with chip selectors for primary goal, fitness level, and workout days per week — pre-populated from the profile and saving immediately on change. A hint directs users to chat with Mr. Bridge for a personalized recommendation.
- **Onboarding generate button now reliably fills in targets.** Replaced `generateText` + manual `JSON.parse` with `generateObject` (Zod schema). The old approach silently returned null whenever the model included any preamble text or markdown fences in its response, causing the "fill in your body stats" error even when stats were present.
- **Onboarding generate button shows error when no data to work with.** "Generate with Mr. Bridge →" now shows an inline hint if it returns null (no body stats or fitness goals entered yet) instead of silently doing nothing. Also catches unexpected errors and shows a fallback message.
- **Workout preferences and equipment now editable in Settings → Fitness tab.** Previously, `workout_preferences` and `equipment_preference` set during onboarding had no Settings UI — they were invisible and uneditable after setup. Settings → Fitness tab now has "Workout preferences" (chip toggles) and "Equipment" (preset chips + free-text tag input) sections that save immediately on change, matching the onboarding experience.

### Added

- **Onboarding — target weight + workout days per week.** Body stats step now captures target weight (lbs) alongside current weight. Fitness goals step adds a 1–7 chip picker for workout days per week. Both are stored in `profile` (`target_weight_lb`, `workout_days_per_week`) and passed as overrides to the nutrition generator so the calorie target reflects deficit/surplus size and weekly training volume.
- **Onboarding — height in ft/in, generate button uses unsaved wizard state.** Height inputs throughout (onboarding body stats step + Settings → Profile → Body Stats) now show feet + inches with automatic conversion to/from `height_cm` (storage stays in cm for AI prompts). "Generate with Mr. Bridge →" now passes the current wizard's unsaved state (birthday, weight, height, sex, goal, level, workout prefs) as overrides to the server action, so it works even if the user hasn't clicked Continue on earlier steps.
- **Onboarding — body stats step, AI nutrition targets, flexible equipment input.** Onboarding wizard expanded from 7 to 8 steps. New "Body stats" step (step 2) collects date of birth, baseline weight (lbs), height (cm), and biological sex — stored in `profile` as `birthday`, `body_weight_lb`, `height_cm`, `biological_sex`. Nutrition step now covers all 4 macros (calories, protein, carbs, fat) and adds a "Generate with Mr. Bridge →" button that calls Claude Haiku to suggest personalized targets based on the user's body stats and goals; live weight from `fitness_log` is preferred over the onboarding baseline when available. Equipment step replaces fixed checkboxes with a tag-input: preset quick-add chips plus a free-text input (Enter to add) for gym equipment not in the presets. Settings → Profile tab now includes a "Body Stats" section so users can update birthday, weight, height, and biological sex after onboarding.
- **New user onboarding wizard (#451).** Adds `/onboarding` route with a 7-step guided setup wizard for new accounts: name & city, primary focus (multi-select), fitness goals & level, workout preferences & equipment, nutrition targets (calories + protein), stock watchlist & sports favorites, and integration pointers. Auth callback (`/auth/callback`) now checks `profile.onboarding_completed` after code exchange and redirects new accounts to `/onboarding` instead of `/dashboard`. Sign-up flow in `login/page.tsx` redirects immediately to `/onboarding` when a session is created without email confirmation. Returning users with the flag set bypass the wizard entirely. New profile keys: `primary_focus`, `fitness_goal`, `fitness_level`, `workout_preferences`, `equipment_preference`, `calorie_target`, `protein_target_g`. Completion flag: `onboarding_completed = "true"`.
- **Admin tooling — tenant inspector, flag toggles, usage dashboard (#462).** New `/admin` route group gated by `is_admin: true` in the owner account's `user_metadata` (returns 404 for non-admins; does not advertise the route). Tenant list at `/admin` shows all users with today's token/tool-call usage vs. cap, integration count, and links to drill-down; includes an inline create-tenant form and per-row delete with email confirmation. Tenant drill-down at `/admin/tenants/[userId]` shows profile k-v table, connected integrations, last 20 chat sessions, quota usage bars with numeric override inputs (`daily_chat_tokens_override` / `daily_tool_calls_override` from #457), a same-day usage reset button, feature-flag toggles (per-user + global defaults), and an audit log. Every mutation writes a row to the new `admin_audit_log` table (who, when, action, before/after JSON). New `feature_flags` table (`id, user_id nullable, flag_name, enabled`) supports per-tenant overrides over a null-user-id global default, readable by authenticated users for their own rows + globals. No changes to `proxy.ts`, Nav, or existing API routes. Post-deploy: set `is_admin: true` in Supabase dashboard user_metadata on the owner account.

### Removed

- **Deleted legacy Python scripts (#480).** Removed `scripts/sync-renpho.py` (deprecated CSV importer, superseded by Fitbit body-comp sync), `scripts/setup-web-oauth.py` (superseded by per-user OAuth UI in #390), and `scripts/normalize_workout_activities.py` (one-time utility, data is stable). README file tree and `docs/fitness-tracker-setup.md` updated; architecture diagram updated to remove Renpho from data sources.

### CI

- **Parallelize smoke-pr chat and a11y jobs (#496).** `smoke-pr` split into `smoke-pr-chat` and `smoke-pr-a11y` jobs that run in parallel on every PR. Each job uploads a distinct artifact (`smoke-pr-chat-artifacts` / `smoke-pr-a11y-artifacts`) on failure. `smoke-release` is unchanged.
- **ESLint cleanup and CI opt-in to Node.js 24 action runtime (#439).** Prefixed unused destructured params with `_`; removed unused `SyncStatus` type import in settings page and unused `workouts` assignment in fitness page; replaced `<img>` with `<Image>` from `next/image` in the `sports-card` TeamLogo component. Added `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'` to all CI jobs ahead of the GitHub Actions June 2026 forced cutover.

### Performance

- **Parallelize a11y smoke tests (#498).** `web/smoke/specs/a11y.spec.ts` now calls `test.describe.configure({ mode: "parallel" })` so the 11 route tests run across workers instead of sequentially. `smoke:a11y` npm script passes `--workers=4` to override the global `workers:1` constraint (which exists solely for the chat suite). Wall-clock time drops from ~60s to ~ceil(11/4) × avg-test-time ≈ 20s. Chat tests are untouched.
- **Reduce Anthropic API cost — 1-hour cache TTL and expanded Haiku routing.** Two changes to `web/src/app/api/chat/route.ts`. (1) Both cache breakpoints (system prompt and trailing tool) now use `ttl: "1h"` instead of the default 5-minute TTL. The 5-minute window was causing 10–30 cache re-writes per active hour at $3.75/MTok each; 1-hour TTL cuts that to 1 re-write/hr at $6/MTok — roughly 60–80% reduction in cache-write cost on active days. (2) `selectModel` Gate 4 (Haiku simple patterns) extended with 34 new read-only patterns across workouts, calendar, recovery/sleep, body stats, stocks, sports, and streaks. Mutations (`assign_workout`, `create_calendar_event`, `reschedule_workout`, etc.) are not affected — they have no simple-pattern match and fall through to Sonnet. All 19 routing test cases verified in-process before PR.

### Security

- **Harden CSP with per-request nonces, drop `'unsafe-inline'` (#484).** Flips `Content-Security-Policy-Report-Only` → `Content-Security-Policy` (enforcing; soak period from #455 complete). Creates `web/src/middleware.ts` to register `proxy` as Next.js middleware (previously exported but never wired up). Generates a 16-byte cryptographic nonce per request in `web/src/proxy.ts`, sets it on the forwarded `x-nonce` request header so RSC can read it, and adds it to the enforcing `Content-Security-Policy` response header. `script-src` now uses `'nonce-{n}' 'strict-dynamic'` (no `'unsafe-inline'`); `'unsafe-eval'` is kept dev-only for Turbopack. `style-src` splits into `style-src-elem 'nonce-{n}' 'self'` (governs `<style>` tags) and `style-src-attr 'unsafe-inline'` (governs `style=` attributes — required for Radix UI portal positioning). `upgrade-insecure-requests` re-added (was intentionally omitted under Report-Only per spec). Two inline `<style>` JSX tags in `settings-tabs.tsx` and `watchlist-widget.tsx` moved to `globals.css` to avoid client-component nonce-threading complexity. Smoke spec updated to assert the enforcing header name, nonce presence, and `'strict-dynamic'`, and to assert `'unsafe-inline'` is absent from `script-src`.
- **Auth guard on `/api/stocks/validate` (#456).** `GET /api/stocks/validate` was missing authentication, allowing any unauthenticated caller to burn the shared Polygon API key. Added `createClient()` + `auth.getUser()` → 401 guard, matching the pattern used by every other route in `web/src/app/api/`.
- **Baseline security response headers (#455).** `web/next.config.ts` now serves `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geolocation denied), `X-Content-Type-Options: nosniff`, and a `Content-Security-Policy-Report-Only` directive scoped to `'self'` + Supabase (https + wss) + `a.espncdn.com` on every route. CSP ships Report-Only during a 7-day soak to surface directive gaps via browser console without breaking production; a follow-up one-line PR flips it to enforcing. New Playwright spec `web/smoke/specs/security-headers.spec.ts` asserts all five headers on both unauthenticated and authenticated routes, and the existing chat smoke (`consoleErrors.toHaveLength(0)`) doubles as the CSP-violation regression net. A separate issue is filed to drop `'unsafe-inline'` via nonce injection. Required for multi-tenant SaaS launch (#201, #450).

### Fixed

- **Chat messages disappear after 429 quota error (#494).** `onFinish` in `useChat` fires from the AI SDK's `finally` block even when the request errors, with `isError: true` and `turnComplete: false`. That caused `handleMessageSent` to skip its early-return guard, fetch messages from the server (which never received the failed message), and remount `ChatInterface` — stripping the optimistic user message. `onFinish` now returns immediately when `isError` is true.

- **Clean up three sources of console noise during the CSP Report-Only soak.** (1) `interest-cohort=()` was the FLoC opt-out; Google killed FLoC in 2022 and Chrome now rejects the directive as "Unrecognized feature." (2) `upgrade-insecure-requests` is ignored by the CSP spec when delivered under `Content-Security-Policy-Report-Only`; it will be added back when the CSP flips to enforcing. (3) `'unsafe-eval'` added to `script-src` in dev only (`NODE_ENV !== "production"`) because Next 16 + Turbopack uses `eval()` to parse the RSC stream in dev mode, which tripped ~130 Report-Only violations per `/dashboard` load. Production builds don't use `eval`, so the prod CSP stays tight.

- **ThemeToggle SSR/client hydration mismatch on /dashboard.** `next-themes` reads from `localStorage` on the client, which may disagree with the cookie-backed `defaultTheme` the server rendered with — the server rendered `Theme: System` + Monitor icon while the client hydrated as `Theme: Dark` + Moon icon, tripping React error #418 and the downstream `Cannot read properties of null (reading 'parentNode')` crash. `web/src/components/theme-toggle.tsx` now gates the theme-dependent label/icon behind a `mounted` flag so SSR and the first client render produce the same placeholder. New Playwright regression `web/smoke/specs/dashboard-hydration.spec.ts` asserts no React hydration errors in the dashboard console.

- **Sleep efficiency chart blank after #453.** `RecoveryTrends` was reading `sleep_efficiency` from `metadata` JSONB; the cleanup migration in #453 removed that key. Now reads from the promoted real column `r.sleep_efficiency` directly.

### Added

- **Self-service sign-up and password reset on login page (#450).** `web/src/app/login/page.tsx` now supports three inline modes — sign-in (default), sign-up (email + password + confirm-password), and forgot-password (email only) — accessible via toggle links below the submit button. Sign-up calls `supabase.auth.signUp`; when email confirmation is enabled the UI shows a "check your inbox" pending state instead of redirecting. Forgot-password calls `supabase.auth.resetPasswordForEmail` with `redirectTo` pointing at the existing `/auth/callback?next=/reset-password` route. New `web/src/app/reset-password/page.tsx` renders a password + confirm-password form that calls `supabase.auth.updateUser` after the user arrives via the Supabase magic link, then redirects to `/dashboard`. Demo login button is hidden in signup/forgot modes. No regressions to the existing sign-in or demo-login paths.

- **Usage tab in Settings — daily quota and stored-data summary (#491).** New Settings → Usage tab with two sections. (1) Daily usage: token and tool-call progress bars with a local-timezone reset time; demo accounts see conversation turns instead. Progress bars turn red at ≥ 80% consumption. (2) Stored data: row count and estimated byte size per category (Tasks, Habits, Fitness, Meals, Journal, Chat), plus a total. Byte sizes come from a new `estimate_user_storage(uuid)` Postgres RPC (`SECURITY DEFINER`, migration `20260424000001`) that aggregates `pg_column_size()` over the user's own rows — accurate for per-user estimates, typically ≤ 150ms. `/api/quota` extended with `is_demo: boolean` so the client component selects the right quota view without a second auth call. New `GET /api/usage/storage` route calls the RPC and returns `{ category: { rows, bytes } }`.

- **Daily quota exhausted banner in chat UI (#490).** When `POST /api/chat` returns 429 `daily_quota_exhausted`, the chat interface now shows a dismissible inline banner above the composer displaying the exact reset time in the user's local timezone. The send button is disabled while the banner is visible; the text input remains accessible. Dismissing the banner re-enables send. Does not affect any other error shape.

- **Per-tenant daily rate limiting on chat route (#457).** New `tenant_quotas` table (one row per user) tracks `tokens_used_today`, `tool_calls_used_today`, and `demo_turns_used_today` against configurable daily caps (default 100k tokens / 500 tool calls / 50 demo turns). Two `SECURITY DEFINER` Postgres functions handle the critical path atomically: `check_and_increment_quota` locks the row, resets counters on day rollover (UTC midnight), and returns 429 `{ error: "daily_quota_exhausted", resets_at }` if the tenant is over cap — all in one round-trip before streaming starts. `record_quota_tokens` appends the billing-weighted token delta in `agent.onFinish` (cache reads at 1/10 weight, writes + output at 1x). Demo path (Groq) counts turns only. `daily_chat_tokens_override` and `daily_tool_calls_override` nullable columns ship now for forward-compat with the admin tooling UI (#462). New `GET /api/quota` endpoint returns the authenticated user's current usage and effective caps. Required for multi-tenant SaaS launch (#201, #450).

- **Data export — one-click JSON/CSV backup from web UI (#67).** New Settings → Data tab with an "Export my data" button. Downloads a zip containing one file per user-authored table (JSON or CSV) plus a `_manifest.json` describing schema version, timestamp, format, date range, and row counts. 15 tables included: `tasks`, `habits`, `habit_registry`, `fitness_log`, `workout_sessions`, `recovery_metrics`, `recipes`, `meal_log`, `profile`, `study_log`, `journal_entries`, `workout_plans`, `strength_sessions`, `strength_session_sets`, `exercise_prs`. Deliberately excluded: chat history (`chat_sessions`, `chat_messages`), app-internal data (`user_equipment`, `notifications`, `packages`, `stocks_cache`, `sports_cache`, `sync_log`, `timer_state`), and encrypted OAuth refresh tokens (`user_integrations`). Date-range filter (all / 1y / 90d / 30d) narrows tables that have a date column; `profile` and `habit_registry` are always returned in full. Implementation uses the user-scoped Supabase server client so RLS is the primary safety net, with an explicit `.eq("user_id", user.id)` secondary filter. Two Playwright smoke specs (`web/smoke/specs/export.spec.ts`) verify the JSON and CSV paths end-to-end — zip contents, manifest shape, RLS scoping, included/excluded tables.

- **Multi-source recovery_metrics: Fitbit sleep/HRV/steps/calories + schema changes (#449).** Prerequisite for per-metric source preferences (#435). Three changes ship together: (1) `recovery_metrics` gains a `source` column in the unique constraint (`user_id, date, source`) so Fitbit and Oura rows coexist per date — existing rows backfilled to `source = 'oura'`. (2) Fitbit sync now calls the sleep, HRV, and daily-activity-summary endpoints and writes recovery rows with `source = 'fitbit'`. (3) Three Oura metadata JSONB fields (`sleep_efficiency`, `awake_hrs`, `vo2_max`) promoted to real columns with SQL backfill. All existing read paths updated with `source = 'oura'` filter to preserve current behaviour until the preference layer (#435) ships.

- **Package delivery widget — expected delivery dates on dashboard (#412).** The dashboard now surfaces a lightweight banner strip (below the birthday banner) showing the most imminent incoming delivery. Gmail is scanned for shipping confirmation emails; UPS, FedEx, USPS, DHL, and Amazon tracking numbers are extracted via regex, and estimated delivery dates are parsed directly from the email body. Data persists in a new RLS-scoped `packages` Supabase table. The banner groups by Today / Tomorrow / This week / Tracking, returns `null` when there are no active deliveries, and links single-package buckets directly to the carrier's tracking page. Background refresh runs in the existing daily cron; on-mount stale-refresh triggers automatically if data is more than 6 hours old. No external API key required.

### Refactored

- **Split `scripts/_supabase.py` god module into focused helpers (#402).** Notification logging extracted into `scripts/_notifications.py`; HTTP retry and sync_log writes extracted into `scripts/_sync_log.py`. `_supabase.py` now contains only `get_client`, `get_owner_user_id`, and `upsert`. Seven callers updated to import from the correct module; ten callers required no changes.

### Changed

- **Settings page reorganized into tabbed navigation (#434).** Replaces the single long-scroll layout with five named tabs — Profile, Fitness, Integrations, Watchlists, Appearance. Active tab persists to `?tab=` URL param for deep-link and back-navigation support. Default tab on first load is Profile. Each tab fetches only the Supabase data its sections require (e.g. the Integrations tab is the only one that invokes `loadIntegration` and `lastSyncStatus`). No changes to any individual settings section component.
- **Admin pages styled to match site design system (#502).** Replaced the standalone admin header chrome with the shared `<Nav />` component so admin pages look and navigate identically to the rest of the app. Converted raw pixel values and hardcoded sizes in `admin/page.tsx` and `admin/tenants/[userId]/page.tsx` to CSS design tokens (`var(--space-*)`, `var(--t-*)`, `var(--r-*)`, `var(--rule-soft)`); all sections now use `.db-section-label` headings and hairline row rules consistent with Phase B dashboard surfaces. Passes token-lint clean.

### Performance

- **Mobile Lighthouse LCP improvements and /settings CLS fix (#384).** All 11 routes now pass the perf smoke gate. Key changes:
  - `/settings` mobile CLS fixed (0.163 → 0.000): `AppearanceSettings` description text now always renders server-side (removed the `mounted ? active.desc : ' '` gate); outer flex row changed to `flex-col` on mobile so the description can't wrap and push content below it.
  - Chart code-splits on `/fitness` dashboard tab (`BodyCompTrends`, `RecoveryTrends`, `ActivityTrends`) and `/dashboard` (`BodyFitnessSummary`, `HealthBreakdown`) via `next/dynamic({ ssr: false })` with sized skeletons, reducing initial JS parse cost.
  - `react-markdown` + remark-gfm split on `/chat` via `next/dynamic`, cutting the initial bundle for the chat route.
  - Suspense streaming on `/weekly` (h1 header streams in shell; data grid resolves asynchronously) and `/settings` (header + AppearanceSettings stream first; data-dependent sections follow).
  - Server waterfall collapses: `/settings`, `/dashboard`, `/habits`, `/meals`, `/notifications` all have sequential Supabase awaits replaced with `Promise.all` where queries are independent.
  - `createClient()` in `web/src/lib/supabase/server.ts` wrapped in `React.cache()` for per-request deduplication.
  - Perf baselines ratcheted down across all 11 routes to lock in improvements (dashboard −456ms, chat −504ms, notifications −672ms, habits −258ms, weekly −98ms vs prior baselines).

### Removed

- **Orphan `web/design-system/mr.-bridge/` directory deleted (#401).** This was an unreferenced copy of the design system master doc generated by the `ui-ux-pro-max` skill with a period-in-folder slugification bug ("mr.-bridge"). It had zero inbound references in code, config, docs, or rules. Canonical design system stays at `design-system/mr-bridge/MASTER.md`.

### Changed

- **Post-incident secret rotation and posture upgrade (#368).** All production secrets were rotated after the Vercel April 2026 security incident (see `docs/runbooks/secret-rotation-2026-04.md` for the full rotation log). Every secret env var was re-added to Vercel with the Sensitive flag. Monarch Money credentials and TheSportsDB API key were deleted entirely — both were abandoned integrations no longer in use. `SPORTSDB_API_KEY` / `SPORTS_PROVIDER` removed from env templates and `thesportsdb.ts` deleted; the sports widget now routes exclusively through ESPN (no key required). A new `docs/SECURITY.md` documents the sensitive-flag rule, rotation cadence, and breach-response protocol. `.github/PULL_REQUEST_TEMPLATE.md` added with a security checklist required for any PR that introduces env vars.
  - If Google Calendar, Gmail, or Fitness shows as disconnected: reconnect it via Settings → Integrations — `GOOGLE_CLIENT_SECRET` was rotated and existing OAuth sessions need re-authorisation.

### Added

- **Standalone typecheck + depcheck CI jobs (#405).** `tsc --noEmit` now runs as a dedicated `typecheck` job in `.github/workflows/lint.yml` on every PR, catching TypeScript errors without requiring a full `next build`. A `depcheck` job runs in parallel to flag unused or drifting dependencies automatically. `npm run typecheck` added to `web/package.json` for local use. `emoji-picker-react` removed from dependencies (first depcheck finding — was unused).

- **Optional dish description field on Food Analyzer (#371).** An optional textarea ("Tell Bridge what's in the dish (optional)") appears above the camera/library buttons on the Food Analyzer landing view. User text (max 500 chars) is injected as an untrusted reference note in the user-turn slot of the vision model for more accurate macro estimates. The value persists on each `ScanItem` through re-estimates and inline edits, is stored in a new `meal_log.user_context` column, and flows through the Bridge chat log path. Users who skip the field see no change in behavior.

- **Pre-commit hook via husky + lint-staged (#354).** ESLint (--fix) and Prettier run on staged files before every local commit. All four token guards (hover handlers, hardcoded white, color-mix(), raw hex) also run via `scripts/lint-tokens.sh` so local behaviour matches CI. The hook is non-interactive and bypassed cleanly by `git commit --no-verify`. Installed automatically on `cd web && npm install`.
- **Prettier code-formatting with explicit config (#355).** `printWidth: 100`, `trailingComma: "all"` (all other defaults kept). `eslint-config-prettier` added as the last entry in `web/eslint.config.mjs` to disable conflicting stylistic ESLint rules. CI enforces formatting via `npm run format:check` added to the `eslint` workflow job. Use `cd web && npm run format` to reformat locally.

### Changed

- **Resolved token-lint scope question (#357).** `scripts/lint-tokens.sh` stays as a separate CI bash script — ESLint cannot natively scan `.css` files (Guards 2–3 cover `color-mix()` and `color:"white"` in CSS), so folding into ESLint would add a plugin dependency without reducing the tool count. Decision documented in the script header.

- **Per-provider last-sync timestamp and Sync Now button in Integrations settings (#422).**
  - Each connected provider (Google, Oura, Fitbit) now shows when data was last pulled — "Synced 3h ago", "Never synced", or "Failed 12m ago" (in danger color for error/partial status).
  - Oura and Fitbit rows include a Sync Now button that POSTs to the existing `/api/sync/{oura,fitbit}` routes, shows a "Syncing…" spinner, and updates the timestamp optimistically on completion.
  - Google shows the last `google_fit` sync timestamp but no Sync Now button (cron-only).
  - Sync Now button is absent when a provider is disconnected.

### Fixed

- **Birthday notification script now reads Google refresh token from `user_integrations` (#409).** `scripts/check_birthday_notif.py` was reading `GOOGLE_REFRESH_TOKEN` from `.env`, which was revoked after the multi-tenant OAuth migration in #390/#396. `get_credentials()` now calls `load_integration(client, user_id, "google")` from `_integrations.py`, consistent with all other sync scripts. Also removed the hardcoded `scopes` parameter from the `Credentials` constructor — passing `calendar.readonly` caused an `invalid_scope` rejection because the web app grants the broader `calendar` scope.

- **Non-owner accounts redirected to /login when opening /settings (#424).** The protected layout was running a redundant `supabase.auth.getUser()` + `redirect("/login")` check on every render, duplicating the auth gate already enforced by `proxy.ts`. On `/settings` (the only `force-dynamic` protected route that always hits the server fresh), the layout's network-backed `getUser()` raced the proxy's cookie refresh and observed a null user, firing the guard for any non-owner Supabase Auth user including the smoke test account. The redundant check is removed; auth enforcement now lives exclusively in `proxy.ts` where session cookies can be correctly refreshed and persisted.

- **`logSync()` was writing to a non-existent column `rows_written`; corrected to `records_written`.**
  Previously every web-triggered sync silently failed to write its sync_log row (supabase-js returns an error object rather than throwing, and the return value was ignored). This meant the Sync Now timestamps above would never update. The Python sync scripts already used the correct column name.
- **Sports: allow ESPN CDN domain for team logo images (#442).** Added `a.espncdn.com` to `images.remotePatterns` in `next.config.ts`. Next.js `Image` blocks external hostnames by default; without this entry all sports team logo images silently failed to load. Works in tandem with the `<img>` → `<Image>` migration in the TeamLogo component (#439).

### Fixed

- **Graphify extractor — eliminate false god nodes from Next.js route handlers and method-call noise (#429).**
  - Route handler collision: Next.js App Router requires `GET`, `POST`, `DELETE`, etc. as named exports in `route.ts` files. All such files share the stem `"route"`, so the extractor was collapsing all same-verb handlers into one node (`GET` = 98 edges, `POST` = 48 edges, `DELETE` = 21 edges). Fixed by namespacing these exports using their file path: IDs are now unique per route file and labels read `GET@chat/route.ts` instead of bare `GET()`.
  - Member-call noise: `round()` (35 edges) and `select()` (39 edges) were built-in/third-party method calls (`Math.round`, Supabase `.select`) that falsely resolved to user-defined functions with the same name. Fixed by tracking a `is_member_call` flag through the call extractor and suppressing cross-file resolution for a curated list of stdlib/third-party method names.
  - Cross-language noise: Python `round()` (direct built-in call) was resolving to TypeScript's `units.ts:round()`. Fixed by blocking cross-language callee resolution (Python caller → TypeScript target, etc.).
  - Result: `GET`, `POST`, `DELETE`, `select()`, `round()` all eliminated from god nodes. `createClient()` correctly surfaces as #1 real hub at 71 edges.

### Changed

- **Renamed bare `get()` helpers in sports sync files to domain-scoped names (#404).**
  - `get<T>()` in `web/src/lib/sync/sports/thesportsdb.ts` renamed to `sportsDbGet<T>()`.
  - `get<T>()` in `web/src/lib/sync/sports/espn.ts` renamed to `espnGet<T>()`.
  - Both are private (non-exported) helpers; no call-site changes outside each file.
  - Matches the convention already used across other sync modules (`fitbitGet`, `ouraGet`, `fitGet`, `polygonGet`).
  - `get()` has been eliminated from the graphify God Nodes list (was #1 at 64 edges).

### Fixed

- **WCAG 2.1 AA color-contrast — axe sweep re-enabled (#381).**
  - Added `--accent-text: oklch(45% 0.13 65)` in light mode (≈5:1 on page bg) alongside existing `--accent`; dark mode aliases `--accent-text` to `--accent` unchanged.
  - Darkened light-mode `--color-text-on-cta` from near-white `oklch(98% 0 0)` to dark ink `oklch(16% 0.020 var(--hue))` — fixes near-white-on-amber pill fills (notifications filter, settings theme radio, window-selector pills).
  - Updated all Pattern A consumers (amber-as-text) to use `--accent-text`: nav active links/icons, journal outer/inner tabs, meals settings links, macro summary settings link, meals "Add macros"/"Ingredients"/"Estimate macros" action links, meals chat link.
  - Removed `data-reveal` from the desktop nav (`position: fixed`) — the entrance animation started at `opacity: 0`, causing axe to evaluate link text at reduced opacity and produce spurious timing-dependent failures.
  - Re-enabled `color-contrast` rule in `smoke/specs/a11y.spec.ts` (removed `.disableRules(["color-contrast"])` + TODO comment). All 11 routes now pass the axe critical/serious gate.

### Added

- **Calendar tab — week/day/month views with full CRUD (#375).**
  - New `/calendar` route with a full-height calendar surface. Week view is the default; toggle to Day or Month via the view pill in the toolbar. Prev/next navigation and "Today" jump button.
  - Week/day view: 24-hour scrollable time grid (starts at 7 AM), events positioned absolutely by start/end time, greedy overlap detection shows simultaneous events side-by-side. All-day events rendered in a banner row above the grid. Current-time indicator line.
  - Month view: 7-column grid with event pills (up to 3 per day, "+N more" overflow label).
  - Click any empty slot → create-event modal (title, date, start/end time, all-day toggle, location). Click any event → detail dialog (time, location, calendar label) with Edit and Delete (two-tap confirm) actions.
  - `calendarType` (primary / birthday / holiday / other) maps to distinct accent colors across all views.
  - New API routes: `GET /api/google/calendar/range?timeMin=&timeMax=` for range queries; `POST /api/google/calendar/events` to create; `PATCH /api/google/calendar/events/[eventId]` to update; `DELETE /api/google/calendar/events/[eventId]` to delete.
  - Demo mode: `DEMO_CALENDAR_EVENTS` extended from 4 to 20 events spanning 3 weeks (all-day, birthday, holiday, overlapping, and multi-hour events) so all three views are populated with meaningful data.
  - Calendar nav item (CalendarDays icon) added between Weekly and Journal; appears in the "More" bottom sheet on mobile.
  - All colors use existing CSS tokens (`--accent`, `--accent-soft`, `--rule-soft`, etc.); no raw hex in `.tsx` files — token-lint clean.

- **Per-user Oura and Fitbit token storage in `user_integrations` (#394, #395).** Oura and Fitbit are now multi-tenant:
  - **Oura:** Users paste a Personal Access Token in Settings → Integrations (inline expand). Token is stored encrypted in `user_integrations` (provider `"oura"`). `syncOura` reads from the table first, falls back to `OURA_ACCESS_TOKEN` env var (owner migration path). Python `scripts/sync-oura.py` updated to use `_integrations.py` helper with the same priority.
  - **Fitbit:** New `/api/auth/fitbit/start` + `/api/auth/fitbit/callback` OAuth 2.0 routes (mirrors Google pattern: CSRF cookie, Basic auth code exchange, `storeIntegration`). `syncFitbit` reads refresh token from `user_integrations` first, falls back to `profile` table. Token rotation writes back to the same source via `persistRotatedToken`. Python `scripts/sync-fitbit.py` updated similarly.
  - **UI:** Integrations settings panel now shows Oura and Fitbit rows (connected badge + Disconnect server action when connected; Connect Oura inline paste field / Connect Fitbit OAuth button when not).
  - **New env var:** `FITBIT_OAUTH_REDIRECT_URI` — required for Fitbit OAuth (app-level, not per-user). `FITBIT_CLIENT_ID` / `FITBIT_CLIENT_SECRET` unchanged.
  - **New helper:** `scripts/_integrations.py` mirrors `web/src/lib/integrations/tokens.ts` for Python scripts, using the same Supabase encrypt/decrypt RPCs.

- **Expandable exercise description/tips panel and in-app rest timer (#414, #283).**
  - `description` (string) and `tips` (string[]) optional fields added to `WorkoutExercise` in types and the `assign_workout` / `update_workout_exercise` tool schemas. The AI now populates 1–3 sentence how-to descriptions and 2–4 form cues per exercise at plan generation time.
  - Each `ExerciseRow` in the weekly workout plan shows a `▾` chevron button when `description` or `tips` data is present. Tapping it collapses/expands an inline panel with the description paragraph and a tips bullet list. Exercises without these fields are unaffected.
  - `InlineSetLogger` now starts a rest countdown automatically after each successful set log. Duration defaults to 90 s; override via `localStorage` key `bridge:rest_timer_duration`. The timer persists across page reloads via `bridge:rest_timer_end`. Dismissible with ✕. On completion a gentle pulse animation plays and an optional ntfy.sh push fires via a new `/api/notifications/push` route (requires `NTFY_TOPIC` env var; silent if unset).
  - New Settings → Fitness section with a rest-timer On/Off toggle backed by the profile kv key `rest_timer_enabled`.

- **Workout improvements: weight notation, fitness tabs, personal records (#331).**
  - `weight_notation` field (`per_hand` | `total` | `null`) on `WorkoutExercise` — Bridge now writes it for new exercises; existing dumbbell exercises auto-infer `per_hand` at render time via name pattern match. Weight display shows "/ hand" or "total" muted label next to target weights throughout the plan and logged sets.
  - `/fitness` page refactored into a tabbed surface (Dashboard / Workouts / History) using a new `FitnessClient` client component. Dashboard (body comp, recovery, activity trends) is the default landing tab.
  - `exercise_prs` Supabase table stores pre-computed PRs (weight, rep, volume) per exercise per user. PRs are upserted after each session completion; first-load backfill runs once if the table is empty. 🏆 chip appears inline on exercises with a PR set in the last 30 days. Full PR table (weight PR, rep PR, volume, date) lives under History.
- **Equipment inventory + cancel/reschedule-workout support (#370).** Three new capabilities:
  - New `user_equipment` table (RLS-enabled) with composite unique `NULLS NOT DISTINCT` on `(user_id, equipment_type, weight_lbs, resistance_level)`. New Settings → Equipment section where you can add/remove equipment by type, weight, resistance level, and quantity. Stock types: dumbbell pair, barbell, plate set, kettlebell, resistance band, slider.
  - New `get_user_equipment` Bridge tool returns a structured `{ items, maxes }` map. `assign_workout` and `update_workout_exercise` now validate proposed weights against inventory before writing — reject with a truth-in-payload error listing each violation and the available max (per #346). System prompt updated: Bridge always calls `get_user_equipment` before proposing weights and never exceeds inventory limits.
  - Workout plan status column (`planned | completed | cancelled | skipped`, default `planned`) with `cancel_reason` and `cancelled_at`. Backfill migration marks plans with linked `strength_sessions` as `completed`, all others remain `planned`. New `cancel_workout` Bridge tool soft-cancels the DB row and deletes the Google Calendar event in one atomic operation with read-after-write verification on both (per #319). Cancel action added to the Fitness tab weekly plan — "Cancel workout" button in each expanded plan row (planned status only); confirmed cancelled rows render dimmed with strikethrough and a "Cancelled" badge.
  - New `reschedule_workout` Bridge tool moves a planned workout atomically: copies config to target date, soft-cancels source, PATCHes (not recreates) the existing calendar event to the new date preserving event ID and attendees. New shared logic in `web/src/lib/fitness/` consumed by both tools and the server action.

### Changed

- **Cron now syncs Oura, Fitbit, and Google Fit for all connected users, not just the owner (#420).** `web/src/app/api/cron/sync/route.ts` replaces the single-owner `syncOura/syncFitbit/syncGoogleFit(db, ownerUserId)` calls with a per-provider fan-out:
  - `listConnectedUsers(db, provider)` (already in `web/src/lib/integrations/tokens.ts:86`, zero callers before this PR) fetches all `user_id` values for a given provider from `user_integrations`.
  - `Promise.allSettled` runs each user's sync concurrently; one user's failure does not abort others.
  - Response shape changes from `{ updated: N }` to `{ usersSynced: N, usersFailed: N, errors: [{userId, error}] }` per provider.
  - The 30-min skip window remains a **global gate per provider** (`lastSyncAgeSecs` is not user-scoped; no schema change to `sync_log`).
  - Stocks and sports syncs remain owner-scoped (`OWNER_USER_ID` still required); `OWNER_USER_ID` env var is unchanged.

- **Meal API routes migrated to ToolLoopAgent.generate() (#366).** All four `generateText()` call sites under `web/src/app/api/meals/` now use `new ToolLoopAgent({ model, instructions, output }).generate({ messages })` — the same config surface as the chat agent. `suggest/route.ts` and both modes in `analyze-photo/route.ts` use `claude-sonnet-4-6`; `estimate-macros/route.ts` retains `claude-haiku-4-5-20251001`. Instructions are extracted from the embedded prompt text into the `instructions` constructor param; user-facing dynamic content remains in the `messages` payload. No behaviour or response shape changes. Prompt caching follow-up tracked in #340.

### Fixed

- **Chat smoke no longer fails when Google isn't connected on the smoke account (#420).** `web/smoke/specs/chat.spec.ts` clears the `consoleErrors` array immediately after `page.goto("/chat")`. Root cause: login redirects to `/dashboard`, which mounts `ScheduleToday`, `UpcomingBirthday`, and `ImportantEmails` — all three fire client-side fetches to `/api/google/calendar`, `/api/google/calendar/upcoming-birthday`, and `/api/google/gmail`, which return 403 when the smoke user has no Google tokens. The fixture accumulates errors across the full page session, so those pre-navigation 403s were counted against the chat test's `consoleErrors.toHaveLength(0)` assertion.

- **CI smoke workflow now has Google OAuth creds (#417).** Added `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to both the `smoke-pr` and `smoke-release` env blocks in [.github/workflows/smoke.yml](.github/workflows/smoke.yml). Without them, Next dev-server boot hit `throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET env vars")` in [web/src/lib/google-auth.ts](web/src/lib/google-auth.ts) on the first chat-tool module import, failing every PR's smoke run. Required repo secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (add via Settings → Secrets and variables → Actions; same values as Vercel prod).

- **Push notifications restored and tap-to-open fixed (#383).** Root causes: (1) `APP_URL` was missing from `.env` — every check script calls `os.environ.get("APP_URL", "")` and silently skips the `--click-url` argument when it's empty, so all ntfy.sh Click headers were dropped. Added `APP_URL=https://mr-bridge-assistant.vercel.app` to `.env`. (2) No cron entries existed — the five check scripts were never scheduled. `scripts/install-notifications.sh` now writes idempotent cron entries for all five scripts with correct schedules (weather 07:00, daily-alerts 07:30, birthdays 08:00, HRV 08:30, tasks 09:00 + 17:00). Each cron entry sources `.env` before invoking the script so env vars are available outside a shell session. (3) `notify.sh` had no delivery log — silent curl failures were invisible. Now appends one ISO-timestamped line per attempt to `~/.mr-bridge/notify.log` whether or not `NTFY_TOPIC` is set.

- **Bridge no longer stalls mid-turn after announcing a next action (#369).** Added a system-prompt rule requiring Bridge to either call the corresponding tool in the same turn or end with an explicit confirmation question when it writes a promissory statement ("Now assigning X", "Next I'll...", "Moving on to..."). Root cause was the per-step confirmation cadence (calendar pre-flight, delete/update guards) being over-generalised to every tool call in a bulk-approved batch. Prompt-only fix; no agent-loop or TypeScript changes.
- **Past-day habit cells now persist on click (#386).** `toggleHabit` was using `onConflict: "habit_id,date"` which no longer matched the actual unique constraint `(user_id, habit_id, date)` introduced in migration `20260417000001` — upserts on existing rows silently did nothing. Fixed the conflict target to `"user_id,habit_id,date"`. Also added error checking on both the upsert and delete paths (`{ error }` was previously discarded), so failures now throw and the client's existing optimistic-rollback in `handleCellClick` correctly fires. Delete filter extended with `.eq("user_id", user.id)` to match the upsert scope.

### Changed

- **Email multi-account ingestion migrated off Gmail POP3 to auto-forwarding (#391).** Google is deprecating the "Check mail from other accounts (POP)" feature in 2026 — new users lost access in Q1 2026, existing users lose access before year-end. No Mr. Bridge code changes required: the `Professional` label detection in `/api/google/gmail` and the dashboard `important-emails` widget are transport-agnostic (they key off the label, not the delivery mechanism). Updated `docs/gmail-multi-account.md` with auto-forwarding setup instructions (enable forward on secondary → verify address → Gmail filter on primary to apply `Professional` label → decommission old POP source). Updated `.claude/rules/briefing.md` and `README.md` to remove POP3 references.

### Added

- **Impeccable UI revamp complete (#272).** Phase A (universal design system + dashboard) and Phase B (all 11 surfaces + nav shell) shipped. Gate B verification passed — all automated checks clean (CLS=0, LCP <1200ms desktop / <2100ms mobile, zero inline padding/duration literals, Phase A dead files removed). Follow-ups: #381 (color contrast), #384 (mobile LCP/CLS).
- **Per-user Google OAuth refresh tokens — multi-tenant Google integrations (#390).** Replaces the single global `GOOGLE_REFRESH_TOKEN` env var with per-user rows in a new `user_integrations` Supabase table. Each user connects their own Google account via `/settings → Integrations` ("Connect Google" button → Google consent screen → callback stores the encrypted refresh token). New `encrypt_integration_token` / `decrypt_integration_token` SQL functions wrap `pgp_sym_encrypt` / `pgp_sym_decrypt` keyed by a new `ENCRYPTION_KEY` env var — first use of column-level encryption in this codebase. `getGoogleAuthClient` is now async and per-user; falls back to the `GOOGLE_REFRESH_TOKEN` env var for the owner until the seed script is run post-deploy (zero-downtime migration). All 12 `getGoogleAuthClient` call sites updated: chat tools (`calendar.ts` 4 sites, `gmail.ts` 2, `workouts.ts` 2) and API routes (`/api/google/calendar`, `/api/google/calendar/upcoming-birthday`, `/api/google/gmail`). Google Fit sync helper (`getGoogleAccessToken`) similarly migrated — drops `GOOGLE_FIT_REFRESH_TOKEN` and `GOOGLE_FIT_CLIENT_ID/SECRET` env vars. OAuth start route at `/api/auth/google/start` and callback at `/api/auth/google/callback` (greenfield — no prior auth-code flow existed). Disconnect deletes the row via a settings server action. API routes now return `{ not_connected: true, status: 403 }` instead of a generic 500 when `GoogleNotConnectedError` is thrown. One-shot seed script at `scripts/seed-owner-google-integration.ts` moves the owner's existing token into the DB post-deploy. **Post-deploy manual steps:** (1) add `ENCRYPTION_KEY` to Vercel env; (2) add redirect URIs to Google Cloud Console OAuth client; (3) run `npx tsx scripts/seed-owner-google-integration.ts`. Closes #390, unblocks #380.

### Removed

- **`OURA_ACCESS_TOKEN` and `FITBIT_REFRESH_TOKEN` env-var / profile-table fallbacks removed (#421).** PR #419 moved tokens into `user_integrations`; PR #420 confirmed cron reads from there for all users; owner has since connected both providers via Settings → Integrations. `syncOura` now throws immediately if `loadIntegration` returns null (no `?? process.env.OURA_ACCESS_TOKEN`). `syncFitbit` always reads from `user_integrations` and always persists rotated tokens via `persistRotatedToken` — profile-table read/write path deleted. Python scripts `sync-oura.py` and `sync-fitbit.py` updated identically; `update_env_token` helper and all `.env` write paths removed. `OURA_ACCESS_TOKEN` and `FITBIT_REFRESH_TOKEN` removed from both `web/.env.local.example` and root `.env.example`. **Post-deploy:** delete the `profile` row where `key = 'fitbit_refresh_token'` for the owner user.
- **`GOOGLE_REFRESH_TOKEN` retired from root `.env.example` + stale setup docs pruned (#393).** Follow-up to #396 which removed the runtime fallback. The root [.env.example](.env.example) still carried a "Migration fallback only" note for `GOOGLE_REFRESH_TOKEN`; replaced with a tombstone comment mirroring the `GOOGLE_FIT_*` retirement pattern. [README.md](README.md) file-tree annotation for `scripts/setup-web-oauth.py` updated to describe it as the legacy flow — per-user tokens now come from the `/settings → Integrations` UI landed in #390. `OWNER_USER_ID` retained at line 68 and in README — still used by `/api/cron/sync` and the Python sync scripts. Closes #393.
- **`GOOGLE_REFRESH_TOKEN` / `OWNER_USER_ID` owner env fallback for Google auth (#396).** `getGoogleAuthClient` and `getGoogleAccessToken` now throw `GoogleNotConnectedError` unconditionally when `loadIntegration` returns null — no special-casing for the owner. The `/api/sync/googlefit` route similarly returns `{ skipped: true }` on no DB row without checking env vars. `GOOGLE_REFRESH_TOKEN` removed from `web/.env.local.example`; `OWNER_USER_ID` retained for cron sync only. Closes #396.
- `GOOGLE_FIT_REFRESH_TOKEN`, `GOOGLE_FIT_CLIENT_ID`, `GOOGLE_FIT_CLIENT_SECRET` env vars — superseded by `user_integrations` table.

### Changed

- **Token optimization — Claude Code context trimmed and .claudeignore added.** Monolithic `.claude/rules/mr-bridge-rules.md` (208 lines) split into `core.md` (always-loaded, 33 lines) + 7 on-demand files (`briefing.md`, `session-close.md`, `features.md`, `location.md`, `study-timer.md`, `voice.md`, `data-sources.md`). CLAUDE.md now imports `core.md` only; situational rules load via a pointer table when the relevant context is requested. Saves ~3,500–4,000 tokens of cold session context. `deepwiki` MCP removed from `.mcp.json` (unused). `.claudeignore` added covering build output, lock files, logs, secrets, and large generated files (CHANGELOG, renpho export).

### Added

- **CI — Smoke workflow with staged PR + nightly gates (#379).** Third Option-C follow-up from #373. New [.github/workflows/smoke.yml](.github/workflows/smoke.yml) with two jobs: **`smoke-pr`** runs `smoke:chat` + `smoke:a11y` on every pull_request that touches `web/**`, the smoke docs, `.mcp.json`, or the workflow file itself (paths-filtered to avoid churn on unrelated changes); **`smoke-release`** runs on a nightly `0 9 * * *` UTC cron plus `workflow_dispatch`, executes chat + a11y against Playwright-managed `next dev`, then stops dev / runs `next build` / starts `next start` / runs `smoke:perf` against the prod bundle / tears down. Playwright browsers cached with key `playwright-<runner>-<hash(package-lock.json)>` — `playwright install --with-deps chromium` fires only on cache miss. On failure both jobs upload `smoke/test-results/`, `smoke/playwright-report/`, and (release only) `smoke/perf-report/` as artifacts with 14-day retention. `concurrency.cancel-in-progress: true` scoped to `smoke-<workflow>-<ref>` so stale PR runs cancel on new pushes. Matches the [.github/workflows/lint.yml](.github/workflows/lint.yml) setup stanza (Node 20, npm cache on `web/package-lock.json`, `defaults.run.working-directory: web`, `npm ci`). **Required repo secrets** (set under Settings → Secrets and variables → Actions): `SMOKE_TEST_EMAIL`, `SMOKE_TEST_PASSWORD`, `SMOKE_SUPABASE_SERVICE_KEY` (= `SUPABASE_SERVICE_ROLE_KEY`), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (middleware hits this on every request), `ANTHROPIC_API_KEY` (chat smoke hits Anthropic). Never scope any of them to production. The first run on this very PR will fail until the secrets land — that's expected, re-run the job from the Actions UI after adding them. [docs/smoke-testing.md](docs/smoke-testing.md) "CI" section rewritten (previously "Not yet configured"). Closes #379.
- **Calendar exclusion — per-profile `excluded_calendar_ids` to skip calendars across every Bridge read path (#388).** Motivated by #380: Jason created a dedicated smoke test Google Calendar under his own Google account, which auto-appears in his `calendarList` → would leak test events into the briefing, the dashboard's Schedule Today widget, and the `list_calendar_events` chat tool. New helper at [web/src/lib/calendar/excluded.ts](web/src/lib/calendar/excluded.ts): `getExcludedCalendarIds(supabase, userId)` reads the `profile` row at `key = "excluded_calendar_ids"`, parses the JSON-array value, returns a `Set<string>`; fail-open on missing / malformed so a schema slip doesn't blank out the schedule. Three call sites now filter the `calendarList` result before fanning out `events.list`: [web/src/lib/tools/calendar.ts](web/src/lib/tools/calendar.ts) (chat tool — took `supabase` + `userId` from the existing `ToolContext`), [web/src/app/api/google/calendar/route.ts](web/src/app/api/google/calendar/route.ts) (dashboard Schedule Today widget), [web/src/app/api/google/calendar/upcoming-birthday/route.ts](web/src/app/api/google/calendar/upcoming-birthday/route.ts) (Upcoming Birthdays widget). No new migration needed — the `profile` table already has the key/value shape used by `sports_favorites` / `stock_watchlist` / etc. **Jason's profile needs one-time seeding** with the smoke calendar ID (documented in PR body). Closes #388.
- **Developer tooling — Lighthouse perf smoke across all 11 routes (#378).** Follow-up from #373's Option-C deferred scope; sibling to #377. New [web/smoke/perf/lighthouse.mts](web/smoke/perf/lighthouse.mts) runs the Lighthouse Node API against each route (mobile + desktop) three times and takes the median of CLS / LCP / TBT. **INP can't be measured in a lab run** (it's a field metric — requires real user interaction), so TBT is used as Google's published proxy per [web.dev/inp](https://web.dev/articles/inp). Thresholds from #323 Gate B: **CLS < 0.1**, **LCP < 2500 ms**, **TBT < 200 ms**. Auth for the 10 protected routes is solved via `chromium.launchPersistentContext()` with a user-data-dir: the script signs in via Playwright against that persistent Chrome (selectors mirror [smoke/fixtures/auth.ts](web/smoke/fixtures/auth.ts) — 8-line duplicate by design, since the fixture uses `test.extend` and doesn't fit a standalone script), and the new tab Lighthouse opens shares the same cookie jar. A short warm-up pass visits every route once after sign-in to pre-compile (no-op in prod, cuts first-audit LCP by 2–4 s in dev). The run is expensive (~7 min for 66 Lighthouse audits against a prod build) — intended for nightly / manual dispatch, not per-PR. New script `smoke:perf` in [web/package.json](web/package.json). New devDeps: `lighthouse`, `tsx` (the script is an ESM `.mts` because Lighthouse is ESM-only and the rest of the repo's TS config is CJS). Reports gitignored via [web/.gitignore](web/.gitignore) (`smoke/perf-report/`). **Per-route baselines at [web/smoke/perf/baselines.json](web/smoke/perf/baselines.json):** desktop passes all 11 routes cleanly against the prod build; mobile LCP fails on every route (3.0–4.2 s) and `/settings` mobile CLS fails at 0.163. Mobile LCP is a cross-cutting systemic issue (SSR'd client-component hydration cost under the mobile preset's 4× CPU throttle) and `/settings` mobile CLS is likely a mobile-only layout shift — both are too structural to fix in this PR. Baselined with +10 % tolerance for cold-run variance, tracked for ratchet-down in #384. The gate is `value ≤ max(threshold, baseline)`, so today's known-bad routes don't block the pipeline but regressions past the current floor still fail. **Always run against `npm run build && npm run start` — never `next dev`.** Dev-mode Lighthouse mobile numbers are meaningless (dev has no minification, source maps on, HMR client wired up → 6–10 s LCP floor regardless of real perf). [docs/smoke-testing.md](docs/smoke-testing.md) "What's covered today" and "Running locally" updated with the prod-build workflow and the baselines explanation. Closes #378.
- **Developer tooling — axe a11y smoke across all 11 routes (#377).** Follow-up from #373's Option-C deferred scope. New [web/smoke/specs/a11y.spec.ts](web/smoke/specs/a11y.spec.ts) data-drives `@axe-core/playwright` through `/dashboard`, `/chat`, `/fitness`, `/habits`, `/tasks`, `/weekly`, `/journal`, `/meals`, `/notifications`, `/settings`, `/login` — one `test()` per route so the HTML report carries per-route traces on failure. Reuses the `signedInPage` fixture from [web/smoke/fixtures/auth.ts](web/smoke/fixtures/auth.ts) for the 10 protected routes and a plain `page` for `/login`. Critical / Serious violations fail the test; Moderate / Minor findings surface as Playwright annotations via `testInfo.annotations.push({ type: "a11y:<impact>", ... })` so they accumulate in the report without blocking. Per-route settled signals are semantic (not `networkidle`, which never quiets on chat/dashboard due to streaming + polling): `<h1>` for the dashboard-like routes, `placeholder="Ask Mr. Bridge..."` for `/chat`, `getByLabel("Email")` for `/login`. New script `smoke:a11y` in [web/package.json](web/package.json) plus `@axe-core/playwright` devDep. Whole run is ~21s on a warm dev server, well under the 90s acceptance SLA. **Obvious critical findings fixed in the same PR:** missing `aria-label` on the chat composer `<textarea>` (chat-interface.tsx:456 — `"Message Mr. Bridge"`), on two `<input type="date">` instances in tasks ([add-task-form.tsx](web/src/components/tasks/add-task-form.tsx), [task-item.tsx](web/src/components/tasks/task-item.tsx) — `"Due date"`), and on all four `<select>` meal-type pickers in [MealsClient.tsx](web/src/components/meals/MealsClient.tsx) — `"Meal type"`. **Baselined for design-token follow-up (#381):** the `color-contrast` rule is temporarily disabled via `.disableRules(["color-contrast"])` because every route fails it at the same three token surfaces — active nav link (`[aria-current="page"]`), segmented-control / tab / radio active button, and a small set of secondary-text spans. Re-enable when #381 lands. [docs/smoke-testing.md](docs/smoke-testing.md) "What's covered today" and "Running locally" updated. Closes #377.
- **Developer tooling — Playwright smoke infrastructure + Playwright MCP for interactive browser control (#373).** Automates the "start dev, sign in, send a chat, paste output back" loop that the manual chat-smoke rule covered — the rule caught PR #359, but skipping it caused the rollback in the first place. Two pieces land together per the issue's Option C: **(1) committed suite** at [web/smoke/](web/smoke/) with [playwright.config.ts](web/playwright.config.ts) (chromium, webServer auto-starts `next dev` on port 3000 with `reuseExistingServer` outside CI, trace + screenshot + video on failure, `fullyParallel: false` + `workers: 1` because specs touch a single shared test account), a signed-in page fixture at [smoke/fixtures/auth.ts](web/smoke/fixtures/auth.ts) that signs in via `getByLabel("Email")` / `getByLabel("Password")` / `getByRole("button", { name: "Sign in" })` and captures console errors + page errors through `page.on("console" | "pageerror")`, a service-role Supabase helper at [smoke/utils/supabase-verify.ts](web/smoke/utils/supabase-verify.ts) that bypasses RLS to query `chat_messages` for the test account, and the MVP spec at smoke/specs/chat.spec.ts — fills `getByPlaceholder("Ask Mr. Bridge...")` with `"what is 2+2"`, clicks `getByRole("button", { name: "Send" })`, races `page.waitForRequest` + `page.waitForResponse` + the click with `Promise.all`, reads the `sessionId` out of the POST body (session creation is lazy client-side via `crypto.randomUUID()`; server upserts `chat_sessions` on first POST), calls `chatResponse.finished()` so we wait for the stream body to close not just headers, asserts the assistant bubble is visible via the stable `data-print-message="assistant"` selector with matching `/4|four/i`, queries `chat_messages` for ≥ 2 rows (user + assistant with non-empty `content`), and fails if any console error fired. Scripts added to [web/package.json](web/package.json): `smoke` (full suite), `smoke:chat`, `smoke:install` (one-time `playwright install --with-deps chromium`). Artifacts gitignored via [web/.gitignore](web/.gitignore) (`smoke/test-results/`, `smoke/playwright-report/`). **(2) Playwright MCP** — Microsoft's official [`@playwright/mcp`](https://github.com/microsoft/playwright-mcp) registered in [.mcp.json](.mcp.json) alongside the existing `deepwiki` entry, so Claude Code sessions in this repo surface `browser_navigate` / `browser_type` / `browser_click` / `browser_snapshot` tools and can drive a real browser during authoring and debugging. New env vars in [.env.example](.env.example): `SMOKE_TEST_EMAIL`, `SMOKE_TEST_PASSWORD`, `SMOKE_SUPABASE_SERVICE_KEY` (aliased to the service-role key so the smoke code path is explicit). Full run-locally guide including the one-time Supabase-dashboard test-account creation lives at [docs/smoke-testing.md](docs/smoke-testing.md), with a short "Running smoke tests" section added to [README.md](README.md). **Deliberately out of scope for this PR** (filed as follow-up issues on merge per the Option C plan): axe a11y spec across 11 routes, Lighthouse perf runner with #323 thresholds, CI workflow with staged gates (`smoke:chat` + `smoke:a11y` per PR; `smoke:release` nightly), mutating-tool + multi-turn coverage (#319 false-success + #369 promise-to-continue). **Stays manual:** iOS Safari on real device, VoiceOver, Impeccable `/critique` + `/polish`, and any chat change not yet covered by a committed spec — the manual chat-smoke rule still applies there. Closes #373.
- **Anthropic extended thinking wired into the Sonnet chat path behind `ENABLE_THINKING` flag, default off (#339).** Measurement-first per the plan — the issue's three open decisions (enable at all? UX surface? per-model or global?) needed real data before committing to a UX. PR #350 cleared the way by collapsing the chat surface onto `ToolLoopAgent`, so the config now lives at the agent constructor in web/src/app/api/chat/route.ts: `providerOptions: { anthropic: { thinking: { type: "adaptive" } } }` is spread onto `new ToolLoopAgent({...})` only when `modelTier === "sonnet" && process.env.ENABLE_THINKING === "1"` — Haiku and the Groq demo path receive nothing. **Adaptive mode, not enabled+budgetTokens** — per the @ai-sdk/anthropic docs, "for newer models (claude-sonnet-4-6, claude-opus-4-6, and later), use adaptive thinking" so the model self-selects whether each turn warrants reasoning. The existing `tokenBudgetExceeds(TOKEN_BUDGET = 150_000)` predicate in route.ts covers reasoning automatically because Anthropic counts thinking as output tokens. Reasoning is **session-only** by three independent guarantees: (1) `sendReasoning: false` on `toUIMessageStreamResponse` — reasoning bytes don't cross the wire even though the SDK default is `true`; (2) the `chat_messages` insert path persists `text.trim()` only (or the #319 `synthesizeFallbackSummary` output when text is empty), neither of which can include reasoning since they're separate fields on the v6 `OnFinishEvent`; (3) the #319 synthesizer's input is `(steps, flags)` — reasoning isn't an addressable input, so it cannot substitute for a final answer. No client renderer changes; `getMessageText` in chat-interface.tsx keeps filtering on `type === "text"`. **SDK finding** — `@ai-sdk/anthropic@3.0.0` does not break out reasoning into `outputTokens.reasoning` (always `undefined` per convert-anthropic-messages-usage.ts lines 66–70 — Anthropic's API doesn't separately report reasoning_tokens in `usage`, the SDK just lumps everything into `outputTokens.total`). So usage-based accounting cannot tell us whether thinking fired. Instead `onFinish` reads `StepResult.reasoning` (an `Array<ReasoningPart>`) and `StepResult.reasoningText` directly — the only definitive signal — and the `[chat] cache ...` log line extends with three new key-value fields: `reasoningParts=<n>` (count of reasoning blocks across all steps), `reasoningChars=<n>` (sum of reasoning text length, a proxy for thinking volume since Anthropic bundles it into output token billing), and `thinkingEnabled=<true|false>` (the gate flag itself), so a baseline-vs-thinking A/B run is grep-able from one stdout file. **Measured A/B (5 prompts, Sonnet 4-6, real Bridge state, single-session-per-arm fallback after the new-chat-button hydration mismatch broke per-prompt fresh sessions):**

  | #   | Prompt                    | Baseline ms | Thinking ms |   Δ ms | Baseline out tok | Thinking out tok | reasoningChars | Quality call                                                                                                                                       |
  | --- | ------------------------- | ----------: | ----------: | -----: | ---------------: | ---------------: | -------------: | -------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 1   | `hi`                      |        1745 |        2093 |   +348 |               12 |               42 |             51 | same                                                                                                                                               |
  | 2   | Friday move + errands     |       22177 |       24066 |  +1889 |              586 |             1294 |           1746 | baseline (caught Giants game conflict, asked timing, offered Sunday)                                                                               |
  | 3   | `move my workout` (ambig) |        8538 |       17278 |  +8740 |              289 |              770 |            954 | thinking (flagged Giants game as timing constraint)                                                                                                |
  | 4   | deload swap               |       20461 |       20553 |    +92 |              596 |             1062 |           1289 | tied / baseline (better history narration + side-by-side table)                                                                                    |
  | 5   | meal Q&A                  |       14103 |       26888 | +12785 |              616 |             1430 |           2093 | **baseline (tool-use regression — thinking said "no saved recipes match" but baseline correctly found Air Fryer Chicken Thighs in saved recipes)** |

  **Aggregates:** mean latency baseline 13.4s → thinking 18.2s (+4.8s, +36%); mean output tokens baseline 420 → thinking 920 (+500, +119%); cost delta ≈ +$7.50 per 1k turns at Sonnet's $15/MTok output rate (cache reads unchanged); reasoning fired on every turn including chitchat (adaptive mode is permissive, not selective). **Subjective:** baseline ≥ thinking on 4 of 5 prompts, with one outright regression where thinking either skipped or misread the `get_recipes` tool. **Recommendation: do not enable by default.** The infrastructure (gate, adaptive provider config, reasoning instrumentation, sendReasoning gate, the SDK-extraction finding) ships behind `ENABLE_THINKING=0` so a future re-measurement can flip the flag — when a new Sonnet snapshot lands, when we want to evaluate Haiku, or when the prompt distribution shifts toward more multi-step planning. Out of scope and deferred unless future data justifies: a UX surface for reasoning (collapsed disclosure or "Bridge is thinking…" ambient strip extending #341), thinking on the Haiku path, swapping back to `enabled` mode with explicit `budgetTokens`, persisting reasoning to `chat_messages`, the per-prompt-conditional gate (route thinking only via the `selectModel` keyword/length predicates). Closes #339.

### Changed

- **Chat transport adopts `UIMessage.parts` end-to-end; chat history round-trips real tool calls and results (#342).** The v4→v6 SDK upgrade (#329) kept the legacy `{role, content: string}` wire shape via a `prepareSendMessagesRequest` shim in web/src/components/chat/chat-interface.tsx — the minimal-diff path. Consequence: when the user reopened an old session, structured tool calls and results were a flattened text approximation, not the actual interaction. This PR keeps the structured shape across the whole boundary. **Schema** (new migration [supabase/migrations/20260420000000_chat_messages_add_parts.sql](supabase/migrations/20260420000000_chat_messages_add_parts.sql)): `chat_messages.parts jsonb NOT NULL DEFAULT '[]'`, backfilled from `content` as a single text part for every historical row. `chat_messages.content` stays `text NOT NULL` — it's the denormalized preview snapshot that the session-sidebar query at web/src/app/api/chat/sessions/route.ts keeps reading; explicitly not migrated to JSONB so the sidebar doesn't have to walk parts. RLS inherits automatically — the policy at [20260413000000_add_user_id_multitenancy.sql](supabase/migrations/20260413000000_add_user_id_multitenancy.sql) is row-scoped on `user_id`, no column whitelist. **Server** (web/src/app/api/chat/route.ts): POST accepts `UIMessage[]`, runs `convertToModelMessages` (the SDK already filters empty text parts, so the legacy empty-content guard is gone), and dual-writes both `parts` and `content` on every chat_messages insert. User-message persistence (pre-stream, the #132 durability path) writes `parts: lastUserMessage.parts` and the extracted text. Assistant-message persistence moved out of `ToolLoopAgent.onFinish` into `toUIMessageStreamResponse.onFinish` so it has access to the SDK's canonical `responseMessage.parts`; the bookkeeping (cache accounting, #319 synthesizer flag, #340 cache log line) stays in the agent's onFinish and stashes `contentToPersist` into a closure variable the outer onFinish reads. Reasoning parts are filtered before persist — #339 explicitly owns reasoning persistence and this PR keeps it ephemeral, matching the existing `sendReasoning: false` posture. **Client** (web/src/app/(protected)/chat/page.tsx + web/src/components/chat/chat-page-client.tsx): SSR loader + the four refetch paths (visibilitychange, loadSession, handleLoadMore, handleMessageSent) now hydrate UIMessages from the structured `parts` column; a `m.parts ?? [{type:'text', text: m.content}]` fallback covers any row missing parts (defensive against migration gaps; can be dropped in a follow-up cleanup PR once verified in production). Five identical inline mappers consolidated into a single `hydrateMessage` helper. **Transport** (chat-interface.tsx): `prepareSendMessagesRequest` shim and its local `getMessageText` helper deleted — `DefaultChatTransport({ api: "/api/chat" })` now sends UIMessages directly. **Untouched (verified)**: session-sidebar preview query, `get_session_history` tool ([web/src/lib/tools/session.ts](web/src/lib/tools/session.ts)), the model-context loader at route.ts which still reads `content` text (historical tool-result round-trips into the model context is a separate follow-up). The #319 synthesizer's text-to-`content` path is preserved exactly. **Verification**: `npm run build` clean, `npx tsc --noEmit` clean, `npm run lint` clean (0 / 0). Migration applied via `supabase db push`; smoke test against `npm run dev` covered the eight checks from the plan — fresh-session round-trip, multi-tool turn renders structured parts on reload (not synthesized paraphrase), forced tool failure preserved honestly per #319, #247 synthesized-fallback writes both columns, stop button (#352) preserves partial parts, pre-migration historical session renders identically, sidebar previews still read `content`, demo path (Groq) unchanged. Closes #342.
- **Chat agent surface refactored from hand-rolled `streamText` to v6 `ToolLoopAgent` (#350).** Follow-up to #337 once #340 (prompt caching) landed. web/src/app/api/chat/route.ts now instantiates a per-request `ToolLoopAgent({ model, instructions, tools, stopWhen, onFinish, prepareCall })` and invokes `agent.stream({ messages, abortSignal })`, replacing the `streamText(streamOptions)` call at the bottom of the route. Zero user-visible behaviour change — the route's four load-bearing contracts all survive unchanged: (1) **#319 verified-success** (`isToolResultOk` + `completedSteps` aggregation runs inside the new `onFinish`, which receives the identical `OnFinishEvent` shape as today), (2) **#346 habit-fabrication guard** (payload-side in [habits.ts](web/src/lib/tools/habits.ts), untouched), (3) **#247 deadline → synthesized-fallback** (`synthesizeFallbackSummary` + its empty-text trigger still fire inside `onFinish`), (4) **#336 turn-complete sentinel** (stamped via `toUIMessageStreamResponse({ messageMetadata })` on `part.type === "finish"` — `messageMetadata` fires on both `start` and `finish` parts per ai@6.0.168 line 2345). Field renamed `system` → `instructions` per `ToolLoopAgentSettings`. `abortSignal` moved off the settings object (`ToolLoopAgent` omits it from the constructor) and passes through the per-call `.stream()` argument instead — the `turnAbort` AbortController + `TURN_DEADLINE_MS` wall-clock guard stay as-is, outside `stopWhen` because a step-boundary predicate cannot beat a Lambda kill mid-step. `onError` moved from the old `streamText` settings into `toUIMessageStreamResponse({ onError })`, which now returns the client-visible fallback string (`"An error occurred."`) matching the SDK's default. `prepareCall: async (args) => args` is a passthrough today but satisfies #350's stated contract that per-request tool factories wire through `prepareCall`; future non-streaming callers can reuse the same agent shape by swapping `.stream()` for `.generate()`. Type-only adjustment: `tokenBudgetExceeds` now carries a `<T extends ToolSet>` generic instead of the concrete `StopCondition<ToolSet>` return it had under `streamText`, because `ToolLoopAgentSettings.stopWhen` uses `StopCondition<NoInfer<TOOLS>>` and the SDK's own helpers (`stepCountIs`) return `StopCondition<any>` for the same reason — we parametrize instead to keep `--no-explicit-any` clean. Verification: `npm run lint` clean, `npm run build` clean, manual smoke test against `npm run dev` covered the seven checks from the plan — fresh session + tool call, multi-tool turn, mutating + confirmation with real calendar cross-check, forced tool error citing real state (#346 guard), `TURN_DEADLINE_MS` → synthesized fallback, mid-stream stop button (#352 UI), `message.metadata.turnComplete` observable on the final assistant message. Out of scope and deferred: extended thinking (#339), non-streaming `.generate()` adoption (new follow-up filed, linked in PR). Closes #350.
- **Chat composer shows streaming tool state + stop button (#341, #352).** Two turn-in-flight UX wins shipped together. **#341:** web/src/components/chat/tool-status-bar.tsx branched only on done-vs-not-done, so `input-streaming` and `input-available` rendered identically and `output-error` rendered with the green `✓` (visual bug). The chip now reads all four AI SDK v6 states: `input-streaming` → spinner + verb label (`"Looking up your calendar…"`), `input-available` → spinner + verb + safe argument preview (`"Looking up your calendar for Apr 18…"`), `output-available` → green `✓` + faint text, `output-error` → red `✕` + `var(--color-danger)` border + `"${verb} failed"` copy. Argument preview is opt-in per tool via `TOOL_INPUT_PREVIEW` — the default is _no preview_ so email queries, task content, journal entries, and meal-logging text never leak into the status bar. Whitelisted previews: `list_calendar_events` (date), `get_habits_today` / `get_fitness_summary` / `get_today_meals` / `get_workout_plan` / `get_workout_history` / `get_recipes` (date only if present), `get_stock_quote` (ticker), `get_sports_data` (team/league). Preview strings truncated to 25 chars. `TOOL_LABELS` extended from 13 to cover all 23 registered chat tools; stale `log_meal` entry removed (meals log via a separate route). **#352:** web/src/components/chat/chat-interface.tsx now destructures `stop` from `useChat()` and the submit button swaps from `<Send>` to `<Square>` while `status === "streaming" || status === "submitted"` — same frame, border, and motion tokens, atomic `aria-label` swap ("Send" ↔ "Stop generating"). Clicking the stop button calls `useChat()`'s `stop()`. A document-level `Escape` listener is attached only while a turn is in flight (textarea is disabled mid-stream so the per-textarea keydown can't fire) — triggers `stop()` with no effect on idle-composer `Esc` behaviour. No server changes — the abort lifecycle landed in earlier PRs (#247 `onFinish` fallback, #319 `turnComplete` sentinel, #337 abort signal plumbing). Partial transcript + `synthesizeFallbackSummary` already handle stopped-turn persistence correctly. Closes #341 and #352.
- **`react-hooks@7` rule set re-promoted to error (#363).** PR #362's Next 15→16 upgrade pulled in `eslint-plugin-react-hooks@7` via `eslint-config-next@16`, which adds four new rules (`set-state-in-effect`, `immutability`, `purity`, `refs`) as errors by default. #362 downgraded all four to `warn` to keep the upgrade's bisect surface minimal, leaving 15 pre-existing violations across 11 sites visible in lint output. This follow-up refactors every violation and removes the four rule overrides from [web/eslint.config.mjs](web/eslint.config.mjs) so Next 16's defaults take effect. No user-visible behaviour change expected — the rules become genuine enforcement instead of ignorable noise. Refactor shape by category: (a) `useSyncExternalStore` migrations for external-store reads — web/src/lib/chart-colors.ts (CSS variables via `MutationObserver` on `<html>`; also fixes the one-frame colour flash on theme toggle), `useReducedMotion` and touch-device detection in [web/src/components/charts/primitives.tsx](web/src/components/charts/primitives.tsx) + web/src/components/chat/chat-interface.tsx (matchMedia), and three storage-backed reads in web/src/components/chat/chat-page-client.tsx (`chatHistoryOpen` in localStorage, `chatPrefill` in sessionStorage, hydration-safe via `getServerSnapshot`), plus the hydration `mounted` flag in [appearance-settings.tsx](web/src/components/settings/appearance-settings.tsx); (b) derive-during-render replacements — `granularity` in [activity-trends.tsx](web/src/components/fitness/activity-trends.tsx) now computes `forceWeekly ? "weekly" : userGranularity` each render instead of syncing via effect; (c) move setState out of synchronous effect body — [schedule-today.tsx](web/src/components/dashboard/schedule-today.tsx) shifts the `nowMinutes` set into the fetch `.finally()` alongside `setLoading(false)`, and [sports-settings.tsx](web/src/components/settings/sports-settings.tsx) hoists the "empty query" branch out of the debounce effect into the input's `onChange`; (d) immutability fixes — meals/page.tsx rebuilds `macroTotals` in two immutable reduce passes (no more closure-variable mutation or post-reduce property reassignment), and [window-selector.tsx](web/src/components/ui/window-selector.tsx) moves the `document.cookie` write into a new `setWindowPreference` Server Action in [web/src/lib/window-actions.ts](web/src/lib/window-actions.ts) that calls `cookies().set()` + `revalidatePath("/", "layout")`, eliminating the `router.refresh()` call; (e) refs fix — drops the `activeSessionIdRef` latest-ref pattern in chat-page-client.tsx, including `activeSessionId` in the visibility effect's dep array (cheap listener re-registration on session change) and in `handleMessageSent`'s `useCallback` deps (ChatInterface already re-keys per session, so `useChat` picks up fresh handlers); (f) purity fix — notifications/page.tsx wraps the Supabase fetch plus its `Date.now()` cutoff and in-band `read_at` update in a `cache()`-wrapped loader so the render body is just `await` + render. Vestigial-bug cleanup bundled in: removed the `sessionStorage` fallback effect for `activeSessionId` that was always overwritten by the persist-effect firing first in declaration order. Verification: `npm run lint` → 0 errors / 0 warnings, `npx tsc --noEmit` clean, `npm run build` clean, dev-server smoke test covers chat mutating tools (#319 contract intact), theme toggle across dashboard/fitness/meals charts, meals delete, window-selector cookie, and notifications read-receipt flow.
- **Next.js 15.5.15 → 16.2.4 (#328).** Major version bump, not a free upgrade — kept `ai`, Supabase, Tailwind, and Zod on their current majors to keep the bisect surface minimal if anything regresses. Four concrete breaking-change touches landed: (1) **`web/src/middleware.ts` → `web/src/proxy.ts`** + function rename `middleware` → `proxy`. Next 16 deprecated the `middleware` filename; `proxy.ts` runs on the Node runtime only (edge is unsupported), but Supabase SSR auth works identically on both, and the dev-server timing log confirms the rename is wired (`proxy.ts: 1806µs` appears per request). Verified end-to-end: `GET /` and `GET /dashboard` still redirect to `/login` when unauthed, `GET /login` returns 200. (2) **`next` + `eslint-config-next` bumped to `^16.2.4`** in [web/package.json](web/package.json); React resolved to `19.2.5` automatically via the existing `^19.1.0` range (Next 16's App Router uses the latest React canary). (3) **ESLint flat-config shim dropped.** Next 16's `eslint-config-next@16` ships a native flat config, so [web/eslint.config.mjs](web/eslint.config.mjs) was rewritten from `FlatCompat.extends("next/core-web-vitals", "next/typescript")` (the #327 pattern that wrapped the legacy Next 15 config) to direct imports: `import nextCoreWebVitals from "eslint-config-next/core-web-vitals"` + `import nextTypescript from "eslint-config-next/typescript"`. `@eslint/eslintrc@^3.3.5` removed from `devDependencies` — no longer referenced. This closes the follow-up #353 filed in #327. (4) **`react-hooks@7` new rules downgraded to `warn`.** The plugin bundled with Next 16 adds four new rules that error by default and surface 15 pre-existing violations in this repo: `react-hooks/set-state-in-effect`, `react-hooks/immutability`, `react-hooks/purity`, `react-hooks/refs`. Each flags a genuine React 19-era anti-pattern (mostly `useEffect → setState` cascades in chart/theme hooks), but the violations are pre-existing behaviour and fixing them is not an upgrade task — filed as a follow-up. Downgrading to `warn` preserves the "lint stays green" contract from #327 without bundling ~15 hook refactors into this PR. Five rule entries added to [web/eslint.config.mjs](web/eslint.config.mjs) with the follow-up issue documented inline. **Non-hits verified absent** (would have forced code changes if present): no `revalidateTag` calls (only `revalidatePath`, unchanged), no `unstable_cacheLife`/`unstable_cacheTag`/`unstable_cache`, no `next/legacy/image`, no `images.domains` (new `minimumCacheTTL` 4h / `qualities: [75]` / `maximumRedirects: 3` defaults apply transparently, no custom `images` block to migrate), no parallel-route `@slot` directories, no `serverRuntimeConfig`/`publicRuntimeConfig`, no `experimental_ppr` or `dynamicIO`, no AMP, no `export const runtime = "edge"` in any route. Every `export const dynamic = "force-dynamic"` (10 protected pages) still works in 16 — no migration needed. Async Request APIs (`cookies`, `headers`, `params`, `searchParams`) already awaited everywhere per #319 work. **Turbopack is now the default for `next build`**; the repo has no custom webpack config so the build ran clean on first attempt (4.7s compile, 30 static pages, Next 16 surfaces the renamed proxy as `ƒ Proxy (Middleware)` in the route list). **`web/tsconfig.json`** auto-updated by the first Next 16 build: `jsx` set to `"react-jsx"` (mandatory in 16), `.next/dev/types/**/*.ts` added to `include` (reflects the new concurrent dev/build output path — Next 16's `next dev` now outputs to `.next/dev` so `next build` and `next dev` can run concurrently). **[README.md](README.md)** updated: Claude Code CLI row bumped from "Requires Node 18+" to "Requires Node 20.9+ (Next.js 16 minimum)". Out of scope and deferred: PPR / `cacheComponents` adoption, the new `updateTag` / `refresh` / `cacheLife` / `revalidateTag(tag, profile)` caching APIs, React 19 Actions migration, React Compiler opt-in, Turbopack filesystem cache, Next DevTools MCP — each warrants its own issue. Verification: `npm run build` clean, `npx tsc --noEmit` clean, `npm run lint` clean (0 errors / 15 warnings from the downgraded react-hooks v7 rules), `npm run dev` starts in 204ms, proxy auth redirect verified via curl, HEAD/GET smoke tests green. Full UX walkthrough per [docs/audits/2026-04-17-pre-release.md](docs/audits/2026-04-17-pre-release.md) done manually pre-merge (dashboard + all widgets, chat stream with a mutating tool, settings save, habit check-in, journal save).
- **Anthropic prompt caching enabled on the chat route's static system prompt + tool schemas (#340).** Every chat turn to Anthropic was re-sending the full ~1.4k-token static system prompt and all 23 tool schemas as fresh input tokens, even though neither changes between turns within a session. v6 (PR #336) exposed `providerOptions.anthropic.cacheControl` but no route was using it. Two breakpoints now carry the cache — one on the last tool in the spread (caches every tool above it via Anthropic's "anchor the trailing block" semantics) and one on the static system message — leaving 2 of Anthropic's 4 allowed cache breakpoints unused. System prompt in web/src/app/api/chat/route.ts split from a single concatenated string into a two-entry `system` array: the static prefix carries `providerOptions.anthropic.cacheControl: { type: "ephemeral" }` (5-minute TTL), the dynamic block (today's date from `todayString()` + the user's name) follows uncached so turn-over-turn time drift doesn't invalidate the cache. Tool-side caching goes through a new `withTrailingCacheBreakpoint()` helper colocated with the tools spread, rather than edits across the 11 tool modules — a critical correction because Anthropic caps requests at 4 breakpoints and the SDK silently drops overflows; marking all 23 tool definitions would have exceeded the cap and left breakpoints past #4 un-cached, the same class of undocumented wire-limit trap that bit #343/#359/#360. Demo path (Groq) is gated out: the string `system` shape and unwrapped tools flow through unchanged. `onFinish` now emits a structured `[chat] cache ...` log line per turn carrying `inputTokens`, `outputTokens`, `cacheRead`, `cacheWrite`, `noCache`, and `warnings` (any `"cacheControl breakpoint limit"` or `"cache_control on non-cacheable context"` warning surfaces here so silent degradation doesn't hide). Budget-tracker semantics explicitly preserved: `usage.inputTokens` is the grand total processed by the model including cache reads and writes, so the existing `tokenBudgetExceeds(TOKEN_BUDGET = 150_000)` predicate in route.ts still enforces the same ceiling — cache changes cost, not tokens-processed, and the ceiling protects against runaway context growth not dollar spend. A comment documents the invariant so it doesn't get "optimized" away later. **Measured delta** on a 2-turn real-user session (haiku, 2-step turns, tools invoked): turn 1 `inputTokens=13844, cacheRead=6448, cacheWrite=6448, noCache=948` — within-turn caching between the two model steps already firing; turn 2 `inputTokens=14088, cacheRead=12896, cacheWrite=0, noCache=1192` — steady-state, ~92% of input tokens served from cache at 10% cost. Effective per-turn input-token-equivalent cost drops from ~14k full-price to ~2.5k (`noCache + 0.1 × cacheRead`), roughly an 82% reduction on the input leg within the 5-minute cache window. `warnings=[]` on both turns; no Anthropic 400s observed; #319 verified-success contract and streaming behaviour unchanged. Local `npm run dev` smoke run performed before merge per the PR #360 process note. Out of scope for this PR and deliberately left untouched: system-prompt content edits, the pantry → Supabase profile migration (still hardcoded in the cached prefix at line 167, memo'd separately), 1-hour cache TTL beta, and any caching on the Groq demo path.
- **Replaced deprecated `next lint` with ESLint CLI + flat config (#327).** `next lint` is removed in Next 16, and the existing `npm run lint` script was a no-op in non-interactive shells — it prompted the developer to pick a config and never returned a meaningful exit code, so CI had no actual lint enforcement and agent-driven edits flowed through an unchecked gate. Ran `npx @next/codemod@canary next-lint-to-eslint-cli .` to generate a flat-config `web/eslint.config.mjs`; the codemod's direct imports (`eslint-config-next/core-web-vitals`) don't run against `eslint-config-next@15` (which still ships legacy `.eslintrc`, not flat), so the config was rewritten to use `FlatCompat` from `@eslint/eslintrc` — the pattern Next itself documents for v15 + ESLint 9 (followup #353 to drop the shim once Next 16 lands). Rule set inherits `next/core-web-vitals` + `next/typescript` (pulls `@typescript-eslint`, `react-hooks`, `jsx-a11y`, `import` transitively). One project-convention override: `@typescript-eslint/no-unused-vars` with `argsIgnorePattern: "^_"` / `varsIgnorePattern: "^_"` — the codebase already uses the underscore-prefix convention (`_dt`, `_key`). CI wiring: .github/workflows/lint-tokens.yml → [.github/workflows/lint.yml](.github/workflows/lint.yml), now running two jobs (`lint-tokens` unchanged + new `eslint` job on Node 20 with npm cache scoped to `web/package-lock.json`). Ten violations fired on first run — all fixed rather than suppressed: two stale `eslint-disable-next-line` directives in web/src/app/api/chat/route.ts that were positioned on the wrong line (the `any` was on the next expression line, not the line after the comment) replaced with proper typing (`StopCondition<any>` → `StopCondition<ToolSet>`; dropped `as any` on `streamOptions.model` — the `Parameters<typeof streamText>[0]` already accepts the model union); unused `fitnessRows` + its unused `fitness_log` Promise.all query removed from dashboard/page.tsx (saves one Supabase round-trip per dashboard render); `_event` fix in [public/sw.js](web/public/sw.js); `postcss.config.mjs` switched from anonymous default export to named const; `aria-expanded` removed from the chat textarea (chat-interface.tsx) — the attribute isn't supported on `role=textbox`; removed unnecessary `fetchSessions` from a `useCallback` dep array in chat-page-client.tsx; dead `eslint-disable-next-line` deleted from fitbit.ts. No behavioural change to the app. Follow-ups filed: #353 (drop FlatCompat after Next 16), #354 (pre-commit hook), #355 (Prettier evaluation), #356 (`@next/bundle-analyzer@^16` vs `next@^15` mismatch), #357 (fold `scripts/lint-tokens.sh` into ESLint as custom rule).

### Fixed

- **Strict mode disabled on all five mutating tools pending Anthropic compilation-limit investigation; schema tightenings kept (#343 rollback).** PR #359 enabled `strict: true` on five mutating tools (`create_calendar_event`, `update_calendar_event`, `assign_workout`, `update_workout_exercise`, `update_profile`) without first reproducing the full request path locally. Every chat request to Anthropic began failing with a 400, surfaced in the browser as the generic `Error — try again` banner on the first user message of every session. Local `npm run dev` would have caught it on the first turn; I skipped the smoke-start step from the plan, so the defect reached prod. Three distinct Anthropic strict-mode constraints surfaced in sequence as each one was addressed: (1) _every `object` schema must set `additionalProperties: false`_ — fixed by adding the flag at every level across the five strict tools; (2) _total optional parameters across all strict tools ≤ 24_ (we were at 32; `assign_workout`'s 3 × 4-optional-per-item exercise arrays alone contribute 12, plus 5 top-level optional = 17) — addressed by dropping `assign_workout` from the strict set, bringing the remaining four to 15 optional; (3) _"schema is too complex for compilation"_ — an undocumented ceiling that tripped even with the tightened four-tool set. Rather than iterate blind against a limit whose precise dimensions Anthropic doesn't document, all five `STRICT_TOOLS` flags are now `false` in [web/src/lib/tools/\_strict.ts](web/src/lib/tools/_strict.ts), which restores the chat to working state. The schema tightenings stay — `additionalProperties: false` on every object schema, full `items` property shapes on `assign_workout.warmup/workout/cooldown` (previously `items: { type: "object" }` with no properties), and `additionalProperties: false` on `update_workout_exercise.updates`. These are correctness improvements regardless of strict mode. The `#319` `{ ok, error? }` runtime contract, read-after-write verifications, and calendar pre-flight rules are all unaffected and remain the primary defence. #343 is reopened with full repro context and the three observed Anthropic constraints; the next attempt will test the compilation budget empirically against one strict tool at a time before re-enabling across the mutating surface.
- **Chat reliability — `update_workout_exercise` error payload now cites real state, and five high-blast-radius mutating tools gate inputs at the provider boundary (#348, #343).** Two follow-ups on the #319 verified-success contract, shipped together. **#348:** the "not found" branch in [web/src/lib/tools/workouts.ts](web/src/lib/tools/workouts.ts) returned `Exercise "X" not found in warmup.` with no list of what _was_ in the plan — the same defence-gap #346/#347 closed for `log_habit`. Now it lists the phase's real exercise names and directs the model: `"Current warmup exercises: A, B, C. Suggest one of these, or propose adding a new exercise — do not invent names."` Zero extra queries (the phase array is already in scope from the row fetch above). In practice the system prompt saves us because Bridge pre-calls `get_workout_plan`; this is the second-layer guard for long turns, post-compaction turns, and direct "change X to Y" instructions that skip the pre-check. **#343:** AI SDK v6 added `strict: true` on `tool({ ... })` which rejects malformed input shapes at the provider boundary before `execute()` runs. Enabled on the five tools where a bad input shape would corrupt user data: `create_calendar_event` + `update_calendar_event` ([web/src/lib/tools/calendar.ts](web/src/lib/tools/calendar.ts)), `assign_workout` + `update_workout_exercise` ([web/src/lib/tools/workouts.ts](web/src/lib/tools/workouts.ts)), and `update_profile` ([web/src/lib/tools/profile.ts](web/src/lib/tools/profile.ts)). Read-only tools and low-blast-radius mutations (`log_habit`, `add_task`, `complete_task`, `log_meal_from_scan`) are deliberately excluded per the issue — measure before enabling. Per-tool toggles live in a single new config module [web/src/lib/tools/\_strict.ts](web/src/lib/tools/_strict.ts):
  ```ts
  export const STRICT_TOOLS = {
    create_calendar_event: true,
    update_calendar_event: true,
    assign_workout: true,
    update_workout_exercise: true,
    update_profile: true,
  } as const;
  ```
  Typed `as const` so any drift between the strict set and real tool names is a TS error at build time. The flag is an operational rollback lever — if a strict gate surfaces a latent schema narrowness under live traffic and Bridge starts refusing a valid intent, flip one entry to `false` and redeploy, no revert needed. If that happens in practice it's a follow-up to tighten the underlying schema, not a permanent override. Strict is additive to the #319 runtime contract: every affected tool still returns `{ ok, error? }` shapes for Supabase/Google failures; the new gate just moves shape-validation failures to the earliest possible layer.
- **`log_habit` `onConflict` target updated to match the multi-tenant unique constraint (#346).** Migration 20260417000001 (v1.1.0) rekeyed the `habits` unique constraint from `(habit_id, date)` to `(user_id, habit_id, date)` and updated scripts/seed_demo.py + web/src/app/api/cron/reset-demo/route.ts — but missed the chat tool's `log_habit` in the route. Every call was hitting `"no unique or exclusion constraint matching the ON CONFLICT specification"` and Bridge was interpreting the error as "habit already logged for today." Fix: update `onConflict: "habit_id,date"` → `"user_id,habit_id,date"` in [web/src/lib/tools/habits.ts](web/src/lib/tools/habits.ts) — same change the other two call sites already had. Discovered during the fabrication-fix retest (same PR).
- **`log_habit` no longer lets the model fabricate alternative habits when the name doesn't match (#346).** When Bridge received a habit name that didn't exist, the tool returned an honest `{ ok: false, error: "No active habit matching ..." }` — but the model then invented plausible-sounding habits ("Morning Stretching, Evening Walk, Meditation...") that don't exist in the user's `habit_registry` instead of citing the real ones. A #319-class trust break, but in the **recovery-suggestion path** rather than the tool-return path — the tool was honest; the model hallucinated on top. Predated both PR #336 (v6 upgrade) and PR #345 (tool-module split) — reproduced identically on all three commits. Fix in [web/src/lib/tools/habits.ts](web/src/lib/tools/habits.ts): on lookup miss, query `habit_registry` for the user's actual active habit names and include them in the `error` string. The model then has concrete truth in context and has to directly contradict tool output to fabricate — in practice it cites the real list. Confirmed end-to-end on a fresh chat session (old sessions with the fabricated list cached in history will still regurgitate it — that's continuation bias, not a fix regression).

### Changed

- **Chat agent loop collapsed onto v6 composed `stopWhen` predicates (#337).** The step-cap and token-budget exits in web/src/app/api/chat/route.ts were wired through two different code paths — `stopWhen: stepCountIs(MAX_STEPS)` for steps, and a hand-tallied `cumulativeTokens` counter in `onStepFinish` that tripped the shared `turnAbort` AbortController when it crossed `TOKEN_BUDGET`. v6 lets `stopWhen` take an array of predicates composed with OR, so the budget check is now a pure `tokenBudgetExceeds(budget)` predicate sitting next to `stepCountIs(MAX_STEPS)`. Deleted: the `cumulativeTokens` / `budgetExceeded` hoisted `let`s and the entire `onStepFinish` callback (its only job was maintaining them). `onFinish` still surfaces `budgetExceeded` to `synthesizeFallbackSummary` and the diagnostic log line — it just reads it from a post-hoc reduction over `steps[].usage` instead of a live counter. `TURN_DEADLINE_MS` wall-clock guard untouched: it trips `turnAbort.abort()` mid-generation to beat Vercel's Lambda kill, which `stopWhen` predicates cannot do because they only evaluate between steps. Pure mechanical refactor — no user-visible change. The #319 verified-success contract, the #346 habit-fabrication guard, the #247 deadline → synthesized-fallback path, and the #336 turn-complete sentinel on `message.metadata` all live outside loop mechanics and are structurally unaffected. Follow-up #350 filed to adopt `ToolLoopAgent` once #340 (prompt caching) and #339 (extended thinking) come online.
- **Meals routes migrated off deprecated `generateObject` (#338).** v6 kept `generateObject` functional but started emitting deprecation warnings in favour of `generateText({ output: Output.object({ schema }) })`. Four call sites under [web/src/app/api/meals/](web/src/app/api/meals/) switched to the new shape — [suggest/route.ts](web/src/app/api/meals/suggest/route.ts) (meal suggestions), [estimate-macros/route.ts](web/src/app/api/meals/estimate-macros/route.ts) (macro re-estimator), and the two branches in [analyze-photo/route.ts](web/src/app/api/meals/analyze-photo/route.ts) (food photo + nutrition-label modes). Models unchanged, vision inputs still use the v6 `mediaType` key from #336. Result destructured as `{ output }` instead of `{ object }`; the response shape the clients see is identical. **Schema tweak required:** `Output.object` forwards the Zod→JSON Schema output directly to Anthropic's native structured-output format, which is stricter than what `generateObject` was stripping — it rejects `minItems`/`maxItems` on arrays and the safe-integer `minimum`/`maximum` bounds Zod v4 emits for `.int()`. Surfaced at runtime as `output_config.format.schema: For '…' type, property '…' is not supported`. Minimal adjustment: dropped `.min(1).max(3)` from the `suggest` array (kept "2–3 meal suggestions (return between 1 and 3 items)" in the `.describe()` so the prompt still steers the model) and replaced `z.number().int()` with `z.number().describe("… (integer)")` on six fields (`calories` ×3, `sodium_mg` ×2, label `calories` ×1) across the three files. Lost validation is cosmetic — Claude returns integer calorie/sodium counts when told to; the prompt guidance was already doing the load-bearing work. Filed as a follow-up from PR #336 and closes the last of the v6-deprecation follow-ups for this PR's stack.
- **Chat tool definitions split out of `route.ts` into per-domain modules (#344).** The 23 `tool()` blocks that used to live inline in web/src/app/api/chat/route.ts — tasks, habits, fitness, profile, gmail, calendar, meals, session, workouts, stocks, sports — each now live in their own module under [web/src/lib/tools/](web/src/lib/tools/), exported as factory functions (`buildTasksTools(ctx)` etc.) that take a `ToolContext` ({ supabase, userId, isDemo, sessionId }) and return the tool object. Pure refactor, zero behaviour change; `route.ts` shrunk from 1954 lines to 576 (tool definitions: 1404 lines → 0 inline). Shared: `web/src/lib/tools/_contract.ts` holds the `ok()` / `err()` helpers + `OkResult<T>` / `ErrResult` types (the #319 verified-success contract); `web/src/lib/tools/_context.ts` defines the per-request context. `isToolResultOk()` and `synthesizeFallbackSummary()` stay in `route.ts` because they're turn-orchestration concerns, not tool contract. Demo fixtures (`DEMO_EMAILS`, `DEMO_CALENDAR_EVENTS`) live in their respective tool modules; workout helpers (`WorkoutExercise`, `buildCalendarDescription`, `withTimeout`) live in [workouts.ts](web/src/lib/tools/workouts.ts).
- **Vercel AI SDK upgraded v4 → v6 (#329).** Two-leg staged migration (4 → 5, validated; 5 → 6, validated). Dependency bumps: `ai@^4.3 → ^6.0`, `@ai-sdk/anthropic@^1.2 → ^3.0`, `@ai-sdk/groq@^1.2 → ^3.0`, added `@ai-sdk/react@^3.0` (v5 moved `useChat` out of `ai/react`), `@ai-sdk/provider@^3.0`, `zod@^4.1.8`. No user-facing behaviour change; the rewrite is internal plumbing so future upgrades don't accumulate debt on top of #319's trickiest code. Key migrations: (a) `tool({ parameters })` → `tool({ inputSchema })` across 24 tool definitions in web/src/app/api/chat/route.ts + [web/src/app/api/meals/scan-chat/route.ts](web/src/app/api/meals/scan-chat/route.ts); (b) `maxSteps: N` → `stopWhen: stepCountIs(N)`; (c) `LanguageModelV1Middleware` → `LanguageModelV3Middleware` with `specificationVersion: "v3"` (import from `@ai-sdk/provider`); (d) `usage.promptTokens`/`completionTokens` → `inputTokens`/`outputTokens` in the `onStepFinish` token-budget tracker; (e) tool result property `.result` → `.output` in the onFinish step-pairing logic; (f) `StreamData` + `toDataStreamResponse({ data })` replaced with `toUIMessageStreamResponse({ messageMetadata })` — the #319 turn-complete sentinel now rides as metadata on the assistant message's finish part instead of a side-channel stream; (g) client-side `useChat` rewrite in web/src/components/chat/chat-interface.tsx — v5 removed managed `input`/`handleInputChange`/`handleSubmit`/`isLoading`/`reload`, so the component now owns local input state, uses `DefaultChatTransport` with `prepareSendMessagesRequest` (flattens `UIMessage.parts` to the server's existing `{ role, content }` shape to avoid rewriting `/api/chat`'s message handling), and derives `isLoading` from `status`; (h) `Message` type replaced with `UIMessage` across 5 files — message content moved from `.content: string` to `.parts: Part[]`, `createdAt` moved into `message.metadata`; (i) `ToolStatusBar` updated for v5's per-tool UI part types (`tool-${name}` with `input-streaming`/`input-available`/`output-available`/`output-error` states); (j) `mimeType` → `mediaType` on `ImagePart` in [web/src/app/api/meals/analyze-photo/route.ts](web/src/app/api/meals/analyze-photo/route.ts). Three new-capability items unlocked by the upgrade are filed as follow-up issues rather than bundled into this PR: `generateObject` → `generateText({ output })` migration (4 call sites in meals routes, deprecated in v6 but functional), `stopWhen` / `ToolLoopAgent` refactor of the manual step-cap + synthesizer logic in the chat route, and Anthropic prompt caching on the system prompt + tool definitions.

### Fixed

- **Upcoming-birthday widget no longer doubles the "birthday" suffix (#334).** When a Google Calendar event title ended in trailing text after `'s birthday` — e.g. `Albert Autin's Birthday 🎈` — the widget rendered _"Albert Autin's Birthday 🎈's birthday"_ because the `/'s birthday$/i` anchor failed on the trailing emoji and `personName()` returned the title unchanged, leaving the JSX template to append the suffix on top of the one already in the title. Switched the detector to `/'s birthday\b/i` (word boundary) and the stripper to `/'s birthday.*$/i` in [web/src/app/api/google/calendar/upcoming-birthday/route.ts](web/src/app/api/google/calendar/upcoming-birthday/route.ts); applied the same boundary change to the `isBirthday` flag in [web/src/app/api/google/calendar/route.ts](web/src/app/api/google/calendar/route.ts) so the main agenda view agrees with the widget on what counts as a birthday event.
- **Demo account no longer pulls real contacts' birthdays (#334).** The upcoming-birthday route had no `DEMO_USER_ID` gate (unlike the main calendar route), so demo visitors were reading birthdays from the owner's Google Calendar. Added a short-circuit that returns a fixed fake persona — Priya, already the demo user's lunch-buddy in [web/src/app/api/google/calendar/route.ts](web/src/app/api/google/calendar/route.ts)'s mock events — with `daysUntil: 12` and a date computed dynamically in `USER_TZ` so the widget is always populated on the demo dashboard without hitting Google.

### Added

- **Delete a logged meal (#330).** Each row in _Logged Today_ and _Past 6 Days_ now has a trash icon. Tap → row disappears immediately and today's macro totals (calories, protein, carbs, fat, fiber, sugar) recompute from the visible rows; a 5-second "Meal deleted" undo toast lets the user restore the row before commit. After the toast expires, `DELETE /api/meals/log` fires; if the user navigates away inside the window, an unmount cleanup flushes the pending delete via `fetch(..., { keepalive: true })` so it leaves the browser even as the page tears down. New `DELETE` handler on [web/src/app/api/meals/log/route.ts](web/src/app/api/meals/log/route.ts) is user-scoped (`createClient()` + `eq("user_id", user.id)` + 404 on cross-user IDs). Reuses the [`UndoToastProvider`](web/src/components/ui/undo-toast.tsx) built for chat session deletion (#205); macro totals are recomputed client-side via a small helper in [MealsClient.tsx](web/src/components/meals/MealsClient.tsx) that mirrors the SSR reduce in page.tsx. The dedupe-driven _Recent meals_ row is intentionally excluded — those are historical references for re-logging, not the source rows themselves; deleting them would be ambiguous.

### Removed

- `scripts/sync-fitbit.py`, `scripts/sync-googlefit.py`, `web/src/lib/sync/fitbit.ts`,
  `web/src/lib/sync/googlefit.ts`, `/api/auth/fitbit/{start,callback}`,
  `/api/sync/fitbit`, `/api/sync/googlefit` — all superseded by Google Health (#607).
- Env: `FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET`, `FITBIT_OAUTH_REDIRECT_URI`,
  `FITBIT_WEIGHT_UNIT`. Google Health reuses `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
  and adds only `GOOGLE_HEALTH_OAUTH_REDIRECT_URI`.

