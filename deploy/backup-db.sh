#!/usr/bin/env bash
set -euo pipefail
cd /opt/mavis
install -d -m 700 /opt/mavis/db-backups
dest="/opt/mavis/db-backups/daily-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose --project-name mavis --env-file .env.production -f deploy/compose.production.yml config --format json \
  | python3 deploy/apply-course-schema.py --backup-only "$dest"
find /opt/mavis/db-backups -name 'daily-*.dump' -mtime +14 -delete
