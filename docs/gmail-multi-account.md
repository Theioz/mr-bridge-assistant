# Gmail & Calendar — Multi-Account Setup

Covers how a primary Gmail account and a secondary (e.g. professional) Gmail account are unified into a single Mr. Bridge session. The OAuth token stays on your primary account — no second credential set is required.

Replace `<your-primary@gmail.com>` and `<your-secondary@gmail.com>` with your actual addresses throughout this guide.

---

## Gmail — POP3 aggregation

Gmail's "Check mail from other accounts" pulls your secondary account into your primary inbox via POP3. Secondary emails land in the primary inbox with a `Professional` label, which the dashboard uses to badge them as `work`.

> **Note:** Gmailify (Google's OAuth-based import) does not accept normal Google passwords and requires an OAuth flow that is not straightforward to complete. Use POP3 instead.

### Step 1 — Enable POP3 on your secondary account

1. Sign into `<your-secondary@gmail.com>`
2. Settings (gear) → **See all settings** → **Forwarding and POP/IMAP** tab
3. Under **POP Download** → select **Enable POP for all mail**
4. Save changes

### Step 2 — Generate an App Password for your secondary account

Gmail's POP3 requires an App Password, not your regular account password (this is true even if 2-Step Verification was already enabled).

1. Go to **myaccount.google.com** while signed into `<your-secondary@gmail.com>`
2. Security → **2-Step Verification** — enable it if not already on
3. Search for **"App passwords"** at the top of the page
4. Create a new App Password (name it anything, e.g. "Mr Bridge POP3")
5. Copy the 16-character code — you'll use it in the next step

### Step 3 — Add your secondary account as a mail source in your primary

1. Sign into `<your-primary@gmail.com>`
2. Settings → **See all settings** → **Accounts and Import** tab
3. Under **Check mail from other accounts** → click **Add a mail account**
4. Enter `<your-secondary@gmail.com>` → Next → select **Import emails from my other account (Gmailify)** if offered, or choose **POP3**
5. Use these POP3 settings:
   - **Username:** `<your-secondary@gmail.com>`
   - **Password:** the 16-character App Password from Step 2
   - **POP Server:** `pop.gmail.com`
   - **Port:** `995`
   - **Always use a secure connection (SSL):** checked
6. Check **Label incoming messages** → create label `Professional`
7. Leave **Archive incoming messages** unchecked (professional = high signal, keep in inbox)
8. Click **Add Account**

### Step 4 — Verify

- In your primary Gmail settings, click **Check mail now** next to your secondary address to trigger an immediate pull
- Send a test email to `<your-secondary@gmail.com>` with subject `urgent: test`
- It should appear in your primary inbox within seconds (after "Check mail now") or within 30–60 min on the normal polling schedule
- Confirm it has the `Professional` label applied

### Sync delay

POP3 polls approximately every 30–60 minutes. Not real-time. Acceptable for session briefings. Use **Check mail now** in Gmail settings to force an immediate pull.

### How emails surface in Mr. Bridge

| Email type | Source | Label in primary inbox | Dashboard? |
|---|---|---|---|
| Personal, high-signal | primary directly | none | Yes, if subject matches filter |
| Professional | secondary via POP3 | `Professional` | Yes, if subject matches filter — shown with `work` badge |
| Personal, noise | primary directly | none | No — subject keyword filter blocks it |

**Dashboard query:** `is:unread subject:(meeting OR urgent OR invoice OR "action required" OR deadline)`

**How the `work` badge works:** The Gmail API returns internal label IDs (opaque strings like `Label_XXXXXXXXXX`), not display names. On each request, `/api/google/gmail` fetches the full label list first to resolve the `Professional` display name to its internal ID, then checks each message's `labelIds` against that ID. This is why the label name in Gmail settings must match exactly — the code looks for a label named `Professional` (case-insensitive).

---

## Google Calendar — Calendar sharing

The secondary calendar is shared with your primary account. The existing OAuth token sees all calendars including shared ones. Calendar sharing is real-time — no sync delay.

### Step 1 — Share your secondary calendar with your primary account

1. Sign into `<your-secondary@gmail.com>` → **calendar.google.com**
2. Settings (gear) → **Settings**
3. In the left sidebar under **Settings for my calendars** → click your calendar name
4. Under **Share with specific people or groups** → click **Add people and groups**
5. Enter `<your-primary@gmail.com>`, set permission to **See all event details** → Send
6. Repeat for any other calendars to share (work project calendars, etc.)

### Step 2 — Accept the shared calendar in your primary account

- A sharing invite arrives as an email to `<your-primary@gmail.com>` — click **Accept**
- Or: open Google Calendar as your primary account and look for the calendar under **Other calendars** in the sidebar

### Step 3 — Verify

1. Create a test event in your secondary account's calendar
2. Confirm it appears immediately in your primary account's Google Calendar view
3. Open the Mr. Bridge web dashboard → Schedule Today card should show the event with the calendar name shown as a subtitle

### How events surface in Mr. Bridge

`/api/google/calendar` lists all calendars accessible to your primary account (primary + shared) and unions their events for today. Events are re-sorted by start time after the merge. Each event includes:

- `calendarName` — the name of the calendar it came from
- `isPrimary` — `true` only for your primary calendar

Non-primary calendar events show the `calendarName` as a subtitle in the Schedule Today dashboard card for source attribution.

---

## Session Briefing

Steps 4 and 5 of the Session Start Protocol reflect multi-account coverage:

- **Calendar**: `List Calendar Events` returns events from all connected calendars. Note the source for non-primary events.
- **Gmail**: `Search Gmail Emails` covers both accounts (secondary emails arrive via POP3 with label `Professional`). Note "personal" or "work" when surfacing emails in the briefing.
