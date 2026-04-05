#!/bin/bash
# Mr. Bridge — notification sender (macOS + Android)
# Usage: ./scripts/notify.sh --title "Title" --message "Message"

TITLE="Mr. Bridge"
MESSAGE=""
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --title) TITLE="$2"; shift ;;
    --message) MESSAGE="$2"; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
  shift
done

if [[ -z "$MESSAGE" ]]; then
  echo "Error: --message is required"
  exit 1
fi

# macOS notification
osascript -e "display notification \"$MESSAGE\" with title \"$TITLE\" sound name \"default\""

# Android push via ntfy.sh
if [[ -f "$ENV_FILE" ]]; then
  set -a && source "$ENV_FILE" && set +a
fi

if [[ -n "$NTFY_TOPIC" ]]; then
  curl -s -X POST "https://ntfy.sh/$NTFY_TOPIC" \
    -H "Title: $TITLE" \
    -d "$MESSAGE" > /dev/null
fi
