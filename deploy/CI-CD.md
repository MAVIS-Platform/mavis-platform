# Production deployment

Pushes to main run Java parser/graph regression tests, Worker tests and frontend tests, then build backend/frontend/worker images in GHCR tagged with the full commit SHA. Only a commit still at the head of main is deployed.

GitHub Actions repository secrets: DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY and DEPLOY_KNOWN_HOSTS. The SSH key is dedicated to this repository. GHCR publishing and pulling use the short-lived GITHUB_TOKEN; no registry PAT is stored on the VPS.

The VPS needs Docker Compose, Python 3, curl, flock, /opt/mavis/.env.production, and the existing Nginx/HTTPS/draw.io installation. Database, SMTP, AI and JVM settings stay in that env file. Never commit it.

The deploy script serializes deployments, pulls all images before replacing containers, and checks frontend, backend, Worker and public HTTPS. On failure it restores the previous Compose and image tags. Prior images and /opt/mavis/releases are retained for rollback; data volumes are never deleted. This is a rolling replacement of a single stack, so brief downtime is expected.

Successful release metadata is in /opt/mavis/.release.env and IMAGE_PREFIX/IMAGE_TAG in the production env file. Do not manually run image prune -a without preserving rollback images.

For manual rollback, find the prior prefix/tag in the chosen releases/*/release.env (the initial deployment uses mavis:local), then run the saved Compose with those IMAGE_PREFIX/IMAGE_TAG environment variables. After health checks succeed, restore the saved Compose and release metadata. Database migrations remain disabled; schema changes need a separately reviewed migration/backup plan.
