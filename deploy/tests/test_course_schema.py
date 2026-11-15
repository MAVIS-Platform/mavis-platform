import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

script = Path(__file__).resolve().parent.parent / "apply-course-schema.py"
spec = importlib.util.spec_from_file_location("course_schema", script)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class MigrationTest(unittest.TestCase):
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
