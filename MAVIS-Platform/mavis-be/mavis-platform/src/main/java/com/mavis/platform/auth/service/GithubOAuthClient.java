package com.mavis.platform.auth.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.exception.AuthErrorCode;
import com.mavis.common.exception.AuthException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
@Slf4j
public class GithubOAuthClient {

    public record GithubUserProfile(String email, String name, String login, String avatarUrl) {}

    private static final Duration TIMEOUT = Duration.ofSeconds(10);

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final String clientId;
    private final String clientSecret;
    private final String tokenUrl;
    private final String apiBaseUrl;

    @Autowired
    public GithubOAuthClient(
            ObjectMapper objectMapper,
            @Value("${app.github.client-id:}") String clientId,
            @Value("${app.github.client-secret:}") String clientSecret,
            @Value("${app.github.token-url:https://github.com/login/oauth/access_token}") String tokenUrl,
            @Value("${app.github.api-base-url:https://api.github.com}") String apiBaseUrl) {
        this(HttpClient.newBuilder().connectTimeout(TIMEOUT).build(), objectMapper, clientId, clientSecret, tokenUrl, apiBaseUrl);
    }

    public GithubOAuthClient(
            HttpClient httpClient,
            ObjectMapper objectMapper,
            String clientId,
            String clientSecret,
            String tokenUrl,
            String apiBaseUrl) {
        this.httpClient = httpClient;
        this.objectMapper = objectMapper;
        this.clientId = clientId == null ? "" : clientId.trim();
        this.clientSecret = clientSecret == null ? "" : clientSecret.trim();
        this.tokenUrl = tokenUrl;
        this.apiBaseUrl = apiBaseUrl.endsWith("/") ? apiBaseUrl.substring(0, apiBaseUrl.length() - 1) : apiBaseUrl;
    }

    public GithubUserProfile exchangeCodeForProfile(String code, String redirectUri) {
        if (clientId.isBlank() || clientSecret.isBlank()) {
            throw new AuthException(AuthErrorCode.AUTH_OAUTH_UNCONFIGURED);
        }
        String accessToken = exchangeAccessToken(code, redirectUri);
        JsonNode userNode = fetchJson(apiBaseUrl + "/user", accessToken);
        String verifiedEmail = fetchVerifiedEmail(accessToken);

        String login = textOrNull(userNode, "login");
        String name = textOrNull(userNode, "name");
        String avatarUrl = textOrNull(userNode, "avatar_url");
        return new GithubUserProfile(verifiedEmail, name, login, avatarUrl);
    }

    private String exchangeAccessToken(String code, String redirectUri) {
        try {
            Map<String, String> payload = new LinkedHashMap<>();
            payload.put("client_id", clientId);
            payload.put("client_secret", clientSecret);
            payload.put("code", code);
            if (redirectUri != null && !redirectUri.isBlank()) {
                payload.put("redirect_uri", redirectUri.trim());
            }
            HttpRequest request = HttpRequest.newBuilder(URI.create(tokenUrl))
                    .timeout(TIMEOUT)
                    .header("Accept", "application/json")
                    .header("Content-Type", "application/json")
                    .header("User-Agent", "MAVIS-Platform")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                log.warn("GitHub token exchange returned HTTP {}", response.statusCode());
                throw new AuthException(AuthErrorCode.AUTH_OAUTH_FAILED);
            }
            JsonNode root = objectMapper.readTree(response.body());
            String token = textOrNull(root, "access_token");
            if (token == null) {
                log.warn("GitHub token exchange missing access_token (error={})", textOrNull(root, "error"));
                throw new AuthException(AuthErrorCode.AUTH_OAUTH_FAILED);
            }
            return token;
        } catch (AuthException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn("GitHub token exchange failed ({})", ex.getClass().getSimpleName());
            throw new AuthException(AuthErrorCode.AUTH_OAUTH_FAILED);
        }
    }

    private String fetchVerifiedEmail(String accessToken) {
        JsonNode emails = fetchJson(apiBaseUrl + "/user/emails", accessToken);
        if (!emails.isArray()) {
            throw new AuthException(AuthErrorCode.AUTH_OAUTH_EMAIL_UNVERIFIED);
        }
        String fallbackVerified = null;
        for (JsonNode entry : emails) {
            boolean verified = entry.path("verified").asBoolean(false);
            String email = textOrNull(entry, "email");
            if (!verified || email == null) continue;
            if (entry.path("primary").asBoolean(false)) {
                return email;
            }
            if (fallbackVerified == null) {
                fallbackVerified = email;
            }
        }
        if (fallbackVerified != null) {
            return fallbackVerified;
        }
        throw new AuthException(AuthErrorCode.AUTH_OAUTH_EMAIL_UNVERIFIED);
    }

    private JsonNode fetchJson(String url, String accessToken) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(TIMEOUT)
                    .header("Accept", "application/vnd.github+json")
                    .header("Authorization", "Bearer " + accessToken)
                    .header("User-Agent", "MAVIS-Platform")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                log.warn("GitHub API {} returned HTTP {}", url, response.statusCode());
                throw new AuthException(AuthErrorCode.AUTH_OAUTH_FAILED);
            }
            return objectMapper.readTree(response.body());
        } catch (AuthException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn("GitHub API request failed ({})", ex.getClass().getSimpleName());
            throw new AuthException(AuthErrorCode.AUTH_OAUTH_FAILED);
        }
    }

    private static String textOrNull(JsonNode node, String field) {
        if (node == null || !node.hasNonNull(field)) return null;
        String value = node.path(field).asText("").trim();
        return value.isEmpty() ? null : value;
    }
}
