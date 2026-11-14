package com.mavis.platform.security.jwt;

import com.mavis.common.exception.AuthErrorCode;
import com.mavis.common.exception.AuthException;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.utils.HashUtils;
import com.mavis.platform.auth.dto.AuthResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Base64;

@Service @RequiredArgsConstructor
public class RefreshSessionService {
    private final JdbcTemplate jdbc; private final UserRepository users; private final JwtUtil jwt;
    private static final SecureRandom RANDOM=new SecureRandom();
    @Transactional public String issue(java.util.UUID userId){byte[] b=new byte[32];RANDOM.nextBytes(b);String raw=Base64.getUrlEncoder().withoutPadding().encodeToString(b);jdbc.update("INSERT INTO refresh_sessions(user_id,token_digest,expires_at) VALUES (?,?,now()+interval '7 days')",userId,digest(raw));return raw;}
    @Transactional public AuthResponse rotate(String raw){
        var ids=jdbc.queryForList("SELECT user_id FROM refresh_sessions WHERE token_digest=? AND revoked_at IS NULL AND expires_at>now() FOR UPDATE",java.util.UUID.class,digest(raw));
        if(ids.isEmpty())throw new AuthException(AuthErrorCode.LOGIN_CREDENTIALS);
        jdbc.update("UPDATE refresh_sessions SET revoked_at=now() WHERE token_digest=?",digest(raw));
        var u=users.findById(ids.getFirst()).filter(x->"ACTIVE".equals(x.getStatus())).orElseThrow(()->new AuthException(AuthErrorCode.LOGIN_LOCKED));
        return response(u,issue(u.getId()));
    }
    @Transactional public void revoke(String raw){if(raw!=null&&!raw.isBlank())jdbc.update("UPDATE refresh_sessions SET revoked_at=coalesce(revoked_at,now()) WHERE token_digest=?",digest(raw));}
    public AuthResponse response(com.mavis.common.entity.User u,String refresh){return AuthResponse.builder().token(jwt.generateToken(u.getEmail(),u.getId(),u.getRole().getCode())).refreshToken(refresh).userId(u.getId()).email(u.getEmail()).fullName(u.getFullName()).role(u.getRole().getCode()).build();}
    private static String digest(String v){return HashUtils.sha256Hex(v.getBytes(StandardCharsets.UTF_8));}
}
