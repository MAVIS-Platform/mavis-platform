package com.mavis.bootstrap;

import com.mavis.platform.security.filter.JwtAuthenticationFilter;
import com.mavis.platform.security.jwt.JwtUtil;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.DriverManager;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "MAVIS_MIGRATION_TEST_JDBC_URL",
        matches = "jdbc:postgresql://127\\.0\\.0\\.1:15438/[a-zA-Z0-9_]+")
class SessionLogoutPostgresTest {
    @Test
    void authenticationRejectsRevokedAndExpiredTokensWithoutRevokingOtherSessions() throws Exception {
        var settings = new MigrationUpgradeTest();
        String name = "mavis_session_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = DriverManager.getConnection(settings.adminUrl, settings.user, settings.password);
             var admin = connection.createStatement()) {
            admin.execute("CREATE DATABASE " + name);
            try {
                String url = settings.adminUrl.substring(0, settings.adminUrl.lastIndexOf('/') + 1) + name;
                settings.flyway(url, null).migrate();
                var source = new DriverManagerDataSource(url, settings.user, settings.password);
                var jdbc = new JdbcTemplate(source);
                var tx = new TransactionTemplate(new DataSourceTransactionManager(source));
                var jwt = new JwtUtil(jdbc);
                ReflectionTestUtils.setField(jwt, "secretKey", "isolated-ci-key-for-signing-fixtures-only");
                ReflectionTestUtils.setField(jwt, "jwtExpiration", 60000L);
                UUID user = UUID.randomUUID();
                String first = jwt.generateToken("student@example.invalid", user, "STUDENT");
                String second = jwt.generateToken("student@example.invalid", user, "STUDENT");
                assertNotEquals(first, second);
                var filter = new JwtAuthenticationFilter(jwt);
                assertEquals(user.toString(), principal(filter, first));
                tx.executeWithoutResult(status -> jwt.revoke(first));
                tx.executeWithoutResult(status -> jwt.revoke(first));
                assertNull(principal(filter, first));
                assertEquals(user.toString(), principal(filter, second));
                ReflectionTestUtils.setField(jwt, "jwtExpiration", -5000L);
                String expired = jwt.generateToken("student@example.invalid", user, "STUDENT");
                assertNull(principal(filter, expired));
                assertNull(principal(filter, "invalid"));
                tx.executeWithoutResult(status -> jwt.revoke(expired));
                assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM revoked_access_tokens", Integer.class));
            } finally {
                admin.execute("DROP DATABASE " + name + " WITH (FORCE)");
            }
        }
    }

    private String principal(JwtAuthenticationFilter filter, String token) throws Exception {
        var request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer " + token);
        String[] principal = new String[1];
        try {
            filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> {
                var auth = SecurityContextHolder.getContext().getAuthentication();
                principal[0] = auth == null ? null : auth.getName();
            });
            return principal[0];
        } finally {
            SecurityContextHolder.clearContext();
        }
    }
}
