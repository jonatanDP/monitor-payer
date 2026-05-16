#!/usr/bin/env sh
PROJECT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
ANDROID_USER_HOME="${ANDROID_USER_HOME:-$PROJECT_DIR/.android}"
GRADLE_USER_HOME="${GRADLE_USER_HOME:-$PROJECT_DIR/.gradle-user}"
GRADLE_RO_DEP_CACHE="${GRADLE_RO_DEP_CACHE:-$HOME/.gradle/caches}"
if [ -n "${GRADLE_OPTS:-}" ]; then
  GRADLE_OPTS="$GRADLE_OPTS -Dorg.gradle.native=false -Dorg.gradle.console=plain"
else
  GRADLE_OPTS="-Dorg.gradle.native=false -Dorg.gradle.console=plain"
fi
export ANDROID_USER_HOME GRADLE_USER_HOME GRADLE_RO_DEP_CACHE GRADLE_OPTS
mkdir -p "$ANDROID_USER_HOME" "$GRADLE_USER_HOME"
GRADLE_BIN="$(find "$HOME/.gradle/wrapper/dists" -path '*/bin/gradle' | tail -n 1)"
if [ ! -x "$GRADLE_BIN" ]; then
  echo "Gradle binary not found: $GRADLE_BIN"
  exit 1
fi
"$GRADLE_BIN" "$@"
