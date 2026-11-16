package com.mavis.platform.security.jwt;

import com.mavis.common.utils.HashUtils;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.ZoneOffset;
import java.util.Date;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class JwtUtil {
    private final JdbcTemplate jdbc;

    @Value("${server.jwt.secret}")
    private String secretKey;

    @Value("${server.jwt.expiration}")
    private long jwtExpiration;

    private SecretKey getSigningKey() {
        return Keys.hmacShaKeyFor(secretKey.getBytes(StandardCharsets.UTF_8));
    }

    public String generateToken(String email, UUID userId, String role) {
        return Jwts.builder()
                .id(UUID.randomUUID().toString())
                .subject(email)
                .claim("userId", userId.toString())
                .claim("role", role)
                .issuedAt(new Date(System.currentTimeMillis()))
                .expiration(new Date(System.currentTimeMillis() + jwtExpiration))
                .signWith(getSigningKey())
                .compact();
    }

    public Claims activeClaims(String token) {
        Claims claims = signedClaims(token);
        if (claims == null) return null;
        Boolean revoked = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM revoked_access_tokens WHERE digest = ?)
                """, Boolean.class, digest(token));
        return Boolean.TRUE.equals(revoked) ? null : claims;
    }

    @Transactional
    public void revoke(String token) {
        Claims claims = signedClaims(token);
        if (claims == null) return;
        jdbc.update("DELETE FROM revoked_access_tokens WHERE expires_at <= CURRENT_TIMESTAMP");
        jdbc.update("""
                INSERT INTO revoked_access_tokens (digest, expires_at) VALUES (?, ?)
                ON CONFLICT (digest) DO NOTHING
                """, digest(token), claims.getExpiration().toInstant().atOffset(ZoneOffset.UTC));
    }

    private Claims signedClaims(String token) {
        try {
            Claims claims = Jwts.parser().verifyWith(getSigningKey()).build()
                    .parseSignedClaims(token).getPayload();
            return claims.getExpiration() == null ? null : claims;
        } catch (JwtException | IllegalArgumentException ignored) {
            return null;
        }
    }

    private String digest(String token) {
        return HashUtils.sha256Hex(token.getBytes(StandardCharsets.UTF_8));
    }
}
