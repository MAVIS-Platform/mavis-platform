#!/usr/bin/env bash
# Idempotent Ubuntu/Debian host setup for MAVIS Stage 3 kernel isolation (gVisor / runsc).
# Works on standard Linux VPS instances without nested KVM (/dev/kvm not required).
# Usage: sudo bash deploy/install-gvisor.sh
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "ERROR: Run as root (sudo bash deploy/install-gvisor.sh)." >&2
  exit 1
fi

ARCH="$(uname -m)"
if [[ "${ARCH}" != "x86_64" && "${ARCH}" != "aarch64" ]]; then
  echo "ERROR: Unsupported architecture: ${ARCH}" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker Engine is not installed. Install Docker first." >&2
  exit 1
fi

if ! command -v runsc >/dev/null 2>&1; then
  echo "[1/3] Installing official Google gVisor (runsc) apt repository..."
  apt-get update -qq
  apt-get install -y -qq apt-transport-https ca-certificates curl gnupg >/dev/null
  install -m 0755 -d /usr/share/keyrings
  curl -fsSL https://gvisor.dev/archive.key | gpg --dearmor --yes -o /usr/share/keyrings/gvisor-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" \
    > /etc/apt/sources.list.d/gvisor.list
  apt-get update -qq
  apt-get install -y -qq runsc
else
  echo "[1/3] gVisor (runsc) already installed: $(runsc --version | head -n 1)"
fi

echo "[2/3] Registering runsc runtime with Docker daemon..."
runsc install
systemctl restart docker

echo "[3/3] Verifying real gVisor kernel isolation via docker run --runtime=runsc..."
if ! docker info --format '{{json .Runtimes}}' | grep -q '"runsc"'; then
  echo "ERROR: Docker daemon did not register the runsc runtime." >&2
  exit 1
fi

docker run --rm --runtime=runsc --memory=64m --pids-limit=32 --cap-drop=ALL \
  hello-world >/dev/null 2>&1 || docker run --rm --runtime=runsc alpine:3.20 uname -a

echo "SUCCESS: gVisor (runsc) is active. MAVIS Runner (MAVIS_RUNNER_OCI_RUNTIME=auto) will automatically isolate Studio containers in gVisor."
