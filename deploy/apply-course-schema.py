"""Prepare additive course migrations before replacing production containers."""
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import parse_qs, unquote, urlsplit

COURSE_ACCESS_PROBE = """
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

QUIZ_PROBE = """
SELECT CASE
    WHEN to_regclass('course_quizzes') IS NULL AND to_regclass('course_quiz_attempts') IS NULL THEN 'missing'
    WHEN to_regclass('course_quizzes') IS NOT NULL AND to_regclass('course_quiz_attempts') IS NOT NULL
         AND (SELECT count(*) FROM information_schema.columns WHERE table_schema = current_schema()
              AND table_name = 'course_quizzes' AND column_name IN
                 ('assignment_id', 'version', 'reference_model_id', 'lesson', 'pass_percent', 'questions')) = 6
         AND (SELECT count(*) FROM information_schema.columns WHERE table_schema = current_schema()
              AND table_name = 'course_quiz_attempts' AND column_name IN
                 ('assignment_id', 'quiz_version', 'student_id', 'attempt_id', 'answers', 'correct_count', 'passed', 'submitted_at')) = 8
    THEN 'ready' ELSE 'partial' END;
"""

MIGRATIONS = {
    "V32__Runtime_Studio_Control.sql": (32, """
SELECT coalesce((SELECT CASE WHEN data_type = 'jsonb' AND is_nullable = 'YES' THEN 'ready' ELSE 'partial' END
FROM information_schema.columns WHERE table_schema = current_schema()
AND table_name = 'runtime_sessions' AND column_name = 'studio_control'),
CASE WHEN to_regclass('runtime_sessions') IS NULL THEN 'partial' ELSE 'missing' END);
"""),
    "V33__Submission_Studio_Evidence.sql": (33, """
SELECT coalesce((SELECT CASE WHEN data_type = 'jsonb' AND is_nullable = 'YES' THEN 'ready' ELSE 'partial' END
FROM information_schema.columns WHERE table_schema = current_schema()
AND table_name = 'submission_snapshots' AND column_name = 'studio_evidence'),
CASE WHEN to_regclass('submission_snapshots') IS NULL THEN 'partial' ELSE 'missing' END);
"""),
    "V34__Assignment_Studio_Topology_Snapshot.sql": (34, """
SELECT CASE
    WHEN to_regclass('assignments') IS NULL THEN 'partial'
    WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema = current_schema()
          AND table_name = 'assignments' AND column_name IN ('studio_topology_snapshot','studio_topology_revision')) = 2
         AND (SELECT data_type FROM information_schema.columns WHERE table_schema = current_schema()
              AND table_name = 'assignments' AND column_name = 'studio_topology_snapshot') = 'jsonb'
         AND (SELECT data_type FROM information_schema.columns WHERE table_schema = current_schema()
              AND table_name = 'assignments' AND column_name = 'studio_topology_revision') = 'integer' THEN 'ready'
    WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema = current_schema()
          AND table_name = 'assignments' AND column_name IN ('studio_topology_snapshot','studio_topology_revision')) = 0 THEN 'missing'
    ELSE 'partial' END;
"""),
    "V35__Course_Composition_Draft.sql": (35, """
WITH expected(present) AS (VALUES
    (to_regclass('course_definitions') IS NOT NULL),
    (to_regclass('course_versions') IS NOT NULL),
    (to_regclass('course_modules') IS NOT NULL),
    (to_regclass('course_items') IS NOT NULL),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'course_definitions' AND column_name = 'published_version'
             AND data_type = 'integer')),
    (EXISTS (SELECT FROM pg_constraint
             WHERE conrelid = to_regclass('course_modules')
             AND conname = 'uq_course_module_position' AND contype = 'u')),
    (EXISTS (SELECT FROM pg_constraint
             WHERE conrelid = to_regclass('course_items')
             AND conname = 'uq_course_item_position' AND contype = 'u'))
)
SELECT CASE WHEN bool_and(present) THEN 'ready'
            WHEN bool_or(present) THEN 'partial'
            ELSE 'missing' END FROM expected;
"""),
    "V45__Nullable_Quiz_Reference_Model.sql": (45, """
WITH expected(present) AS (VALUES
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'course_quizzes' AND column_name = 'reference_model_id'
             AND is_nullable = 'YES'))
)
SELECT CASE WHEN bool_and(present) THEN 'ready'
            ELSE 'missing' END FROM expected;
"""),
    "V46__Nullable_Submission_Reference_Columns.sql": (46, """
WITH expected(present) AS (VALUES
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'submission_snapshots' AND column_name = 'project_id'
             AND is_nullable = 'YES')),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'submission_snapshots' AND column_name = 'source_snapshot_id'
             AND is_nullable = 'YES')),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'submission_snapshots' AND column_name = 'model_version_id'
             AND is_nullable = 'YES'))
)
SELECT CASE WHEN bool_and(present) THEN 'ready'
            ELSE 'missing' END FROM expected;
