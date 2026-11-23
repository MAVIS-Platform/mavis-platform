package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.DiagramVersion;
import com.mavis.common.entity.EvaluationRun;
import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.DiagramVersionRepository;
import com.mavis.common.repository.EvaluationRunRepository;
import com.mavis.common.repository.EvidenceRepository;
import com.mavis.common.repository.ModelElementRepository;
import com.mavis.common.repository.ModelRelationshipRepository;
import com.mavis.common.repository.ModelVersionRepository;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.SourceSnapshotRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.utils.HashUtils;
import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.CourseraModuleSpec;
import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.LessonSpec;
import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.RubricCriterion;
import com.mavis.platform.workspace.curriculum.CsharpCourseraCatalog;
import com.mavis.platform.workspace.curriculum.JavaCourseraCatalog;
import com.mavis.platform.workspace.curriculum.V2CurriculumJsonLoader;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
@Transactional
@Slf4j
public class CourseLabSeederService {
    private static final String ACTION_SEEDED = "COURSE_LABS_SEEDED_CURATED";
    public static final String PRESET_STANDARD_DEMO = "STANDARD_DEMO";
    public static final String PRESET_FULL_CURRICULUM = "FULL_CURRICULUM";
    public static final String PRESET_JAVA_COURSERA = "JAVA_COURSERA_FULL";
    public static final String PRESET_CSHARP_COURSERA = "CSHARP_COURSERA_FULL";
    private static final ThreadLocal<java.util.Set<UUID>> SEEDING_IN_PROGRESS =
            ThreadLocal.withInitial(java.util.HashSet::new);

    public static boolean isSeeding(UUID workspaceId) {
        return workspaceId != null && SEEDING_IN_PROGRESS.get().contains(workspaceId);
    }

    private record LabSeedSpec(
            String curriculumCode,
            String title,
            String description,
            List<String> requiredDiagramTypes,
            boolean requireRuntimeTrace) {}

    private final AccessPolicyService access;
    private final WorkspaceRepository workspaces;
    private final AssignmentRepository assignments;
    private final ProjectRepository projects;
    private final SourceSnapshotRepository snapshots;
    private final ModelVersionRepository models;
    private final ModelElementRepository elements;
    private final ModelRelationshipRepository relationships;
    private final DiagramVersionRepository diagrams;
    private final EvaluationRunRepository evaluations;
    private final EvidenceRepository evidences;
    private final CourseCurriculum curriculum;
    private final CourseQuizService quizzes;
    private final CourseAccessService courses;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final Path storageRoot;

    @Autowired(required = false)
    private CourseAuthoringService courseAuthoring;

    @Autowired
    public CourseLabSeederService(
            AccessPolicyService access,
            WorkspaceRepository workspaces,
            AssignmentRepository assignments,
            ProjectRepository projects,
            SourceSnapshotRepository snapshots,
            ModelVersionRepository models,
            ModelElementRepository elements,
            ModelRelationshipRepository relationships,
            DiagramVersionRepository diagrams,
            EvaluationRunRepository evaluations,
            EvidenceRepository evidences,
            CourseCurriculum curriculum,
            CourseQuizService quizzes,
            CourseAccessService courses,
            JdbcTemplate jdbc,
            ObjectMapper json,
            @Value("${mavis.storage.upload-dir:${java.io.tmpdir}/mavis-uploads}") String uploadDir) {
        this.access = access;
        this.workspaces = workspaces;
        this.assignments = assignments;
        this.projects = projects;
        this.snapshots = snapshots;
        this.models = models;
        this.elements = elements;
        this.relationships = relationships;
        this.diagrams = diagrams;
        this.evaluations = evaluations;
        this.evidences = evidences;
        this.curriculum = curriculum;
        this.quizzes = quizzes;
        this.courses = courses;
        this.jdbc = jdbc;
        this.json = json;
        this.storageRoot = Path.of(uploadDir);
    }

    public CourseAccessService.Roadmap seedCurated(UUID workspaceId) {
        return seedCurated(workspaceId, PRESET_STANDARD_DEMO);
    }

    private record CourseraTrackSpec(
            String courseTitle,
            String courseDescription,
            List<CourseraModuleSpec> modules,
            List<LessonSpec> allLessons,
            List<String> runtimeServices,
            boolean csharpTrack,
            String auditAction) {
        static CourseraTrackSpec javaV2() {
            return new CourseraTrackSpec(
                    JavaCourseraCatalog.COURSE_TITLE,
                    JavaCourseraCatalog.COURSE_DESCRIPTION,
                    JavaCourseraCatalog.modules(),
                    JavaCourseraCatalog.allLessons(),
                    MocHuongReferenceArchitectureBuilder.REAL_MICROSERVICES,
                    false,
                    "COURSE_JAVA_COURSERA_SEEDED");
        }

        static CourseraTrackSpec csharpV2() {
            return new CourseraTrackSpec(
                    CsharpCourseraCatalog.COURSE_TITLE,
                    CsharpCourseraCatalog.COURSE_DESCRIPTION,
                    CsharpCourseraCatalog.modules(),
                    CsharpCourseraCatalog.allLessons(),
                    CsharpCourseraCatalog.CURATED_SERVICES,
                    true,
                    "COURSE_CSHARP_COURSERA_SEEDED");
        }

        CourseQuizService.Publish toQuizPublish(CourseraModuleSpec modSpec) {
            return csharpTrack
                    ? CsharpCourseraCatalog.toQuizPublishRequest(modSpec)
                    : JavaCourseraCatalog.toQuizPublishRequest(modSpec);
        }
    }

