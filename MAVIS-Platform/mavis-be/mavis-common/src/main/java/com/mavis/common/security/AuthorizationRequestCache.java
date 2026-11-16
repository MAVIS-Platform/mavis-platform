package com.mavis.common.security;

import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.entity.WorkspaceMember;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;

import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * Authorization memoization for one HTTP request only. No entities or access
 * decisions survive into the next request, so revocation has no TTL delay and
 * background jobs without request context always consult the database.
 */
public final class AuthorizationRequestCache {
    private static final String PREFIX = AuthorizationRequestCache.class.getName() + ".";

    private AuthorizationRequestCache() {}

    public static Optional<User> user(UUID userId, Supplier<Optional<User>> loader) {
        return load(PREFIX + "user." + userId, loader);
    }

    public static Optional<Workspace> workspace(UUID workspaceId, Supplier<Optional<Workspace>> loader) {
        return load(PREFIX + "workspace." + workspaceId, loader);
    }

    public static Optional<WorkspaceMember> membership(UUID workspaceId, UUID userId,
                                                       Supplier<Optional<WorkspaceMember>> loader) {
        return load(memberKey(workspaceId, userId), loader);
    }

    public static void evictUser(UUID userId) {
        evict(PREFIX + "user." + userId);
    }

    public static void evictMembership(UUID workspaceId, UUID userId) {
        evict(memberKey(workspaceId, userId));
    }

    private static String memberKey(UUID workspaceId, UUID userId) {
        return PREFIX + "member." + workspaceId + "." + userId;
    }

    @SuppressWarnings("unchecked")
    private static <T> Optional<T> load(String key, Supplier<Optional<T>> loader) {
        RequestAttributes request = RequestContextHolder.getRequestAttributes();
        if (request == null) return loader.get();
        Optional<T> cached = (Optional<T>) request.getAttribute(key, RequestAttributes.SCOPE_REQUEST);
        if (cached != null) return cached;
        Optional<T> loaded = loader.get();
        request.setAttribute(key, loaded, RequestAttributes.SCOPE_REQUEST);
        return loaded;
    }

    private static void evict(String key) {
        RequestAttributes request = RequestContextHolder.getRequestAttributes();
        if (request != null) request.removeAttribute(key, RequestAttributes.SCOPE_REQUEST);
    }
}
