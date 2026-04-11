# Gmail & Calendar — Multi-Account Setup

Covers how `jaydud6@gmail.com` (personal, primary) and `leung.ss.jason@gmail.com` (professional) are unified into a single Mr. Bridge session.

---

## Gmail — "Check mail from other accounts" (POP3 aggregation)

Professional emails are pulled into the personal inbox. The OAuth token stays on `jaydud6@gmail.com` — no second credential set required.

### Setup steps

**1. Enable POP3 on leung.ss.jason**
- Gmail → Settings → See all settings → Forwarding and POP/IMAP
- Under "POP Download": select "Enable POP for all mail" (or "for mail that arrives from now on")
- Save

**2. Add leung.ss.jason as a mail source in jaydud6**
- Gmail (jaydud6) → Settings → See all settings → Accounts → "Check mail from other accounts"
- Click "Add a mail account" → enter `leung.ss.jason@gmail.com`
- Choose: "Import emails from my other account (Gmailify)" if offered, otherwise use POP3
- In the label step: check "Label incoming messages" → create or select label `professional`
- Do NOT check "Archive incoming messages" — professional emails should stay in inbox

**3. Verify**
- Trigger an immediate pull: Settings → Accounts → "Check mail now" next to leung.ss.jason
- Send a test email to `leung.ss.jason@gmail.com`; within 30–60 min it should appear in jaydud6's inbox tagged `professional`

### Sync delay
POP3 polls approximately every 30–60 minutes. Not real-time. Acceptable for session briefings. Use "Check mail now" in Settings to force an immediate poll.

### How emails surface in Mr. Bridge

| Email type | Where it comes from | Label in jaydud6 | Appears in dashboard? |
|---|---|---|---|
| Personal, high-signal | jaydud6 directly | none | Yes, if subject matches filter |
| Professional | leung.ss.jason via POP3 | `professional` | Yes, if subject matches filter; shown with "work" badge |
| Personal, noise | jaydud6 directly | none | No (subject filter blocks it) |

The dashboard query: `is:unread subject:(meeting OR urgent OR invoice OR "action required" OR deadline)`
Professional emails that don't match this filter are still pulled into the inbox but won't surface in the Important Emails card. They're accessible via Gmail directly.

---

## Google Calendar — Calendar sharing

The professional calendar is shared with the personal account. The existing OAuth token (jaydud6) then sees all calendars via the Google Calendar API — no second auth required. Calendar sharing is real-time (no sync delay).

### Setup steps

**1. Share leung.ss.jason's calendars with jaydud6**
- Google Calendar (leung.ss.jason) → Settings → click each calendar under "Settings for my calendars"
- Under "Share with specific people or groups" → Add `jaydud6@gmail.com`
- Permission: "See all event details"
- Repeat for each calendar to share (typically: primary + any work project calendars)

**2. Accept the shared calendar in jaydud6**
- Google Calendar (jaydud6) should prompt to accept; or check "Other calendars" in the sidebar
- The professional calendars appear under "Other calendars" with the leung.ss.jason label

**3. Verify**
- Create a test event in leung.ss.jason's Google Calendar
- Confirm it appears in jaydud6's Google Calendar within seconds
- Open Mr. Bridge web dashboard → Schedule Today card should show the event with the calendar name as source

### How events surface in Mr. Bridge

The calendar API (`/api/google/calendar`) now lists all calendars accessible to jaydud6 (primary + shared) and unions their events for today. Each event includes:
- `calendarName` — the name of the calendar it came from
- `isPrimary` — true only for jaydud6's own primary calendar

Non-primary events show the `calendarName` as a subtitle in the Schedule Today dashboard card, so it's clear which account an event belongs to.

---

## Session Briefing Notes

Steps 4 and 5 of the Session Start Protocol now reflect multi-account coverage:

- **Calendar**: List Calendar Events returns events from all connected calendars. Note the source for any non-primary events.
- **Gmail**: Search covers both accounts via POP3 aggregation. Professional emails arrive with Gmail label `professional`. Note "personal" or "work" when surfacing emails in the briefing.