    public static boolean isCourseraLabsAligned(List<Assignment> existingLabs, List<CourseraModuleSpec> modules) {
        if (existingLabs == null || modules == null || existingLabs.size() != modules.size()) {
            return false;
        }
        for (int i = 0; i < modules.size(); i++) {
            Assignment lab = existingLabs.get(i);
            boolean runtimeRequired = modules.get(i).visualLab() != null
                    && modules.get(i).visualLab().requireRuntimeTrace();
            if (lab == null
                    || !Integer.valueOf(i + 1).equals(lab.getLabOrder())
                    || !modules.get(i).labTitle().equals(lab.getTitle())
                    || !Boolean.valueOf(runtimeRequired).equals(lab.getRequireRuntimeTrace())) {
                return false;
            }
        }
        return true;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void ensureJavaCourseraPopulated(UUID workspaceId) {
        ensureCourseraTrackPopulated(workspaceId, CourseraTrackSpec.javaV2());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void ensureCsharpCourseraPopulated(UUID workspaceId) {
        ensureCourseraTrackPopulated(workspaceId, CourseraTrackSpec.csharpV2());
    }

    private void ensureCourseraTrackPopulated(UUID workspaceId, CourseraTrackSpec track) {
        if (workspaceId == null || isSeeding(workspaceId)) {
            return;
        }
        Workspace workspace = workspaces.findById(workspaceId).orElse(null);
        if (workspace == null || !"ACTIVE".equals(workspace.getStatus())) {
            return;
        }
        User actor = workspace.getCreatedBy();
        if (actor == null) {
            return;
        }
        List<Assignment> existingLabs = assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId);
        Integer publishedModules = jdbc.queryForObject("""
                SELECT COUNT(*) FROM course_modules cm
                JOIN course_definitions c ON c.id = cm.course_id
                WHERE c.workspace_id = ? AND c.status = 'PUBLISHED'
                """, Integer.class, workspaceId);
        int expectedModules = track.modules().size();
        if (!track.csharpTrack() && !existingLabs.isEmpty() && needsMocHuongUpgrade(existingLabs)) {
            SEEDING_IN_PROGRESS.get().add(workspaceId);
            try {
                upgradeJavaWorkspaceToMocHuong(workspaceId, existingLabs);
            } catch (Exception ex) {
                log.warn("Auto-upgrading workspace {} to Moc Huong reference architecture deferred: {}",
                        workspaceId, ex.getMessage());
            } finally {
                SEEDING_IN_PROGRESS.get().remove(workspaceId);
            }
        }
        if (isCourseraLabsAligned(existingLabs, track.modules())
                && publishedModules != null && publishedModules >= expectedModules) {
            return;
        }
        Authentication previous = SecurityContextHolder.getContext().getAuthentication();
        SEEDING_IN_PROGRESS.get().add(workspaceId);
        try {
            var auth = new UsernamePasswordAuthenticationToken(
                    actor.getId().toString(), null, List.of(new SimpleGrantedAuthority("ROLE_LECTURER")));
            SecurityContextHolder.getContext().setAuthentication(auth);
            seedCourseraInternal(workspaceId, workspace, actor, track);
        } catch (Exception ex) {
            log.warn("Auto-healing Coursera workspace {} deferred: {}", workspaceId, ex.getMessage());
        } finally {
            SEEDING_IN_PROGRESS.get().remove(workspaceId);
            if (previous != null) {
                SecurityContextHolder.getContext().setAuthentication(previous);
            } else {
                SecurityContextHolder.clearContext();
            }
        }
    }

    public CourseAccessService.Roadmap seedCurated(UUID workspaceId, String preset) {
        User lecturer = access.requireCurrentActiveUser();
        access.requireWorkspaceLecturer(workspaceId);
        Workspace workspace = workspaces.findLockedById(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Workspace not found"));
        if (!"ACTIVE".equals(workspace.getStatus())) {
            throw new BusinessException(ErrorCode.CONFLICT, "This workspace is archived");
        }

        String normalizedPreset = preset == null ? "" : preset.trim();
        if (PRESET_JAVA_COURSERA.equalsIgnoreCase(normalizedPreset)) {
            return seedCourseraInternal(workspaceId, workspace, lecturer, CourseraTrackSpec.javaV2());
        }
        if (PRESET_CSHARP_COURSERA.equalsIgnoreCase(normalizedPreset)) {
            return seedCourseraInternal(workspaceId, workspace, lecturer, CourseraTrackSpec.csharpV2());
        }

        boolean fullCurriculum = PRESET_FULL_CURRICULUM.equalsIgnoreCase(normalizedPreset);
        List<Assignment> existingLabs = assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId);
        upgradeExistingLabsIfSafe(existingLabs);

        if (!fullCurriculum && !existingLabs.isEmpty()) {
            ensureCourseMode(workspace);
            existingLabs.stream()
                    .map(Assignment::getReferenceModel)
                    .filter(java.util.Objects::nonNull)
                    .findFirst()
                    .ifPresent(ref -> ensureReferenceRuntimeSetup(ref, java.util.Map.of()));
            syncCuratedCourseOutline(workspaceId, workspace);
            return courses.roadmap(workspaceId);
        }
        if (fullCurriculum && existingLabs.size() >= 13) {
            ensureCourseMode(workspace);
            existingLabs.stream()
                    .map(Assignment::getReferenceModel)
                    .filter(java.util.Objects::nonNull)
                    .findFirst()
                    .ifPresent(ref -> ensureReferenceRuntimeSetup(ref, java.util.Map.of()));
            syncCuratedCourseOutline(workspaceId, workspace);
            return courses.roadmap(workspaceId);
        }

        ModelVersion refModel = existingLabs.stream()
                .map(Assignment::getReferenceModel)
                .filter(java.util.Objects::nonNull)
                .findFirst()
                .orElseGet(() -> seedReferenceModel(workspaceId, workspace, lecturer));
        ensureReferenceRuntimeSetup(refModel, java.util.Map.of());

        ensureCourseMode(workspace);

        Set<String> existingTitles = new LinkedHashSet<>();
        int nextOrder = 0;
        for (Assignment existing : existingLabs) {
            if (existing.getTitle() != null) {
                existingTitles.add(existing.getTitle());
            }
            if (existing.getLabOrder() != null && existing.getLabOrder() > nextOrder) {
                nextOrder = existing.getLabOrder();
            }
        }

        List<LabSeedSpec> specs = buildLabSpecs(fullCurriculum);
        for (LabSeedSpec spec : specs) {
            if (existingTitles.contains(spec.title())) {
                continue;
            }
            Assignment.AssignmentBuilder labBuilder = Assignment.builder()
                    .workspace(workspace)
                    .createdBy(lecturer)
                    .title(spec.title())
                    .description(spec.description())
                    .labMode(spec.requireRuntimeTrace() ? "THEORY_QUIZ_STUDIO" : "THEORY_QUIZ")
                    .requiredDiagramTypes(json.valueToTree(spec.requiredDiagramTypes()))
                    .ruleSetVersion("SWD_DEFAULT_V1")
                    .requireRuntimeTrace(spec.requireRuntimeTrace())
                    .referenceModel(refModel)
                    .labOrder(++nextOrder);
            if (spec.requireRuntimeTrace()) {
                labBuilder.studioTopologySnapshot(buildDefaultStudioTopology())
                        .studioTopologyRevision(1);
            }
            Assignment lab = assignments.saveAndFlush(labBuilder.build());
            quizzes.publishCurriculum(workspaceId, lab.getId(), curriculum.quizFor(spec.curriculumCode()));
        }

        syncCuratedCourseOutline(workspaceId, workspace);

        jdbc.update("INSERT INTO audit_logs(actor_id, action, target_type, target_id) VALUES (?, ?, ?, ?)",
                lecturer.getId(), ACTION_SEEDED, "WORKSPACE", workspaceId);

        return courses.roadmap(workspaceId);
    }

    private CourseAccessService.Roadmap seedCourseraInternal(
            UUID workspaceId, Workspace workspace, User lecturer, CourseraTrackSpec track) {
        boolean addedFlag = !isSeeding(workspaceId);
        if (addedFlag) {
            SEEDING_IN_PROGRESS.get().add(workspaceId);
        }
        try {
            return runSeedCourseraInternal(workspaceId, workspace, lecturer, track);
        } finally {
            if (addedFlag) {
                SEEDING_IN_PROGRESS.get().remove(workspaceId);
            }
        }
    }

    private CourseAccessService.Roadmap runSeedCourseraInternal(
            UUID workspaceId, Workspace workspace, User lecturer, CourseraTrackSpec track) {
        ensureCourseMode(workspace);
        List<Assignment> existingLabs = assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId);
        ModelVersion refModel = existingLabs.stream()
                .map(Assignment::getReferenceModel)
                .filter(java.util.Objects::nonNull)
                .findFirst()
                .orElseGet(() -> seedReferenceModel(workspaceId, workspace, lecturer));
        if (!track.csharpTrack() && !existingLabs.isEmpty() && needsMocHuongUpgrade(existingLabs)) {
            upgradeJavaWorkspaceToMocHuong(workspaceId, existingLabs);
        }
        ensureReferenceRuntimeSetup(refModel, java.util.Map.of());

        List<CourseraModuleSpec> catalogModules = track.modules();
        Set<UUID> matchedIds = new LinkedHashSet<>();
        List<Assignment> matchedByIndex = new ArrayList<>(catalogModules.size());
        for (CourseraModuleSpec modSpec : catalogModules) {
            Assignment match = existingLabs.stream()
                    .filter(a -> modSpec.labTitle().equals(a.getTitle())
                            || V2CurriculumJsonLoader.isSameLabTitle(modSpec.labTitle(), a.getTitle()))
                    .filter(a -> a.getId() == null || !matchedIds.contains(a.getId()))
                    .findFirst()
                    .orElse(null);
            if (match != null && match.getId() != null) {
                matchedIds.add(match.getId());
            }
            matchedByIndex.add(match);
        }

        List<Assignment> staleLabs = existingLabs.stream()
                .filter(a -> a.getId() != null ? !matchedIds.contains(a.getId()) : !matchedByIndex.contains(a))
                .toList();

        boolean needsReorder = !staleLabs.isEmpty();
        if (!needsReorder) {
            for (int i = 0; i < catalogModules.size(); i++) {
                Assignment m = matchedByIndex.get(i);
                if (m != null && !Integer.valueOf(i + 1).equals(m.getLabOrder())) {
                    needsReorder = true;
                    break;
                }
            }
        }

        if (needsReorder) {
            // Clear colliding lab_order values first to satisfy uq_workspace_lab_order on PostgreSQL.
            for (Assignment stale : staleLabs) {
                stale.setLabOrder(null);
                stale.setAiPolicy(markArchivedV1(stale.getAiPolicy()));
                assignments.saveAndFlush(stale);
                if (stale.getId() != null) {
                    try {
                        jdbc.update("DELETE FROM lab_prerequisites WHERE assignment_id = ? OR prerequisite_assignment_id = ?",
                                stale.getId(), stale.getId());
                    } catch (Exception ex) {
                        log.debug("Skipped pruning lab_prerequisites for detached lab {}: {}", stale.getId(), ex.getMessage());
                    }
                }
            }
            for (int i = 0; i < catalogModules.size(); i++) {
                Assignment m = matchedByIndex.get(i);
                if (m != null && m.getLabOrder() != null && !Integer.valueOf(i + 1).equals(m.getLabOrder())) {
                    m.setLabOrder(null);
                    assignments.saveAndFlush(m);
                }
            }
        }

        List<Assignment> orderedLabs = new ArrayList<>(catalogModules.size());
        for (int i = 0; i < catalogModules.size(); i++) {
            int targetOrder = i + 1;
            CourseraModuleSpec modSpec = catalogModules.get(i);
            Assignment match = matchedByIndex.get(i);
            if (match == null) {
                boolean runtime = modSpec.visualLab() != null && modSpec.visualLab().requireRuntimeTrace();
                List<String> diagramTypes = modSpec.visualLab() != null
                        ? modSpec.visualLab().requiredDiagramTypes()
                        : List.of("C4_CONTAINER", "C4_COMPONENT");
                Assignment.AssignmentBuilder labBuilder = Assignment.builder()
                        .workspace(workspace)
                        .createdBy(lecturer)
                        .title(modSpec.labTitle())
                        .description(modSpec.labDescription())
                        .labMode(runtime ? "THEORY_QUIZ_STUDIO" : "THEORY_QUIZ")
                        .requiredDiagramTypes(json.valueToTree(diagramTypes))
                        .ruleSetVersion("SWD_DEFAULT_V1")
                        .requireRuntimeTrace(runtime)
                        .referenceModel(refModel)
                        .labOrder(targetOrder);
                if (runtime) {
                    labBuilder.studioTopologySnapshot(buildStudioTopologyForServices(track.runtimeServices()))
                            .studioTopologyRevision(1);
                }
                match = assignments.saveAndFlush(labBuilder.build());
            } else {
                boolean runtime = modSpec.visualLab() != null && modSpec.visualLab().requireRuntimeTrace();
                boolean changed = !Integer.valueOf(targetOrder).equals(match.getLabOrder())
                        || !modSpec.labTitle().equals(match.getTitle())
                        || !modSpec.labDescription().equals(match.getDescription())
                        || !Boolean.valueOf(runtime).equals(match.getRequireRuntimeTrace());
                if (changed) {
                    match.setLabOrder(targetOrder);
                    match.setTitle(modSpec.labTitle());
                    match.setDescription(modSpec.labDescription());
                    match.setRequireRuntimeTrace(runtime);
                    match.setLabMode(runtime ? "THEORY_QUIZ_STUDIO" : "THEORY_QUIZ");
                    if (runtime && match.getStudioTopologySnapshot() == null) {
                        match.setStudioTopologySnapshot(buildStudioTopologyForServices(track.runtimeServices()));
                        match.setStudioTopologyRevision(1);
                    }
                    match = assignments.saveAndFlush(match);
                }
            }
            quizzes.publishCurriculum(workspaceId, match.getId(), track.toQuizPublish(modSpec));
            orderedLabs.add(match);
        }

        syncCourseraOutline(workspaceId, orderedLabs, track);
        syncTheoryAssetsLibrary(workspaceId, lecturer != null ? lecturer.getId() : null, track.allLessons());

        jdbc.update("INSERT INTO audit_logs(actor_id, action, target_type, target_id) VALUES (?, ?, ?, ?)",
                lecturer.getId(), track.auditAction(), "WORKSPACE", workspaceId);

        return courses.roadmap(workspaceId);
    }

