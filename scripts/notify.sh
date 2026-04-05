#!/bin/bash
# Mr. Bridge — macOS notification sender
# Usage: ./scripts/notify.sh --title "Title" --message "Message"

TITLE="Mr. Bridge"
MESSAGE=""

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

osascript -e "display notification \"$MESSAGE\" with title \"$TITLE\" sound name \"default\""
