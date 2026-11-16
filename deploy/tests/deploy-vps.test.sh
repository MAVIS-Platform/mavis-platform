#!/usr/bin/env bash
set -euo pipefail
mkdir -p /opt/mavis/deploy /tmp/stubs
cat > /tmp/stubs/docker <<'STUB'
#!/usr/bin/env bash
set -e
if [ "$1" = login ]; then cat >/dev/null; exit 0; fi
if [ "$1" = exec ]; then
  if [ -f /tmp/fail-tag ] && [ "$(cat /tmp/current-tag)" = "$(cat /tmp/fail-tag)" ]; then exit 1; fi
  exit 0
fi
if [ "$1" = compose ]; then
  printf '%s %s %s\n' "${IMAGE_PREFIX:-}" "${IMAGE_TAG:-}" "$*" >> /tmp/compose-calls
  case " $* " in *" up "*) printf '%s' "$IMAGE_TAG" > /tmp/current-tag;; esac
fi
STUB
printf '#!/bin/sh\nexit 0\n' > /tmp/stubs/curl
cp /tmp/stubs/curl /tmp/stubs/sleep
chmod +x /tmp/stubs/*
export PATH=/tmp/stubs:$PATH
echo 'INITIAL_ENV=preserved' > /opt/mavis/.env.production
echo 'name: mavis' > /opt/mavis/deploy/compose.production.yml
tag1=$(printf 'a%.0s' {1..40})
tag2=$(printf 'b%.0s' {1..40})
tag3=$(printf 'c%.0s' {1..40})
for tag in "$tag1" "$tag2" "$tag3"; do
  mkdir -p "/opt/mavis/incoming-$tag"
  echo 'name: mavis' > "/opt/mavis/incoming-$tag/compose.production.yml"
done
printf 'test-token\n' | bash /source/deploy-vps.sh "$tag1" ghcr.io/mavis-platform/mavis-platform test-user
grep -q "IMAGE_TAG=$tag1" /opt/mavis/.release.env
grep -q 'INITIAL_ENV=preserved' /opt/mavis/.env.production
grep -q '^MAVIS_RUNTIME_ENVIRONMENT_KEY=.\+' /opt/mavis/.env.production
test "$(stat -c %a /opt/mavis/.env.production)" = 600
echo "$tag2" > /tmp/fail-tag
if printf 'test-token\n' | bash /source/deploy-vps.sh "$tag2" ghcr.io/mavis-platform/mavis-platform test-user; then
  echo 'Expected failed deployment'; exit 1
fi
test "$(cat /tmp/current-tag)" = "$tag1"
grep -q "IMAGE_TAG=$tag1" /opt/mavis/.release.env
printf 'raise SystemExit(1)\n' > "/opt/mavis/incoming-$tag3/apply-course-schema.py"
touch "/opt/mavis/incoming-$tag3/V26__Course_Lab_Access.sql"
if printf 'test-token\n' | bash /source/deploy-vps.sh "$tag3" ghcr.io/mavis-platform/mavis-platform test-user; then
  echo 'Expected failed schema preparation'; exit 1
fi
test "$(cat /tmp/current-tag)" = "$tag1"
grep -q "IMAGE_TAG=$tag1" /opt/mavis/.release.env
if grep "^.* $tag3 " /tmp/compose-calls | grep -q ' up '; then
  echo 'Stack replaced despite schema preparation failure'; exit 1
fi
test -z "$(find /opt/mavis -maxdepth 1 -name '.registry.*' -print)"
echo 'PASS: success, failed-health rollback, schema failure preserves running stack, env preservation, secret-directory cleanup.'
