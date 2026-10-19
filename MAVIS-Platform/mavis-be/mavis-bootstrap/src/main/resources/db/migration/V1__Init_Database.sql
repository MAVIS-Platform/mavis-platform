-- ============================================================================
-- MAVIS - V1__Init_Database.sql (Phiên bản Giáo dục & Runtime sau Review 1)
-- Flyway Baseline Migration - PostgreSQL
-- Đồng bộ 100% với Sơ đồ ERD & Sơ đồ Kiến trúc Hệ thống (System Architecture)
-- Domains:
--   1. Identity, Role & Policy (roles, users, workspaces, workspace_members, audit_logs)
--   2. Learning Workspace (assignments, projects)
--   3. Artifact Gateway & Job Orchestrator (source_snapshots, jobs, runtime_sessions)
--   4. Canonical Model, Diagram & AI (model_versions, model_elements, model_relationships,
--                                     evidences, diagram_versions, ai_explanations)
--   5. Evaluation, Submission & Feedback (evaluation_runs, evaluation_findings,
--                                         submission_snapshots, feedback_comments)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- DOMAIN 1: IDENTITY, ROLE & POLICY
-- ============================================================================

-- 1. Bảng roles: Quản lý vai trò toàn cục trên hệ thống (Khớp với thực thể 'role' trên ERD)
CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code            VARCHAR(50) NOT NULL UNIQUE
        CHECK (code IN ('SYSTEM_ADMIN', 'LECTURER', 'STUDENT')),
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Bảng users: Tài khoản người dùng (Liên kết N-1 với bảng roles)
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'LOCKED', 'INACTIVE')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Bảng workspaces: Không gian lớp học / môn học
CREATE TABLE workspaces (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code            VARCHAR(50) UNIQUE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    created_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Bảng workspace_members: Phân quyền LECTURER / STUDENT theo từng lớp học (Workspace)
CREATE TABLE workspace_members (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    member_role     VARCHAR(50) NOT NULL
        CHECK (member_role IN ('LECTURER', 'STUDENT')),
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, user_id)
);

-- ============================================================================
-- DOMAIN 2: LEARNING WORKSPACE (ASSIGNMENTS & PROJECTS)
-- ============================================================================

