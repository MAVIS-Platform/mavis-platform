#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE_ROOT="${MAVIS_TOOL_CACHE:-${HOME}/.cache/mavis-toolchain}"
TOOLS_ROOT="${MAVIS_TOOLS_ROOT:-${HOME}/.local/opt/mavis}"
mkdir -p "$CACHE_ROOT" "$TOOLS_ROOT"

log() { printf '[mavis-bootstrap] %s\n' "$*"; }

need_cmd() { command -v "$1" >/dev/null 2>&1; }

install_jdk21() {
  if need_cmd javac && javac -version 2>&1 | grep -q '21\.'; then
    log 'JDK 21 already available; leaving it unchanged.'
    return
  fi
  local target="$TOOLS_ROOT/jdk-21"
  if [[ ! -x "$target/bin/javac" ]]; then
    local direct="$CACHE_ROOT/jdk-21-openjdk-amd64"
    if [[ -x "$direct/bin/javac" ]]; then
      target="$direct"
    else
      if need_cmd apt-get && [[ -w /tmp ]]; then
        local debdir="$CACHE_ROOT/jdk-debs"
        mkdir -p "$debdir" "$target"
        (cd "$debdir" && apt-get download openjdk-21-jdk-headless openjdk-21-jre-headless openjdk-21-jdk openjdk-21-jre)
        local extract="$CACHE_ROOT/jdk-extract"
        mkdir -p "$extract"
        local deb
        for deb in "$debdir"/*.deb; do dpkg-deb -x "$deb" "$extract"; done
        cp -a "$extract/usr/lib/jvm/java-21-openjdk-amd64/." "$target/"
        rm -rf "$target/conf/security"
        mkdir -p "$target/conf/security"
        cp -a "$extract/etc/java-21-openjdk/security/." "$target/conf/security/"
      else
        log 'Cannot install JDK 21: apt-get/dpkg unavailable.' >&2
        return 1
      fi
    fi
  fi
  export JAVA_HOME="$target"
  export PATH="$JAVA_HOME/bin:$PATH"
  log "JDK configured at $JAVA_HOME"
}

install_dotnet10() {
  local desired='10.0.403'
  if need_cmd dotnet && dotnet --list-sdks 2>/dev/null | awk '{print $1}' | grep -Fxq "$desired"; then
    log ".NET SDK $desired already available; leaving it unchanged."
  else
    local install="$TOOLS_ROOT/dotnet"
    mkdir -p "$install"
    if [[ ! -x "$install/dotnet" ]]; then
      local script="$CACHE_ROOT/dotnet-install.sh"
      if [[ ! -f "$script" ]]; then curl -fsSL https://dot.net/v1/dotnet-install.sh -o "$script"; fi
      bash "$script" --version "$desired" --install-dir "$install" --no-path
    fi
    export DOTNET_ROOT="$install"
    export PATH="$DOTNET_ROOT:$PATH"
  fi
  export DOTNET_ROOT="${DOTNET_ROOT:-$(dirname "$(command -v dotnet)")}"
  export PATH="$DOTNET_ROOT:$PATH"
  export DOTNET_CLI_TELEMETRY_OPTOUT=1
}

install_chromium() {
  if [[ -d "$HOME/.cache/ms-playwright" ]] && find "$HOME/.cache/ms-playwright" -maxdepth 2 -type f -name chrome-headless-shell -print -quit | grep -q .; then
    log 'Playwright Chromium binary already installed; leaving it unchanged.'
  else
    (cd "$ROOT/MAVIS-Frontend" && npx playwright install chromium)
  fi
  local browser_root
  browser_root="$(node -p "require('$ROOT/MAVIS-Frontend/node_modules/playwright').chromium.executablePath()" 2>/dev/null || true)"
  if [[ -n "$browser_root" && -x "$browser_root" ]]; then
    log "Playwright Chromium verified: $browser_root"
  else
    log 'Playwright Chromium executable not found after install.' >&2
    return 1
  fi
}

# Use only user-space installs. Never inspect or print credential values.
install_jdk21
install_dotnet10
install_chromium

log 'Toolchain bootstrap finished. PostgreSQL/Docker are not auto-started or provisioned by this script.'
log 'Docker requires a platform-provided socket/daemon. PostgreSQL integration tests require a disposable local DB.'
log 'Active process environment: JAVA_HOME, DOTNET_ROOT, PATH are set for this script only.'
