-- Lecturer inboxes represent submission work, not general system activity.
-- Keep read/unread for presentation and track completion independently.
ALTER TABLE user_notifications
    ADD COLUMN IF NOT EXISTS action_required BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS entity_id UUID,
    ADD COLUMN IF NOT EXISTS assignment_id UUID,
    ADD COLUMN IF NOT EXISTS workspace_id UUID,
    ADD COLUMN IF NOT EXISTS context_label VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_notifications_pending_actions
    ON user_notifications(recipient_id, created_at DESC)
    WHERE action_required AND resolved_at IS NULL;

-- Lecturer notifications deliberately contain only student submission work.
-- Operational failures stay on their owning screen and are surfaced by the UI
-- as a toast/dialog instead of becoming permanent inbox noise.
CREATE OR REPLACE FUNCTION mavis_notify(who UUID, event TEXT, cat TEXT, heading TEXT, detail TEXT, link TEXT) RETURNS void LANGUAGE sql AS $$
 INSERT INTO user_notifications(recipient_id,event_key,category,title,body,target_path)
 SELECT u.id,left(event,240),cat,left(heading,160),left(detail,500),left(link,500)
 FROM users u
 JOIN roles r ON r.id = u.role_id
 WHERE u.id = who
   AND u.status = 'ACTIVE'
   AND ((cat <> 'SYSTEM' AND link NOT LIKE '/administration%') OR r.code = 'SYSTEM_ADMIN')
   AND (r.code <> 'LECTURER' OR (cat = 'SUBMISSION' AND heading = 'New submission received'))
 ON CONFLICT(recipient_id,event_key) DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION mavis_classify_notification() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE recipient_role TEXT; submission UUID;
BEGIN
  SELECT r.code INTO recipient_role
  FROM users u JOIN roles r ON r.id = u.role_id
  WHERE u.id = NEW.recipient_id;

  IF recipient_role = 'LECTURER'
     AND NEW.category = 'SUBMISSION'
     AND NEW.title = 'New submission received'
     AND NEW.target_path ~ '^/submissions/[0-9a-fA-F-]{36}$' THEN
    submission := substring(NEW.target_path from '/submissions/([0-9a-fA-F-]{36})$')::uuid;
    NEW.action_required := true;
    NEW.entity_id := submission;
    SELECT s.assignment_id, a.workspace_id, a.title
      INTO NEW.assignment_id, NEW.workspace_id, NEW.context_label
    FROM submission_snapshots s
    JOIN assignments a ON a.id = s.assignment_id
    WHERE s.id = submission;
    NEW.target_path := '/submissions?workspace=' || NEW.workspace_id ||
                       '&assignment=' || NEW.assignment_id || '&status=PENDING';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_classify_notification ON user_notifications;
CREATE TRIGGER trg_classify_notification
BEFORE INSERT ON user_notifications
FOR EACH ROW EXECUTE FUNCTION mavis_classify_notification();

-- Classify historical Lecturer submission notifications so the migration is
-- immediately useful without replaying business events.
UPDATE user_notifications n
SET action_required = true,
    entity_id = s.id,
    assignment_id = s.assignment_id,
    workspace_id = a.workspace_id,
    context_label = a.title,
    target_path = '/submissions?workspace=' || a.workspace_id ||
                  '&assignment=' || s.assignment_id || '&status=PENDING'
FROM users u
JOIN roles r ON r.id = u.role_id
JOIN submission_snapshots s ON true
JOIN assignments a ON a.id = s.assignment_id
WHERE n.recipient_id = u.id
  AND n.target_path = '/submissions/' || s.id
  AND r.code = 'LECTURER'
  AND n.category = 'SUBMISSION'
  AND n.title = 'New submission received';

UPDATE user_notifications n
SET resolved_at = coalesce(n.resolved_at, sr.updated_at)
FROM submission_reviews sr
WHERE n.entity_id = sr.submission_id
  AND n.action_required
  AND sr.status IN ('RETURNED', 'GRADED');

CREATE OR REPLACE FUNCTION mavis_resolve_submission_notification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('RETURNED', 'GRADED') THEN
    UPDATE user_notifications
       SET resolved_at = coalesce(resolved_at, now())
     WHERE entity_id = NEW.submission_id AND action_required;
  ELSIF NEW.status = 'DRAFT' THEN
    UPDATE user_notifications
       SET resolved_at = NULL
     WHERE entity_id = NEW.submission_id AND action_required;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resolve_submission_notification ON submission_reviews;
CREATE TRIGGER trg_resolve_submission_notification
AFTER INSERT OR UPDATE OF status ON submission_reviews
FOR EACH ROW EXECUTE FUNCTION mavis_resolve_submission_notification();
