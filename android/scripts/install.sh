#!/usr/bin/env bash
# Install (or update in place) the release APK on the phone over Wireless debugging.
# Usage: android/scripts/install.sh [<phone-ip>:<connect-port>]
# Pair once first: adb pair <phone-ip>:<pairing-port>   (see android/README.md)
set -euo pipefail
# shellcheck source=SCRIPTDIR/env.sh
source "$(dirname "$0")/env.sh"

if [ $# -ge 1 ]; then
  adb connect "$1"
fi
adb devices -l

apk="$ANDROID_DIR/native/app/build/outputs/apk/release/app-release.apk"
[ -f "$apk" ] || { echo "no APK at $apk; run android/scripts/build.sh first" >&2; exit 1; }
# -r replaces the installed app and keeps its data. It only works while the signing key matches.
adb install -r "$apk"
