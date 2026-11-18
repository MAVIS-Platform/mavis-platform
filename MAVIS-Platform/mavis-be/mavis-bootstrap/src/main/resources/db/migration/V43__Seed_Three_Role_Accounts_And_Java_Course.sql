-- V43__Seed_Three_Role_Accounts_And_Java_Course.sql
-- Idempotently seeds 3 ready-to-test role accounts (LECTURER, STUDENT, SYSTEM_ADMIN)
-- and the flagship JAVA-MS-2026 Coursera Java Microservices workspace.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Self-heal V42 columns if an environment skipped V42
ALTER TABLE course_passkeys ADD COLUMN IF NOT EXISTS id UUID DEFAULT uuid_generate_v4();
ALTER TABLE course_passkeys ADD COLUMN IF NOT EXISTS code VARCHAR(32);
ALTER TABLE course_passkeys ADD COLUMN IF NOT EXISTS label VARCHAR(120) NOT NULL DEFAULT 'Class Passkey';
ALTER TABLE course_passkeys ADD COLUMN IF NOT EXISTS max_uses INTEGER;
ALTER TABLE course_passkeys ADD COLUMN IF NOT EXISTS used_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE course_passkeys ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS course_item_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    course_item_id UUID NOT NULL REFERENCES course_items(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    answer_markdown TEXT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'SUBMITTED'
        CHECK (status IN ('SUBMITTED', 'GRADED', 'RETURNED')),
    score INTEGER CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
    feedback TEXT,
    graded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    graded_at TIMESTAMPTZ,
    CONSTRAINT uq_course_item_student_submission UNIQUE (course_item_id, student_id)
);

-- 2. Ensure 3 core roles exist
INSERT INTO roles (code, name, description) VALUES
    ('SYSTEM_ADMIN', 'Quản trị viên hệ thống', 'Toàn quyền cấu hình hệ thống và quản lý người dùng'),
    ('LECTURER', 'Giảng viên', 'Tạo lớp học, biên soạn giáo trình, Lab, Quiz, Tự luận và chấm điểm'),
    ('STUDENT', 'Sinh viên', 'Tham gia lớp học bằng Passkey, học lý thuyết, làm Quiz, Tự luận và Lab')
ON CONFLICT (code) DO NOTHING;

-- 3. Upsert 3 ready-to-test accounts with real BCrypt hashes
INSERT INTO users (email, password_hash, full_name, role_id, status)
VALUES (
    'gv.java@mavis.edu.vn',
    crypt('Java@123456', gen_salt('bf', 10)),
    'Thầy Hoàng · Giảng Viên Java Microservices',
    (SELECT id FROM roles WHERE code = 'LECTURER'),
    'ACTIVE'
)
ON CONFLICT (email) DO UPDATE SET
    password_hash = crypt('Java@123456', gen_salt('bf', 10)),
    full_name = EXCLUDED.full_name,
    role_id = EXCLUDED.role_id,
    status = 'ACTIVE';

INSERT INTO users (email, password_hash, full_name, role_id, status)
VALUES (
    'sv.java@mavis.edu.vn',
    crypt('Java@123456', gen_salt('bf', 10)),
    'Lê Minh Triết · Sinh Viên SE181979',
    (SELECT id FROM roles WHERE code = 'STUDENT'),
    'ACTIVE'
)
ON CONFLICT (email) DO UPDATE SET
    password_hash = crypt('Java@123456', gen_salt('bf', 10)),
    full_name = EXCLUDED.full_name,
    role_id = EXCLUDED.role_id,
    status = 'ACTIVE';

INSERT INTO users (email, password_hash, full_name, role_id, status)
VALUES (
    'admin@mavis.edu.vn',
    crypt('Admin@123456', gen_salt('bf', 10)),
    'Quản Trị Viên Hệ Thống MAVIS',
    (SELECT id FROM roles WHERE code = 'SYSTEM_ADMIN'),
    'ACTIVE'
)
ON CONFLICT (email) DO UPDATE SET
    password_hash = crypt('Admin@123456', gen_salt('bf', 10)),
    full_name = EXCLUDED.full_name,
    role_id = EXCLUDED.role_id,
    status = 'ACTIVE';

-- 4. Upsert Flagship Java Microservices Workspace (JAVA-MS-2026)
INSERT INTO workspaces (code, name, description, created_by, status, course_mode, max_students)
VALUES (
    'JAVA-MS-2026',
    'Kiến Trúc & Phát Triển Java Microservices Toàn Diện (Chuẩn Coursera)',
    'Khóa học toàn diện gồm 6 Chương: Java 21 & Spring Boot 3, C4 Model & DDD Bounded Context, OpenFeign & Reverse BFS, Resilience4j & Messaging, Saga & JWT Security, OpenTelemetry & Production-Ready Microservices.',
    (SELECT id FROM users WHERE email = 'gv.java@mavis.edu.vn'),
    'ACTIVE',
    TRUE,
    200
)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    status = 'ACTIVE',
    course_mode = TRUE,
    max_students = 200;

-- 5. Ensure Lecturer & Student memberships in JAVA-MS-2026
INSERT INTO workspace_members (workspace_id, user_id, member_role)
SELECT w.id, u.id, 'LECTURER'
FROM workspaces w
JOIN users u ON u.email IN ('gv.java@mavis.edu.vn', 'hoangnt@fpt.edu.vn')
WHERE w.code = 'JAVA-MS-2026'
ON CONFLICT (workspace_id, user_id) DO UPDATE SET member_role = 'LECTURER';

INSERT INTO workspace_members (workspace_id, user_id, member_role)
SELECT w.id, u.id, 'STUDENT'
FROM workspaces w
JOIN users u ON u.email IN ('sv.java@mavis.edu.vn', 'trietlmse181979@fpt.edu.vn')
WHERE w.code = 'JAVA-MS-2026'
ON CONFLICT (workspace_id, user_id) DO UPDATE SET member_role = 'STUDENT';
