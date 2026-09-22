package com.mavis.common.repository;

import com.mavis.common.entity.User;
import com.mavis.common.entity.UserOtp;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserOtpRepository extends JpaRepository<UserOtp, UUID> {
    Optional<UserOtp> findFirstByUserAndOtpCodeAndIsUsedFalseOrderByCreatedAtDesc(User user, String otpCode);
}