    private void syncCourseraOutline(UUID workspaceId, List<Assignment> orderedLabs, CourseraTrackSpec track) {
        if (courseAuthoring == null || orderedLabs.isEmpty()) {
            return;
        }
        try {
            List<CourseraModuleSpec> catalogModules = track.modules();
            int expectedItemCount = track.allLessons().size() + catalogModules.size() * 3;
            var existing = courseAuthoring.findExistingForAuthoring(workspaceId).orElse(null);
            boolean upToDate = false;
            if (existing != null
                    && "PUBLISHED".equals(existing.status())
                    && existing.publishedVersion() >= 1
                    && track.courseTitle().equals(existing.title())
                    && existing.modules() != null
                    && existing.modules().size() == catalogModules.size()) {
                int totalItems = existing.modules().stream()
                        .mapToInt(m -> m.items() != null ? m.items().size() : 0)
                        .sum();
                String firstTheoryBody = existing.modules().stream()
                        .flatMap(m -> m.items().stream())
                        .filter(item -> "THEORY".equals(item.type()) && item.content() != null)
                        .map(item -> item.content().path("body").asText(""))
                        .findFirst()
                        .orElse("");
                boolean hasMojibake = existing.modules().stream()
                        .flatMap(m -> m.items().stream())
                        .anyMatch(item -> item.content() != null
                                && item.content().path("body").asText("").contains("ðŸ"));
                boolean hasStaleStepCopy = existing.modules().stream()
                        .flatMap(m -> m.items().stream())
                        .anyMatch(item -> {
                            if (item.content() == null) return false;
                            String body = item.content().path("body").asText("");
                            return body.contains("Step 4 (MAVIS Studio)")
                                    || body.contains("MAVIS Studio (Step 4)")
                                    || body.contains("Step 4 —")
                                    || body.contains("Step 3 & Step 4");
                        });
                upToDate = totalItems >= expectedItemCount && firstTheoryBody.length() >= 1500
                        && !hasMojibake && !hasStaleStepCopy;
            }
            if (upToDate) {
                return;
            }
            if (existing != null && "ARCHIVED".equals(existing.status())) {
                log.warn("Skipped syncing archived Coursera outline for workspace {}", workspaceId);
                return;
            }
            if (existing != null && "PUBLISHED".equals(existing.status())) {
                existing = courseAuthoring.startDraft(workspaceId);
            }
            existing = courseAuthoring.saveDraft(workspaceId, new CourseAuthoringService.CourseRequest(
                    track.courseTitle(),
                    track.courseDescription()));
            if (existing.modules() != null && !existing.modules().isEmpty()) {
                for (CourseAuthoringService.ModuleView staleModule : List.copyOf(existing.modules())) {
                    courseAuthoring.deleteModule(workspaceId, staleModule.id());
                }
            }

            for (int i = 0; i < catalogModules.size() && i < orderedLabs.size(); i++) {
                CourseraModuleSpec modSpec = catalogModules.get(i);
                Assignment lab = orderedLabs.get(i);
                CourseAuthoringService.CourseView afterModule = courseAuthoring.addModule(
                        workspaceId, new CourseAuthoringService.ModuleRequest(
                                modSpec.title(), modSpec.description(), null));
                UUID moduleId = afterModule.modules().getLast().id();

                for (LessonSpec lesson : modSpec.lessons()) {
                    ObjectNode content = json.createObjectNode();
                    content.put("body", lesson.bodyMarkdown());
                    content.put("curriculumCode", lesson.curriculumCode());
                    content.put("estimatedMinutes", lesson.estimatedMinutes());
                    courseAuthoring.addItem(workspaceId, moduleId,
                            new CourseAuthoringService.ItemRequest(
                                    "THEORY", lesson.title(), lesson.summary(), null, content, true));
                }

                courseAuthoring.addItem(workspaceId, moduleId,
                        new CourseAuthoringService.ItemRequest(
                                "QUIZ",
                                "Quiz Module " + modSpec.position() + " · Kiểm tra Trắc nghiệm (" + modSpec.quizQuestions().size() + " câu)",
                                "Vượt qua Quiz Gate (>= 70%) để mở khóa bài thực hành tiếp theo.",
                                lab.getId(), json.createObjectNode(), true));

                if (modSpec.essay() != null) {
                    ObjectNode essayContent = json.createObjectNode();
                    essayContent.put("prompt", modSpec.essay().promptMarkdown());
                    ArrayNode rubricArr = essayContent.putArray("rubric");
                    for (RubricCriterion c : modSpec.essay().rubric()) {
                        ObjectNode node = rubricArr.addObject();
                        node.put("title", c.criterion());
                        node.put("criterion", c.criterion());
                        node.put("description", c.excellentDescription());
                        node.put("excellentDescription", c.excellentDescription());
                        node.put("points", c.weightPoints());
                        node.put("weightPoints", c.weightPoints());
                        node.put("maxScore", c.weightPoints());
                    }
                    courseAuthoring.addItem(workspaceId, moduleId,
                            new CourseAuthoringService.ItemRequest(
                                    "ESSAY", modSpec.essay().title(), modSpec.essay().description(),
                                    null, essayContent, true));
                }

                if (modSpec.visualLab() != null) {
                    String resolvedLabType = "RUNTIME_LAB".equals(modSpec.visualLab().itemType())
                            && !Boolean.TRUE.equals(lab.getRequireRuntimeTrace())
                            ? "IMPACT_LAB"
                            : modSpec.visualLab().itemType();
                    courseAuthoring.addItem(workspaceId, moduleId,
                            new CourseAuthoringService.ItemRequest(
                                    resolvedLabType,
                                    modSpec.visualLab().title(),
                                    modSpec.visualLab().description(),
                                    lab.getId(), json.createObjectNode(), true));
                }
            }
            courseAuthoring.publish(workspaceId);
            log.info("Published {}-module Coursera V2 outline for workspace {}", catalogModules.size(), workspaceId);
        } catch (RuntimeException ex) {
            log.warn("Could not publish Coursera outline for workspace {}", workspaceId);
            throw ex;
        }
    }

