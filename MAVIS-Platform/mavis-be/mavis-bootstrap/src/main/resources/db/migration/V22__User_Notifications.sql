-- In-app inbox. Event delivery is transactional: rolled-back business changes emit nothing.
CREATE TABLE user_notifications (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 event_key VARCHAR(240) NOT NULL,
 category VARCHAR(24) NOT NULL CHECK (category IN ('WORKSPACE','ASSIGNMENT','SUBMISSION','ANALYSIS','RUNTIME','ACCOUNT','SYSTEM')),
 title VARCHAR(160) NOT NULL, body VARCHAR(500) NOT NULL,
 target_path VARCHAR(500) NOT NULL CHECK (target_path LIKE '/%' AND target_path NOT LIKE '//%'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), read_at TIMESTAMPTZ,
 UNIQUE(recipient_id,event_key)
);
CREATE INDEX idx_notifications_inbox ON user_notifications(recipient_id,created_at DESC,id DESC);
CREATE INDEX idx_notifications_unread ON user_notifications(recipient_id,created_at DESC) WHERE read_at IS NULL;

CREATE FUNCTION mavis_notify(who UUID, event TEXT, cat TEXT, heading TEXT, detail TEXT, link TEXT) RETURNS void LANGUAGE sql AS $$
 INSERT INTO user_notifications(recipient_id,event_key,category,title,body,target_path)
 SELECT u.id,left(event,240),cat,left(heading,160),left(detail,500),left(link,500)
 FROM users u WHERE u.id=who AND u.status='ACTIVE'
 ON CONFLICT(recipient_id,event_key) DO NOTHING;
