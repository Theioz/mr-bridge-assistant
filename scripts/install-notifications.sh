#!/usr/bin/env bash
# Mr. Bridge — idempotent cron installer for push-notification check scripts.
# Usage: bash scripts/install-notifications.sh
# Safe to re-run — duplicate entries are never added.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_DIR/.env"
PYTHON="$(command -v python3)"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Copy .env.example → .env and fill in values first." >&2
  exit 1
fi

# Each entry: "CRON_SCHEDULE|SCRIPT_PATH"
# Schedules follow issue #383 spec:
#   weather     07:00  daily
#   daily alerts 07:30 daily
#   birthdays   08:00  daily
#   hrv         08:30  daily (after ~6am Oura sync window)
#   task due    09:00 + 17:00 daily
declare -a ENTRIES=(
  "0 7 * * *|scripts/check_weather_alert.py"
  "30 7 * * *|scripts/check_daily_alerts.py"
  "0 8 * * *|scripts/check_birthday_notif.py"
  "30 8 * * *|scripts/check_hrv_alert.py"
  "0 9 * * *|scripts/check_task_due_alerts.py"
  "0 17 * * *|scripts/check_task_due_alerts.py"
)

# Load current crontab (empty string if none)
CURRENT_CRONTAB="$(crontab -l 2>/dev/null || true)"
NEW_CRONTAB="$CURRENT_CRONTAB"
ADDED=0
SKIPPED=0

for ENTRY in "${ENTRIES[@]}"; do
  SCHEDULE="${ENTRY%%|*}"
  SCRIPT="${ENTRY##*|}"
  CMD="$SCHEDULE cd \"$REPO_DIR\" && set -a && source \"$ENV_FILE\" && set +a && \"$PYTHON\" \"$REPO_DIR/$SCRIPT\" >> \"$HOME/.mr-bridge/cron.log\" 2>&1"

  # Dedup check: skip if this exact script path already has a cron entry at this schedule
  if echo "$NEW_CRONTAB" | grep -qF "$REPO_DIR/$SCRIPT"; then
    echo "  skip  [$SCHEDULE] $SCRIPT (already present)"
    (( SKIPPED++ )) || true
  else
    if [[ -n "$NEW_CRONTAB" ]]; then
      NEW_CRONTAB="$NEW_CRONTAB
$CMD"
    else
      NEW_CRONTAB="$CMD"
    fi
    echo "  add   [$SCHEDULE] $SCRIPT"
    (( ADDED++ )) || true
  fi
done

if (( ADDED > 0 )); then
  echo "$NEW_CRONTAB" | crontab -
  echo ""
  echo "Installed $ADDED cron entry/entries. Skipped $SKIPPED already present."
  echo "Logs: $HOME/.mr-bridge/cron.log"
  echo "Delivery log: $HOME/.mr-bridge/notify.log"
else
  echo ""
  echo "All $SKIPPED entries already present — nothing changed."
fi

echo ""
echo "Current mr-bridge cron entries:"
crontab -l 2>/dev/null | grep "mr-bridge-assistant" || echo "  (none)"