    private void syncTheoryAssetsLibrary(UUID workspaceId, UUID creatorId, List<LessonSpec> lessons) {
        try {
            List<String> existingTitles = jdbc.queryForList(
                    "SELECT title FROM theory_assets WHERE workspace_id = ?", String.class, workspaceId);
            Set<String> seen = existingTitles != null ? new LinkedHashSet<>(existingTitles) : Set.of();
            for (LessonSpec lesson : lessons) {
                if (seen.contains(lesson.title())) {
                    jdbc.update("""
                            UPDATE theory_assets
                            SET body = ?, updated_at = now()
                            WHERE workspace_id = ? AND title = ?
                            """, lesson.bodyMarkdown(), workspaceId, lesson.title());
                    continue;
                }
                jdbc.update("""
                        INSERT INTO theory_assets (id, workspace_id, title, body, language, style, source, version, created_by, created_at, updated_at)
                        VALUES (?, ?, ?, ?, 'vi', 'GUIDED', 'SEED', 1, ?, now(), now())
                        """, UUID.randomUUID(), workspaceId, lesson.title(), lesson.bodyMarkdown(), creatorId);
            }
        } catch (Exception ex) {
            log.debug("Skipped syncing theory_assets library for workspace {}: {}", workspaceId, ex.getMessage());
        }
    }