$$;
CREATE FUNCTION mavis_notify_admins(event TEXT, heading TEXT, detail TEXT, link TEXT, excluded UUID DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
 SELECT mavis_notify(u.id,event,'SYSTEM',heading,detail,link) FROM users u JOIN roles r ON r.id=u.role_id
 WHERE r.code='SYSTEM_ADMIN' AND u.status='ACTIVE' AND (excluded IS NULL OR u.id<>excluded);
$$;
CREATE FUNCTION mavis_notify_workspace(workspace UUID, event TEXT, cat TEXT, heading TEXT, detail TEXT, link TEXT, only_teachers BOOLEAN DEFAULT false, excluded UUID DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
 SELECT mavis_notify(w.user_id,event,cat,heading,detail,link) FROM (
 SELECT wm.user_id FROM workspace_members wm WHERE wm.workspace_id=workspace AND (NOT only_teachers OR wm.member_role IN ('LECTURER','OWNER'))
 UNION SELECT ws.created_by FROM workspaces ws WHERE ws.id=workspace
 ) w WHERE excluded IS NULL OR w.user_id<>excluded;
$$;
CREATE FUNCTION mavis_business_notifications() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n JSONB; o JSONB; eid UUID; pid UUID; wid UUID; recipient UUID; actor UUID; label TEXT; key TEXT; link TEXT; status TEXT;
BEGIN
 n:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 o:=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
 eid:=(n->>'id')::uuid; key:=TG_TABLE_NAME||':'||eid||':'||txid_current()||':'||TG_OP;
 IF TG_TABLE_NAME='assignments' THEN
   IF TG_OP='UPDATE' AND (n-'updated_at')=(o-'updated_at') THEN RETURN NEW; END IF;
   wid:=(n->>'workspace_id')::uuid; actor:=(n->>'created_by')::uuid;
   PERFORM mavis_notify_workspace(wid,key,'ASSIGNMENT',CASE WHEN TG_OP='INSERT' THEN 'New assignment' WHEN TG_OP='DELETE' THEN 'Assignment removed' ELSE 'Assignment updated' END,
    coalesce(n->>'title','Assignment')||CASE WHEN TG_OP='DELETE' THEN ' was removed.' ELSE '. Review the instructions and deadline.' END,
    '/assignments?workspace='||wid,false,actor);
 ELSIF TG_TABLE_NAME='workspace_members' THEN
   IF TG_OP='UPDATE' AND n->>'member_role'=o->>'member_role' THEN RETURN NEW; END IF;
   wid:=(n->>'workspace_id')::uuid;recipient:=(n->>'user_id')::uuid;
   SELECT name INTO label FROM workspaces WHERE id=wid;
   PERFORM mavis_notify(recipient,key,'WORKSPACE',CASE WHEN TG_OP='DELETE' THEN 'Workspace access removed' WHEN TG_OP='INSERT' THEN 'Added to workspace' ELSE 'Workspace role changed' END,coalesce(label,'Workspace')||'. Review your workspace access.','/workspaces');
   IF TG_OP='INSERT' THEN PERFORM mavis_notify_workspace(wid,key||':staff','WORKSPACE','Workspace member joined','A member has joined '||coalesce(label,'your workspace')||'.','/members?workspace='||wid,true,recipient);END IF;
 ELSIF TG_TABLE_NAME='workspaces' AND TG_OP='UPDATE' THEN
   IF n->>'status' IS DISTINCT FROM o->>'status' THEN
    PERFORM mavis_notify_workspace(eid,key,'WORKSPACE','Workspace status changed',coalesce(n->>'name','Workspace')||' is now '||(n->>'status')||'.','/workspaces',false,(n->>'created_by')::uuid);
   END IF;
 ELSIF TG_TABLE_NAME='submission_snapshots' AND TG_OP='INSERT' THEN
   SELECT a.workspace_id INTO wid FROM assignments a WHERE a.id=(n->>'assignment_id')::uuid;
   PERFORM mavis_notify_workspace(wid,key,'SUBMISSION','New submission received','A student has submitted an assignment for review.','/submissions/'||eid,true,(n->>'submitted_by')::uuid);
   PERFORM mavis_notify((n->>'submitted_by')::uuid,key||':receipt','SUBMISSION','Submission received','Your assignment submission has been saved.','/submissions/'||eid);
 ELSIF TG_TABLE_NAME IN ('feedback_comments','submission_reviews') THEN
   IF TG_TABLE_NAME='submission_reviews' AND n->>'status' NOT IN ('RETURNED','GRADED') THEN
    IF TG_OP='UPDATE' AND o->>'status' IN ('RETURNED','GRADED') THEN
     SELECT submitted_by INTO recipient FROM submission_snapshots WHERE id=(n->>'submission_id')::uuid;
     PERFORM mavis_notify(recipient,key,'SUBMISSION','Published review withdrawn','Your lecturer has withdrawn a published review.','/submissions/'||(n->>'submission_id'));
    END IF;
    RETURN NEW;
   END IF;
   IF TG_OP='UPDATE' AND n=o THEN RETURN NEW; END IF;
   IF TG_TABLE_NAME='feedback_comments' AND TG_OP='UPDATE' AND n->>'comment_text' IS NOT DISTINCT FROM o->>'comment_text' THEN RETURN NEW; END IF;
   SELECT submitted_by INTO recipient FROM submission_snapshots WHERE id=(n->>'submission_id')::uuid;
   PERFORM mavis_notify(recipient,key,'SUBMISSION',CASE WHEN TG_OP='DELETE' THEN 'Lecturer feedback removed' WHEN TG_TABLE_NAME='submission_reviews' THEN 'Submission review published' ELSE 'New lecturer feedback' END,'Your lecturer has updated your feedback. Open the submission to review the latest state.','/submissions/'||(n->>'submission_id'));
 ELSIF TG_TABLE_NAME='users' AND TG_OP='UPDATE' THEN
   IF n->>'status' IS DISTINCT FROM o->>'status' OR n->>'role_id' IS DISTINCT FROM o->>'role_id' THEN
    PERFORM mavis_notify(eid,key,'ACCOUNT','Account access updated','Your account role or access status has changed. Sign in again to refresh your permissions.','/profile');
    PERFORM mavis_notify_admins(key,'Account access changed','An account role or status was changed. Review the administrative audit log.','/administration/audit',eid);
   END IF;
   IF n->>'password_hash' IS DISTINCT FROM o->>'password_hash' THEN
    PERFORM mavis_notify(eid,key||':password','ACCOUNT','Password changed','The password for your account has changed. Contact your administrator if this was not you.','/profile');
   END IF;
 ELSIF TG_TABLE_NAME='audit_logs' AND TG_OP='INSERT' THEN
   IF n->>'action' IN ('CONFIGURE_INTEGRATION','CONFIGURE_RUNNER_PROFILE') THEN
    PERFORM mavis_notify_admins(key,'Platform configuration changed','An integration or runtime profile was changed. Review the audit trail.','/administration/audit',(n->>'actor_id')::uuid);
   END IF;
 ELSIF TG_TABLE_NAME IN ('jobs','runtime_sessions','source_snapshots','model_versions','evaluation_runs','projects') THEN
   pid:=CASE WHEN TG_TABLE_NAME='projects' THEN eid ELSE (n->>'project_id')::uuid END;
   IF TG_TABLE_NAME='evaluation_runs' THEN SELECT project_id INTO pid FROM model_versions WHERE id=(n->>'model_version_id')::uuid; END IF;
   SELECT owner_id,name,workspace_id INTO recipient,label,wid FROM projects WHERE id=pid;
   IF recipient IS NULL THEN RETURN NEW; END IF;
   IF TG_TABLE_NAME='jobs' AND TG_OP='UPDATE' AND n->>'status' IS DISTINCT FROM o->>'status' AND n->>'status' IN ('COMPLETED','FAILED','CANCELLED','TIMED_OUT') THEN
    status:=n->>'status';link:='/analysis-history?project='||pid;
    PERFORM mavis_notify(recipient,key,'ANALYSIS',CASE WHEN status='FAILED' THEN 'Analysis failed' WHEN status='CANCELLED' THEN 'Analysis cancelled' ELSE 'Analysis finished' END,coalesce(label,'Project')||'. Open the result to review the outcome.',link);
    IF status IN ('FAILED','TIMED_OUT') THEN PERFORM mavis_notify_admins(key||':ops','Analysis job needs attention','A source analysis job failed or timed out.','/administration/jobs',recipient); END IF;
   ELSIF TG_TABLE_NAME='runtime_sessions' AND TG_OP='UPDATE' THEN
    status:=n->>'execution_status';link:='/sessions?project='||pid||'&session='||eid;
    IF (status IS DISTINCT FROM o->>'execution_status' AND status IN ('COMPLETED','FAILED','TIMED_OUT','CANCELLED','TERMINATED','REJECTED')) OR (n->>'cleanup_status' IS DISTINCT FROM o->>'cleanup_status' AND n->>'cleanup_status'='FAILED') THEN
     PERFORM mavis_notify(recipient,key,'RUNTIME','Runtime session updated',coalesce(label,'Project')||'. Execution: '||coalesce(status,'unknown')||'. Review evidence and cleanup.',link);
     IF status IN ('FAILED','TIMED_OUT','REJECTED') OR n->>'cleanup_status'='FAILED' THEN PERFORM mavis_notify_admins(key||':ops','Runtime needs attention','A runtime session failed or cleanup requires review.','/administration/admin-sessions?session='||eid,recipient); END IF;
    END IF;
   ELSIF TG_TABLE_NAME='source_snapshots' AND TG_OP='UPDATE' AND n->>'is_published'='true' AND o->>'is_published' IS DISTINCT FROM 'true' THEN
    PERFORM mavis_notify_workspace(wid,key,'ASSIGNMENT','Reference source published','A reference source snapshot is available in your workspace.','/references?workspace='||wid,false,recipient);
   ELSIF TG_TABLE_NAME='model_versions' AND TG_OP='INSERT' THEN
    PERFORM mavis_notify(recipient,key,'ANALYSIS','Architecture model available',coalesce(label,'Project')||'. A new model revision is available for review.','/architecture?project='||pid||'&model='||eid);
   ELSIF TG_TABLE_NAME='evaluation_runs' AND TG_OP='INSERT' THEN
    PERFORM mavis_notify(recipient,key,'ANALYSIS','Evaluation available','Architecture checks are available. Review findings and supporting evidence.','/project-overview?project='||pid);
   ELSIF TG_TABLE_NAME='projects' AND TG_OP='UPDATE' AND n->>'status' IS DISTINCT FROM o->>'status' THEN
    PERFORM mavis_notify(recipient,key,'ACCOUNT','Project status changed',coalesce(label,'Project')||' is now '||(n->>'status')||'.','/');
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['assignments','workspace_members','workspaces','submission_snapshots','feedback_comments','submission_reviews','users','audit_logs','jobs','runtime_sessions','source_snapshots','model_versions','evaluation_runs','projects'] LOOP
  EXECUTE format('CREATE TRIGGER mavis_notifications_%I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION mavis_business_notifications()',t,t);
 END LOOP;
END $$;
-- Reminders are deduplicated per assignment/deadline/window and exclude submitted students.
CREATE FUNCTION mavis_assignment_reminders() RETURNS void LANGUAGE sql AS $$
 INSERT INTO user_notifications(recipient_id,event_key,category,title,body,target_path)
 SELECT DISTINCT wm.user_id,'due:'||a.id||':'||extract(epoch FROM a.due_at)::text||':'||due_window.hours,'ASSIGNMENT',
  'Assignment due soon',left(a.title||CASE WHEN due_window.hours=1 THEN ' is due within one hour.' ELSE ' is due within 24 hours.' END,500),'/assignments?workspace='||a.workspace_id
 FROM assignments a JOIN workspaces w ON w.id=a.workspace_id AND w.status='ACTIVE'
 JOIN workspace_members wm ON wm.workspace_id=a.workspace_id AND wm.member_role='STUDENT'
 JOIN users u ON u.id=wm.user_id AND u.status='ACTIVE'
 CROSS JOIN (VALUES (24),(1)) AS due_window(hours)
 WHERE a.due_at>now() AND a.due_at<=now()+make_interval(hours=>due_window.hours)
 AND (due_window.hours=1 OR a.due_at>now()+interval '1 hour')
 AND NOT EXISTS(SELECT 1 FROM submission_snapshots ss WHERE ss.assignment_id=a.id AND ss.submitted_by=wm.user_id)
 ON CONFLICT(recipient_id,event_key) DO NOTHING;
$$;

-- Last observed health state prevents repeated alerts while an outage is unchanged.
CREATE TABLE notification_health_states(service_id VARCHAR(80) PRIMARY KEY,status VARCHAR(16) NOT NULL,checked_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE FUNCTION mavis_observe_health(service TEXT, current_status TEXT) RETURNS void LANGUAGE plpgsql AS $$
DECLARE previous TEXT;
BEGIN
 IF service NOT IN ('backend','database','worker','storage') OR current_status NOT IN ('UP','DOWN','WARNING','UNKNOWN','DISABLED') THEN RETURN; END IF;
 INSERT INTO notification_health_states(service_id,status) VALUES(service,'UNKNOWN') ON CONFLICT DO NOTHING;
 SELECT status INTO previous FROM notification_health_states WHERE service_id=service FOR UPDATE;
 UPDATE notification_health_states SET status=current_status,checked_at=now() WHERE service_id=service;
 IF current_status IN ('DOWN','WARNING') AND previous IS DISTINCT FROM current_status THEN
  PERFORM mavis_notify_admins('health:'||service||':'||current_status||':'||txid_current(),'Service needs attention',service||' health check reports '||current_status||'. Review System Health.','/administration/health');
 ELSIF current_status='UP' AND previous IN ('DOWN','WARNING') THEN
  PERFORM mavis_notify_admins('health:'||service||':'||current_status||':'||txid_current(),'Service recovered',service||' is responding again.','/administration/health');
 END IF;
END;
$$;
