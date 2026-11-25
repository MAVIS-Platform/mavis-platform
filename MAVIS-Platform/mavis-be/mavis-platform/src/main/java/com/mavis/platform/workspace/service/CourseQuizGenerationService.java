package com.mavis.platform.workspace.service;

import com.mavis.common.entity.Assignment;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.security.AccessPolicyService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Builds a source-grounded Quiz draft from the selected Module's theory lessons and/or
 * static architecture model (C1-C3 elements and Dependency Graph relationships).
 */
@Service
@RequiredArgsConstructor
public class CourseQuizGenerationService {

    private static final int DEFAULT_COUNT = 10;
    private static final int MAX_COUNT = 20;
    private static final int MAX_THEORY_CHARS = 24_000;
    private static final int MAX_DIAGRAM_CHARS = 10_000;

    private final AssignmentRepository assignments;
    private final AccessPolicyService access;
    private final JdbcTemplate jdbc;
    private final QuizQuestionGenerator generator;

    public record Request(Integer count, String locale, Boolean includeTheory,
                          Boolean includeStaticDiagrams, List<UUID> theoryItemIds) {
        public Request(Integer count, String locale) {
            this(count, locale, true, true, null);
        }
    }

    public record Generated(String providerMode, int sourceTheoryItems, int sourceDiagramElements,
                            List<String> sourcesUsed, List<CourseQuizService.Question> questions) {
        public Generated(String providerMode, int sourceTheoryItems, List<CourseQuizService.Question> questions) {
            this(providerMode, sourceTheoryItems, 0, List.of(), questions);
        }
    }

    public Generated generate(UUID workspaceId, UUID assignmentId, Request request) {
        access.requireWorkspaceLecturer(workspaceId);
        Assignment lab = assignments.findById(assignmentId)
                .filter(value -> workspaceId.equals(value.getWorkspace().getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "LAB_NOT_FOUND", "Lab not found in this workspace"));

        int count = validCount(request);
        boolean vietnamese = request != null && "vi".equalsIgnoreCase(request.locale());
        boolean useTheory = request == null || request.includeTheory() == null || request.includeTheory();
        boolean useDiagrams = request == null || request.includeStaticDiagrams() == null || request.includeStaticDiagrams();
        List<UUID> selectedTheoryIds = request == null ? null : request.theoryItemIds();

        Theory theory = useTheory
                ? (selectedTheoryIds != null && !selectedTheoryIds.isEmpty()
                    ? theoryByIds(workspaceId, selectedTheoryIds)
                    : theoryFor(workspaceId, lab.getId()))
                : new Theory("", 0);
        UUID modelId = lab.getReferenceModel() != null
                ? lab.getReferenceModel().getId()
                : latestWorkspaceModelId(workspaceId);
        DiagramContext diagrams = useDiagrams && modelId != null
                ? diagramContextFor(modelId)
                : new DiagramContext("", 0);

        return generateFromSources(theory, diagrams, count, vietnamese);
    }

    public Generated generate(UUID workspaceId, Request request) {
        access.requireWorkspaceLecturer(workspaceId);
        int count = validCount(request);
        boolean vietnamese = request != null && "vi".equalsIgnoreCase(request.locale());
        boolean useTheory = request == null || request.includeTheory() == null || request.includeTheory();
        boolean useDiagrams = request == null || request.includeStaticDiagrams() == null || request.includeStaticDiagrams();
        List<UUID> selectedTheoryIds = request == null ? null : request.theoryItemIds();

        Theory theory = useTheory
                ? (selectedTheoryIds != null && !selectedTheoryIds.isEmpty()
                    ? theoryByIds(workspaceId, selectedTheoryIds)
                    : workspaceTheory(workspaceId))
                : new Theory("", 0);
        UUID modelId = useDiagrams ? latestWorkspaceModelId(workspaceId) : null;
        DiagramContext diagrams = useDiagrams && modelId != null
                ? diagramContextFor(modelId)
                : new DiagramContext("", 0);

        return generateFromSources(theory, diagrams, count, vietnamese);
    }

