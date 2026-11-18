package com.mavis.platform.workspace.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.common.entity.User;
import com.mavis.common.security.AccessPolicyService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.*;

/** Public-to-authenticated-users course listing for MAVIS All Courses.
 * A course remains a workspace; this endpoint never changes the existing
 * roadmap or enrollment workflow. */
@RestController
@RequestMapping("/api/v1/courses")
public class CourseCatalogController {
    private static final Set<String> DIFFICULTIES = Set.of("BEGINNER", "INTERMEDIATE", "ADVANCED");
    private static final Set<String> SORTS = Set.of("NAME", "NEWEST");
    private static final String COURSE_DIFFICULTY = """
            CASE
              WHEN lower(w.name) LIKE '%advanced%' OR lower(w.name) LIKE '%nâng cao%' THEN 'ADVANCED'
              WHEN lower(w.name) LIKE '%intermediate%' OR lower(w.name) LIKE '%trung cấp%' THEN 'INTERMEDIATE'
              WHEN lower(w.name) LIKE '%beginner%' OR lower(w.name) LIKE '%fundamental%'
                   OR lower(w.name) LIKE '%basic%' OR lower(w.name) LIKE '%cơ bản%' THEN 'BEGINNER'
              ELSE NULL
            END
            """;
    private final AccessPolicyService access;
    private final JdbcTemplate jdbc;

    public CourseCatalogController(AccessPolicyService access, JdbcTemplate jdbc) {
        this.access = access;
        this.jdbc = jdbc;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public ApiResponse<CatalogResponse> list(
            @RequestParam(defaultValue = "") String q,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String difficulty,
            @RequestParam(defaultValue = "NAME") String sort,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "24") @Min(1) @Max(48) int size) {
        User user = access.requireCurrentActiveUser();
        String normalizedDifficulty = optionalDifficulty(difficulty);
        String normalizedSort = optionalSort(sort);
        String keyword = q == null ? "" : q.trim().toLowerCase(Locale.ROOT);
        String selectedCategory = category == null ? "" : category.trim();

        List<Object> filterArgs = new ArrayList<>();
        StringBuilder where = new StringBuilder("""
                FROM workspaces w
                JOIN users lecturer ON lecturer.id = w.created_by
                WHERE w.course_mode = true AND w.status = 'ACTIVE'
                """);
        if (!keyword.isEmpty()) {
            where.append(" AND (lower(w.name) LIKE ? OR lower(coalesce(w.code, '')) LIKE ? OR lower(coalesce(w.description, '')) LIKE ?)");
            String query = "%" + keyword + "%";
            filterArgs.add(query); filterArgs.add(query); filterArgs.add(query);
        }
        if (!selectedCategory.isEmpty()) {
            where.append(" AND lower(btrim(w.name)) = lower(?)");
            filterArgs.add(selectedCategory);
        }
        if (normalizedDifficulty != null) {
            where.append(" AND (").append(COURSE_DIFFICULTY).append(") = ?");
            filterArgs.add(normalizedDifficulty);
        }

        Long total = jdbc.queryForObject("SELECT count(*) " + where, Long.class, filterArgs.toArray());
        String order = normalizedSort.equals("NEWEST") ? "w.created_at DESC, w.id DESC" : "lower(w.name) ASC, w.id ASC";
        List<Object> rowArgs = new ArrayList<>(List.of(user.getId()));
        rowArgs.addAll(filterArgs);
        rowArgs.add(size); rowArgs.add(page * size);
        String itemSql = """
                SELECT w.id, w.code, w.name, w.description, w.created_at,
                       lecturer.full_name AS lecturer_name,
                       EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = w.id AND wm.user_id = ?) AS enrolled,
                       btrim(w.name) AS category,
                       """ + COURSE_DIFFICULTY + """
                       AS difficulty_level,
                       (SELECT count(*) FROM assignments a WHERE a.workspace_id = w.id AND a.lab_order IS NOT NULL) AS lab_count
                """ + where + " ORDER BY " + order + " LIMIT ? OFFSET ?";
        List<CatalogCourse> items = jdbc.query(itemSql, this::map, rowArgs.toArray());

        List<String> categories = jdbc.queryForList("""
                SELECT DISTINCT btrim(w.name) AS category
                FROM workspaces w
                WHERE w.course_mode = true AND w.status = 'ACTIVE'
                  AND btrim(w.name) <> ''
                ORDER BY category
                """, String.class);
        return ApiResponse.success(new CatalogResponse(items, total == null ? 0 : total, page, size, categories));
    }

    private CatalogCourse map(ResultSet rs, int row) throws SQLException {
        String difficulty = rs.getString("difficulty_level");
        return new CatalogCourse(
                rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("name"),
                rs.getString("description"), rs.getString("lecturer_name"), rs.getBoolean("enrolled"),
                List.of(rs.getString("category")), difficulty == null ? List.of() : List.of(difficulty), rs.getLong("lab_count"),
                rs.getTimestamp("created_at").toInstant().toString());
    }

    private static String optionalDifficulty(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        if (!DIFFICULTIES.contains(normalized)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid difficulty");
        return normalized;
    }

    private static String optionalSort(String value) {
        String normalized = value == null || value.isBlank() ? "NAME" : value.trim().toUpperCase(Locale.ROOT);
        if (!SORTS.contains(normalized)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid sort");
        return normalized;
    }

    public record CatalogResponse(List<CatalogCourse> items, long total, int page, int size, List<String> categories) {}
    public record CatalogCourse(UUID workspaceId, String code, String title, String description, String lecturerName,
                                boolean enrolled, List<String> categories, List<String> difficulties,
                                long labCount, String createdAt) {}
}
