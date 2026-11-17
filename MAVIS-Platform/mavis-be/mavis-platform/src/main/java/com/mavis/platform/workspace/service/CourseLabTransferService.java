package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.CourseDefinition;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.CourseDefinitionRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.AccessPolicyService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Moves a Lab between lecturers as a portable file.
 *
 * <p>A bundle carries what a lecturer authored: Lab settings, theory lessons and the Quiz draft.
 * The reference repository is described by URL/commit but never copied, because source snapshots and
 * analyzed models belong to the exporting workspace. The importer re-attaches and analyzes the
 * repository before students can open C1-C3.</p>
 */
@Service
@RequiredArgsConstructor
public class CourseLabTransferService {

    public static final String FORMAT = "mavis.lab.bundle";
    public static final int VERSION = 1;
    private static final int MAX_THEORY_ITEMS = 50;
    private static final int MAX_THEORY_BODY = 20_000;
    private static final int MAX_QUESTIONS = 50;
    private static final Set<String> LAB_MODES = Set.of("LEGACY", "THEORY_QUIZ", "THEORY_QUIZ_STUDIO");

    private final AssignmentRepository assignments;
    private final CourseDefinitionRepository courses;
    private final WorkspaceRepository workspaces;
    private final AccessPolicyService access;
    private final CourseAuthoringService authoring;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public record Bundle(String format, Integer version, String exportedAt, LabInfo lab,
                         SourceInfo source, List<TheoryItem> theory, Quiz quiz) {}

    public record LabInfo(String title, String instructions, String labMode,
                          Boolean requireRuntimeTrace, List<String> requiredDiagramTypes,
                          String ruleSetVersion) {}

    public record SourceInfo(String repositoryUrl, String defaultBranch, String commitSha,
                             Integer modelRevision) {}

    public record TheoryItem(String title, String body) {}

    public record Quiz(String lesson, Integer passPercent, List<CourseQuizService.Question> questions) {}

    public record ImportResult(UUID assignmentId, String title, int theoryCount, boolean quizImported,
                               List<String> notes) {}

    @Transactional(readOnly = true)
    public Bundle exportLab(UUID workspaceId, UUID assignmentId) {
        access.requireWorkspaceLecturer(workspaceId);
        Assignment lab = assignments.findById(assignmentId)
                .filter(value -> workspaceId.equals(value.getWorkspace().getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "LAB_NOT_FOUND",
                        "Lab not found in this workspace"));

        LabInfo info = new LabInfo(lab.getTitle(), lab.getDescription(),
                lab.getLabMode() == null ? "LEGACY" : lab.getLabMode(),
                Boolean.TRUE.equals(lab.getRequireRuntimeTrace()),
                strings(lab.getRequiredDiagramTypes()), lab.getRuleSetVersion());

        return new Bundle(FORMAT, VERSION, OffsetDateTime.now().toString(), info,
                source(lab), theory(workspaceId, assignmentId), quiz(assignmentId));
    }

