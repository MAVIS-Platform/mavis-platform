import importlib.util
import os
import shutil
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest
from unittest.mock import Mock, patch

script = Path(__file__).resolve().parent.parent / "apply-course-schema.py"
spec = importlib.util.spec_from_file_location("course_schema", script)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class MigrationTest(unittest.TestCase):
    def test_ssh_retry_only_retries_transport_failures(self):
        bash = shutil.which("bash")
        if os.name == "nt":
            bash = str(Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git/bin/bash.exe")
        if not bash or not Path(bash).exists():
            self.skipTest("Bash is needed to exercise the deployment retry function")
        workflow = (script.parent.parent / ".github/workflows/deploy-production.yml").read_text(encoding="utf-8")
        function = textwrap.dedent(workflow[workflow.index("          retry_ssh() {"):
                                           workflow.index("          retry_scp() {")])
        for failure, expected_attempts in ((1, 1), (255, 3), (0, 1)):
            with self.subTest(failure=failure):
                test = f"""
                    attempts=0
                    ssh_opts=()
                    target=test-only
                    ssh() {{ attempts=$((attempts+1)); return {failure}; }}
                    sleep() {{ :; }}
                """
                result = subprocess.run([bash, "-c", textwrap.dedent(test) + function + """
                    retry_ssh true test-command
                    status=$?
                    printf '%s %s' "$status" "$attempts"
                """], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
                self.assertEqual(result.stdout.decode(), f"{failure} {expected_attempts}")

    @unittest.skipUnless(os.environ.get("MAVIS_TEST_PG_CONTAINER"),
                         "Set MAVIS_TEST_PG_CONTAINER to a disposable local PostgreSQL container")
    def test_v35_real_migration_matches_its_readiness_probe(self):
        container = os.environ["MAVIS_TEST_PG_CONTAINER"]
        version, probe = module.MIGRATIONS["V35__Course_Composition_Draft.sql"]
        self.assertEqual(version, 35)

        def sql(query):
            result = subprocess.run(
                ["docker", "exec", "-i", container, "psql", "-U", "test_only",
                 "-d", "test_only", "-XAtq", "-v", "ON_ERROR_STOP=1"],
                input=query.encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            )
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            return result.stdout.decode().strip()

        sql("""
            CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
            CREATE TABLE workspaces (id uuid PRIMARY KEY);
            CREATE TABLE assignments (id uuid PRIMARY KEY);
            CREATE TABLE users (id uuid PRIMARY KEY);
        """)
        self.assertEqual(sql(probe), "missing")
        migration = script.parent.parent / "MAVIS-Platform/mavis-be/mavis-bootstrap/src/main/resources/db/migration/V35__Course_Composition_Draft.sql"
        sql("BEGIN;\n" + migration.read_text(encoding="utf-8-sig") + "\nCOMMIT;")
        self.assertEqual(sql(probe), "ready")
        self.assertEqual(sql(probe), "ready", "A deployment retry must recognize an applied V35")

    def test_each_quiz_migration_uses_its_own_probe_and_transaction_lock(self):
        for filename, version, marker in (
            ("V27__Course_Quizzes.sql", 27, "course_quiz_attempts"),
            ("V28__Submission_Course_Quiz_Evidence.sql", 28, "course_quiz_evidence"),
            ("V29__Submission_Evidence_Package_Digest.sql", 29, "evidence_package_digest"),
            ("V30__Submission_Snapshot_Grades_And_Explanations.sql", 30, "snapshot_grades"),
            ("V31__WF01_Customer_Ready_Identity_And_Course.sql", 31, "refresh_sessions"),
            ("V32__Runtime_Studio_Control.sql", 32, "studio_control"),
            ("V33__Submission_Studio_Evidence.sql", 33, "studio_evidence"),
            ("V34__Assignment_Studio_Topology_Snapshot.sql", 34, "studio_topology_snapshot"),
            ("V35__Course_Composition_Draft.sql", 35, "course_definitions"),
            ("V36__Quiz_Authoring.sql", 36, "course_quiz_drafts"),
            ("V37__Runtime_Session_Assignment.sql", 37, "assignment_id"),
            ("V38__Submission_V2_Lab_Mode.sql", 38, "theory_evidence"),
            ("V42__Passkey_Crud_And_Essay_Submissions.sql", 42, "course_item_submissions"),
        ):
            registered, probe = module.MIGRATIONS[filename]
            self.assertEqual(registered, version)
            client = module.PostgresClient({}, registered, probe)
            with self.subTest(migration=filename), tempfile.TemporaryDirectory() as tmp, patch.object(client, "run") as run:
                migration = Path(tmp) / filename
                migration.write_text("SELECT 1;", encoding="utf-8")
                run.return_value.stdout = b"missing\n"
                self.assertEqual(client.probe(), "missing")
                self.assertIn(marker, run.call_args.args[-1])
                client.apply(migration)
                self.assertIn(f"pg_advisory_xact_lock(1296127049, {version})".encode(), run.call_args.kwargs["input_data"])

    def test_tls_url_preserves_connection_identity(self):
        env = module.connection({
            "MAVIS_DB_URL": "jdbc:postgresql://db.example.invalid:15432/app%5Fdb?sslmode=require",
            "MAVIS_DB_USERNAME": "app",
            "MAVIS_DB_PASSWORD": "fixture",
        })
        self.assertEqual((env["PGHOST"], env["PGPORT"], env["PGDATABASE"], env["PGSSLMODE"]),
                         ("db.example.invalid", "15432", "app_db", "require"))

    def test_non_tls_or_ambiguous_target_is_refused(self):
        for url in (
            "jdbc:postgresql://db/app?sslmode=disable",
            "jdbc:postgresql://db/app?currentSchema=other",
            "jdbc:postgresql://db,other/app",
            "jdbc:postgresql://db/app?sslmode=require&sslmode=disable",
        ):
            with self.subTest(url=url), self.assertRaises(ValueError):
                module.connection({"MAVIS_DB_URL": url})

    def test_ready_is_noop_and_partial_never_writes(self):
        client = Mock()
        client.probe.return_value = "ready"
        module.prepare(client, Path("migration.sql"), Path("backup.dump"))
        client.backup.assert_not_called()
        client.apply.assert_not_called()
        client.probe.return_value = "partial"
        with self.assertRaises(ValueError):
            module.prepare(client, Path("migration.sql"), Path("backup.dump"))
        client.backup.assert_not_called()
        client.apply.assert_not_called()

    def test_backup_failure_prevents_mutation(self):
        client = Mock()
        client.probe.return_value = "missing"
        client.backup.side_effect = subprocess.CalledProcessError(1, "pg_dump")
        with self.assertRaises(subprocess.CalledProcessError):
            module.prepare(client, Path("migration.sql"), Path("backup.dump"))
        client.apply.assert_not_called()

    def test_migration_requires_verified_schema(self):
        client = Mock()
        client.probe.side_effect = ["missing", "missing"]
        with self.assertRaises(ValueError):
            module.prepare(client, Path("migration.sql"), Path("backup.dump"))
        self.assertEqual([call[0] for call in client.method_calls],
                         ["probe", "backup", "apply", "probe"])

    def test_failed_archive_check_keeps_previous_backup(self):
        client = module.PostgresClient({})
        with tempfile.TemporaryDirectory() as tmp:
            destination = Path(tmp) / "before-v26.dump"
            destination.write_bytes(b"old backup")

            def command(*args, stdout=None, stdin=None):
                if args[0] == "pg_dump":
                    stdout.write(b"new backup")
                else:
                    self.assertEqual(stdin.read(), b"new backup")
                    raise subprocess.CalledProcessError(1, "pg_restore")

            with patch.object(client, "run", side_effect=command):
                with self.assertRaises(subprocess.CalledProcessError):
                    client.backup(destination)
            self.assertEqual(destination.read_bytes(), b"old backup")
            self.assertFalse(destination.with_suffix(".pending").exists())


if __name__ == "__main__":
    unittest.main()
