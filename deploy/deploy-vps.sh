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
docker container prune -f --filter "label!=com.docker.compose.project" >/dev/null 2>&1 || true
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
mem_kb = 0
meminfo = Path('/proc/meminfo')
if meminfo.exists():
    for mline in meminfo.read_text().splitlines():
        if mline.startswith('MemTotal:'):
            parts = mline.split()
            if len(parts) >= 2 and parts[1].isdigit():
                mem_kb = int(parts[1])
            break
# Allow 2 concurrent Studio stacks on hosts with >=3.5 GiB RAM (measured ~680 MiB/stack).
if mem_kb >= 3_500_000 and keys.get('MAVIS_RUNTIME_MAX_ACTIVE_STUDIO_SESSIONS', '') in ('', '1'):
    lines = [l for l in lines if not l.startswith('MAVIS_RUNTIME_MAX_ACTIVE_STUDIO_SESSIONS=')]
    lines.append('MAVIS_RUNTIME_MAX_ACTIVE_STUDIO_SESSIONS=2')
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
pull_release_images() {
  local attempt delay
  for attempt in 1 2 3 4; do
    if compose "$prefix" "$tag" "$incoming/compose.production.yml" pull; then
      return 0
    fi
    if [ "$attempt" -eq 4 ]; then
      echo "Failed to pull release images after $attempt attempts" >&2
      return 1
    fi
    delay=$((attempt * 10))
    echo "Image pull attempt $attempt failed; retrying in ${delay}s" >&2
    sleep "$delay"
  done
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
pull_release_images
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
announcements_migration="$incoming/V44__Mavis_Announcements.sql"
if [ -e "$announcements_migration" ]; then
  test -f "$java_course_seed_migration" && test -f "$schema_tool" || { echo "Incomplete Announcements schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$announcements_migration" /opt/mavis/db-backups/announcements-before-v44.dump
fi
nullable_quiz_model_migration="$incoming/V45__Nullable_Quiz_Reference_Model.sql"
if [ -e "$nullable_quiz_model_migration" ]; then
  test -f "$announcements_migration" && test -f "$schema_tool" || { echo "Incomplete Nullable Quiz Model schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$nullable_quiz_model_migration" /opt/mavis/db-backups/quiz-nullable-model-before-v45.dump
fi
nullable_submission_ref_migration="$incoming/V46__Nullable_Submission_Reference_Columns.sql"
if [ -e "$nullable_submission_ref_migration" ]; then
  test -f "$nullable_quiz_model_migration" && test -f "$schema_tool" || { echo "Incomplete Nullable Submission Reference schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$nullable_submission_ref_migration" /opt/mavis/db-backups/submission-nullable-ref-before-v46.dump
fi
course_quiz_assets_migration="$incoming/V47__Course_Quiz_Assets.sql"
if [ -e "$course_quiz_assets_migration" ]; then
  test -f "$nullable_submission_ref_migration" && test -f "$schema_tool" || { echo "Incomplete Course Quiz Assets schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$course_quiz_assets_migration" /opt/mavis/db-backups/course-quiz-assets-before-v47.dump
fi
inactive_workspace_status_migration="$incoming/V48__Allow_Inactive_Workspace_Status.sql"
if [ -e "$inactive_workspace_status_migration" ]; then
  test -f "$course_quiz_assets_migration" && test -f "$schema_tool" || { echo "Incomplete Workspace Status schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$inactive_workspace_status_migration" /opt/mavis/db-backups/workspace-status-before-v48.dump
fi
notifications_scope_migration="$incoming/V49__Scope_And_Deduplicate_Notifications.sql"
if [ -e "$notifications_scope_migration" ]; then
  test -f "$inactive_workspace_status_migration" && test -f "$schema_tool" || { echo "Incomplete Notifications Scope schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$notifications_scope_migration" /opt/mavis/db-backups/notifications-scope-before-v49.dump
fi
lecturer_notification_workflow_migration="$incoming/V50__Lecturer_Submission_Notification_Workflow.sql"
if [ -e "$lecturer_notification_workflow_migration" ]; then
  test -f "$notifications_scope_migration" && test -f "$schema_tool" || { echo "Incomplete Lecturer Notification Workflow schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$lecturer_notification_workflow_migration" /opt/mavis/db-backups/lecturer-notifications-before-v50.dump
fi
inline_quiz_progress_migration="$incoming/V51__Persist_Inline_Quiz_Progress.sql"
if [ -e "$inline_quiz_progress_migration" ]; then
  test -f "$lecturer_notification_workflow_migration" && test -f "$schema_tool" || { echo "Incomplete Inline Quiz Progress schema package"; exit 1; }
  compose "$prefix" "$tag" "$incoming/compose.production.yml" config --format json |
    python3 "$schema_tool" "$inline_quiz_progress_migration" /opt/mavis/db-backups/inline-quiz-progress-before-v51.dump
fi
# Ensure persistent data volume upload and worker directories are writable by app user 1654:1654
docker run --rm --mount source=mavis_data,target=/data alpine:3.20 sh -c "mkdir -p /data/uploads /data/worker-artifacts && chown -R 1654:1654 /data/uploads /data/worker-artifacts" >/dev/null 2>&1 || true
drain_deadline=$((SECONDS + 360))
while docker ps --format '{{.Label "com.docker.compose.project"}}' 2>/dev/null | grep -Eq '^mavisrun-[0-9a-f]{32}$'; do
  if [ "$SECONDS" -ge "$drain_deadline" ]; then echo "Studio drain timeout; deploying anyway."; break; fi
  echo "Waiting for active Studio sessions to finish..."; sleep 10
done
if ! compose "$prefix" "$tag" "$incoming/compose.production.yml" up -d --no-build --remove-orphans || ! healthy; then
  echo "Deployment failed; restoring previous images and Compose."
  compose "$old_prefix" "$old_tag" "$previous/compose.production.yml" up -d --no-build --remove-orphans
  if healthy; then echo "Rollback healthy."; else echo "ROLLBACK REQUIRES ATTENTION."; fi
  exit 1
fi
cp "$incoming/compose.production.yml" deploy/compose.production.yml
if [ -f "$incoming/compose.runner-worker.yml" ]; then cp "$incoming/compose.runner-worker.yml" deploy/compose.runner-worker.yml; fi
if [ -f "$incoming/install-gvisor.sh" ]; then cp "$incoming/install-gvisor.sh" deploy/install-gvisor.sh && chmod 0755 deploy/install-gvisor.sh; fi
if [ -f "$incoming/check-studio-readiness.sh" ]; then cp "$incoming/check-studio-readiness.sh" deploy/check-studio-readiness.sh && chmod 0755 deploy/check-studio-readiness.sh; fi
if [ -f "$incoming/apply-course-schema.py" ]; then cp "$incoming/apply-course-schema.py" deploy/apply-course-schema.py; fi
if [ -f "$incoming/backup-db.sh" ]; then
  cp "$incoming/backup-db.sh" deploy/backup-db.sh && chmod 0755 deploy/backup-db.sh
  if [ -d /etc/cron.d ] && [ -w /etc/cron.d ]; then
    printf '15 3 * * * root /opt/mavis/deploy/backup-db.sh >> /var/log/mavis-db-backup.log 2>&1\n' > /etc/cron.d/mavis-db-backup
    chmod 0644 /etc/cron.d/mavis-db-backup
  else
    echo "Skipping /etc/cron.d/mavis-db-backup install (requires write access to /etc/cron.d); see Runbook."
  fi
fi
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