    @Transactional
    public ImportResult importLab(UUID workspaceId, Bundle bundle) {
        access.requireWorkspaceLecturer(workspaceId);
        validate(bundle);
        Workspace workspace = workspaces.findById(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Workspace not found"));
        User actor = access.requireCurrentActiveUser();

        String mode = bundle.lab().labMode() == null ? "LEGACY" : bundle.lab().labMode().trim().toUpperCase();
        Assignment lab = assignments.save(Assignment.builder()
                .workspace(workspace)
                .createdBy(actor)
                .title(bundle.lab().title().trim())
                .description(blankToNull(bundle.lab().instructions()))
                .labMode(mode)
                .requireRuntimeTrace(Boolean.TRUE.equals(bundle.lab().requireRuntimeTrace()))
                .requiredDiagramTypes(json.valueToTree(bundle.lab().requiredDiagramTypes() == null
                        ? List.of() : bundle.lab().requiredDiagramTypes()))
                .ruleSetVersion(blankToNull(bundle.lab().ruleSetVersion()))
                .build());

        List<TheoryItem> theory = bundle.theory() == null ? List.of() : bundle.theory();
        if (!theory.isEmpty()) {
            ensureEditableCourse(workspace);
            var module = authoring.addModule(workspaceId,
                    new CourseAuthoringService.ModuleRequest("Imported · " + truncate(lab.getTitle(), 230),
                            "Theory imported from a Lab bundle", null));
            UUID moduleId = module.modules().getLast().id();
            for (TheoryItem item : theory) {
                var content = json.createObjectNode().put("body", item.body()).put("format", "markdown");
                authoring.addItem(workspaceId, moduleId, new CourseAuthoringService.ItemRequest(
                        "THEORY", truncate(item.title(), 255), null, lab.getId(), content, true));
            }
        }

        boolean quizImported = false;
        if (bundle.quiz() != null && bundle.quiz().questions() != null && !bundle.quiz().questions().isEmpty()) {
            List<CourseQuizService.Question> questions = normalize(bundle.quiz().questions());
            jdbc.update("""
                    INSERT INTO course_quiz_drafts(assignment_id, lesson, pass_percent, questions, updated_by, updated_at)
                    VALUES (?, ?, ?, CAST(? AS jsonb), ?, now())
                    """, lab.getId(), bundle.quiz().lesson() == null ? "" : bundle.quiz().lesson(),
                    bundle.quiz().passPercent() == null ? 80 : bundle.quiz().passPercent(),
                    encode(questions), actor.getId());
            quizImported = true;
        }

        List<String> notes = new ArrayList<>();
        if (bundle.source() != null && bundle.source().repositoryUrl() != null) {
            notes.add("Reference source was not copied. Attach " + bundle.source().repositoryUrl()
                    + (bundle.source().commitSha() == null ? "" : "@" + bundle.source().commitSha())
                    + " in Reference source, then analyze it to regenerate C1-C3.");
        }
        if (!quizImported) notes.add("No Quiz questions were included in this bundle.");
        return new ImportResult(lab.getId(), lab.getTitle(), theory.size(), quizImported, List.copyOf(notes));
    }

    private void validate(Bundle bundle) {
        if (bundle == null || !FORMAT.equals(bundle.format()) || bundle.version() == null
                || bundle.version() != VERSION) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "LAB_BUNDLE_INVALID",
                    "This file is not a MAVIS Lab bundle (format " + FORMAT + ", version " + VERSION + ")");
        }
        if (bundle.lab() == null || bundle.lab().title() == null || bundle.lab().title().isBlank()
                || bundle.lab().title().trim().length() > 255) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "LAB_BUNDLE_INVALID",
                    "The bundle needs a Lab title of at most 255 characters");
        }
        if (bundle.lab().instructions() != null && bundle.lab().instructions().length() > 10_000) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "LAB_BUNDLE_INVALID",
                    "Lab instructions exceed 10000 characters");
        }
        String mode = bundle.lab().labMode() == null ? "LEGACY" : bundle.lab().labMode().toUpperCase();
        if (!LAB_MODES.contains(mode)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "LAB_BUNDLE_INVALID", "Unsupported Lab mode");
        }
        if (bundle.theory() != null) {
            if (bundle.theory().size() > MAX_THEORY_ITEMS) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "LAB_BUNDLE_INVALID",
                        "A bundle can contain at most " + MAX_THEORY_ITEMS + " theory lessons");
            }
            for (TheoryItem item : bundle.theory()) {
                if (item == null || item.title() == null || item.title().isBlank()) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "LAB_BUNDLE_INVALID",
                            "Every theory lesson needs a title");
                }
                if (item.body() != null && item.body().length() > MAX_THEORY_BODY) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "LAB_BUNDLE_INVALID",
                            "A theory lesson exceeds " + MAX_THEORY_BODY + " characters");
                }
            }
        }
        if (bundle.quiz() != null) {
            int pass = bundle.quiz().passPercent() == null ? 80 : bundle.quiz().passPercent();
            if (pass < 1 || pass > 100) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "LAB_BUNDLE_INVALID",
                        "Quiz pass percent must be between 1 and 100");
            }
            if (bundle.quiz().lesson() != null && bundle.quiz().lesson().length() > 20_000) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "LAB_BUNDLE_INVALID",
                        "Quiz lesson text exceeds 20000 characters");
            }
            if (bundle.quiz().questions() != null && bundle.quiz().questions().size() > MAX_QUESTIONS) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "LAB_BUNDLE_INVALID",
                        "A bundle can contain at most " + MAX_QUESTIONS + " Quiz questions");
            }
        }
    }

    private void ensureEditableCourse(Workspace workspace) {
        CourseDefinition course = courses.findByWorkspaceId(workspace.getId()).orElse(null);
        if (course == null) {
            authoring.saveDraft(workspace.getId(),
                    new CourseAuthoringService.CourseRequest(workspace.getName() + " Course",
                            "Theory imported with Labs"));
            return;
        }
        if ("PUBLISHED".equals(course.getStatus())) authoring.startDraft(workspace.getId());
    }

    private SourceInfo source(Assignment lab) {
        ModelVersion model = lab.getReferenceModel();
        if (model == null) return null;
        SourceSnapshot snapshot = model.getSourceSnapshot();
        String repositoryUrl = model.getProject() == null ? null : model.getProject().getRepositoryUrl();
        String defaultBranch = model.getProject() == null ? null : model.getProject().getDefaultBranch();
        return new SourceInfo(repositoryUrl, defaultBranch,
                snapshot == null ? null : snapshot.getCommitSha(), model.getRevision());
    }

    private List<TheoryItem> theory(UUID workspaceId, UUID assignmentId) {
        return jdbc.query("""
                SELECT ci.title, coalesce(ci.content->>'body', '') AS body
                FROM course_items ci
                JOIN course_modules cm ON cm.id = ci.module_id
                JOIN course_definitions cd ON cd.id = cm.course_id
                WHERE cd.workspace_id = ? AND ci.item_type = 'THEORY'
                  AND cm.id IN (SELECT linked.module_id FROM course_items linked WHERE linked.assignment_id = ?)
                ORDER BY cm.position, ci.position
                """, (rs, row) -> new TheoryItem(rs.getString("title"), rs.getString("body")),
                workspaceId, assignmentId);
    }

    private Quiz quiz(UUID assignmentId) {
        Quiz published = jdbc.query("""
                SELECT lesson, pass_percent, questions::text FROM course_quizzes
                WHERE assignment_id = ? ORDER BY version DESC LIMIT 1
                """, (rs, row) -> new Quiz(rs.getString(1), rs.getInt(2),
                        decode(rs.getString(3))), assignmentId).stream().findFirst().orElse(null);
        if (published != null) return published;
        return jdbc.query("""
                SELECT lesson, pass_percent, questions::text FROM course_quiz_drafts
                WHERE assignment_id = ?
                """, (rs, row) -> new Quiz(rs.getString(1), rs.getInt(2),
                        decode(rs.getString(3))), assignmentId).stream().findFirst().orElse(null);
    }

    private List<String> strings(JsonNode node) {
        if (node == null || !node.isArray()) return List.of();
        List<String> values = new ArrayList<>();
        node.forEach(value -> values.add(value.asText()));
        return List.copyOf(values);
    }

    private List<CourseQuizService.Question> decode(String raw) {
        try {
            List<CourseQuizService.Question> parsed = json.readValue(raw,
                    new TypeReference<List<CourseQuizService.Question>>() {});
            return normalize(parsed);
        } catch (JsonProcessingException error) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "LAB_BUNDLE_CORRUPT",
                    "Stored Quiz questions could not be read");
        }
    }

    private List<CourseQuizService.Question> normalize(List<CourseQuizService.Question> questions) {
        List<CourseQuizService.Question> normalized = new ArrayList<>();
        for (int index = 0; index < questions.size(); index++) {
            normalized.add(CourseQuizService.normalizeQuestion(questions.get(index), index));
        }
        return List.copyOf(normalized);
    }

    private String encode(List<CourseQuizService.Question> questions) {
        try {
            return json.writeValueAsString(questions);
        } catch (JsonProcessingException error) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "LAB_BUNDLE_CORRUPT",
                    "Quiz questions could not be encoded");
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String truncate(String value, int max) {
        if (value == null) return "";
        return value.length() <= max ? value : value.substring(0, max);
    }
}