"""),
    "V47__Course_Quiz_Assets.sql": (47, """
WITH expected(present) AS (VALUES
    (to_regclass('course_quiz_assets') IS NOT NULL),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'course_quiz_assets' AND column_name = 'questions'
             AND data_type = 'jsonb')),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'course_quiz_assets' AND column_name = 'pass_percent'
             AND data_type = 'integer'))
)
SELECT CASE WHEN bool_and(present) THEN 'ready'
            WHEN bool_or(present) THEN 'partial'
            ELSE 'missing' END FROM expected;
"""),
    "V49__Scope_And_Deduplicate_Notifications.sql": (49, """
SELECT CASE
    WHEN to_regprocedure('mavis_business_notifications()') IS NULL THEN 'partial'
    WHEN pg_get_functiondef('mavis_business_notifications()'::regprocedure) LIKE '%v49_notification_scope_dedupe%' THEN 'ready'
    ELSE 'missing' END;
"""),
    "V50__Lecturer_Submission_Notification_Workflow.sql": (50, """
WITH expected(present) AS (VALUES
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'user_notifications' AND column_name = 'action_required'
             AND data_type = 'boolean')),
    (to_regprocedure('mavis_classify_notification()') IS NOT NULL),
    (to_regprocedure('mavis_resolve_submission_notification()') IS NOT NULL),
    (EXISTS (SELECT FROM pg_trigger
             WHERE tgname = 'trg_classify_notification' AND NOT tgisinternal)),
    (EXISTS (SELECT FROM pg_trigger
             WHERE tgname = 'trg_resolve_submission_notification' AND NOT tgisinternal))
)
SELECT CASE WHEN bool_and(present) THEN 'ready'
            WHEN bool_or(present) THEN 'partial'
            ELSE 'missing' END FROM expected;
"""),
    "V51__Persist_Inline_Quiz_Progress.sql": (51, """
WITH expected(present) AS (VALUES
    (to_regclass('course_inline_quiz_progress') IS NOT NULL),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'course_inline_quiz_progress' AND column_name = 'item_id'
             AND data_type = 'uuid')),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'course_inline_quiz_progress' AND column_name = 'passed'
             AND data_type = 'boolean'))
)
SELECT CASE WHEN bool_and(present) THEN 'ready'
            WHEN bool_or(present) THEN 'partial'
            ELSE 'missing' END FROM expected;
"""),
    "V48__Allow_Inactive_Workspace_Status.sql": (48, """
SELECT CASE
    WHEN to_regclass('workspaces') IS NULL THEN 'partial'
    WHEN EXISTS (
        SELECT FROM pg_constraint
        WHERE conrelid = to_regclass('workspaces')
          AND conname = 'workspaces_status_check'
          AND pg_get_constraintdef(oid) LIKE '%INACTIVE%'
    ) THEN 'ready'
    ELSE 'missing' END;
"""),
    "V44__Mavis_Announcements.sql": (44, """
WITH expected(present) AS (VALUES
    (to_regclass('announcements') IS NOT NULL),
    (to_regclass('announcement_workspaces') IS NOT NULL),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'announcements' AND column_name = 'priority'
             AND data_type = 'character varying')),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'announcement_workspaces' AND column_name = 'workspace_id'
             AND data_type = 'uuid'))
)
SELECT CASE WHEN bool_and(present) THEN 'ready'
            WHEN bool_or(present) THEN 'partial'
            ELSE 'missing' END FROM expected;
"""),
    "V43__Seed_Three_Role_Accounts_And_Java_Course.sql": (43, """
WITH expected(present) AS (VALUES
    (EXISTS (SELECT FROM users WHERE email = 'gv.java@mavis.edu.vn' AND status = 'ACTIVE')),
    (EXISTS (SELECT FROM users WHERE email = 'sv.java@mavis.edu.vn' AND status = 'ACTIVE'))
)
SELECT CASE WHEN bool_and(present) THEN 'ready'
            ELSE 'missing' END FROM expected;
"""),
    "V42__Passkey_Crud_And_Essay_Submissions.sql": (42, """
WITH expected(present) AS (VALUES
    (to_regclass('course_item_submissions') IS NOT NULL),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'course_passkeys' AND column_name = 'id'
             AND data_type = 'uuid' AND is_nullable = 'NO')),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'course_passkeys' AND column_name = 'code'
             AND data_type = 'character varying')),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'course_passkeys' AND column_name = 'is_active'
             AND data_type = 'boolean'))
)
SELECT CASE WHEN bool_and(present) THEN 'ready'
            WHEN bool_or(present) THEN 'partial'
            ELSE 'missing' END FROM expected;
