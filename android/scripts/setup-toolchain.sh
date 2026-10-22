#!/usr/bin/env bash
# One-time per build machine: JDK 21 + Android SDK (command-line tools only, no Android Studio).
# macOS uses Homebrew; Linux/WSL uses apt for the JDK and Google's zip for the SDK tools.
# Gradle downloads the SDK platform and build-tools it needs on the first build.
set -euo pipefail

# Android command-line tools release, matched to the Homebrew cask so both machines agree.
# SHA-1 is the one Google publishes in https://dl.google.com/android/repository/repository2-3.xml
CMDLINE_REV=15859902
CMDLINE_LINUX_SHA1=040d3996a65543d22ec4bf73e4c37aa37a8d4af4

case "$(uname -s)" in
  Darwin)
    brew install openjdk@21
    brew install --cask android-commandlinetools
    ;;
  Linux)
    sudo apt-get update
    sudo apt-get install -y openjdk-21-jdk-headless unzip curl
    sdk="$HOME/Android/Sdk"
    if [ ! -x "$sdk/cmdline-tools/latest/bin/sdkmanager" ]; then
      tmp=$(mktemp -d)
      zip="$tmp/cmdline-tools.zip"
      curl -fsSL -o "$zip" \
        "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_REV}_latest.zip"
      echo "${CMDLINE_LINUX_SHA1}  $zip" | sha1sum -c -
      mkdir -p "$sdk/cmdline-tools"
      unzip -q "$zip" -d "$tmp"
      mv "$tmp/cmdline-tools" "$sdk/cmdline-tools/latest"
      rm -rf "$tmp"
    fi
    ;;
  *)
    echo "unsupported OS: $(uname -s)" >&2
    exit 1
    ;;
esac

# shellcheck source=SCRIPTDIR/env.sh
source "$(dirname "$0")/env.sh"
yes | sdkmanager --licenses >/dev/null || true
sdkmanager "platform-tools"

java -version 2>&1 | head -1
echo "ANDROID_HOME=$ANDROID_HOME"
echo "Toolchain ready. Next: put the release keystore in ~/.mrb-android/ (see android/README.md)."