    private Generated generateFromSources(Theory theory, DiagramContext diagrams, int count, boolean vietnamese) {
        boolean hasTheory = !theory.text().isBlank();
        boolean hasDiagrams = !diagrams.text().isBlank();
        if (!hasTheory && !hasDiagrams) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "THEORY_REQUIRED",
                    "Add theory content or attach a reference architecture model before generating Quiz questions");
        }
        List<String> sourcesUsed = new ArrayList<>();
        StringBuilder combined = new StringBuilder();
        if (hasTheory) {
            sourcesUsed.add("THEORY");
            int limit = hasDiagrams ? MAX_THEORY_CHARS - MAX_DIAGRAM_CHARS : MAX_THEORY_CHARS;
            String t = theory.text().length() > limit ? theory.text().substring(0, limit) : theory.text();
            combined.append("[SOURCE: THEORY]\n").append(t).append("\n\n");
        }
        if (hasDiagrams) {
            sourcesUsed.add("STATIC_DIAGRAMS");
            String d = diagrams.text().length() > MAX_DIAGRAM_CHARS
                    ? diagrams.text().substring(0, MAX_DIAGRAM_CHARS)
                    : diagrams.text();
            combined.append("[SOURCE: STATIC_DIAGRAMS]\n").append(d).append("\n");
        }
        String finalSource = combined.toString().trim();
        if (finalSource.length() > MAX_THEORY_CHARS) {
            finalSource = finalSource.substring(0, MAX_THEORY_CHARS);
        }
        List<CourseQuizService.Question> questions = generator.generate(finalSource, count, vietnamese);
        return new Generated(generator.providerMode(), theory.items(), diagrams.elements(),
                List.copyOf(sourcesUsed), List.copyOf(questions));
    }

    private static int validCount(Request request) {
        int count = request == null || request.count() == null ? DEFAULT_COUNT : request.count();
        if (count < 1 || count > MAX_COUNT) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "AI_QUIZ_COUNT_INVALID",
                    "Ask for between 1 and " + MAX_COUNT + " questions");
        }
        return count;
    }

    private Theory theoryFor(UUID workspaceId, UUID assignmentId) {
        record Row(String body, int items) {}
        Row row = jdbc.queryForObject("""
                SELECT coalesce(string_agg(
                           ci.title || E'\\n\\n' || coalesce(ci.content->>'body', ''),
                           E'\\n\\n---\\n\\n' ORDER BY cm.position, ci.position), '') AS body,
                       count(*) AS items
                FROM course_items ci
                JOIN course_modules cm ON cm.id = ci.module_id
                JOIN course_definitions cd ON cd.id = cm.course_id
                WHERE cd.workspace_id = ?
                  AND ci.item_type = 'THEORY'
                  AND cm.id IN (SELECT linked.module_id FROM course_items linked
                                WHERE linked.assignment_id = ?)
                """, (rs, ignored) -> new Row(rs.getString("body"), rs.getInt("items")),
                workspaceId, assignmentId);
        if (row == null) return new Theory("", 0);
        String text = row.body() == null ? "" : row.body();
        if (text.length() > MAX_THEORY_CHARS) text = text.substring(0, MAX_THEORY_CHARS);
        return new Theory(text, row.items());
    }

    private Theory theoryByIds(UUID workspaceId, List<UUID> itemIds) {
        record Row(UUID id, String title, String body) {}
        List<Row> rows = jdbc.query("""
                SELECT ci.id, ci.title, coalesce(ci.content->>'body', '') AS body
                FROM course_items ci
                JOIN course_modules cm ON cm.id = ci.module_id
                JOIN course_definitions cd ON cd.id = cm.course_id
                WHERE cd.workspace_id = ? AND ci.item_type = 'THEORY'
                ORDER BY cm.position, ci.position
                """, (rs, ignored) -> new Row(rs.getObject("id", UUID.class), rs.getString("title"), rs.getString("body")),
                workspaceId);
        if (rows == null || rows.isEmpty()) return new Theory("", 0);
        var wanted = java.util.Set.copyOf(itemIds);
        StringBuilder sb = new StringBuilder();
        int count = 0;
        for (Row row : rows) {
            if (!wanted.contains(row.id())) continue;
            if (count > 0) sb.append("\n\n---\n\n");
            sb.append(row.title() == null ? "" : row.title()).append("\n\n").append(row.body() == null ? "" : row.body());
            count++;
        }
        String text = sb.toString();
        if (text.length() > MAX_THEORY_CHARS) text = text.substring(0, MAX_THEORY_CHARS);
        return new Theory(text, count);
    }

    private Theory workspaceTheory(UUID workspaceId) {
        record Row(String body, int items) {}
        Row row = jdbc.queryForObject("""
                SELECT coalesce(string_agg(title || E'\n\n' || body,
                           E'\n\n---\n\n' ORDER BY updated_at DESC), '') AS body,
                       count(*) AS items
                FROM theory_assets
                WHERE workspace_id = ?
                """, (rs, ignored) -> new Row(rs.getString("body"), rs.getInt("items")), workspaceId);
        if (row != null && row.body() != null && !row.body().isBlank()) {
            String text = row.body().length() > MAX_THEORY_CHARS ? row.body().substring(0, MAX_THEORY_CHARS) : row.body();
            return new Theory(text, row.items());
        }
        List<String> itemRows = jdbc.query("""
                SELECT ci.title || E'\n\n' || coalesce(ci.content->>'body', '') AS entry
                FROM course_items ci
                JOIN course_modules cm ON cm.id = ci.module_id
                JOIN course_definitions cd ON cd.id = cm.course_id
                WHERE cd.workspace_id = ? AND ci.item_type = 'THEORY'
                ORDER BY cm.position, ci.position
                """, (rs, ignored) -> rs.getString("entry"), workspaceId);
        if (itemRows == null || itemRows.isEmpty()) return new Theory("", 0);
        String joined = String.join("\n\n---\n\n", itemRows);
        if (joined.length() > MAX_THEORY_CHARS) joined = joined.substring(0, MAX_THEORY_CHARS);
        return new Theory(joined, itemRows.size());
    }

    private UUID latestWorkspaceModelId(UUID workspaceId) {
        List<UUID> ids = jdbc.query("""
                SELECT mv.id
                FROM model_versions mv
                JOIN projects p ON p.id = mv.project_id
                WHERE p.workspace_id = ?
                ORDER BY mv.created_at DESC
                LIMIT 1
                """, (rs, ignored) -> rs.getObject(1, UUID.class), workspaceId);
        return (ids == null || ids.isEmpty()) ? null : ids.getFirst();
    }

    private DiagramContext diagramContextFor(UUID modelId) {
        List<String> elements = jdbc.query("""
                SELECT element_type, name, coalesce(language_stack, ''), coalesce(scope, '')
                FROM model_elements
                WHERE model_version_id = ?
                ORDER BY element_type, name
                LIMIT 40
                """, (rs, ignored) -> {
            String type = rs.getString(1);
            String name = rs.getString(2);
            String stack = rs.getString(3);
            String scope = rs.getString(4);
            StringBuilder line = new StringBuilder("- [").append(type).append("] ").append(name);
            if (!stack.isBlank()) line.append(" (").append(stack).append(")");
            if (!scope.isBlank() && !"null".equalsIgnoreCase(scope)) line.append(" — ").append(scope);
            return line.toString();
        }, modelId);
        List<String> rels = jdbc.query("""
                SELECT src.name AS src_name, tgt.name AS tgt_name, mr.relation_type, mr.origin_layer
                FROM model_relationships mr
                JOIN model_elements src ON src.id = mr.source_element_id
                JOIN model_elements tgt ON tgt.id = mr.target_element_id
                WHERE mr.model_version_id = ?
                ORDER BY src.name, tgt.name
                LIMIT 50
                """, (rs, ignored) -> "- " + rs.getString(1) + " -> " + rs.getString(2)
                + " (" + rs.getString(3) + ", layer=" + rs.getString(4) + ")", modelId);

        int elemCount = elements == null ? 0 : elements.size();
        int relCount = rels == null ? 0 : rels.size();
        if (elemCount == 0 && relCount == 0) {
            return new DiagramContext("", 0);
        }
        StringBuilder sb = new StringBuilder();
        if (elemCount > 0) {
            sb.append("C1-C3 Architecture Elements:\n");
            for (String line : elements) sb.append(line).append('\n');
        }
        if (relCount > 0) {
            sb.append("Service Dependency Graph Relationships:\n");
            for (String line : rels) sb.append(line).append('\n');
        }
        return new DiagramContext(sb.toString().trim(), elemCount);
    }

    private record Theory(String text, int items) {}
    private record DiagramContext(String text, int elements) {}
}
