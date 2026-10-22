# shellcheck shell=bash
# Sourced by the other scripts. Points JAVA_HOME / ANDROID_HOME at the toolchain that
# setup-toolchain.sh installs, unless the caller already set them, so nothing has to go into
# a shell rc file and the Mac and WSL builds behave the same.

case "$(uname -s)" in
  Darwin)
    : "${JAVA_HOME:=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
    : "${ANDROID_HOME:=/opt/homebrew/share/android-commandlinetools}"
    ;;
  Linux)
    : "${JAVA_HOME:=/usr/lib/jvm/java-21-openjdk-amd64}"
    : "${ANDROID_HOME:=$HOME/Android/Sdk}"
    ;;
  *)
    echo "unsupported OS: $(uname -s)" >&2
    return 1
    ;;
esac
export JAVA_HOME ANDROID_HOME
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

# BASH_SOURCE is bash-only. Sourced from zsh (the macOS default) it is empty and ANDROID_DIR would
# silently resolve relative to the caller's cwd, so refuse rather than build from the wrong tree.
if [ -z "${BASH_SOURCE[0]:-}" ]; then
  echo "env.sh must be sourced from bash: bash -c 'source android/scripts/env.sh && ...'" >&2
  return 1
fi
ANDROID_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ANDROID_DIR
