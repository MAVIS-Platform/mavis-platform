#!/usr/bin/env bash
set -euo pipefail
umask 077
tag="${1:?Missing commit SHA}"
prefix="${2:?Missing image prefix}"
registry_user="${3:?Missing registry user}"
[[ "$tag" =~ ^[a-f0-9]{40}$ ]] || { echo "Invalid commit SHA"; exit 2; }
[[ "$prefix" == "ghcr.io/mavis-platform/mavis-platform" ]] || { echo "Unexpected registry"; exit 2; }
cd /opt/mavis
exec 9>.deploy.lock
flock -w 300 9
incoming="/opt/mavis/incoming-$tag"
test -f "$incoming/compose.production.yml"
test -f .env.production
python3 - <<'PY'
import base64, os
from pathlib import Path
p = Path('/opt/mavis/.env.production')
lines = p.read_text().splitlines()
keys = {l.split('=', 1)[0]: l.split('=', 1)[1] for l in lines if '=' in l and not l.startswith('#')}
if not keys.get('MAVIS_RUNTIME_ENVIRONMENT_KEY'):
    lines = [l for l in lines if not l.startswith('MAVIS_RUNTIME_ENVIRONMENT_KEY=')]
    lines.append('MAVIS_RUNTIME_ENVIRONMENT_KEY=' + base64.b64encode(os.urandom(32)).decode())
if Path('/var/run/docker.sock').exists():
    lines = [l for l in lines if not l.startswith('DOCKER_GID=')]
    lines.append('DOCKER_GID=' + str(Path('/var/run/docker.sock').stat().st_gid))
p.write_text('\n'.join(lines) + '\n')
p.chmod(0o600)
PY
previous="/opt/mavis/releases/$(date -u +%Y%m%dT%H%M%SZ)-before-$tag"
mkdir -p "$previous"
cp deploy/compose.production.yml "$previous/compose.production.yml"
old_prefix=mavis
old_tag=local
if [ -f .release.env ]; then
  old_prefix=$(sed -n 's/^IMAGE_PREFIX=//p' .release.env)
  old_tag=$(sed -n 's/^IMAGE_TAG=//p' .release.env)
  cp .release.env "$previous/release.env"
fi
export DOCKER_CONFIG
DOCKER_CONFIG=$(mktemp -d /opt/mavis/.registry.XXXXXX)
cleanup() { rm -rf "$DOCKER_CONFIG"; }
trap cleanup EXIT
IFS= read -r registry_token
printf '%s' "$registry_token" | docker login ghcr.io --username "$registry_user" --password-stdin
unset registry_token
compose() {
  local image_prefix="$1" image_tag="$2" file="$3"
  shift 3
  IMAGE_PREFIX="$image_prefix" IMAGE_TAG="$image_tag" docker compose --project-name mavis --env-file /opt/mavis/.env.production -f "$file" "$@"
}
healthy() {
  for attempt in $(seq 1 30); do
    if docker exec mavis-frontend-1 node -e '
      Promise.all(["http://127.0.0.1:3000/api/auth-config","http://backend:8080/v3/api-docs","http://worker:8080/api/health/ready"].map(async u=>{
        const r=await fetch(u,{signal:AbortSignal.timeout(4000)});if(!r.ok)throw new Error("Unhealthy upstream");
      })).catch(()=>process.exit(1));' >/dev/null 2>&1 &&
       curl -fsS --max-time 10 https://maviss.site/login -o /dev/null; then return 0; fi
    sleep 4
  done
  return 1
}
compose "$prefix" "$tag" "$incoming/compose.production.yml" config --quiet
compose "$prefix" "$tag" "$incoming/compose.production.yml" pull
if ! compose "$prefix" "$tag" "$incoming/compose.production.yml" up -d --no-build --remove-orphans || ! healthy; then
  echo "Deployment failed; restoring previous images and Compose."
  compose "$old_prefix" "$old_tag" "$previous/compose.production.yml" up -d --no-build --remove-orphans
  if healthy; then echo "Rollback healthy."; else echo "ROLLBACK REQUIRES ATTENTION."; fi
  exit 1
fi
cp "$incoming/compose.production.yml" deploy/compose.production.yml
printf 'IMAGE_PREFIX=%s\nIMAGE_TAG=%s\n' "$prefix" "$tag" > .release.env
python3 - "$prefix" "$tag" <<'PY'
from pathlib import Path
import sys
p=Path('/opt/mavis/.env.production')
lines=[line for line in p.read_text().splitlines() if not line.startswith(('IMAGE_PREFIX=','IMAGE_TAG='))]
lines.extend(['IMAGE_PREFIX='+sys.argv[1], 'IMAGE_TAG='+sys.argv[2]])
p.write_text('\n'.join(lines)+'\n')
p.chmod(0o600)
PY
echo "Deployment healthy: $tag"