"""),
    "V41__Lab_Studio_Exercise.sql": (41, """
WITH expected(present) AS (VALUES
    (to_regclass('lab_studio_exercises') IS NOT NULL),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'lab_studio_exercises' AND column_name = 'baseline_requests'
             AND data_type = 'jsonb')),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'lab_studio_exercises' AND column_name = 'runtime_project_id'
             AND data_type = 'uuid')),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'assignments' AND column_name = 'studio_exercise_snapshot'
             AND data_type = 'jsonb')),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'assignments' AND column_name = 'studio_exercise_revision'
             AND data_type = 'integer'))
)
SELECT CASE WHEN bool_and(present) THEN 'ready'
            WHEN bool_or(present) THEN 'partial'
            ELSE 'missing' END FROM expected;
"""),
    "V40__Lab_Prerequisites.sql": (40, """
WITH expected(present) AS (VALUES
    (to_regclass('lab_prerequisites') IS NOT NULL),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'lab_prerequisites' AND column_name = 'assignment_id'
             AND data_type = 'uuid' AND is_nullable = 'NO')),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'lab_prerequisites' AND column_name = 'prerequisite_assignment_id'
             AND data_type = 'uuid' AND is_nullable = 'NO')),
    (EXISTS (SELECT FROM pg_constraint
             WHERE conrelid = to_regclass('lab_prerequisites')
             AND conname = 'chk_lab_prerequisite_not_self' AND contype = 'c'))
)
SELECT CASE WHEN bool_and(present) THEN 'ready'
            WHEN bool_or(present) THEN 'partial'
            ELSE 'missing' END FROM expected;
"""),
    "V39__Theory_Library.sql": (39, """
WITH expected(present) AS (VALUES
    (to_regclass('theory_assets') IS NOT NULL),
    (to_regclass('lab_theory_assets') IS NOT NULL),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'theory_assets' AND column_name = 'workspace_id'
             AND data_type = 'uuid' AND is_nullable = 'NO')),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'theory_assets' AND column_name = 'body'
             AND data_type = 'text')),
    (EXISTS (SELECT FROM pg_constraint
             WHERE conrelid = to_regclass('lab_theory_assets')
             AND conname = 'uq_lab_theory_asset' AND contype = 'u'))
)
SELECT CASE WHEN bool_and(present) THEN 'ready'
            WHEN bool_or(present) THEN 'partial'
            ELSE 'missing' END FROM expected;
"""),
    "V38__Submission_V2_Lab_Mode.sql": (38, """
WITH expected(present) AS (VALUES
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'assignments' AND column_name = 'lab_mode'
             AND data_type = 'character varying' AND is_nullable = 'NO')),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'submission_snapshots' AND column_name = 'theory_evidence'
             AND data_type = 'jsonb' AND is_nullable = 'YES')),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'submission_snapshots' AND column_name = 'diagram_version_id'
             AND is_nullable = 'YES'))
)
SELECT CASE WHEN bool_and(present) THEN 'ready'
            WHEN bool_or(present) THEN 'partial'
            ELSE 'missing' END FROM expected;
"""),
    "V37__Runtime_Session_Assignment.sql": (37, """
WITH expected(present) AS (VALUES
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'runtime_sessions' AND column_name = 'assignment_id'
             AND data_type = 'uuid')),
    (to_regclass('ix_runtime_sessions_assignment_created') IS NOT NULL)
)
SELECT CASE WHEN bool_and(present) THEN 'ready'
            WHEN bool_or(present) THEN 'partial'
            ELSE 'missing' END FROM expected;
"""),
    "V36__Quiz_Authoring.sql": (36, """
WITH expected(present) AS (VALUES
    (to_regclass('course_quiz_drafts') IS NOT NULL),
    (to_regclass('quiz_question_bank') IS NOT NULL),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'course_quizzes' AND column_name = 'published_at'
             AND data_type = 'timestamp with time zone')),
    (to_regclass('idx_quiz_question_bank_workspace') IS NOT NULL)
)
SELECT CASE WHEN bool_and(present) THEN 'ready'
            WHEN bool_or(present) THEN 'partial'
            ELSE 'missing' END FROM expected;
"""),
    "V26__Course_Lab_Access.sql": (26, COURSE_ACCESS_PROBE),
    "V27__Course_Quizzes.sql": (27, QUIZ_PROBE),
    "V28__Submission_Course_Quiz_Evidence.sql": (28, """
SELECT coalesce((SELECT CASE WHEN data_type = 'jsonb' AND is_nullable = 'YES'
                              THEN 'ready' ELSE 'partial' END
                 FROM information_schema.columns WHERE table_schema = current_schema()
                 AND table_name = 'submission_snapshots' AND column_name = 'course_quiz_evidence'),
                CASE WHEN to_regclass('submission_snapshots') IS NULL THEN 'partial' ELSE 'missing' END);
