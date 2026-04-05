# Mr. Bridge — Notifications Setup

Push notifications are delivered via [ntfy.sh](https://ntfy.sh) — a free, open-source pub/sub notification service. You pick a unique topic string; any device subscribed to that topic receives the notification.

## Your Topic
Your topic is stored in `.env` on your Mac:
```
NTFY_TOPIC=your-unique-topic-here
```
Use the same string across all devices. Pick something hard to guess (e.g. `mr-bridge-jason-7734`) since anyone who knows the topic can read notifications.

---

## Android

1. Install **ntfy** from [Google Play](https://play.google.com/store/apps/details?id=io.heckel.ntfy) or [F-Droid](https://f-droid.org/en/packages/io.heckel.ntfy/)
2. Open the app → tap **+** (Subscribe to topic)
3. Server: `https://ntfy.sh`
4. Topic: enter your `NTFY_TOPIC` value
5. Tap Subscribe

Notifications arrive instantly whenever Mr. Bridge sends one.

---

## macOS

Already handled by `scripts/notify.sh` via `osascript` (no setup needed).

Optionally install ntfy-desktop for a unified cross-platform experience:
1. Go to [github.com/Aetherinox/ntfy-desktop/releases](https://github.com/Aetherinox/ntfy-desktop/releases)
2. Download the macOS `.dmg` (Intel or Apple Silicon)
3. Open → Add server: `https://ntfy.sh` → subscribe to your topic

---

## Windows PC

1. Go to [github.com/Aetherinox/ntfy-desktop/releases](https://github.com/Aetherinox/ntfy-desktop/releases)
2. Download the Windows installer (`.exe` — 64-bit)
3. Run the installer
4. Open ntfy-desktop → click **Add Server** → enter `https://ntfy.sh`
5. Subscribe to topic → enter your `NTFY_TOPIC` value
6. If Windows prompts for notification permissions, allow them

---

## Testing

Once any device is set up, test from your Mac terminal:

```bash
cd "/Users/jason/Code Projects/mr-bridge-assistant"
bash scripts/notify.sh --title "Mr. Bridge" --message "Test notification"
```

Or send directly via curl (works from any machine):
```bash
curl -X POST "https://ntfy.sh/YOUR_TOPIC" \
  -H "Title: Mr. Bridge" \
  -d "Test notification"
```

---

## GitHub Actions Secret (for weekly review nudge)

The weekly review nudge runs via GitHub Actions and needs your topic:

1. Go to your repo on GitHub → **Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. Name: `NTFY_TOPIC`
4. Value: your topic string
5. Save

This lets the scheduled workflow POST to ntfy.sh without exposing your topic in the repo.
