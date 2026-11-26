"""Integration tests against an isolated localhost PostgreSQL cluster; never production."""
import os, unittest, uuid
from pathlib import Path
from datetime import datetime, timedelta, timezone
import psycopg2
from psycopg2 import sql

class NotificationEvents(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.config=dict(host="127.0.0.1",port=int(os.environ.get("MAVIS_NOTIFICATION_TEST_PORT","55439")),user="postgres")
  cls.db="mavis_notifications_test_"+uuid.uuid4().hex[:12]
  cls.admin=psycopg2.connect(dbname="postgres",**cls.config);cls.admin.autocommit=True
  with cls.admin.cursor() as q:q.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(cls.db)))
  cls.c=psycopg2.connect(dbname=cls.db,**cls.config)
  migration=Path(__file__).resolve().parents[2]/"main/resources/db/migration"
  with cls.c:
   with cls.c.cursor() as q:
    for name in ["V1__Init_Database.sql","V7__Runtime_Versioned_Contract_And_Receipts.sql","V21__Submission_Review.sql","V22__User_Notifications.sql","V49__Scope_And_Deduplicate_Notifications.sql","V50__Lecturer_Submission_Notification_Workflow.sql"]:q.execute((migration/name).read_text(encoding="utf-8-sig"))
 @classmethod
 def tearDownClass(cls):
  cls.c.close()
  with cls.admin.cursor() as q:q.execute(sql.SQL("DROP DATABASE {}").format(sql.Identifier(cls.db)))
  cls.admin.close()
 def insert(self,table,**values):
  names=list(values)
  self.q.execute(sql.SQL("INSERT INTO {} ({}) VALUES ({}) RETURNING id").format(sql.Identifier(table),sql.SQL(',').join(map(sql.Identifier,names)),sql.SQL(',').join(sql.Placeholder()*len(names))),[values[n] for n in names]);return str(self.q.fetchone()[0])
 def setUp(self):
  self.q=self.c.cursor()
  self.q.execute("SELECT code,id FROM roles");roles=dict(self.q.fetchall())
  self.teacher=self.insert('users',role_id=str(roles['LECTURER']),email=uuid.uuid4().hex+'@example.invalid',password_hash='test-only',full_name='Teacher')
  self.student=self.insert('users',role_id=str(roles['STUDENT']),email=uuid.uuid4().hex+'@example.invalid',password_hash='test-only',full_name='Student')
  self.outsider=self.insert('users',role_id=str(roles['STUDENT']),email=uuid.uuid4().hex+'@example.invalid',password_hash='test-only',full_name='Other student')
  self.admin_id=self.insert('users',role_id=str(roles['SYSTEM_ADMIN']),email=uuid.uuid4().hex+'@example.invalid',password_hash='test-only',full_name='Admin')
  self.workspace=self.insert('workspaces',created_by=self.teacher,name='Class',code=uuid.uuid4().hex[:10])
  self.insert('workspace_members',workspace_id=self.workspace,user_id=self.teacher,member_role='LECTURER')
  self.insert('workspace_members',workspace_id=self.workspace,user_id=self.student,member_role='STUDENT')
  self.project=self.insert('projects',owner_id=self.student,workspace_id=self.workspace,name='Test project')
  self.snapshot=self.insert('source_snapshots',project_id=self.project,artifact_hash='test')
  self.q.execute('DELETE FROM user_notifications')
 def tearDown(self):self.c.rollback();self.q.close()
 def notices(self,who):
  self.q.execute('SELECT title,body,target_path FROM user_notifications WHERE recipient_id=%s ORDER BY created_at,id',(who,));return self.q.fetchall()
 def assignment(self,hours=24):return self.insert('assignments',workspace_id=self.workspace,created_by=self.teacher,title='Assignment',due_at=datetime.now(timezone.utc)+timedelta(hours=hours))
 def submission(self):
  assignment=self.assignment();model=self.insert('model_versions',project_id=self.project,source_snapshot_id=self.snapshot)
  diagram=self.insert('diagram_versions',model_version_id=model,notation='C4',layout_json='{}')
  return self.insert('submission_snapshots',assignment_id=assignment,project_id=self.project,submitted_by=self.student,source_snapshot_id=self.snapshot,model_version_id=model,diagram_version_id=diagram)
 def test_assignment_recipients_are_scoped_and_no_creator_echo(self):
  self.assignment();self.assertEqual(len(self.notices(self.student)),1);self.assertEqual(self.notices(self.teacher),[]);self.assertEqual(self.notices(self.outsider),[])
 def test_business_rollback_removes_notification(self):
  self.q.execute('SAVEPOINT event');self.assignment();self.q.execute('ROLLBACK TO SAVEPOINT event');self.assertEqual(self.notices(self.student),[])
 def test_job_terminal_notifies_owner_and_admin_but_not_other_students(self):
  job=self.insert('jobs',project_id=self.project,source_snapshot_id=self.snapshot,job_type='STATIC_ANALYSIS')
  self.q.execute("UPDATE jobs SET status='FAILED',error_diagnostics='private credential' WHERE id=%s",(job,))
  self.assertEqual(len(self.notices(self.student)),1);self.assertEqual(len(self.notices(self.admin_id)),1);self.assertEqual(self.notices(self.outsider),[])
  self.assertNotIn('private credential',str(self.notices(self.student)))
  self.q.execute("UPDATE jobs SET status='FAILED' WHERE id=%s",(job,));self.assertEqual(len(self.notices(self.student)),1)
 def test_draft_grade_never_notifies_student(self):
  submission=self.submission();self.q.execute('DELETE FROM user_notifications')
  review=self.insert('submission_reviews',submission_id=submission,lecturer_id=self.teacher,status='DRAFT',score=50,summary='private draft')
  self.assertEqual(self.notices(self.student),[])
  self.q.execute("UPDATE submission_reviews SET status='GRADED' WHERE id=%s",(review,));self.assertEqual(len(self.notices(self.student)),1);self.assertNotIn('private draft',str(self.notices(self.student)))
 def test_submission_goes_to_teacher_and_receipt_to_submitter(self):
  self.submission();self.assertTrue(any('submission' in row[0].lower() for row in self.notices(self.teacher)));self.assertTrue(any('Submission received'==row[0] for row in self.notices(self.student)));self.assertEqual(self.notices(self.outsider),[])
 def test_lecturer_submission_action_resolves_only_after_published_review(self):
  submission=self.submission()
  self.q.execute('SELECT action_required,resolved_at,context_label FROM user_notifications WHERE recipient_id=%s AND entity_id=%s',(self.teacher,submission));action,resolved,label=self.q.fetchone()
  self.assertTrue(action);self.assertIsNone(resolved);self.assertEqual(label,'Assignment')
  review=self.insert('submission_reviews',submission_id=submission,lecturer_id=self.teacher,status='DRAFT',summary='draft')
  self.q.execute('SELECT resolved_at FROM user_notifications WHERE recipient_id=%s AND entity_id=%s',(self.teacher,submission));self.assertIsNone(self.q.fetchone()[0])
  self.q.execute("UPDATE submission_reviews SET status='RETURNED' WHERE id=%s",(review,))
  self.q.execute('SELECT resolved_at FROM user_notifications WHERE recipient_id=%s AND entity_id=%s',(self.teacher,submission));self.assertIsNotNone(self.q.fetchone()[0])
 def test_feedback_only_for_submission_author(self):
  submission=self.submission();self.q.execute('DELETE FROM user_notifications')
  self.insert('feedback_comments',submission_id=submission,lecturer_id=self.teacher,comment_text='private feedback')
  self.assertEqual(len(self.notices(self.student)),1);self.assertEqual(self.notices(self.outsider),[]);self.assertNotIn('private feedback',str(self.notices(self.student)))
 def test_runtime_failure_routes_admin_to_operations(self):
  session=self.insert('runtime_sessions',project_id=self.project,source_snapshot_id=self.snapshot)
  self.q.execute("UPDATE runtime_sessions SET execution_status='FAILED' WHERE id=%s",(session,))
  self.assertEqual(len(self.notices(self.student)),1);self.assertTrue(self.notices(self.admin_id)[0][2].startswith('/administration/admin-sessions?session='))
 def test_deadline_reminders_deduplicate_and_no_double_window(self):
  self.assignment(hours=0.5);self.q.execute('DELETE FROM user_notifications');self.q.execute('SELECT mavis_assignment_reminders()');self.q.execute('SELECT mavis_assignment_reminders()')
  self.assertEqual(len(self.notices(self.student)),1)
 def test_already_submitted_student_gets_no_deadline_reminder(self):
  self.submission();self.q.execute('DELETE FROM user_notifications');self.q.execute('SELECT mavis_assignment_reminders()');self.assertEqual(self.notices(self.student),[])
 def test_membership_and_reference_publishing(self):
  self.insert('workspace_members',workspace_id=self.workspace,user_id=self.outsider,member_role='STUDENT');self.assertTrue(self.notices(self.outsider))
  self.q.execute('DELETE FROM user_notifications')
  self.q.execute('UPDATE source_snapshots SET is_published=true WHERE id=%s',(self.snapshot,));self.assertTrue(self.notices(self.outsider));self.assertEqual(self.notices(self.student),[])
 def test_evaluation_links_to_existing_project_route(self):
  model=self.insert('model_versions',project_id=self.project,source_snapshot_id=self.snapshot);self.q.execute('DELETE FROM user_notifications')
  self.insert('evaluation_runs',model_version_id=model,rule_set_version='test');self.assertTrue(self.notices(self.student)[0][2].startswith('/project-overview?'))
 def test_account_change_and_configuration_alert(self):
  self.q.execute("UPDATE users SET status='LOCKED' WHERE id=%s",(self.student,));self.assertEqual(self.notices(self.student),[]);self.assertTrue(self.notices(self.admin_id))
  self.q.execute('DELETE FROM user_notifications');self.insert('audit_logs',actor_id=self.teacher,action='CONFIGURE_INTEGRATION',target_type='INTEGRATION');self.assertTrue(self.notices(self.admin_id))

 def test_health_outage_and_recovery_alert_once(self):
  self.q.execute("SELECT mavis_observe_health('worker','DOWN')");self.q.execute("SELECT mavis_observe_health('worker','DOWN')");self.assertEqual(len(self.notices(self.admin_id)),1)
  self.q.execute("SELECT mavis_observe_health('worker','UP')");self.assertEqual(len(self.notices(self.admin_id)),2);self.assertEqual(self.notices(self.student),[])
 def test_review_withdrawal_and_feedback_deletion_are_not_new_feedback(self):
  submission=self.submission();review=self.insert('submission_reviews',submission_id=submission,lecturer_id=self.teacher,status='GRADED',score=50,summary='published')
  self.q.execute('DELETE FROM user_notifications');self.q.execute("UPDATE submission_reviews SET status='DRAFT' WHERE id=%s",(review,));self.assertEqual(self.notices(self.student)[0][0],'Published review withdrawn')
  comment=self.insert('feedback_comments',submission_id=submission,lecturer_id=self.teacher,comment_text='private')
  self.q.execute('DELETE FROM user_notifications');self.q.execute('DELETE FROM feedback_comments WHERE id=%s',(comment,));self.assertEqual(self.notices(self.student)[0][0],'Lecturer feedback removed')
 def test_password_change_notification_contains_no_hash(self):
  self.q.execute("UPDATE users SET password_hash='never-disclose-this' WHERE id=%s",(self.student,));self.assertEqual(self.notices(self.student)[0][0],'Password changed');self.assertNotIn('never-disclose-this',str(self.notices(self.student)))

if __name__=='__main__':unittest.main(verbosity=2)
