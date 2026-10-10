-- ============================================================================
-- MAVIS - V1__Init_Database.sql (Phiên bản Giáo dục sau Review 1)
-- Flyway baseline migration - PostgreSQL
-- Domains:
--   - Identity & Policy (Users, Workspaces, Memberships)
--   - Learning Workspace (Assignments, Projects, Submissions, Feedback)
--   - Artifact Gateway (Source Snapshots)
--   - Job Orchestrator (Jobs, Attempts)
--   - Model & Diagram (Models, Elements, Relationships, Diagrams, Evidence)
--   - Evaluation (Evaluation Runs, Findings)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- DOMAIN: IDENTITY & POLICY
-- ============================================================================

-- Bảng users: Không dùng bảng roles toàn cục nữa, chỉ đánh dấu system_admin
CREATE TABLE users (
                       id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                       email           VARCHAR(255) NOT NULL UNIQUE,
                       password_hash   VARCHAR(255) NOT NULL,
                       full_name       VARCHAR(255),
                       is_system_admin BOOLEAN NOT NULL DEFAULT false,
                       status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                           CHECK (status IN ('ACTIVE', 'LOCKED')),
                       created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
                       updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bảng workspaces: Không gian lớp học / môn học
CREATE TABLE workspaces (
                            id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                            name            VARCHAR(255) NOT NULL,
                            description     TEXT,
                            created_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
                            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bảng workspace_members: Phân quyền LECTURER / STUDENT theo từng workspace
CREATE TABLE workspace_members (
                                   id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                                   workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                                   user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                                   role            VARCHAR(50) NOT NULL
                                       CHECK (role IN ('LECTURER', 'STUDENT')),
                                   joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
                                   UNIQUE (workspace_id, user_id)
);

-- ============================================================================
-- DOMAIN: LEARNING WORKSPACE
-- ============================================================================

-- Bảng assignments: Đề bài do giảng viên giao
CREATE TABLE assignments (
                             id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                             workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                             title               VARCHAR(255) NOT NULL,
                             description         TEXT,
                             diagram_level       VARCHAR(50), -- e.g., 'C4_CONTAINER'
                             rule_set_version    VARCHAR(50),
                             ai_policy           JSONB,       -- Cấu hình hiển thị gợi ý, AI
                             created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
                             updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bảng projects: Dự án (Của giảng viên tạo làm mẫu hoặc sinh viên làm bài)
CREATE TABLE projects (
                          id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                          workspace_id            UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                          assignment_id           UUID REFERENCES assignments(id) ON DELETE SET NULL,
                          owner_id                UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                          name                    VARCHAR(255) NOT NULL,
                          repository_url          VARCHAR(500),
                          is_reference_template   BOOLEAN NOT NULL DEFAULT false, -- True nếu là project mẫu của giảng viên
                          reference_snapshot_id   UUID, -- Trỏ về bản mẫu nếu fork từ project mẫu
                          status                  VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                              CHECK (status IN ('ACTIVE', 'ARCHIVED', 'DELETED')),
                          created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
                          updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- DOMAIN: ARTIFACT GATEWAY & JOB ORCHESTRATOR
-- ============================================================================

-- Bảng source_snapshots: Bản chụp source code cố định (đảm bảo tính bất biến)
CREATE TABLE source_snapshots (
                                  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                                  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                                  commit_sha      VARCHAR(255),
                                  artifact_hash   VARCHAR(255),
                                  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bảng jobs: Quản lý tiến trình Analysis/Evaluation (Thay cho analysis_sessions)
CREATE TABLE jobs (
                      id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                      project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                      source_snapshot_id  UUID NOT NULL REFERENCES source_snapshots(id) ON DELETE CASCADE,
                      job_type            VARCHAR(50) NOT NULL
                          CHECK (job_type IN ('ANALYSIS', 'EVALUATION', 'EXPLANATION')),
                      status              VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
                      result_manifest     JSONB,
                      error_diagnostics   TEXT,
                      started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
                      completed_at        TIMESTAMPTZ
);

-- ============================================================================
-- DOMAIN: MODEL & DIAGRAM (ARCHITECTURE KNOWLEDGE GRAPH)
-- ============================================================================

-- Bảng model_versions: Lưu trữ các phiên bản của mô hình kiến trúc
CREATE TABLE model_versions (
                                id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                                project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                                source_snapshot_id  UUID NOT NULL REFERENCES source_snapshots(id) ON DELETE RESTRICT,
                                revision            INT NOT NULL DEFAULT 1,
                                schema_version      VARCHAR(50) NOT NULL,
                                origin              VARCHAR(50) NOT NULL
                                    CHECK (origin IN ('GENERATED', 'USER_CONFIRMED')),
                                created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
                                created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bảng elements: Các thành phần của kiến trúc (Containers, Components...)
CREATE TABLE elements (
                          id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                          model_version_id    UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
                          element_type        VARCHAR(50) NOT NULL,
                          name                VARCHAR(255) NOT NULL,
                          scope               VARCHAR(100),
                          properties          JSONB,
                          status              VARCHAR(50) NOT NULL DEFAULT 'DRAFT'
                              CHECK (status IN ('DRAFT', 'NEEDS_REVIEW', 'VALIDATED', 'STUDENT_CONFIRMED'))
);

-- Bảng relationships: Mối quan hệ giữa các elements
CREATE TABLE relationships (
                               id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                               model_version_id    UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
                               source_element_id   UUID NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
                               target_element_id   UUID NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
                               relation_type       VARCHAR(50) NOT NULL,
                               direction           VARCHAR(50),
                               properties          JSONB
);

-- Bảng evidence: Dữ liệu nguồn dẫn chứng cho một Element hoặc Relationship
CREATE TABLE evidence (
                          id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                          source_snapshot_id  UUID NOT NULL REFERENCES source_snapshots(id) ON DELETE CASCADE,
                          element_id          UUID REFERENCES elements(id) ON DELETE CASCADE,
                          relationship_id     UUID REFERENCES relationships(id) ON DELETE CASCADE,
                          locator             VARCHAR(500) NOT NULL, -- File path, trace span ID, vv.
                          adapter_version     VARCHAR(50),
                          source_type         VARCHAR(50) NOT NULL
                              CHECK (source_type IN ('STATIC_CODE', 'CONFIG', 'RUNTIME_TRACE')),
                          excerpt             TEXT,
                          CONSTRAINT chk_evidence_target CHECK (element_id IS NOT NULL OR relationship_id IS NOT NULL)
);

-- Bảng diagram_versions: Lưu trữ hiển thị đồ họa của Model (Sơ đồ vẽ)
CREATE TABLE diagram_versions (
                                  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                                  model_version_id    UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
                                  notation            VARCHAR(50) NOT NULL, -- e.g., 'C4', 'UML_SEQUENCE'
                                  level               VARCHAR(50),
                                  layout_json         JSONB NOT NULL,       -- Tọa độ x, y, shapes
                                  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- DOMAIN: EVALUATION & SUBMISSION
-- ============================================================================

-- Bảng evaluation_runs: Kết quả chạy rule set
CREATE TABLE evaluation_runs (
                                 id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                                 model_version_id    UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
                                 rule_set_version    VARCHAR(50) NOT NULL,
                                 runtime_session_id  UUID, -- (Tuỳ chọn) Nếu có đối chiếu runtime
                                 created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bảng evaluation_findings: Chi tiết các lỗi/vi phạm hoặc Pass
CREATE TABLE evaluation_findings (
                                     id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                                     evaluation_run_id   UUID NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
                                     element_id          UUID REFERENCES elements(id) ON DELETE CASCADE,
                                     relationship_id     UUID REFERENCES relationships(id) ON DELETE CASCADE,
                                     rule_id             VARCHAR(100) NOT NULL,
                                     status              VARCHAR(50) NOT NULL
                                         CHECK (status IN ('PASS', 'VIOLATION', 'NEEDS_REVIEW', 'NOT_APPLICABLE')),
                                     message             TEXT NOT NULL
);

-- Bảng submission_snapshots: Gói nộp bài của sinh viên (Bất biến)
CREATE TABLE submission_snapshots (
                                      id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                                      assignment_id       UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
                                      project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                                      submitted_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                                      model_version_id    UUID NOT NULL REFERENCES model_versions(id) ON DELETE RESTRICT,
                                      diagram_version_id  UUID NOT NULL REFERENCES diagram_versions(id) ON DELETE RESTRICT,
                                      evaluation_run_id   UUID REFERENCES evaluation_runs(id) ON DELETE RESTRICT,
                                      submitted_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bảng feedbacks: Nhận xét của giảng viên trên bài nộp
CREATE TABLE feedbacks (
                           id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                           submission_id       UUID NOT NULL REFERENCES submission_snapshots(id) ON DELETE CASCADE,
                           lecturer_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                           element_id          UUID REFERENCES elements(id) ON DELETE CASCADE,
                           relationship_id     UUID REFERENCES relationships(id) ON DELETE CASCADE,
                           comment_text        TEXT NOT NULL,
                           created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- DATA MẪU (SEED DATA)
-- ============================================================================
INSERT INTO users (email, password_hash, full_name, is_system_admin) VALUES
                                                                         ('admin@mavis.edu.vn', 'hashed_pwd', 'System Admin', true),
                                                                         ('lecturer@fpt.edu.vn', 'hashed_pwd', 'Nguyen The Hoang', false);

-- ============================================================================
-- INDEXES 
-- ============================================================================

-- Bảng Workspace & Project
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX idx_projects_workspace ON projects(workspace_id);
CREATE INDEX idx_projects_owner ON projects(owner_id);

-- Snapshot & Jobs
CREATE INDEX idx_source_snapshots_project ON source_snapshots(project_id);
CREATE INDEX idx_jobs_project ON jobs(project_id);

-- Model & Evidence
CREATE INDEX idx_model_versions_project ON model_versions(project_id);
CREATE INDEX idx_elements_model ON elements(model_version_id);
CREATE INDEX idx_relationships_model ON relationships(model_version_id);
CREATE INDEX idx_evidence_element ON evidence(element_id);
CREATE INDEX idx_evidence_relationship ON evidence(relationship_id);

-- Evaluation & Submission
CREATE INDEX idx_evaluation_runs_model ON evaluation_runs(model_version_id);
CREATE INDEX idx_evaluation_findings_run ON evaluation_findings(evaluation_run_id);
CREATE INDEX idx_submissions_assignment ON submission_snapshots(assignment_id);
CREATE INDEX idx_submissions_project ON submission_snapshots(project_id);
CREATE INDEX idx_feedbacks_submission ON feedbacks(submission_id);