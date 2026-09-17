-- ============================================================================
-- MAVIS - V1__Init_Database.sql
-- Flyway baseline migration - PostgreSQL
-- Domain: Platform (Auth, RBAC, Subscription, Billing, Project)
--         Analyzer (Analysis Session, Graph, Evidence, AI Explanation)
-- LƯU Ý: Phần Auth đã được tinh gọn (2 bảng) để phù hợp đồ án thay vì 5 bảng Enterprise.
-- ============================================================================

-- Bắt buộc để dùng uuid_generate_v4() tạo khóa chính tự động
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- DOMAIN: PLATFORM
-- ============================================================================

-- Bảng roles: Định nghĩa sẵn các vai trò hợp lệ.
-- Giúp tuân thủ chuẩn 3NF, tránh hard-code chuỗi văn bản trong code.
CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code            VARCHAR(50) NOT NULL UNIQUE,  -- Ví dụ: ADMIN, DEVELOPER
    description     TEXT
);

-- Bảng users: Đã bỏ đi các bảng nối phức tạp, gắn trực tiếp role_id vào user.
-- Tối ưu cho Spring Security (chỉ cần JOIN 1 lần lấy được Role).
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT, -- Gắn Role trực tiếp vào User
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255),
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'LOCKED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bảng subscription_plans: Gói cước (Free, Premium)
CREATE TABLE subscription_plans (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                    VARCHAR(100) NOT NULL,
    max_projects            INT NOT NULL,
    ai_explanation_credits  INT NOT NULL,
    price                   NUMERIC(12,2) NOT NULL,
    billing_cycle           VARCHAR(20) NOT NULL
                                CHECK (billing_cycle IN ('MONTHLY', 'YEARLY')),
    is_active               BOOLEAN NOT NULL DEFAULT true
);

-- Bảng user_subscriptions: Gói cước mà User đang sử dụng
-- ON DELETE RESTRICT: Đảm bảo dữ liệu thanh toán không bị mất dấu vết.
CREATE TABLE user_subscriptions (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    plan_id                 UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    status                  VARCHAR(20) NOT NULL
                                CHECK (status IN ('ACTIVE', 'EXPIRED', 'CANCELLED')),
    ai_credits_remaining    INT NOT NULL DEFAULT 0,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    expired_at              TIMESTAMPTZ
);

-- Bảng payment_transactions: Lịch sử thanh toán
CREATE TABLE payment_transactions (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_subscription_id    UUID NOT NULL REFERENCES user_subscriptions(id) ON DELETE RESTRICT,
    amount                  NUMERIC(12,2) NOT NULL,
    currency                VARCHAR(10) NOT NULL,
    gateway                 VARCHAR(50) NOT NULL,
    gateway_transaction_id  VARCHAR(255),
    status                  VARCHAR(20) NOT NULL
                                CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bảng billing_invoices: Hóa đơn thanh toán
CREATE TABLE billing_invoices (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_subscription_id    UUID NOT NULL REFERENCES user_subscriptions(id) ON DELETE RESTRICT,
    amount                  NUMERIC(12,2) NOT NULL,
    issued_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    due_at                  TIMESTAMPTZ,
    status                  VARCHAR(20) NOT NULL DEFAULT 'UNPAID'
                                CHECK (status IN ('UNPAID', 'PAID', 'OVERDUE'))
);

-- Bảng system_configs: Cấu hình linh hoạt dạng JSON (ví dụ API Keys)
CREATE TABLE system_configs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_key      VARCHAR(100) NOT NULL UNIQUE,
    config_value    JSONB NOT NULL,
    description     TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bảng projects: Dự án đã được import bởi Developer
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    storage_path    VARCHAR(500) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'DELETED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- DOMAIN: ANALYZER (GRAPH CORE)
-- ============================================================================

-- Bảng analysis_sessions: Tính năng "Immutable Analysis" (Phân tích bất biến)
-- Mỗi lần quét lại sẽ tạo mới, không xóa bản cũ để giữ an toàn dữ liệu.
CREATE TABLE analysis_sessions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    triggered_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
    is_latest_valid     BOOLEAN NOT NULL DEFAULT false, -- Chỉ có 1 bản là true (bản hoàn chỉnh nhất)
    error_message       TEXT,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ
);

-- Bảng service_nodes: Các Microservice phát hiện được (Ví dụ: order-service)
CREATE TABLE service_nodes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID NOT NULL REFERENCES analysis_sessions(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    node_type       VARCHAR(30) NOT NULL
                        CHECK (node_type IN ('JAVA_SPRING', 'DOTNET', 'GENERIC')),
    source_path     VARCHAR(500),
    metadata        JSONB
);

