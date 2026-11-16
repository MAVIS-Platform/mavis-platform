package com.mavis.platform.auth.controller;
import com.mavis.common.entity.UserOtp;
import org.junit.jupiter.api.Test;
import java.time.*;
import static org.junit.jupiter.api.Assertions.*;
class OtpTimezoneTest {
    @Test void timestamptzMappingPreservesInstantAcrossOffsets(){var expiry=OffsetDateTime.parse("2026-10-23T18:00:00+07:00");var otp=UserOtp.builder().expiryTime(expiry).build();assertEquals(OffsetDateTime.class,otp.getExpiryTime().getClass());assertTrue(otp.getExpiryTime().isAfter(OffsetDateTime.parse("2026-10-23T10:59:59Z")));assertFalse(otp.getExpiryTime().isAfter(OffsetDateTime.parse("2026-10-23T11:00:01Z")));}
}
