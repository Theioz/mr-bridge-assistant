# Mr. Bridge — Notifications Setup

Push notifications are delivered via [ntfy.sh](https://ntfy.sh) — a free, open-source pub/sub
notification service. You pick a unique topic string; any device subscribed to that topic receives
the notification. ntfy is the **only** delivery path: there are no macOS banners from the scripts
(the `osascript` branch was removed — the jobs run on compute-core, which is Linux).

## How a notification is sent

One path sends every scheduled notification: `scripts/_push.py` (`scripts/notify.sh` is a thin
wrapper around it). Each call does two things:

1. POSTs to `https://ntfy.sh/$NTFY_TOPIC` — a failure here exits non-zero, so cron sees it.
2. Inserts a row into the `notifications` table, so the push also shows on the in-app
   **Notifications** page (last 30 days). A failed insert is reported on stderr but does not undo
   the push.

Every send is appended to `~/.mr-bridge/notify.log` (title, type, click URL, HTTP status — never
the topic).

The jobs that call it, and their schedule, are listed in the README's Notifications section; the
schedule itself lives in the host crontab (jl-homelab `system/cron/compute-core-crontab`), not in
this repo. Each job writes a heartbeat to `sync_log`, shown under **Settings → Status**.

Two senders sit outside that path: `/api/cron/audit-recipes` (in the app) posts to ntfy and writes
its own `notifications` row, and the GitHub Actions weekly review nudge (below) posts to ntfy only.

## Your topic

Set it in the env file the scripts read (the root `.env` on compute-core) and in the app's env file:

```
NTFY_TOPIC=your-unique-topic-here
```

Use the same string on every device. Pick something hard to guess (e.g. `mr-bridge-[name]-[xxxx]`)
— anyone who knows the topic can read your notifications. Mind the spelling: `NTFY`, not `NFTY`.

---

## Android

1. Install **ntfy** from [Google Play](https://play.google.com/store/apps/details?id=io.heckel.ntfy) or [F-Droid](https://f-droid.org/en/packages/io.heckel.ntfy/)
2. Open the app → tap **+** (Subscribe to topic)
3. Server: `https://ntfy.sh`
4. Topic: enter your `NTFY_TOPIC` value
5. Tap Subscribe

## iOS

Install **ntfy** from the [App Store](https://apps.apple.com/app/ntfy/id1625396347) and subscribe to
the same topic on `https://ntfy.sh`.

## macOS / Windows desktop

Subscribe in a browser at `https://ntfy.sh/<your-topic>`, or install the community
[ntfy-desktop](https://github.com/Aetherinox/ntfy-desktop/releases) app:

1. Download the macOS `.dmg` or Windows installer from the releases page
2. Open ntfy-desktop → **Add Server** → `https://ntfy.sh`
3. Subscribe to your `NTFY_TOPIC`
4. Allow notification permissions if the OS asks

---

## Testing

From the repo checkout on compute-core (the script loads the root `.env`):

```bash
bash scripts/notify.sh --title "Mr. Bridge" --message "Test notification"
```

This sends the push **and** adds a row to the in-app Notifications page. To test ntfy alone from any
machine:

```bash
curl -X POST "https://ntfy.sh/YOUR_TOPIC" \
  -H "Title: Mr. Bridge" \
  -d "Test notification"
```

---

## GitHub Actions secret (weekly review nudge)

`.github/workflows/weekly-review-nudge.yml` runs on GitHub's runners every Monday 04:00 UTC (Sunday
evening Pacific) and posts a "time for your weekly review" push straight to ntfy. It does not go
through `_push.py`, so it does **not** appear on the in-app Notifications page.

It needs your topic as a repository secret:

1. Repo on GitHub → **Settings → Secrets and variables → Actions**
2. **New repository secret** → Name `NTFY_TOPIC`, value your topic
3. Optionally add `APP_URL` so tapping the notification opens `/weekly`

This keeps the topic out of the repo.
