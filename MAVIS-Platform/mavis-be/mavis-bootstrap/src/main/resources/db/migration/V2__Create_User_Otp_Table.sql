-- ============================================================================
-- MAVIS - V2__Create_User_Otp_Table.sql
-- Flyway migration - PostgreSQL
-- ============================================================================

-- Bảng user_otps: Lưu mã OTP cho xác thực Email và Khôi phục mật khẩu.
CREATE TABLE user_otps (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    otp_code        VARCHAR(10) NOT NULL,
    purpose         VARCHAR(50) NOT NULL DEFAULT 'EMAIL_VERIFICATION'
                        CHECK (purpose IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET')),
    expiry_time     TIMESTAMPTZ NOT NULL,
    is_used         BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_otps_user ON user_otps (user_id);

-- Cập nhật ràng buộc (check constraint) của cột status trong bảng users
-- PostgreSQL không cho phép ALTER CONSTRAINT trực tiếp, nên ta drop rồi add lại.
ALTER TABLE users DROP CONSTRAINT users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check 
    CHECK (status IN ('ACTIVE', 'LOCKED', 'PENDING_VERIFICATION'));