"""),
    "V29__Submission_Evidence_Package_Digest.sql": (29, """
SELECT CASE
    WHEN to_regclass('submission_snapshots') IS NULL THEN 'partial'
    WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema = current_schema()
          AND table_name = 'submission_snapshots' AND column_name = 'evidence_package_digest') = 0
         AND to_regclass('ix_submission_evidence_package_digest') IS NULL THEN 'missing'
    WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema = current_schema()
          AND table_name = 'submission_snapshots' AND column_name = 'evidence_package_digest'
          AND data_type = 'character varying' AND character_maximum_length = 71 AND is_nullable = 'NO') = 1
         AND to_regclass('ix_submission_evidence_package_digest') IS NOT NULL THEN 'ready'
    ELSE 'partial' END;
"""),
    "V30__Submission_Snapshot_Grades_And_Explanations.sql": (30, """
SELECT CASE
    WHEN to_regclass('submission_snapshots') IS NULL OR to_regclass('submission_reviews') IS NULL THEN 'partial'
    WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema = current_schema()
          AND ((table_name = 'submission_snapshots' AND column_name = 'student_snapshots')
               OR (table_name = 'submission_reviews' AND column_name IN ('snapshot_grades', 'lab_outcome')))) = 0
        THEN 'missing'
    WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema = current_schema()
          AND ((table_name = 'submission_snapshots' AND column_name = 'student_snapshots' AND data_type = 'jsonb')
               OR (table_name = 'submission_reviews' AND column_name = 'snapshot_grades' AND data_type = 'jsonb')
               OR (table_name = 'submission_reviews' AND column_name = 'lab_outcome'
                   AND data_type = 'character varying' AND character_maximum_length = 24))) = 3
        THEN 'ready'
    ELSE 'partial' END;
"""),
    "V31__WF01_Customer_Ready_Identity_And_Course.sql": (31, """
WITH expected(present) AS (VALUES
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'users' AND column_name = 'avatar_url')),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'users' AND column_name = 'preferred_locale')),
    (EXISTS (SELECT FROM information_schema.columns WHERE table_schema = current_schema()
             AND table_name = 'workspaces' AND column_name = 'max_students')),
    (to_regclass('refresh_sessions') IS NOT NULL),
    (to_regclass('ix_refresh_sessions_user_active') IS NOT NULL),
    (to_regclass('auth_rate_limits') IS NOT NULL)
)
SELECT CASE WHEN bool_and(present) THEN 'ready'
            WHEN bool_or(present) THEN 'partial'
            ELSE 'missing' END FROM expected;
"""),
}


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
    def __init__(self, settings, migration_version=26, schema_probe=COURSE_ACCESS_PROBE):
        self.settings = settings
        self.migration_version = migration_version
        self.schema_probe = schema_probe

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
        result = self.run("psql", "-XAtw", "-v", "ON_ERROR_STOP=1", "-c", self.schema_probe,
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
            f"SELECT pg_advisory_xact_lock(1296127049, {self.migration_version});\n"
            + migration.read_text(encoding="utf-8-sig")
            + "\nCOMMIT;\n"
        )
        self.run("psql", "-Xqw", "-v", "ON_ERROR_STOP=1", input_data=script.encode())


def prepare(client, migration, backup, label="WF-01"):
    state = client.probe()
    if state == "ready":
        print(f"{label} schema already present.")
        return
    if state != "missing":
        raise ValueError(f"Partial {label} schema requires operator reconciliation")
    client.backup(backup)
    client.apply(migration)
    if client.probe() != "ready":
        raise ValueError(f"{label} schema verification failed")
    print(f"{label} schema verified. Pre-migration backup retained on the deployment host.")


def main(argv=None, stdin=None):
    args = list(sys.argv[1:] if argv is None else argv)
    stream = sys.stdin if stdin is None else stdin
    os.umask(0o077)
    try:
        backend = json.load(stream)["services"]["backend"]["environment"]
        if len(args) == 2 and args[0] == "--backup-only":
            PostgresClient(connection(backend)).backup(Path(args[1]))
            print(f"Database backup verified: {args[1]}")
            return
        if len(args) != 2:
            raise ValueError("Expected <migration.sql> <backup.dump> or --backup-only <backup.dump>")
        migration = Path(args[0])
        version, probe = MIGRATIONS[migration.name]
        prepare(PostgresClient(connection(backend), version, probe), migration, Path(args[1]), f"V{version}")
    except (KeyError, OSError, ValueError, subprocess.CalledProcessError):
        sys.exit("Course schema preparation failed before replacement. Check DB access, schema and backup.")


if __name__ == "__main__":
    main()
