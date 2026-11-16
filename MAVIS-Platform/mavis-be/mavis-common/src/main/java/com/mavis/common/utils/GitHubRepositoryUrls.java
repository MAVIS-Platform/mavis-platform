package com.mavis.common.utils;

import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import java.net.URI;
import java.util.Locale;

/** Canonical identity for one public GitHub repository, independent of branch. */
public final class GitHubRepositoryUrls {
    private GitHubRepositoryUrls() {}
    public static String normalize(String input) {
        if (input == null || input.isBlank()) return null;
        try {
            URI uri = URI.create(input.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme()) || !"github.com".equalsIgnoreCase(uri.getHost())
                    || uri.getRawUserInfo() != null || uri.getPort() != -1 || uri.getRawQuery() != null || uri.getRawFragment() != null) throw new IllegalArgumentException();
            String path = uri.getPath().replaceAll("/+$", "");
            if (path.endsWith(".git")) path = path.substring(0, path.length() - 4);
            if (!path.matches("/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")) throw new IllegalArgumentException();
            String[] parts = path.substring(1).split("/");
            if (parts[0].equals(".") || parts[0].equals("..") || parts[1].equals(".") || parts[1].equals("..")) throw new IllegalArgumentException();
            return "https://github.com/" + parts[0].toLowerCase(Locale.ROOT) + "/" + parts[1].toLowerCase(Locale.ROOT);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Use a GitHub repository root URL: https://github.com/owner/repository");
        }
    }
    public static String requireSame(String bound, String requested) {
        String candidate = normalize(requested);
        if (candidate == null) throw new BusinessException(ErrorCode.BAD_REQUEST, "GitHub repository URL is required");
        String existing = normalize(bound);
        if (existing != null && !existing.equals(candidate)) throw new BusinessException(ErrorCode.BAD_REQUEST,
                "This project is linked to another GitHub repository. Create a separate project for a different repository.");
        return candidate;
    }
}
