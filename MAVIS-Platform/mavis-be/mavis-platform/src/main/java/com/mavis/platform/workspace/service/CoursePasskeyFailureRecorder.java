package com.mavis.platform.workspace.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CoursePasskeyFailureRecorder {
    private final JdbcTemplate jdbc;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String actorDigest) {
        jdbc.update("""
                INSERT INTO auth_rate_limits(scope,subject_digest,attempts) VALUES ('PASSKEY',?,1)
                ON CONFLICT(scope,subject_digest) DO UPDATE SET
                    attempts=auth_rate_limits.attempts+1,
                    blocked_until=CASE WHEN auth_rate_limits.attempts+1>=5
                        THEN now()+interval '15 minutes' ELSE auth_rate_limits.blocked_until END
                """, actorDigest);
    }
}
