package com.mavis.platform.announcement;

import com.mavis.common.dto.ApiResponse;
import com.mavis.common.entity.User;
import com.mavis.common.security.AccessPolicyService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.util.*;

/**
 * Administrator-authored site announcements are intentionally separate from
 * user_notifications. Announcements have a publish lifecycle and an audience;
 * notifications remain event records for an individual recipient.
 */
@RestController
@RequestMapping("/api/v1")
public class AnnouncementController {
    private static final Set<String> PRIORITIES = Set.of("LOW", "NORMAL", "HIGH", "URGENT");
    private static final Set<String> AUDIENCES = Set.of("ALL", "STUDENT", "LECTURER", "WORKSPACE");
    private static final Set<String> STATUSES = Set.of("DRAFT", "SCHEDULED", "PUBLISHED", "EXPIRED", "ARCHIVED");

    private final AccessPolicyService access;
    private final JdbcTemplate jdbc;

    public AnnouncementController(AccessPolicyService access, JdbcTemplate jdbc) {
        this.access = access;
        this.jdbc = jdbc;
    }

    @GetMapping("/announcements")
    @Transactional(readOnly = true)
    public ApiResponse<List<AnnouncementResponse>> live() {
        User user = access.requireCurrentActiveUser();
        String audienceRole = switch (roleCode(user)) {
            case "STUDENT" -> "STUDENT";
            case "LECTURER" -> "LECTURER";
            default -> "ALL";
        };
        List<AnnouncementResponse> rows = jdbc.query("""
                SELECT a.id, a.title, a.content, a.priority, a.status, a.audience_type, a.pinned,
                       a.publish_at, a.expire_at, a.created_at, a.updated_at,
                       creator.full_name AS created_by_name
                FROM announcements a
                JOIN users creator ON creator.id = a.created_by
                WHERE a.status IN ('PUBLISHED', 'SCHEDULED')
                  AND a.publish_at IS NOT NULL AND a.publish_at <= now()
                  AND (a.expire_at IS NULL OR a.expire_at > now())
                  AND (
                    a.audience_type = 'ALL'
                    OR a.audience_type = ?
                    OR (a.audience_type = 'WORKSPACE' AND EXISTS (
                        SELECT 1
                        FROM announcement_workspaces aw
                        JOIN workspace_members wm ON wm.workspace_id = aw.workspace_id
                        WHERE aw.announcement_id = a.id AND wm.user_id = ?
                    ))
                  )
                ORDER BY a.pinned DESC, a.publish_at DESC, a.id DESC
                """, this::map, audienceRole, user.getId());
        return ApiResponse.success(rows);
    }

    @GetMapping("/admin/announcements")
    @Transactional(readOnly = true)
    public ApiResponse<List<AnnouncementResponse>> listForAdmin(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String search) {
        access.requireSystemAdmin();
        String normalizedStatus = optionalStatus(status);
        String normalizedSearch = search == null ? "" : search.trim().toLowerCase(Locale.ROOT);
        List<Object> args = new ArrayList<>();
        StringBuilder sql = new StringBuilder("""
                SELECT a.id, a.title, a.content, a.priority, a.status, a.audience_type, a.pinned,
                       a.publish_at, a.expire_at, a.created_at, a.updated_at,
                       creator.full_name AS created_by_name
                FROM announcements a
                JOIN users creator ON creator.id = a.created_by
                WHERE 1 = 1
                """);
        if (normalizedStatus != null) {
            sql.append(" AND a.status = ?");
            args.add(normalizedStatus);
        }
        if (!normalizedSearch.isEmpty()) {
            sql.append(" AND (lower(a.title) LIKE ? OR lower(a.content) LIKE ?)");
            args.add("%" + normalizedSearch + "%");
            args.add("%" + normalizedSearch + "%");
        }
        sql.append(" ORDER BY a.updated_at DESC, a.id DESC");
        return ApiResponse.success(jdbc.query(sql.toString(), this::map, args.toArray()));
    }

    @PostMapping("/admin/announcements")
    @Transactional
    public ApiResponse<AnnouncementResponse> create(@Valid @RequestBody AnnouncementRequest request) {
        User admin = access.requireCurrentActiveUser();
        access.requireSystemAdmin();
        Normalized input = normalize(request, false);
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO announcements (id, title, content, priority, status, audience_type, pinned,
                                           publish_at, expire_at, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, id, input.title(), input.content(), input.priority(), input.status(), input.audience(),
                input.pinned(), timestamp(input.publishAt()), timestamp(input.expireAt()), admin.getId(), admin.getId());
        replaceWorkspaces(id, input.workspaceIds());
        return ApiResponse.success(find(id));
    }

    @PutMapping("/admin/announcements/{id}")
    @Transactional
    public ApiResponse<AnnouncementResponse> update(
            @PathVariable UUID id,
            @Valid @RequestBody AnnouncementRequest request) {
        User admin = access.requireCurrentActiveUser();
        access.requireSystemAdmin();
        ensureExists(id);
        Normalized input = normalize(request, false);
        jdbc.update("""
                UPDATE announcements
                SET title = ?, content = ?, priority = ?, status = ?, audience_type = ?, pinned = ?,
                    publish_at = ?, expire_at = ?, updated_by = ?, updated_at = now()
                WHERE id = ?
                """, input.title(), input.content(), input.priority(), input.status(), input.audience(),
                input.pinned(), timestamp(input.publishAt()), timestamp(input.expireAt()), admin.getId(), id);
        replaceWorkspaces(id, input.workspaceIds());
        return ApiResponse.success(find(id));
    }

