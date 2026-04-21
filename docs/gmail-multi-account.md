# Gmail & Calendar — Multi-Account Setup

Covers how a primary Gmail account and a secondary (e.g. professional) Gmail account are unified into a single Mr. Bridge session. The OAuth token stays on your primary account — no second credential set is required.

Replace `<your-primary@gmail.com>` and `<your-secondary@gmail.com>` with your actual addresses throughout this guide.

---

## Gmail — auto-forwarding aggregation

> **Migration note (April 2026):** Google is deprecating the "Check mail from other accounts (POP)" feature in 2026. New users lost access in Q1 2026; existing users lose access later in 2026. If you previously used POP3 aggregation, follow the steps below to switch to auto-forwarding. No Mr. Bridge code changes are needed — the `Professional` label detection works the same way regardless of how emails arrive.

Emails from the secondary account are forwarded into the primary inbox automatically. A Gmail filter on the primary account applies the `Professional` label to forwarded messages, which the dashboard uses to badge them as `work`.

### Step 1 — Enable auto-forwarding on your secondary account

1. Sign into `<your-secondary@gmail.com>`
2. Settings (gear) → **See all settings** → **Forwarding and POP/IMAP** tab
3. Under **Forwarding** → click **Add a forwarding address**
4. Enter `<your-primary@gmail.com>` → Next → Proceed → OK
5. Gmail sends a verification email to your primary address — open it and click the confirmation link (or copy the code and paste it back on the Forwarding settings page)
6. Once verified, select **Forward a copy of incoming mail to `<your-primary@gmail.com>`** and choose **Keep Gmail's copy in the Inbox**
7. Save changes

> **Enterprise accounts:** If the "Forwarding" section is grayed out, your domain admin has disabled it. Contact your admin or use a Gmail filter with label rules on the primary account side as a partial workaround (you'll need to add the secondary inbox separately via IMAP in Gmail mobile — see Google's support docs).

### Step 2 — Create a Gmail filter on your primary account to apply the `Professional` label

Auto-forwarded emails keep the **original sender's** address in `From`, so a `from:` filter won't match them. Use `deliveredto:` instead — Gmail sets this header to the forwarding destination address on every forwarded message.

1. Sign into `<your-primary@gmail.com>`
2. In the search bar, type: `deliveredto:<your-secondary@gmail.com>`
3. Click the **filter icon** (sliders) → **Create filter**
4. Check **Apply the label** → select **New label…** → name it `Professional` → Create
5. Optionally check **Never send it to Spam** to prevent misfiling
6. Click **Create filter**

### Step 3 — Verify

- Send a test email to `<your-secondary@gmail.com>` with subject `urgent: test`
- It should appear in your primary inbox within 1–2 minutes with the `Professional` label applied
- Confirm it has the `Professional` label attached before proceeding

### Decommission POP3 (existing users only)

Once auto-forwarding is working and verified, remove the old POP3 source:

1. Sign into `<your-primary@gmail.com>` → Settings → **Accounts and Import** tab
2. Under **Check mail from other accounts** → click **delete** next to `<your-secondary@gmail.com>`
3. Confirm deletion

### How emails surface in Mr. Bridge

| Email type | Source | Label in primary inbox | Dashboard? |
|---|---|---|---|
| Personal, high-signal | primary directly | none | Yes, if subject matches filter |
| Professional | secondary via auto-forward | `Professional` | Yes, if subject matches filter — shown with `work` badge |
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
- **Gmail**: `Search Gmail Emails` covers both accounts (secondary emails arrive via auto-forwarding with label `Professional`). Note "personal" or "work" when surfacing emails in the briefing.