    private void syncCuratedCourseOutline(UUID workspaceId, Workspace workspace) {
        if (courseAuthoring == null) {
            return;
        }
        try {
            var existing = courseAuthoring.findExistingForAuthoring(workspaceId).orElse(null);
            if (existing != null && existing.modules() != null && !existing.modules().isEmpty()) {
                return;
            }
            List<Assignment> allLabs = assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId);
            if (allLabs.isEmpty()) {
                return;
            }
            if (existing != null && "PUBLISHED".equals(existing.status())) {
                courseAuthoring.startDraft(workspaceId);
            } else {
                String courseTitle = (workspace.getName() == null || workspace.getName().isBlank())
                        ? "Microservices Architecture Curated Course"
                        : workspace.getName() + " · Giáo trình Microservices";
                courseAuthoring.saveDraft(workspaceId, new CourseAuthoringService.CourseRequest(
                        courseTitle.length() > 255 ? courseTitle.substring(0, 255) : courseTitle,
                        "Giáo trình & chuỗi bài Lab thực hành kiến trúc phần mềm Microservices (C4, 3E, Reverse BFS, Quiz Gate & MAVIS Studio Live)."));
            }

            List<List<Assignment>> groups = partitionLabsIntoModules(allLabs);
            List<String> moduleTitles = groups.size() == 1
                    ? List.of("Chặng 1 · Nền tảng Kiến trúc & Thực hành Microservices")
                    : List.of(
                            "Chặng 1 · Nền tảng Kiến trúc & Ranh giới Dữ liệu",
                            "Chặng 2 · Giao tiếp Dịch vụ & API Gateway",
                            "Chặng 3 · Khả năng Chịu lỗi & Bất đồng bộ",
                            "Chặng 4 · Quan sát Hệ thống & Tổng kết");

            for (int i = 0; i < groups.size(); i++) {
                List<Assignment> chunk = groups.get(i);
                if (chunk.isEmpty()) continue;
                String title = i < moduleTitles.size() ? moduleTitles.get(i) : "Module " + (i + 1);
                CourseAuthoringService.CourseView afterModule = courseAuthoring.addModule(
                        workspaceId, new CourseAuthoringService.ModuleRequest(title, null, null));
                UUID moduleId = afterModule.modules().getLast().id();

                for (Assignment lab : chunk) {
                    String theoryBody = "## " + lab.getTitle() + "\n\n"
                            + (lab.getDescription() != null && !lab.getDescription().isBlank()
                                    ? lab.getDescription()
                                    : "Nghiên cứu kiến trúc tham chiếu C1–C3, quy tắc 3E và luồng phụ thuộc trước khi làm Quiz Gate.")
                            + "\n\n- Quan sát sơ đồ kiến trúc C1–C3 và đồ thị phụ thuộc ở Bước 1.\n"
                            + "- Phân tích vùng ảnh hưởng bằng Reverse BFS ở Bước 2.\n"
                            + "- Vượt qua Quiz Gate (>= 70%) trước khi thực nghiệm trên MAVIS Runtime Studio và nộp bằng chứng.";
                    ObjectNode theoryContent = json.createObjectNode().put("body", theoryBody);
                    courseAuthoring.addItem(workspaceId, moduleId,
                            new CourseAuthoringService.ItemRequest(
                                    "THEORY", "Lý thuyết · " + lab.getTitle(),
                                    "Kiến thức trọng tâm chuẩn bị cho Lab", null, theoryContent, true));
                    courseAuthoring.addItem(workspaceId, moduleId,
                            new CourseAuthoringService.ItemRequest(
                                    "QUIZ", "Quiz Gate · " + lab.getTitle(),
                                    "Kiểm tra nhận thức mở khóa Lab", lab.getId(), json.createObjectNode(), true));
                    boolean isRuntime = Boolean.TRUE.equals(lab.getRequireRuntimeTrace());
                    courseAuthoring.addItem(workspaceId, moduleId,
                            new CourseAuthoringService.ItemRequest(
                                    isRuntime ? "RUNTIME_LAB" : "STATIC_LAB", lab.getTitle(),
                                    isRuntime ? "Thực nghiệm Studio Live & Nộp hồ sơ V2" : "Phân tích Tĩnh 3E & Nộp hồ sơ V2",
                                    lab.getId(), json.createObjectNode(), true));
                }
            }
            courseAuthoring.publish(workspaceId);
        } catch (RuntimeException ex) {
            log.warn("Could not publish curated course outline for workspace {}", workspaceId);
            throw ex;
        }
    }

    private static List<List<Assignment>> partitionLabsIntoModules(List<Assignment> labs) {
        if (labs.size() <= 3) {
            return List.of(labs);
        }
        List<Assignment> m1 = new ArrayList<>();
        List<Assignment> m2 = new ArrayList<>();
        List<Assignment> m3 = new ArrayList<>();
        List<Assignment> m4 = new ArrayList<>();
        for (int i = 0; i < labs.size(); i++) {
            if (i < 3) m1.add(labs.get(i));
            else if (i < 6) m2.add(labs.get(i));
            else if (i < 10) m3.add(labs.get(i));
            else m4.add(labs.get(i));
        }
        return List.of(m1, m2, m3, m4);
    }

    private void ensureCourseMode(Workspace workspace) {
        if (!workspace.isCourseMode()) {
            workspace.setCourseMode(true);
            workspaces.saveAndFlush(workspace);
        }
    }

    private ModelVersion seedReferenceModel(UUID workspaceId, Workspace workspace, User lecturer) {
        Project refProject = projects.save(Project.builder()
                .workspace(workspace)
                .owner(lecturer)
                .name(MocHuongReferenceArchitectureBuilder.SYSTEM_NAME)
                .description("Curated Java 21 / Spring Boot 3 microservices repository (Service Discovery, API Gateway, Identity, Catalog, Order, Notification) from MAVIS-Platform/Moc-Huong-Shop.")
                .defaultBranch("main")
                .projectType("TEACHER_REFERENCE")
                .isReferenceTemplate(true)
                .status("ACTIVE")
                .build());

        byte[] zipBytes = MocHuongReferenceArchitectureBuilder.buildMocHuongArchive();
        Path archivePath = persistArchive(workspaceId, refProject.getId(), zipBytes);
        String sha256 = HashUtils.sha256Hex(zipBytes);

        SourceSnapshot refSnapshot = snapshots.save(SourceSnapshot.builder()
                .project(refProject)
                .sourceType("ZIP_UPLOAD")
                .branchName("main")
                .artifactHash(sha256)
                .storagePath(archivePath.toString())
                .isPublished(true)
                .createdBy(lecturer)
                .build());
        refProject.setReferenceSnapshotId(refSnapshot.getId());
        projects.saveAndFlush(refProject);

        ModelVersion refModel = models.saveAndFlush(ModelVersion.builder()
                .project(refProject)
                .sourceSnapshot(refSnapshot)
                .revision(1)
                .schemaVersion("1.0")
                .origin("GENERATED")
                .isLatestValid(true)
                .createdBy(lecturer)
                .build());

        MocHuongReferenceArchitectureBuilder.BuiltResult built = MocHuongReferenceArchitectureBuilder.populate(
                json,
                refModel,
                refSnapshot,
                new MocHuongReferenceArchitectureBuilder.PersistenceHooks(
                        elements::save,
                        relationships::save,
                        evidences::save,
                        diagrams::saveAll,
                        evaluations::save
                ));

        ensureReferenceRuntimeSetup(refModel, built.serviceIds());

        return refModel;
    }

    private boolean needsMocHuongUpgrade(List<Assignment> existingLabs) {
        if (existingLabs == null || existingLabs.isEmpty()) {
            return false;
        }
        ModelVersion refModel = existingLabs.stream()
                .map(Assignment::getReferenceModel)
                .filter(java.util.Objects::nonNull)
                .findFirst()
                .orElse(null);
        if (refModel == null || refModel.getId() == null || refModel.getProject() == null) {
            return false;
        }
        List<ModelElement> existing = elements.findByModelVersionId(refModel.getId());
        if (existing == null || existing.isEmpty()) {
            return false;
        }
        String projName = refModel.getProject().getName();
        if (!MocHuongReferenceArchitectureBuilder.SYSTEM_NAME.equals(projName)) {
            return true;
        }
        boolean hasFake = existing.stream()
                .anyMatch(e -> "payment-service".equalsIgnoreCase(e.getName())
                        || "inventory-service".equalsIgnoreCase(e.getName()));
        if (hasFake) {
            return true;
        }
        boolean hasCatalog = existing.stream().anyMatch(e -> "catalog-service".equalsIgnoreCase(e.getName()));
        boolean hasIdentity = existing.stream().anyMatch(e -> "identity-service".equalsIgnoreCase(e.getName()));
        boolean hasActors = existing.stream().anyMatch(e -> "PERSON".equalsIgnoreCase(e.getElementType()));
        return !(hasCatalog && hasIdentity && hasActors);
    }

    private void upgradeJavaWorkspaceToMocHuong(UUID workspaceId, List<Assignment> existingLabs) {
        ModelVersion refModel = existingLabs.stream()
                .map(Assignment::getReferenceModel)
                .filter(java.util.Objects::nonNull)
                .findFirst()
                .orElse(null);
        if (refModel == null || refModel.getId() == null || refModel.getProject() == null) {
            return;
        }
        Project refProject = refModel.getProject();
        Integer subRefs = jdbc.queryForObject(
                "SELECT COUNT(*) FROM submission_snapshots WHERE model_version_id = ?",
                Integer.class, refModel.getId());
        if (subRefs != null && subRefs > 0) {
            log.info("Skipping in-place rebuild for reference model {} ({} submission_snapshots reference it)",
                    refModel.getId(), subRefs);
        } else {
            List<Evidence> oldEvidences = evidences.findByModelVersionId(refModel.getId());
            if (oldEvidences != null && !oldEvidences.isEmpty()) {
                evidences.deleteAll(oldEvidences);
            }
            List<ModelRelationship> oldRels = relationships.findByModelVersionId(refModel.getId());
            if (oldRels != null && !oldRels.isEmpty()) {
                relationships.deleteAll(oldRels);
            }
            List<ModelElement> oldElements = elements.findByModelVersionId(refModel.getId());
            if (oldElements != null && !oldElements.isEmpty()) {
                List<ModelElement> children = oldElements.stream().filter(e -> e.getParentElement() != null).toList();
                List<ModelElement> roots = oldElements.stream().filter(e -> e.getParentElement() == null).toList();
                if (!children.isEmpty()) {
                    elements.deleteAll(children);
                }
                if (!roots.isEmpty()) {
                    elements.deleteAll(roots);
                }
            }
            List<DiagramVersion> oldDiagrams = diagrams.findByModelVersionId(refModel.getId());
            if (oldDiagrams != null && !oldDiagrams.isEmpty()) {
                diagrams.deleteAll(oldDiagrams);
            }
            refProject.setName(MocHuongReferenceArchitectureBuilder.SYSTEM_NAME);
            refProject.setDescription("Curated Java 21 / Spring Boot 3 microservices repository (Service Discovery, API Gateway, Identity, Catalog, Order, Notification) from MAVIS-Platform/Moc-Huong-Shop.");
            projects.saveAndFlush(refProject);

            SourceSnapshot refSnapshot = refModel.getSourceSnapshot();
            if (refSnapshot != null) {
                byte[] zipBytes = MocHuongReferenceArchitectureBuilder.buildMocHuongArchive();
                Path archivePath = persistArchive(workspaceId, refProject.getId(), zipBytes);
                refSnapshot.setArtifactHash(HashUtils.sha256Hex(zipBytes));
                refSnapshot.setStoragePath(archivePath.toString());
                snapshots.saveAndFlush(refSnapshot);
                MocHuongReferenceArchitectureBuilder.BuiltResult built = MocHuongReferenceArchitectureBuilder.populate(
                        json,
                        refModel,
                        refSnapshot,
                        new MocHuongReferenceArchitectureBuilder.PersistenceHooks(
                                elements::save,
                                relationships::save,
                                evidences::save,
                                diagrams::saveAll,
                                evaluations::save
                        ));
                refreshReferenceRuntimeSetup(refModel, built.serviceIds());
            }
        }
        ObjectNode targetTopology = buildStudioTopologyForServices(MocHuongReferenceArchitectureBuilder.REAL_MICROSERVICES);
        for (Assignment lab : existingLabs) {
            if (Boolean.TRUE.equals(lab.getRequireRuntimeTrace()) && hasStaleTopology(lab.getStudioTopologySnapshot())) {
                lab.setStudioTopologySnapshot(targetTopology);
                lab.setStudioTopologyRevision(lab.getStudioTopologyRevision() != null ? lab.getStudioTopologyRevision() : 1);
                assignments.saveAndFlush(lab);
            }
        }
    }

    private boolean hasStaleTopology(com.fasterxml.jackson.databind.JsonNode snapshot) {
        if (snapshot == null || !snapshot.path("blocks").isArray()) {
            return true;
        }
        String raw = snapshot.path("blocks").toString();
        return raw.contains("payment-service")
                || raw.contains("inventory-service")
                || !raw.contains("catalog-service");
    }

    private void upgradeExistingLabsIfSafe(List<Assignment> existingLabs) {
        if (existingLabs == null || existingLabs.isEmpty()) {
            return;
        }
        for (Assignment existing : existingLabs) {
            boolean changed = false;
            String mode = existing.getLabMode();
            if (mode == null || mode.isBlank() || "LEGACY".equalsIgnoreCase(mode)) {
                Integer legacyDiagramCount = jdbc.queryForObject("""
                        SELECT count(*) FROM submission_snapshots
                        WHERE assignment_id = ? AND diagram_version_id IS NOT NULL
                        """, Integer.class, existing.getId());
                if (legacyDiagramCount == null || legacyDiagramCount == 0) {
                    existing.setLabMode(Boolean.TRUE.equals(existing.getRequireRuntimeTrace())
                            ? "THEORY_QUIZ_STUDIO" : "THEORY_QUIZ");
                    changed = true;
                }
            }
            if (Boolean.TRUE.equals(existing.getRequireRuntimeTrace()) && existing.getStudioTopologySnapshot() == null) {
                existing.setStudioTopologySnapshot(buildDefaultStudioTopology());
                existing.setStudioTopologyRevision(1);
                changed = true;
            }
            if (changed) {
                assignments.saveAndFlush(existing);
            }
        }
    }

    private void ensureReferenceRuntimeSetup(ModelVersion refModel, java.util.Map<String, UUID> knownServiceIds) {
        upsertReferenceRuntimeSetup(refModel, knownServiceIds, false);
    }

    private void refreshReferenceRuntimeSetup(ModelVersion refModel, java.util.Map<String, UUID> knownServiceIds) {
        upsertReferenceRuntimeSetup(refModel, knownServiceIds, true);
    }

    private void upsertReferenceRuntimeSetup(
            ModelVersion refModel, java.util.Map<String, UUID> knownServiceIds, boolean overwriteExisting) {
        if (refModel == null || refModel.getProject() == null || refModel.getSourceSnapshot() == null
                || refModel.getProject().getId() == null) {
            return;
        }
        UUID refProjectId = refModel.getProject().getId();
        Integer cfgCount = jdbc.queryForObject(
                "SELECT count(*) FROM runtime_configurations WHERE project_id = ?",
                Integer.class, refProjectId);
        if (overwriteExisting || cfgCount == null || cfgCount == 0) {
            ObjectNode profile = buildReferenceRuntimeProfile(refModel, knownServiceIds);
            jdbc.update("""
                    INSERT INTO runtime_configurations (project_id, source_snapshot_id, model_version_id, profile_id, profile, revision)
                    VALUES (?, ?, ?, 'SPRING_BOOT_DOTNET_COMPOSE_V1', CAST(? AS jsonb), 1)
                    ON CONFLICT (project_id) DO UPDATE
                    SET source_snapshot_id = EXCLUDED.source_snapshot_id,
                        model_version_id = EXCLUDED.model_version_id,
                        profile = CASE WHEN ? THEN EXCLUDED.profile ELSE runtime_configurations.profile END,
                        revision = CASE WHEN ? THEN runtime_configurations.revision + 1 ELSE runtime_configurations.revision END
                    """, refProjectId, refModel.getSourceSnapshot().getId(), refModel.getId(), profile.toString(), overwriteExisting, overwriteExisting);
        }

        Integer scnCount = jdbc.queryForObject(
                "SELECT count(*) FROM runtime_scenarios WHERE project_id = ?",
                Integer.class, refProjectId);
        ArrayNode steps = buildMocHuongRuntimeScenarios();
        if (scnCount == null || scnCount == 0) {
            jdbc.update("""
                    INSERT INTO runtime_scenarios (id, project_id, name, steps, revision)
                    VALUES (?, ?, 'Moc Huong Resilience & Flow Check', CAST(? AS jsonb), 1)
                    """, UUID.randomUUID(), refProjectId, steps.toString());
        } else if (overwriteExisting) {
            jdbc.update("""
                    UPDATE runtime_scenarios
                    SET name = 'Moc Huong Resilience & Flow Check',
                        steps = CAST(? AS jsonb),
                        revision = revision + 1
                    WHERE project_id = ?
                    """, steps.toString(), refProjectId);
        }
    }

    private ObjectNode buildReferenceRuntimeProfile(ModelVersion refModel, java.util.Map<String, UUID> knownServiceIds) {
        java.util.Map<String, UUID> serviceMap = new java.util.LinkedHashMap<>(knownServiceIds);
        if (serviceMap.isEmpty()) {
            for (ModelElement el : elements.findByModelVersionId(refModel.getId())) {
                if ("SERVICE_CONTAINER".equals(el.getElementType()) && el.getName() != null && el.getId() != null) {
                    serviceMap.putIfAbsent(el.getName(), el.getId());
                }
            }
        }
        ObjectNode profile = json.createObjectNode();
        ObjectNode apps = profile.putObject("applications");
        apps.putObject("service-discovery").put("runtime", "java").put("containerPort", 8761);
        apps.putObject("api-gateway").put("runtime", "java").put("containerPort", 8080);
        apps.putObject("identity-service").put("runtime", "java").put("containerPort", 8081);
        apps.putObject("catalog-service").put("runtime", "java").put("containerPort", 8082);
        apps.putObject("order-service").put("runtime", "java").put("containerPort", 8083);
        apps.putObject("notification-service").put("runtime", "java").put("containerPort", 8084);
        ObjectNode mappings = profile.putObject("serviceMappings");
        serviceMap.forEach((name, id) -> {
            if (id != null) mappings.put(name, id.toString());
        });
        profile.set("studioTopology", buildDefaultStudioTopology());
        return profile;
    }

    private ArrayNode buildMocHuongRuntimeScenarios() {
        ArrayNode steps = json.createArrayNode();
        steps.addObject().put("id", "order-checkout").put("service", "order-service")
                .put("method", "POST").put("path", "/api/v1/orders").put("expectedStatus", 200);
        steps.addObject().put("id", "catalog-products").put("service", "catalog-service")
                .put("method", "GET").put("path", "/api/v1/products").put("expectedStatus", 200);
        steps.addObject().put("id", "identity-auth").put("service", "identity-service")
                .put("method", "POST").put("path", "/api/v1/auth/login").put("expectedStatus", 200);
        return steps;
    }

    private ObjectNode markArchivedV1(com.fasterxml.jackson.databind.JsonNode existingPolicy) {
        ObjectNode node = (existingPolicy != null && existingPolicy.isObject())
                ? ((ObjectNode) existingPolicy).deepCopy()
                : json.createObjectNode();
        node.put("archivedV1", true);
        node.put("archivedReason", "REPLACED_BY_V2_CATALOG");
        return node;
    }

    public ObjectNode buildDefaultStudioTopology() {
        return buildStudioTopologyForServices(MocHuongReferenceArchitectureBuilder.REAL_MICROSERVICES);
    }

    private ObjectNode buildStudioTopologyForServices(List<String> serviceNames) {
        ObjectNode topology = json.createObjectNode().put("version", 1);
        ArrayNode blocks = topology.putArray("blocks");
        for (String svc : serviceNames) {
            blocks.addObject()
                    .put("service", svc)
                    .put("label", svc)
                    .put("canScale", true)
                    .put("initiallyStopped", false);
        }
        topology.putArray("connections");
        return topology;
    }

    private List<LabSeedSpec> buildLabSpecs(boolean fullCurriculum) {
        if (!fullCurriculum) {
            return List.of(
                    new LabSeedSpec(
                            "java-04",
                            "Lab 01 · Static C1–C3 Architecture & OpenFeign Reverse BFS",
                            "Inspect the curated Spring Boot microservices, identify OpenFeign/REST call sites, review C1–C3 views, pass the theory quiz, and submit your C4 Container & Component diagrams.",
                            List.of("C4_CONTAINER", "C4_COMPONENT"),
                            false),
                    new LabSeedSpec(
                            "java-07",
                            "Lab 02 · Runtime Resilience, Circuit Breaker & Stop/Scale Impact",
                            "Verify live OpenTelemetry runtime traces on the curated architecture, perform a MAVIS Studio Stop/Scale chaos experiment on catalog-service, and submit your verified runtime & architecture package.",
                            List.of("C4_CONTAINER", "DEPENDENCY_GRAPH"),
                            true),
                    new LabSeedSpec(
                            "csharp-13",
                            "Lab 03 · ASP.NET Core Microservices with Roslyn & OpenTelemetry",
                            "Analyze C# ASP.NET Core services (Orders/Program.cs, Catalog/Program.cs) alongside Spring Boot services, inspect Roslyn static findings and OTel runtime traces, and verify Studio Stop/Scale impact.",
                            List.of("C4_CONTAINER", "DEPENDENCY_GRAPH"),
                            true)
            );
        }

        List<String> fullOrder = List.of(
                "java-01", "java-02", "java-03", "java-04",
                "java-05", "java-06", "java-07", "java-08",
                "java-09", "java-10", "java-11", "java-12",
                "csharp-13"
        );
        List<LabSeedSpec> specs = new ArrayList<>(fullOrder.size());
        for (int i = 0; i < fullOrder.size(); i++) {
            String code = fullOrder.get(i);
            String label = String.format("Lab %02d", i + 1);
            boolean staticOnly = i < 4;
            List<String> requiredDiagrams = staticOnly
                    ? List.of("C4_CONTAINER", "C4_COMPONENT")
                    : List.of("C4_CONTAINER", "DEPENDENCY_GRAPH");
            CourseCurriculum.Chapter chapter = curriculum.chapter(code);
            String title = label + " · " + chapter.title();
            String description = chapter.objective() + "\n\n" + chapter.exercise();
            specs.add(new LabSeedSpec(code, title, description, requiredDiagrams, !staticOnly));
        }
        return specs;
    }

    private Path persistArchive(UUID workspaceId, UUID projectId, byte[] zipBytes) {
        String filename = "curated-course-" + workspaceId + "-" + projectId + ".zip";
        try {
            Files.createDirectories(storageRoot);
            Path target = storageRoot.toRealPath().resolve(filename);
            Files.write(target, zipBytes);
            return target;
        } catch (IOException primaryEx) {
            Path fallbackDir = Path.of(System.getProperty("java.io.tmpdir"), "mavis-uploads");
            try {
                Files.createDirectories(fallbackDir);
                Path fallbackTarget = fallbackDir.toRealPath().resolve(filename);
                Files.write(fallbackTarget, zipBytes);
                log.warn("Primary upload directory '{}' unavailable ({}); wrote curated archive to '{}'",
                        storageRoot, primaryEx.getMessage(), fallbackTarget);
                return fallbackTarget;
            } catch (IOException fallbackEx) {
                log.warn("Unable to persist curated archive to disk ({}); LabReferenceArchive will materialize in temp dir on demand",
                        fallbackEx.getMessage());
                return fallbackDir.resolve(filename);
            }
        }
    }

    public static byte[] buildCuratedArchive() {
        return MocHuongReferenceArchitectureBuilder.buildMocHuongArchive();
    }
}