    @PostMapping("/admin/announcements/{id}/publish")
    @Transactional
    public ApiResponse<AnnouncementResponse> publish(@PathVariable UUID id) {
        User admin = access.requireCurrentActiveUser();
        access.requireSystemAdmin();
        ensureExists(id);
        jdbc.update("""
                UPDATE announcements
                SET status = CASE WHEN publish_at IS NOT NULL AND publish_at > now() THEN 'SCHEDULED' ELSE 'PUBLISHED' END,
                    publish_at = coalesce(publish_at, now()), updated_by = ?, updated_at = now()
                WHERE id = ?
                """, admin.getId(), id);
        return ApiResponse.success(find(id));
    }

    @PostMapping("/admin/announcements/{id}/unpublish")
    @Transactional
    public ApiResponse<AnnouncementResponse> unpublish(@PathVariable UUID id) {
        User admin = access.requireCurrentActiveUser();
        access.requireSystemAdmin();
        ensureExists(id);
        jdbc.update("UPDATE announcements SET status = 'DRAFT', updated_by = ?, updated_at = now() WHERE id = ?", admin.getId(), id);
        return ApiResponse.success(find(id));
    }

    @DeleteMapping("/admin/announcements/{id}")
    @Transactional
    public ApiResponse<Void> delete(@PathVariable UUID id) {
        access.requireSystemAdmin();
        if (jdbc.update("DELETE FROM announcements WHERE id = ?", id) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Announcement not found");
        }
        return ApiResponse.success(null);
    }

    private AnnouncementResponse find(UUID id) {
        return jdbc.queryForObject("""
                SELECT a.id, a.title, a.content, a.priority, a.status, a.audience_type, a.pinned,
                       a.publish_at, a.expire_at, a.created_at, a.updated_at,
                       creator.full_name AS created_by_name
                FROM announcements a JOIN users creator ON creator.id = a.created_by
                WHERE a.id = ?
                """, this::map, id);
    }

    private AnnouncementResponse map(ResultSet rs, int row) throws SQLException {
        return new AnnouncementResponse(
                rs.getObject("id", UUID.class), rs.getString("title"), rs.getString("content"),
                rs.getString("priority"), rs.getString("status"), rs.getString("audience_type"),
                rs.getBoolean("pinned"), offset(rs.getTimestamp("publish_at")), offset(rs.getTimestamp("expire_at")),
                rs.getString("created_by_name"), offset(rs.getTimestamp("created_at")), offset(rs.getTimestamp("updated_at")));
    }

    private static OffsetDateTime offset(Timestamp value) {
        return value == null ? null : value.toInstant().atOffset(java.time.ZoneOffset.UTC);
    }

    private static Timestamp timestamp(OffsetDateTime value) {
        return value == null ? null : Timestamp.from(value.toInstant());
    }

    private static String roleCode(User user) {
        return user.getRole() == null ? "" : String.valueOf(user.getRole().getCode()).toUpperCase(Locale.ROOT);
    }

    private static String optionalStatus(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        if (!STATUSES.contains(normalized)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid status");
        return normalized;
    }

    private static Normalized normalize(AnnouncementRequest request, boolean publishing) {
        String priority = required(PRIORITIES, request.priority(), "NORMAL");
        String audience = required(AUDIENCES, request.audienceType(), "ALL");
        OffsetDateTime publishAt = request.publishAt();
        OffsetDateTime expireAt = request.expireAt();
        if (expireAt != null && publishAt != null && !expireAt.isAfter(publishAt)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Expiration must follow publication");
        }
        List<UUID> workspaces = request.workspaceIds() == null ? List.of() : request.workspaceIds().stream().distinct().toList();
        if (audience.equals("WORKSPACE") && workspaces.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Workspace audience requires at least one workspace");
        }
        String status = request.status() == null || request.status().isBlank()
                ? "DRAFT" : required(STATUSES, request.status(), "DRAFT");
        if (publishing && status.equals("DRAFT")) status = "PUBLISHED";
        return new Normalized(request.title().trim(), request.content().trim(), priority, status, audience,
                Boolean.TRUE.equals(request.pinned()), publishAt, expireAt, workspaces);
    }

    private static String required(Set<String> allowed, String value, String fallback) {
        String result = value == null || value.isBlank() ? fallback : value.trim().toUpperCase(Locale.ROOT);
        if (!allowed.contains(result)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid announcement value");
        return result;
    }

    private void replaceWorkspaces(UUID id, List<UUID> workspaceIds) {
        jdbc.update("DELETE FROM announcement_workspaces WHERE announcement_id = ?", id);
        for (UUID workspaceId : workspaceIds) {
            if (jdbc.queryForObject("SELECT count(*) FROM workspaces WHERE id = ?", Long.class, workspaceId) == 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Workspace not found");
            }
            jdbc.update("INSERT INTO announcement_workspaces (announcement_id, workspace_id) VALUES (?, ?)", id, workspaceId);
        }
    }

    private void ensureExists(UUID id) {
        if (jdbc.queryForObject("SELECT count(*) FROM announcements WHERE id = ?", Long.class, id) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Announcement not found");
        }
    }

    public record AnnouncementRequest(
            @NotBlank @Size(max = 160) String title,
            @NotBlank @Size(max = 12000) String content,
            String priority,
            String status,
            String audienceType,
            Boolean pinned,
            OffsetDateTime publishAt,
            OffsetDateTime expireAt,
            List<UUID> workspaceIds) {}

    public record AnnouncementResponse(
            UUID id, String title, String content, String priority, String status, String audienceType,
            boolean pinned, OffsetDateTime publishAt, OffsetDateTime expireAt, String createdByName,
            OffsetDateTime createdAt, OffsetDateTime updatedAt) {}

    private record Normalized(
            String title, String content, String priority, String status, String audience, boolean pinned,
            OffsetDateTime publishAt, OffsetDateTime expireAt, List<UUID> workspaceIds) {}
}
