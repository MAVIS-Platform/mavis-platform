"""Prepare the additive WF-01 schema before replacing production containers."""
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import parse_qs, unquote, urlsplit

PROBE = """
WITH expected(present) AS (VALUES
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'workspaces' AND column_name = 'course_mode' AND data_type = 'boolean')),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'assignments' AND column_name = 'lab_order' AND data_type = 'integer')),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'workspace_members' AND column_name = 'enrollment_request_id')),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'workspace_members' AND column_name = 'enrollment_key_digest')),
    (to_regclass('course_passkeys') IS NOT NULL),
    (to_regclass('course_lab_results') IS NOT NULL),
    (to_regclass('revoked_access_tokens') IS NOT NULL),
    (to_regclass('uq_workspace_lab_order') IS NOT NULL)
)
SELECT CASE WHEN bool_and(present) THEN 'ready'
            WHEN bool_or(present) THEN 'partial'
            ELSE 'missing' END FROM expected;
"""


def connection(settings):
    jdbc = settings["MAVIS_DB_URL"]
    if not jdbc.startswith("jdbc:postgresql://"):
        raise ValueError("Expected one PostgreSQL JDBC endpoint")
    url = urlsplit(jdbc[5:])
    query = parse_qs(url.query, strict_parsing=True)
    if (not url.hostname or url.username or "," in url.netloc or url.fragment
            or not url.path[1:] or "/" in url.path[1:] or set(query) - {"sslmode"}):
        raise ValueError("Unsupported PostgreSQL JDBC connection options")
    ssl = query.get("sslmode", ["require"])
    if ssl != ["require"]:
        raise ValueError("Production migration requires TLS (sslmode=require)")
    return {
        "PGHOST": url.hostname,
        "PGPORT": str(url.port or 5432),
        "PGDATABASE": unquote(url.path[1:]),
        "PGUSER": settings["MAVIS_DB_USERNAME"],
        "PGPASSWORD": settings["MAVIS_DB_PASSWORD"],
        "PGSSLMODE": "require",
        "PGCONNECT_TIMEOUT": "10",
    }


class PostgresClient:
    def __init__(self, settings):
        self.settings = settings

    def run(self, *command, input_data=None, stdin=None, stdout=None):
        args = ["docker", "run", "--rm", "-i", "--network", "mavis_default"]
        for key in self.settings:
            args.extend(("--env", key))
        return subprocess.run(
            [*args, "postgres:18", *command],
            env={**os.environ, **self.settings},
            input=input_data,
            stdin=stdin,
            stdout=stdout,
            check=True,
        )

    def probe(self):
        result = self.run("psql", "-XAtw", "-v", "ON_ERROR_STOP=1", "-c", PROBE,
                          stdout=subprocess.PIPE)
        return result.stdout.decode().strip()

    def backup(self, destination):
        temporary = destination.with_suffix(".pending")
        try:
            with temporary.open("wb") as output:
                self.run("pg_dump", "-w", "--format=custom", stdout=output)
            if temporary.stat().st_size == 0:
                raise ValueError("PostgreSQL backup was empty")
            with temporary.open("rb") as archive:
                self.run("pg_restore", "--list", stdin=archive, stdout=subprocess.DEVNULL)
            temporary.replace(destination)
        finally:
            temporary.unlink(missing_ok=True)

    def apply(self, migration):
        script = (
            "BEGIN;\nSET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '60s';\n"
            "SELECT pg_advisory_xact_lock(1296127049, 26);\n"
            + migration.read_text(encoding="utf-8-sig")
            + "\nCOMMIT;\n"
        )
        self.run("psql", "-Xqw", "-v", "ON_ERROR_STOP=1", input_data=script.encode())


def prepare(client, migration, backup):
    state = client.probe()
    if state == "ready":
        print("WF-01 schema already present.")
        return
    if state != "missing":
        raise ValueError("Partial WF-01 schema requires operator reconciliation")
    client.backup(backup)
    client.apply(migration)
    if client.probe() != "ready":
        raise ValueError("WF-01 schema verification failed")
    print("WF-01 schema verified. Pre-migration backup retained on the deployment host.")


if __name__ == "__main__":
    os.umask(0o077)
    try:
        backend = json.load(sys.stdin)["services"]["backend"]["environment"]
        prepare(PostgresClient(connection(backend)), Path(sys.argv[1]), Path(sys.argv[2]))
    except (KeyError, OSError, ValueError, subprocess.CalledProcessError):
        sys.exit("WF-01 schema preparation failed before replacement. Check DB access, schema and backup.")
