# Gmail & Calendar — Multi-Account Setup

Covers how `jaydud6@gmail.com` (personal, primary) and `leung.ss.jason@gmail.com` (professional) are unified into a single Mr. Bridge session. The OAuth token stays on `jaydud6@gmail.com` — no second credential set is required.

---

## Gmail — POP3 aggregation

Gmail's "Check mail from other accounts" pulls `leung.ss.jason@gmail.com` into `jaydud6@gmail.com` via POP3. Professional emails land in the personal inbox with a `Professional` label, which the dashboard uses to badge them as `work`.

> **Note:** Gmailify (Google's OAuth-based import) does not accept normal Google passwords and requires an OAuth flow that is not straightforward to complete. Use POP3 instead.

### Step 1 — Enable POP3 on leung.ss.jason

1. Sign into `leung.ss.jason@gmail.com`
2. Settings (gear) → **See all settings** → **Forwarding and POP/IMAP** tab
3. Under **POP Download** → select **Enable POP for all mail**
4. Save changes

### Step 2 — Generate an App Password for leung.ss.jason

Gmail's POP3 requires an App Password, not your regular account password (this is true even if 2-Step Verification was already enabled).

1. Go to **myaccount.google.com** while signed into `leung.ss.jason@gmail.com`
2. Security → **2-Step Verification** — enable it if not already on
3. Search for **"App passwords"** at the top of the page
4. Create a new App Password (name it anything, e.g. "Mr Bridge POP3")
5. Copy the 16-character code — you'll use it in the next step

### Step 3 — Add leung.ss.jason as a mail source in jaydud6

1. Sign into `jaydud6@gmail.com`
2. Settings → **See all settings** → **Accounts and Import** tab
3. Under **Check mail from other accounts** → click **Add a mail account**
4. Enter `leung.ss.jason@gmail.com` → Next → select **Import emails from my other account (Gmailify)** if offered, or choose **POP3**
5. Use these POP3 settings:
   - **Username:** `leung.ss.jason@gmail.com`
   - **Password:** the 16-character App Password from Step 2
   - **POP Server:** `pop.gmail.com`
   - **Port:** `995`
   - **Always use a secure connection (SSL):** checked
6. Check **Label incoming messages** → create label `Professional`
7. Leave **Archive incoming messages** unchecked (professional = high signal, keep in inbox)
8. Click **Add Account**

### Step 4 — Verify

- In jaydud6's Gmail settings, click **Check mail now** next to `leung.ss.jason@gmail.com (POP3)` to trigger an immediate pull
- Send a test email to `leung.ss.jason@gmail.com` with subject `urgent: test`
- It should appear in `jaydud6@gmail.com`'s inbox within seconds (after "Check mail now") or within 30–60 min on the normal polling schedule
- Confirm it has the `Professional` label applied

### Sync delay

POP3 polls approximately every 30–60 minutes. Not real-time. Acceptable for session briefings. Use **Check mail now** in Gmail settings to force an immediate pull.

### How emails surface in Mr. Bridge

| Email type | Source | Label in jaydud6 | Dashboard? |
|---|---|---|---|
| Personal, high-signal | jaydud6 directly | none | Yes, if subject matches filter |
| Professional | leung.ss.jason via POP3 | `Professional` | Yes, if subject matches filter — shown with `work` badge |
| Personal, noise | jaydud6 directly | none | No — subject keyword filter blocks it |

**Dashboard query:** `is:unread subject:(meeting OR urgent OR invoice OR "action required" OR deadline)`

**How the `work` badge works:** The Gmail API returns internal label IDs (opaque strings like `Label_XXXXXXXXXX`), not display names. On each request, `/api/google/gmail` fetches the full label list first to resolve the `Professional` display name to its internal ID, then checks each message's `labelIds` against that ID. This is why the label name in Gmail settings must match exactly — the code looks for a label named `Professional` (case-insensitive).

---

## Google Calendar — Calendar sharing

The professional calendar is shared with `jaydud6@gmail.com`. The existing OAuth token sees all calendars including shared ones. Calendar sharing is real-time — no sync delay.

### Step 1 — Share leung.ss.jason's calendar with jaydud6

1. Sign into `leung.ss.jason@gmail.com` → **calendar.google.com**
2. Settings (gear) → **Settings**
3. In the left sidebar under **Settings for my calendars** → click **Jason Leung** (or the calendar name)
4. Under **Share with specific people or groups** → click **Add people and groups**
5. Enter `jaydud6@gmail.com`, set permission to **See all event details** → Send
6. Repeat for any other calendars to share (work project calendars, etc.)

### Step 2 — Accept the shared calendar in jaydud6

- A sharing invite arrives as an email to `jaydud6@gmail.com` — click **Accept**
- Or: open Google Calendar as jaydud6 and look for the calendar under **Other calendars** in the sidebar

### Step 3 — Verify

1. Create a test event in `leung.ss.jason@gmail.com`'s calendar
2. Confirm it appears immediately in `jaydud6@gmail.com`'s Google Calendar view
3. Open the Mr. Bridge web dashboard → Schedule Today card should show the event with the calendar name shown as a subtitle

### How events surface in Mr. Bridge

`/api/google/calendar` lists all calendars accessible to `jaydud6@gmail.com` (primary + shared) and unions their events for today. Events are re-sorted by start time after the merge. Each event includes:

- `calendarName` — the name of the calendar it came from (e.g. "Jason Leung")
- `isPrimary` — `true` only for jaydud6's own primary calendar

Non-primary calendar events show the `calendarName` as a subtitle in the Schedule Today dashboard card for source attribution.

---

## Session Briefing

Steps 4 and 5 of the Session Start Protocol reflect multi-account coverage:

- **Calendar**: `List Calendar Events` returns events from all connected calendars. Note the source for non-primary events.
- **Gmail**: `Search Gmail Emails` covers both accounts (professional emails arrive via POP3 with label `Professional`). Note "personal" or "work" when surfacing emails in the briefing.
