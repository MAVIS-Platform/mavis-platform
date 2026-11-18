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
old_prefix=mavis
old_tag=local
if [ -f .release.env ]; then
  old_prefix=$(sed -n 's/^IMAGE_PREFIX=//p' .release.env)
  old_tag=$(sed -n 's/^IMAGE_TAG=//p' .release.env)
fi
docker container prune -f >/dev/null 2>&1 || true
docker builder prune -af >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true
for img in $(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep "^${prefix}-" | grep -vE ":($tag|$old_tag)$" || true); do
  docker rmi "$img" >/dev/null 2>&1 || true
done
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
mkdir -p "$previous" /tmp/mavis-runner-state
chown -R 1654:1654 /tmp/mavis-runner-state 2>/dev/null || true
chmod 0755 /tmp/mavis-runner-state 2>/dev/null || true
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
IFS= read -r ai_api_key || true
printf '%s' "$registry_token" | docker login ghcr.io --username "$registry_user" --password-stdin
unset registry_token
if [ -n "${ai_api_key:-}" ]; then
  AI_KEY="$ai_api_key" python3 - <<'PY'
import os
from pathlib import Path
p = Path('/opt/mavis/.env.production')
key = os.environ['AI_KEY'].strip()
lines = [l for l in p.read_text().splitlines() if not l.startswith(('MAVIS_AI_API_KEY=', 'OPENAI_API_KEY='))]
lines.append(f'MAVIS_AI_API_KEY={key}')
lines.append(f'OPENAI_API_KEY={key}')
p.write_text('\n'.join(lines) + '\n')
p.chmod(0o600)
PY
fi
unset ai_api_key
compose() {
  local image_prefix="$1" image_tag="$2" file="$3"
  shift 3
  IMAGE_PREFIX="$image_prefix" IMAGE_TAG="$image_tag" docker compose --project-name mavis --env-file /opt/mavis/.env.production -f "$file" "$@"
}
healthy() {
  for attempt in $(seq 1 45); do
    if docker exec mavis-frontend-1 node -e '
      Promise.all(["http://127.0.0.1:3000/api/auth-config","http://backend:8080/v3/api-docs","http://worker:8080/api/health/ready"].map(async u=>{
        const r=await fetch(u,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error("Unhealthy upstream");
      })).catch(()=>process.exit(1));' >/dev/null 2>&1 &&
       curl -fsS --max-time 10 https://maviss.site/login -o /dev/null; then return 0; fi
    sleep 4
  done
  return 1
}
compose "$prefix" "$tag" "$incoming/compose.production.yml" config --quiet
compose "$prefix" "$tag" "$incoming/compose.production.yml" pull
migration="$incoming/V26__Course_Lab_Access.sql"
schema_tool="$incoming/apply-course-schema.py"
if [ -e "$migration" ] || [ -e "$schema_tool" ]; then
  test -f "$migration" && test -f "$schema_tool" || { echo "Incomplete WF-01 schema package"; exit 1; }
  install -d -m 700 /opt/mavis/db-backups
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$migration" /opt/mavis/db-backups/wf01-before-v26.dump
fi
quiz_migration="$incoming/V27__Course_Quizzes.sql"
if [ -e "$quiz_migration" ]; then
  test -f "$migration" && test -f "$schema_tool" || { echo "Incomplete WF-02 schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$quiz_migration" /opt/mavis/db-backups/wf02-before-v27.dump
fi
quiz_evidence_migration="$incoming/V28__Submission_Course_Quiz_Evidence.sql"
if [ -e "$quiz_evidence_migration" ]; then
  test -f "$quiz_migration" && test -f "$schema_tool" || { echo "Incomplete WF-02 evidence schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$quiz_evidence_migration" /opt/mavis/db-backups/wf02-before-v28.dump
fi
digest_migration="$incoming/V29__Submission_Evidence_Package_Digest.sql"
if [ -e "$digest_migration" ]; then
  test -f "$quiz_evidence_migration" && test -f "$schema_tool" || { echo "Incomplete WF-04 digest schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$digest_migration" /opt/mavis/db-backups/wf04-before-v29.dump
fi
grading_migration="$incoming/V30__Submission_Snapshot_Grades_And_Explanations.sql"
if [ -e "$grading_migration" ]; then
  test -f "$digest_migration" && test -f "$schema_tool" || { echo "Incomplete WF-04 grading schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$grading_migration" /opt/mavis/db-backups/wf04-before-v30.dump
fi
identity_migration="$incoming/V31__WF01_Customer_Ready_Identity_And_Course.sql"
if [ -e "$identity_migration" ]; then
  test -f "$grading_migration" && test -f "$schema_tool" || { echo "Incomplete WF-01 identity schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$identity_migration" /opt/mavis/db-backups/wf01-before-v31.dump
fi
studio_control_migration="$incoming/V32__Runtime_Studio_Control.sql"
if [ -e "$studio_control_migration" ]; then
  test -f "$identity_migration" && test -f "$schema_tool" || { echo "Incomplete Studio control schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$studio_control_migration" /opt/mavis/db-backups/wf03-before-v32.dump
fi
studio_evidence_migration="$incoming/V33__Submission_Studio_Evidence.sql"
if [ -e "$studio_evidence_migration" ]; then
  test -f "$studio_control_migration" && test -f "$schema_tool" || { echo "Incomplete Studio evidence schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$studio_evidence_migration" /opt/mavis/db-backups/wf03-before-v33.dump
fi
topology_migration="$incoming/V34__Assignment_Studio_Topology_Snapshot.sql"
if [ -e "$topology_migration" ]; then
  test -f "$studio_evidence_migration" && test -f "$schema_tool" || { echo "Incomplete Studio topology schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$topology_migration" /opt/mavis/db-backups/wf03-before-v34.dump
fi
course_composition_migration="$incoming/V35__Course_Composition_Draft.sql"
if [ -e "$course_composition_migration" ]; then
  test -f "$topology_migration" && test -f "$schema_tool" || { echo "Incomplete Course composition schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$course_composition_migration" /opt/mavis/db-backups/course-before-v35.dump
fi
quiz_authoring_migration="$incoming/V36__Quiz_Authoring.sql"
if [ -e "$quiz_authoring_migration" ]; then
  test -f "$course_composition_migration" && test -f "$schema_tool" || { echo "Incomplete Quiz authoring schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$quiz_authoring_migration" /opt/mavis/db-backups/quiz-before-v36.dump
fi
runtime_assignment_migration="$incoming/V37__Runtime_Session_Assignment.sql"
if [ -e "$runtime_assignment_migration" ]; then
  test -f "$quiz_authoring_migration" && test -f "$schema_tool" || { echo "Incomplete Runtime assignment schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$runtime_assignment_migration" /opt/mavis/db-backups/runtime-before-v37.dump
fi
submission_v2_migration="$incoming/V38__Submission_V2_Lab_Mode.sql"
if [ -e "$submission_v2_migration" ]; then
  test -f "$runtime_assignment_migration" && test -f "$schema_tool" || { echo "Incomplete Submission v2 schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$submission_v2_migration" /opt/mavis/db-backups/submission-v2-before-v38.dump
fi
theory_library_migration="$incoming/V39__Theory_Library.sql"
if [ -e "$theory_library_migration" ]; then
  test -f "$submission_v2_migration" && test -f "$schema_tool" || { echo "Incomplete Theory library schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$theory_library_migration" /opt/mavis/db-backups/theory-before-v39.dump
fi
lab_prerequisites_migration="$incoming/V40__Lab_Prerequisites.sql"
if [ -e "$lab_prerequisites_migration" ]; then
  test -f "$theory_library_migration" && test -f "$schema_tool" || { echo "Incomplete Lab prerequisites schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$lab_prerequisites_migration" /opt/mavis/db-backups/prerequisites-before-v40.dump
fi
studio_exercise_migration="$incoming/V41__Lab_Studio_Exercise.sql"
if [ -e "$studio_exercise_migration" ]; then
  test -f "$lab_prerequisites_migration" && test -f "$schema_tool" || { echo "Incomplete Studio exercise schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$studio_exercise_migration" /opt/mavis/db-backups/studio-exercise-before-v41.dump
fi
passkey_essay_migration="$incoming/V42__Passkey_Crud_And_Essay_Submissions.sql"
if [ -e "$passkey_essay_migration" ]; then
  test -f "$studio_exercise_migration" && test -f "$schema_tool" || { echo "Incomplete Passkey & Essay schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$passkey_essay_migration" /opt/mavis/db-backups/passkey-essay-before-v42.dump
fi
java_course_seed_migration="$incoming/V43__Seed_Three_Role_Accounts_And_Java_Course.sql"
if [ -e "$java_course_seed_migration" ]; then
  test -f "$passkey_essay_migration" && test -f "$schema_tool" || { echo "Incomplete Java course seed schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$java_course_seed_migration" /opt/mavis/db-backups/java-seed-before-v43.dump
fi
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