-- 5. Bảng assignments: Đề bài kiến trúc do Giảng viên giao trong Workspace
CREATE TABLE assignments (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id            UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by              UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title                   VARCHAR(255) NOT NULL,
    description             TEXT,
    required_diagram_types  JSONB,          -- Danh sách sơ đồ yêu cầu (VD: ["C4_CONTAINER", "RUNTIME_SEQUENCE"])
    rule_set_version        VARCHAR(50),
    require_runtime_trace   BOOLEAN NOT NULL DEFAULT false,
    ai_policy               JSONB,          -- Cấu hình phạm vi hỗ trợ giải thích của AI
    due_at                  TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Bảng projects: Dự án (Hỗ trợ cả Dự án Cá nhân lẫn Dự án trong Workspace/Assignment)
CREATE TABLE projects (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id            UUID REFERENCES workspaces(id) ON DELETE CASCADE,   -- Nullable để hỗ trợ Personal Project
    assignment_id           UUID REFERENCES assignments(id) ON DELETE SET NULL,
    owner_id                UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name                    VARCHAR(255) NOT NULL,
    description             TEXT,
    repository_url          VARCHAR(500),
    default_branch          VARCHAR(100),
    project_type            VARCHAR(50) NOT NULL DEFAULT 'STUDENT_WORKING'
        CHECK (project_type IN ('PERSONAL', 'TEACHER_REFERENCE', 'STUDENT_WORKING')),
    is_reference_template   BOOLEAN NOT NULL DEFAULT false,
    reference_snapshot_id   UUID,           -- Sẽ gắn FK tới source_snapshots(id) bên dưới
    status                  VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'ARCHIVED', 'DELETED')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- DOMAIN 3: ARTIFACT GATEWAY, JOB ORCHESTRATOR & RUNTIME SANDBOX
-- ============================================================================

-- 7. Bảng source_snapshots: Bản chụp mã nguồn bất biến (GitHub Commit SHA hoặc ZIP SHA-256)
CREATE TABLE source_snapshots (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_type         VARCHAR(30) NOT NULL DEFAULT 'GITHUB_COMMIT'
        CHECK (source_type IN ('GITHUB_COMMIT', 'ZIP_UPLOAD')),
    branch_name         VARCHAR(100),
    commit_sha          VARCHAR(255),
    artifact_hash       VARCHAR(255) NOT NULL,  -- SHA-256 hash đảm bảo tính toàn vẹn
    storage_path        VARCHAR(500),           -- Đường dẫn file trên Artifact Storage
    is_published        BOOLEAN NOT NULL DEFAULT false, -- Cho phép Giảng viên publish bản mẫu
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bổ sung khóa ngoại từ projects.reference_snapshot_id trỏ về source_snapshots(id)
ALTER TABLE projects
    ADD CONSTRAINT fk_projects_reference_snapshot
    FOREIGN KEY (reference_snapshot_id) REFERENCES source_snapshots(id) ON DELETE SET NULL;

-- 8. Bảng runtime_sessions: Phiên chạy thực nghiệm kịch bản trong Docker Sandbox & OpenTelemetry
CREATE TABLE runtime_sessions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_snapshot_id  UUID NOT NULL REFERENCES source_snapshots(id) ON DELETE CASCADE,
    triggered_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    profile_name        VARCHAR(100),           -- VD: 'SPRING_BOOT_DOTNET_COMPOSE_V1'
    scenario_name       VARCHAR(255),
    scenario_config     JSONB,                  -- Cấu hình HTTP requests kịch bản (đã ẩn secret)
    scenario_status     VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (scenario_status IN ('PENDING', 'APPROVED', 'RUNNING', 'PASSED', 'FAILED', 'TIMEOUT', 'CANCELLED')),
    trace_status        VARCHAR(30) NOT NULL DEFAULT 'NONE'
        CHECK (trace_status IN ('NONE', 'COMPLETE', 'PARTIAL', 'UNMAPPED')),
    trace_storage_path  VARCHAR(500),           -- Đường dẫn lưu OTLP trace spans đã redact
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Bảng jobs: Quản lý tiến trình bất đồng bộ (Analysis, Runtime, Evaluation, AI Explanation)
CREATE TABLE jobs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_snapshot_id  UUID NOT NULL REFERENCES source_snapshots(id) ON DELETE CASCADE,
    job_type            VARCHAR(50) NOT NULL
        CHECK (job_type IN ('STATIC_ANALYSIS', 'RUNTIME_EXECUTION', 'EVALUATION', 'IMPACT_ANALYSIS', 'AI_EXPLANATION')),
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    result_manifest     JSONB,
    error_diagnostics   TEXT,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ
);

-- ============================================================================
-- DOMAIN 4: CANONICAL ARCHITECTURE MODEL, DIAGRAM & AI EXPLANATION
-- ============================================================================

-- 10. Bảng model_versions: Phiên bản Mô hình Kiến trúc Chung (Canonical Architectural Model)
CREATE TABLE model_versions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_snapshot_id  UUID NOT NULL REFERENCES source_snapshots(id) ON DELETE RESTRICT,
    runtime_session_id  UUID REFERENCES runtime_sessions(id) ON DELETE SET NULL,
    revision            INT NOT NULL DEFAULT 1,
    schema_version      VARCHAR(50) NOT NULL DEFAULT '1.0',
    origin              VARCHAR(50) NOT NULL DEFAULT 'GENERATED'
        CHECK (origin IN ('GENERATED', 'USER_CONFIRMED', 'RUNTIME_ENRICHED')),
    is_latest_valid     BOOLEAN NOT NULL DEFAULT true,
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, revision)
);

