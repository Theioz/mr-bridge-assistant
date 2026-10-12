#!/bin/bash
# Mr. Bridge — send a notification (ntfy push + in-app history row).
# Usage: ./scripts/notify.sh --title "Title" --message "Message" [--click-url "https://..."] [--type TYPE]
#
# Thin wrapper over scripts/_push.py, the single delivery path, so shell callers get the same
# behaviour as Python ones: the push lands in the in-app Notifications history too, the delivery
# log never records the ntfy topic, and a failed send exits non-zero. The macOS osascript branch
# is gone: these jobs run on compute-core (Linux), where it could only fail.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a && source "$ENV_FILE" && set +a
fi
exec python3 "$SCRIPT_DIR/_push.py" "$@"
