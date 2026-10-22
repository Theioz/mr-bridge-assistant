#!/usr/bin/env bash
# Build the signed release APK. Usage: android/scripts/build.sh
set -euo pipefail
# shellcheck source=SCRIPTDIR/env.sh
source "$(dirname "$0")/env.sh"

if [ ! -f "$HOME/.mrb-android/keystore.properties" ]; then
  echo "ABORT: ~/.mrb-android/keystore.properties missing. Pull the release keystore from the" >&2
  echo "vault first (android/README.md). Refusing to build an unsigned or differently-signed APK." >&2
  exit 1
fi

cd "$ANDROID_DIR"
[ -d node_modules ] || npm ci --no-fund --no-audit
npx cap sync android

cd native
./gradlew assembleRelease --console=plain

apk="$ANDROID_DIR/native/app/build/outputs/apk/release/app-release.apk"
apksigner=$(ls -d "$ANDROID_HOME"/build-tools/*/ | sort -V | tail -1)apksigner
"$apksigner" verify --print-certs "$apk" | grep -E 'SHA-256 digest'
echo "Built: $apk"
