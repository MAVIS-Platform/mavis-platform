#!/usr/bin/env bash
# Pre-survey Studio Live readiness & host health verifier for MAVIS VPS.
# Usage: bash /opt/mavis/deploy/check-studio-readiness.sh
set -euo pipefail

PASS=0
WARN=0
FAIL=0
ok()   { echo "[PASS] $1"; PASS=$((PASS+1)); }
warn() { echo "[WARN] $1"; WARN=$((WARN+1)); }
fail() { echo "[FAIL] $1"; FAIL=$((FAIL+1)); }

echo "=== MAVIS Studio Live Pre-Survey Readiness Check ==="

if docker info --format '{{.OSType}}' 2>/dev/null | grep -qx 'linux'; then
  ok "Docker Engine (linux) is reachable"
else
  fail "Docker Engine is unreachable"
fi

if docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q '"runsc"'; then
  ok "Stage 3 gVisor (runsc) kernel isolation is installed"
else
  warn "gVisor (runsc) not installed — running in hardened runc mode (enable: sudo bash /opt/mavis/deploy/install-gvisor.sh)"
fi

FREE_MIB=$(df -Pm /var/lib/docker 2>/dev/null | awk 'NR==2{print $4}' || df -Pm / | awk 'NR==2{print $4}')
if [[ "${FREE_MIB:-0}" -ge 5120 ]]; then
  ok "Free disk space: ${FREE_MIB} MiB (>= 5120 MiB recommended)"
elif [[ "${FREE_MIB:-0}" -ge 2048 ]]; then
  warn "Free disk space is tight: ${FREE_MIB} MiB (< 5120 MiB recommended)"
else
  fail "Critical low disk space: ${FREE_MIB:-0} MiB (< 2048 MiB)"
fi

AVAIL_RAM_MIB=$(awk '/MemAvailable:/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)
if [[ "${AVAIL_RAM_MIB:-0}" -ge 2048 ]]; then
  ok "Available RAM: ${AVAIL_RAM_MIB} MiB"
else
  warn "Low available RAM: ${AVAIL_RAM_MIB} MiB (consider MAVIS_RUNTIME_MAX_ACTIVE_STUDIO_SESSIONS=2 or adding a Worker VPS)"
fi

ORPHANS=$(docker ps -aq --filter 'label=com.docker.compose.project' --format '{{.Label "com.docker.compose.project"}}' 2>/dev/null | grep -E '^mavisrun-[0-9a-f]{32}$' | sort -u | wc -l || echo 0)
if [[ "${ORPHANS:-0}" -eq 0 ]]; then
  ok "Zero lingering mavisrun-* sandbox stacks"
else
  warn "${ORPHANS} active or orphaned mavisrun-* sandbox stack(s) currently present"
fi

SANDBOX_IMAGES=$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -c '^mavis-sandbox-' || true)
ok "Pre-built local Lab sandbox images cached: ${SANDBOX_IMAGES}"

if curl -fsS --max-time 8 https://maviss.site/api/auth-config >/dev/null 2>&1; then
  ok "Production endpoint https://maviss.site/api/auth-config is healthy"
else
  fail "Production endpoint https://maviss.site/api/auth-config failed health check"
fi

echo "=== Summary: PASS=${PASS} WARN=${WARN} FAIL=${FAIL} ==="
[[ "${FAIL}" -eq 0 ]]