-- Bảng dependency_edges: Mối liên kết giữa các Microservice (Ví dụ: Order gọi Payment)
CREATE TABLE dependency_edges (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL REFERENCES analysis_sessions(id) ON DELETE CASCADE,
    source_node_id      UUID NOT NULL REFERENCES service_nodes(id) ON DELETE CASCADE,
    target_node_id      UUID NOT NULL REFERENCES service_nodes(id) ON DELETE CASCADE,
    dependency_kind     VARCHAR(30) NOT NULL
                            CHECK (dependency_kind IN ('REST_HTTP', 'CONFIG_REF', 'DOCKER_LINK')),
    description         TEXT
);

-- Bảng evidence: Minh chứng mã nguồn (Chính xác dòng code nào sinh ra liên kết này)
CREATE TABLE evidence (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    edge_id         UUID REFERENCES dependency_edges(id) ON DELETE CASCADE,
    node_id         UUID REFERENCES service_nodes(id) ON DELETE CASCADE,
    file_path       VARCHAR(500) NOT NULL,
    line_number     INT,
    code_snippet    TEXT,
    evidence_type   VARCHAR(30) NOT NULL,
    CONSTRAINT chk_evidence_target CHECK (edge_id IS NOT NULL OR node_id IS NOT NULL) -- Ràng buộc: Bằng chứng phải gắn với Node hoặc Edge
);

-- Bảng impact_index: Lưu trữ sẵn đường đi tác động để truy vấn siêu tốc (< 3 giây)
CREATE TABLE impact_index (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL REFERENCES analysis_sessions(id) ON DELETE CASCADE,
    source_node_id      UUID NOT NULL REFERENCES service_nodes(id) ON DELETE CASCADE,
    affected_node_id    UUID NOT NULL REFERENCES service_nodes(id) ON DELETE CASCADE,
    impact_type         VARCHAR(10) NOT NULL
                            CHECK (impact_type IN ('DIRECT', 'INDIRECT')),
    hop_distance        INT NOT NULL,
    path                JSONB,
    CONSTRAINT uq_impact_unique UNIQUE (session_id, source_node_id, affected_node_id)
);

-- Bảng ai_explanations: Lịch sử giải thích từ OpenAI/Gemini
CREATE TABLE ai_explanations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL REFERENCES analysis_sessions(id) ON DELETE CASCADE,
    node_id             UUID REFERENCES service_nodes(id) ON DELETE CASCADE,
    edge_id             UUID REFERENCES dependency_edges(id) ON DELETE CASCADE,
    requested_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    explanation_text    TEXT NOT NULL,
    prompt_used         TEXT,
    credit_cost         INT NOT NULL DEFAULT 1,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- DATA MẪU (SEED DATA)
-- ============================================================================
-- Insert sẵn 2 roles cơ bản để đỡ phải tạo tay.
INSERT INTO roles (code, description) VALUES 
('ADMIN', 'Quản trị viên hệ thống'),
('DEVELOPER', 'Lập trình viên sử dụng hệ thống');

-- ============================================================================
-- INDEXES 
-- ============================================================================

-- Platform
CREATE INDEX idx_projects_owner ON projects (owner_id);
CREATE INDEX idx_user_subscriptions_user ON user_subscriptions (user_id);
CREATE INDEX idx_payment_transactions_subscription ON payment_transactions (user_subscription_id);
CREATE INDEX idx_billing_invoices_subscription ON billing_invoices (user_subscription_id);

-- Analyzer - phục vụ build graph & precompute (lúc phân tích)
CREATE INDEX idx_nodes_session ON service_nodes (session_id);
CREATE INDEX idx_edges_session_source ON dependency_edges (session_id, source_node_id);
CREATE INDEX idx_edges_session_target ON dependency_edges (session_id, target_node_id);

-- Analyzer - phục vụ truy vấn tương tác UI (bắt buộc < 3 giây)
CREATE INDEX idx_impact_session_source ON impact_index (session_id, source_node_id);

-- Partial Index: Đảm bảo chỉ có 1 session là latest cho mỗi project
CREATE UNIQUE INDEX idx_sessions_project_latest ON analysis_sessions (project_id)
    WHERE is_latest_valid = true;

-- Analyzer - evidence lookup từ UI
CREATE INDEX idx_evidence_edge ON evidence (edge_id);
CREATE INDEX idx_evidence_node ON evidence (node_id);

-- AI explanation history
CREATE INDEX idx_ai_explanations_session ON ai_explanations (session_id);