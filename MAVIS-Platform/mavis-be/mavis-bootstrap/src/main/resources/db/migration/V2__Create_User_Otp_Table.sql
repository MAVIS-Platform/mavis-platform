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