-- 11. Bảng model_elements: Các phần tử kiến trúc (Đổi từ 'elements' -> 'model_elements' khớp 100% ERD)
CREATE TABLE model_elements (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_version_id    UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
    parent_element_id   UUID REFERENCES model_elements(id) ON DELETE CASCADE, -- Hỗ trợ phân cấp C4 (System -> Container -> Component -> Code)
    element_type        VARCHAR(50) NOT NULL
        CHECK (element_type IN ('SYSTEM', 'SERVICE_CONTAINER', 'COMPONENT', 'CLASS_INTERFACE', 'DATABASE', 'EXTERNAL_SYSTEM', 'QUEUE_BROKER')),
    language_stack      VARCHAR(50),            -- VD: 'JAVA_SPRING', 'CSHARP_DOTNET', 'POSTGRESQL'
    name                VARCHAR(255) NOT NULL,
    scope               VARCHAR(100),
    properties          JSONB,
    status              VARCHAR(50) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'NEEDS_REVIEW', 'VALIDATED', 'STUDENT_CONFIRMED', 'UNCERTAIN_MAPPING')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. Bảng model_relationships: Các mối quan hệ phụ thuộc (Đổi từ 'relationships' -> 'model_relationships' khớp 100% ERD)
CREATE TABLE model_relationships (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_version_id    UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
    source_element_id   UUID NOT NULL REFERENCES model_elements(id) ON DELETE CASCADE,
    target_element_id   UUID NOT NULL REFERENCES model_elements(id) ON DELETE CASCADE,
    relation_type       VARCHAR(50) NOT NULL
        CHECK (relation_type IN ('SERVICE_HTTP_CALL', 'CODE_DEPENDENCY', 'DATABASE_ACCESS', 'RUNTIME_OBSERVED', 'DECLARED_COMPOSE')),
    origin_layer        VARCHAR(30) NOT NULL DEFAULT 'STATIC'
        CHECK (origin_layer IN ('STATIC', 'DEPLOYMENT', 'RUNTIME', 'STATIC_AND_RUNTIME')),
    direction           VARCHAR(50) DEFAULT 'DIRECTED',
    properties          JSONB,                  -- Chứa HTTP method, endpoint path, latency, status_code...
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. Bảng evidences: Bằng chứng mã nguồn, cấu hình & vết thực thi (Đổi từ 'evidence' -> 'evidences' khớp 100% ERD)
CREATE TABLE evidences (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_snapshot_id  UUID NOT NULL REFERENCES source_snapshots(id) ON DELETE CASCADE,
    model_version_id    UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
    element_id          UUID REFERENCES model_elements(id) ON DELETE CASCADE,
    relationship_id     UUID REFERENCES model_relationships(id) ON DELETE CASCADE,
    runtime_session_id  UUID REFERENCES runtime_sessions(id) ON DELETE SET NULL,
    locator             VARCHAR(500) NOT NULL,  -- Đường dẫn file:dòng code hoặc OpenTelemetry trace_id/span_id
    adapter_version     VARCHAR(50),            -- VD: 'JAVAPARSER_3.25', 'ROSLYN_4.8', 'OTEL_COLLECTOR_1.0'
    source_type         VARCHAR(50) NOT NULL
        CHECK (source_type IN ('STATIC_CODE', 'CONFIG_FILE', 'DOCKER_COMPOSE', 'RUNTIME_TRACE')),
    excerpt             TEXT,                   -- Đoạn code hoặc span payload đã qua bộ lọc khử Secret
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_evidences_target CHECK (element_id IS NOT NULL OR relationship_id IS NOT NULL)
);

-- 14. Bảng diagram_versions: Lưu trữ bố cục tọa độ sơ đồ C4 / 4+1 / Dependency Graph
CREATE TABLE diagram_versions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_version_id    UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
    notation            VARCHAR(50) NOT NULL
        CHECK (notation IN ('DEPENDENCY_GRAPH', 'C4', 'VIEW_4_PLUS_1', 'UML_SEQUENCE')),
    level               VARCHAR(50),            -- VD: 'CONTEXT', 'CONTAINER', 'COMPONENT', 'CODE', 'RUNTIME_PROCESS'
    layout_json         JSONB NOT NULL,         -- Tọa độ node (x, y), style, filter layers
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 15. Bảng ai_explanations: Lịch sử giải thích của AI có kiểm soát (Bổ sung mới để khớp 100% với ERD)
CREATE TABLE ai_explanations (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_version_id        UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
    element_id              UUID REFERENCES model_elements(id) ON DELETE CASCADE,
    relationship_id         UUID REFERENCES model_relationships(id) ON DELETE CASCADE,
    runtime_session_id      UUID REFERENCES runtime_sessions(id) ON DELETE SET NULL,
    requested_by            UUID REFERENCES users(id) ON DELETE SET NULL,
    explanation_scope       VARCHAR(50) NOT NULL
        CHECK (explanation_scope IN ('ELEMENT', 'RELATIONSHIP', 'DIAGRAM_VIEW', 'RUNTIME_TRACE', 'CHANGE_IMPACT', 'RULE_FINDING')),
    explanation_text        TEXT NOT NULL,
    cited_evidence_ids      JSONB NOT NULL DEFAULT '[]'::jsonb, -- Danh sách ID bảng evidences được AI trích dẫn
    secret_redacted         BOOLEAN NOT NULL DEFAULT true,      -- Xác nhận đã chạy Secret Redaction Filter
    ai_model_name           VARCHAR(100),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- DOMAIN 5: EVALUATION, SUBMISSION & FEEDBACK
-- ============================================================================

-- 16. Bảng evaluation_runs: Lượt kiểm tra quy tắc kiến trúc & đối chiếu Runtime
CREATE TABLE evaluation_runs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_version_id    UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
    runtime_session_id  UUID REFERENCES runtime_sessions(id) ON DELETE SET NULL,
    rule_set_version    VARCHAR(50) NOT NULL,
    summary_metrics     JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 17. Bảng evaluation_findings: Chi tiết kết quả kiểm tra quy tắc kiến trúc
CREATE TABLE evaluation_findings (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evaluation_run_id   UUID NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
    element_id          UUID REFERENCES model_elements(id) ON DELETE CASCADE,
    relationship_id     UUID REFERENCES model_relationships(id) ON DELETE CASCADE,
    rule_id             VARCHAR(100) NOT NULL,
    severity            VARCHAR(20) NOT NULL DEFAULT 'WARNING'
        CHECK (severity IN ('INFO', 'WARNING', 'ERROR')),
    status              VARCHAR(50) NOT NULL
        CHECK (status IN ('PASS', 'VIOLATION', 'NEEDS_REVIEW', 'NOT_APPLICABLE')),
    message             TEXT NOT NULL
);

-- 18. Bảng submission_snapshots: Gói nộp bài tập bất biến của Sinh viên
CREATE TABLE submission_snapshots (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id       UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    submitted_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    source_snapshot_id  UUID NOT NULL REFERENCES source_snapshots(id) ON DELETE RESTRICT,
    model_version_id    UUID NOT NULL REFERENCES model_versions(id) ON DELETE RESTRICT,
    diagram_version_id  UUID NOT NULL REFERENCES diagram_versions(id) ON DELETE RESTRICT,
    evaluation_run_id   UUID REFERENCES evaluation_runs(id) ON DELETE RESTRICT,
    runtime_session_id  UUID REFERENCES runtime_sessions(id) ON DELETE RESTRICT,
    submission_notes    TEXT,
    submitted_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 19. Bảng feedback_comments: Nhận xét của Giảng viên trên bài nộp (Đổi từ 'feedbacks' -> 'feedback_comments' khớp 100% ERD)
CREATE TABLE feedback_comments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id       UUID NOT NULL REFERENCES submission_snapshots(id) ON DELETE CASCADE,
    lecturer_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    element_id          UUID REFERENCES model_elements(id) ON DELETE CASCADE,
    relationship_id     UUID REFERENCES model_relationships(id) ON DELETE CASCADE,
    comment_text        TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 20. Bảng audit_logs: Nhật ký kiểm toán hệ thống dành cho System Administrator
CREATE TABLE audit_logs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id            UUID REFERENCES users(id) ON DELETE SET NULL,
    action              VARCHAR(100) NOT NULL,
    target_type         VARCHAR(100),
    target_id           UUID,
    details             JSONB,
    ip_address          VARCHAR(64),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- DATA MẪU (SEED DATA)
-- ============================================================================

INSERT INTO roles (id, code, name, description) VALUES
    ('11111111-1111-1111-1111-111111111111', 'SYSTEM_ADMIN', 'System Administrator', 'Quản trị viên toàn hệ thống, cấu hình tích hợp và giám sát Runtime Runner'),
    ('22222222-2222-2222-2222-222222222222', 'LECTURER', 'Lecturer', 'Giảng viên quản lý Workspace lớp học, giao đề bài, đăng project mẫu và chấm bài'),
    ('33333333-3333-3333-3333-333333333333', 'STUDENT', 'Student / Learner', 'Sinh viên hoặc người học độc lập thực hành phân tích kiến trúc và nộp bài tập');

INSERT INTO users (role_id, email, password_hash, full_name, status) VALUES
    ('11111111-1111-1111-1111-111111111111', 'admin@mavis.edu.vn', '$2a$10$hashed_pwd_admin', 'System Admin', 'ACTIVE'),
    ('22222222-2222-2222-2222-222222222222', 'hoangnt@fpt.edu.vn', '$2a$10$hashed_pwd_lecturer', 'Nguyen The Hoang', 'ACTIVE'),
    ('33333333-3333-3333-3333-333333333333', 'trietlmse181979@fpt.edu.vn', '$2a$10$hashed_pwd_student', 'Le Minh Triet', 'ACTIVE');

-- ============================================================================
-- INDEXES (TỐI ƯU HÓA TRUY VẤN ĐỒ THỊ, VERSION & CHANGE IMPACT)
-- ============================================================================

CREATE INDEX idx_users_role ON users(role_id);
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX idx_workspace_members_workspace ON workspace_members(workspace_id);

CREATE INDEX idx_projects_workspace ON projects(workspace_id);
CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_projects_assignment ON projects(assignment_id);
CREATE INDEX idx_source_snapshots_project ON source_snapshots(project_id);
CREATE INDEX idx_runtime_sessions_project ON runtime_sessions(project_id);
CREATE INDEX idx_runtime_sessions_snapshot ON runtime_sessions(source_snapshot_id);
CREATE INDEX idx_jobs_project ON jobs(project_id);

CREATE INDEX idx_model_versions_project ON model_versions(project_id);
CREATE INDEX idx_model_versions_snapshot ON model_versions(source_snapshot_id);
CREATE INDEX idx_model_elements_version ON model_elements(model_version_id);
CREATE INDEX idx_model_relationships_version ON model_relationships(model_version_id);
CREATE INDEX idx_model_relationships_source ON model_relationships(source_element_id);
CREATE INDEX idx_model_relationships_target ON model_relationships(target_element_id);
CREATE INDEX idx_evidences_version ON evidences(model_version_id);
CREATE INDEX idx_evidences_element ON evidences(element_id);
CREATE INDEX idx_evidences_relationship ON evidences(relationship_id);
CREATE INDEX idx_diagram_versions_model ON diagram_versions(model_version_id);
CREATE INDEX idx_ai_explanations_model ON ai_explanations(model_version_id);

CREATE INDEX idx_evaluation_runs_model ON evaluation_runs(model_version_id);
CREATE INDEX idx_evaluation_findings_run ON evaluation_findings(evaluation_run_id);
CREATE INDEX idx_submissions_assignment ON submission_snapshots(assignment_id);
CREATE INDEX idx_submissions_project ON submission_snapshots(project_id);
CREATE INDEX idx_feedback_comments_submission ON feedback_comments(submission_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);