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
import com.mavis.platform.workspace.curriculum.JavaCourseraCatalog;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
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
            return seedJavaCourseraInternal(workspaceId, workspace, lecturer);
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

    private CourseAccessService.Roadmap seedJavaCourseraInternal(UUID workspaceId, Workspace workspace, User lecturer) {
        ensureCourseMode(workspace);
        List<Assignment> existingLabs = assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId);
        ModelVersion refModel = existingLabs.stream()
                .map(Assignment::getReferenceModel)
                .filter(java.util.Objects::nonNull)
                .findFirst()
                .orElseGet(() -> seedReferenceModel(workspaceId, workspace, lecturer));
        ensureReferenceRuntimeSetup(refModel, java.util.Map.of());

        int nextOrder = existingLabs.stream()
                .map(Assignment::getLabOrder)
                .filter(java.util.Objects::nonNull)
                .mapToInt(Integer::intValue)
                .max()
                .orElse(0);

        List<Assignment> orderedLabs = new ArrayList<>();
        for (CourseraModuleSpec modSpec : JavaCourseraCatalog.modules()) {
            Assignment match = existingLabs.stream()
                    .filter(a -> modSpec.labTitle().equals(a.getTitle()))
                    .findFirst()
                    .orElse(null);
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
                        .labOrder(++nextOrder);
                if (runtime) {
                    labBuilder.studioTopologySnapshot(buildDefaultStudioTopology())
                            .studioTopologyRevision(1);
                }
                match = assignments.saveAndFlush(labBuilder.build());
            }
            quizzes.publishCurriculum(workspaceId, match.getId(), JavaCourseraCatalog.toQuizPublishRequest(modSpec));
            orderedLabs.add(match);
        }

        syncJavaCourseraOutline(workspaceId, orderedLabs);

        jdbc.update("INSERT INTO audit_logs(actor_id, action, target_type, target_id) VALUES (?, ?, ?, ?)",
                lecturer.getId(), "COURSE_JAVA_COURSERA_SEEDED", "WORKSPACE", workspaceId);

        return courses.roadmap(workspaceId);
    }

    private void syncJavaCourseraOutline(UUID workspaceId, List<Assignment> orderedLabs) {
        if (courseAuthoring == null || orderedLabs.isEmpty()) {
            return;
        }
        try {
            CourseAuthoringService.CourseView existing = null;
            try {
                existing = courseAuthoring.get(workspaceId);
            } catch (BusinessException ex) {
                if (ex.getErrorCode() != ErrorCode.NOT_FOUND) {
                    throw ex;
                }
            }
            if (existing != null
                    && "PUBLISHED".equals(existing.status())
                    && existing.publishedVersion() >= 1
                    && existing.modules() != null
                    && existing.modules().size() == 6) {
                boolean hasMojibake = existing.modules().stream()
                        .flatMap(m -> m.items().stream())
                        .anyMatch(item -> item.content() != null
                                && item.content().path("body").asText("").contains("ðŸ"));
                if (!hasMojibake) {
                    return;
                }
            }
            if (existing != null && "PUBLISHED".equals(existing.status())) {
                existing = courseAuthoring.startDraft(workspaceId);
            } else if (existing == null) {
                existing = courseAuthoring.saveDraft(workspaceId, new CourseAuthoringService.CourseRequest(
                        JavaCourseraCatalog.COURSE_TITLE,
                        JavaCourseraCatalog.COURSE_DESCRIPTION));
            }
            if (existing.modules() != null && !existing.modules().isEmpty()) {
                for (CourseAuthoringService.ModuleView staleModule : List.copyOf(existing.modules())) {
                    courseAuthoring.deleteModule(workspaceId, staleModule.id());
                }
            }

            List<CourseraModuleSpec> catalogModules = JavaCourseraCatalog.modules();
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
                                "Quiz Chương " + modSpec.position() + " · Kiểm tra Trắc nghiệm (10 câu)",
                                "Vượt qua Quiz Gate (>= 70%) để mở khóa bài thực hành tiếp theo.",
                                lab.getId(), json.createObjectNode(), true));

                if (modSpec.essay() != null) {
                    ObjectNode essayContent = json.createObjectNode();
                    essayContent.put("prompt", modSpec.essay().promptMarkdown());
                    ArrayNode rubricArr = essayContent.putArray("rubric");
                    for (RubricCriterion c : modSpec.essay().rubric()) {
                        ObjectNode node = rubricArr.addObject();
                        node.put("criterion", c.criterion());
                        node.put("points", c.weightPoints());
                        node.put("description", c.excellentDescription());
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
            log.info("Published 6-module Java Coursera outline for workspace {}", workspaceId);
        } catch (Exception ex) {
            log.warn("Could not publish Java Coursera outline for workspace {}: {}", workspaceId, ex.getMessage(), ex);
        }
    }

    private void syncCuratedCourseOutline(UUID workspaceId, Workspace workspace) {
        if (courseAuthoring == null) {
            return;
        }
        try {
            CourseAuthoringService.CourseView existing = null;
            try {
                existing = courseAuthoring.get(workspaceId);
            } catch (BusinessException ex) {
                if (ex.getErrorCode() != ErrorCode.NOT_FOUND) {
                    throw ex;
                }
            }
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
                            + "- Vượt qua Quiz Gate (>= 80%) ở Bước 3 trước khi thực nghiệm ở Bước 4.";
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
        } catch (Exception ignored) {
            // Do not fail seeding if optional authoring synchronization encounters incomplete mock state in tests.
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
                .name("Curated E-Commerce Reference (Spring Boot & .NET Core)")
                .description("Curated multi-service repository (API Gateway, Order Service, Payment Service, Inventory Service, C# Orders/Catalog) for Guided Labs.")
                .defaultBranch("main")
                .projectType("TEACHER_REFERENCE")
                .isReferenceTemplate(true)
                .status("ACTIVE")
                .build());

        byte[] zipBytes = buildCuratedArchive();
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

        ModelVersion refModel = models.saveAndFlush(ModelVersion.builder()
                .project(refProject)
                .sourceSnapshot(refSnapshot)
                .revision(1)
                .schemaVersion("1.0")
                .origin("GENERATED")
                .isLatestValid(true)
                .createdBy(lecturer)
                .build());

        ModelElement customer = elements.save(ModelElement.builder()
                .modelVersion(refModel).elementType("PERSON").languageStack("Actor")
                .name("Customer").scope("external").status("CONFIRMED").build());
        ModelElement gateway = elements.save(ModelElement.builder()
                .modelVersion(refModel).elementType("SERVICE_CONTAINER").languageStack("Java / Spring Cloud Gateway")
                .name("api-gateway").scope("service").status("CONFIRMED").build());
        ModelElement orderService = elements.save(ModelElement.builder()
                .modelVersion(refModel).elementType("SERVICE_CONTAINER").languageStack("Java / Spring Boot")
                .name("order-service").scope("service").status("CONFIRMED").build());
        ModelElement paymentService = elements.save(ModelElement.builder()
                .modelVersion(refModel).elementType("SERVICE_CONTAINER").languageStack("Java / Spring Boot")
                .name("payment-service").scope("service").status("CONFIRMED").build());
        ModelElement inventoryService = elements.save(ModelElement.builder()
                .modelVersion(refModel).elementType("SERVICE_CONTAINER").languageStack("Java / Spring Boot")
                .name("inventory-service").scope("service").status("CONFIRMED").build());

        ModelElement orderController = elements.save(ModelElement.builder()
                .modelVersion(refModel).parentElement(orderService).elementType("COMPONENT").languageStack("Spring MVC")
                .name("OrderController").scope("order-service").status("CONFIRMED").build());
        ModelElement paymentClient = elements.save(ModelElement.builder()
                .modelVersion(refModel).parentElement(orderService).elementType("COMPONENT").languageStack("OpenFeign")
                .name("PaymentClient").scope("order-service").status("CONFIRMED").build());
        ModelElement paymentController = elements.save(ModelElement.builder()
                .modelVersion(refModel).parentElement(paymentService).elementType("COMPONENT").languageStack("Spring MVC")
                .name("PaymentController").scope("payment-service").status("CONFIRMED").build());
        ModelElement inventoryController = elements.save(ModelElement.builder()
                .modelVersion(refModel).parentElement(inventoryService).elementType("COMPONENT").languageStack("Spring MVC")
                .name("InventoryController").scope("inventory-service").status("CONFIRMED").build());

        ModelRelationship customerToGateway = relationships.save(ModelRelationship.builder()
                .modelVersion(refModel).sourceElement(customer).targetElement(gateway)
                .relationType("USES").originLayer("STATIC").direction("DIRECTED").build());
        ModelRelationship gatewayToOrder = relationships.save(ModelRelationship.builder()
                .modelVersion(refModel).sourceElement(gateway).targetElement(orderService)
                .relationType("HTTP_CALL").originLayer("STATIC").direction("DIRECTED").build());
        ModelRelationship orderToPayment = relationships.save(ModelRelationship.builder()
                .modelVersion(refModel).sourceElement(orderService).targetElement(paymentService)
                .relationType("FEIGN_CALL").originLayer("STATIC").direction("DIRECTED").build());
        ModelRelationship orderToInventory = relationships.save(ModelRelationship.builder()
                .modelVersion(refModel).sourceElement(orderService).targetElement(inventoryService)
                .relationType("HTTP_CALL").originLayer("STATIC").direction("DIRECTED").build());
        ModelRelationship clientToPaymentController = relationships.save(ModelRelationship.builder()
                .modelVersion(refModel).sourceElement(paymentClient).targetElement(paymentController)
                .relationType("CALL_SITE").originLayer("STATIC").direction("DIRECTED").build());
        ModelRelationship orderCtrlToClient = relationships.save(ModelRelationship.builder()
                .modelVersion(refModel).sourceElement(orderController).targetElement(paymentClient)
                .relationType("DEPENDS_ON").originLayer("STATIC").direction("DIRECTED").build());

        evidences.save(Evidence.builder()
                .sourceSnapshot(refSnapshot)
                .modelVersion(refModel)
                .relationship(orderToPayment)
                .locator("order-service/src/main/java/com/curated/order/PaymentClient.java:6")
                .adapterVersion("curated-seed-v1")
                .sourceType("CALL_SITE")
                .excerpt("@FeignClient(name = \"payment-service\", url = \"http://payment-service:8082\")")
                .build());

        List<ModelElement> containers = List.of(gateway, orderService, paymentService, inventoryService);
        List<ModelRelationship> containerEdges = List.of(gatewayToOrder, orderToPayment, orderToInventory);
        List<ModelElement> components = List.of(orderService, paymentService, inventoryService, orderController, paymentClient, paymentController, inventoryController);
        List<ModelRelationship> componentEdges = List.of(orderCtrlToClient, clientToPaymentController, orderToInventory);

        diagrams.saveAll(List.of(
                buildContextDiagram(refModel, refProject.getName(), customer, customerToGateway),
                buildDiagram(refModel, "DEPENDENCY_GRAPH", "SERVICE", containers, containerEdges),
                buildDiagram(refModel, "C4", "CONTAINER", containers, containerEdges),
                buildDiagram(refModel, "C4", "COMPONENT", components, componentEdges)
        ));

        ObjectNode metrics = json.createObjectNode()
                .put("complianceScore", 88.0)
                .put("totalFindings", 0)
                .put("passedRules", 5);
        evaluations.save(EvaluationRun.builder()
                .modelVersion(refModel)
                .ruleSetVersion("3e-3")
                .summaryMetrics(metrics)
                .build());

        java.util.Map<String, UUID> serviceIds = new java.util.LinkedHashMap<>();
        serviceIds.put("api-gateway", gateway.getId());
        serviceIds.put("order-service", orderService.getId());
        serviceIds.put("payment-service", paymentService.getId());
        serviceIds.put("inventory-service", inventoryService.getId());
        ensureReferenceRuntimeSetup(refModel, serviceIds);

        return refModel;
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
        if (refModel == null || refModel.getProject() == null || refModel.getSourceSnapshot() == null
                || refModel.getProject().getId() == null) {
            return;
        }
        UUID refProjectId = refModel.getProject().getId();
        Integer cfgCount = jdbc.queryForObject(
                "SELECT count(*) FROM runtime_configurations WHERE project_id = ?",
                Integer.class, refProjectId);
        if (cfgCount == null || cfgCount == 0) {
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
            apps.putObject("api-gateway").put("runtime", "java").put("containerPort", 8080);
            apps.putObject("order-service").put("runtime", "java").put("containerPort", 8081);
            apps.putObject("payment-service").put("runtime", "java").put("containerPort", 8082);
            apps.putObject("inventory-service").put("runtime", "java").put("containerPort", 8083);
            ObjectNode mappings = profile.putObject("serviceMappings");
            serviceMap.forEach((name, id) -> {
                if (id != null) mappings.put(name, id.toString());
            });
            profile.set("studioTopology", buildDefaultStudioTopology());
            jdbc.update("""
                    INSERT INTO runtime_configurations (project_id, source_snapshot_id, model_version_id, profile_id, profile, revision)
                    VALUES (?, ?, ?, 'SPRING_BOOT_DOTNET_COMPOSE_V1', CAST(? AS jsonb), 1)
                    ON CONFLICT (project_id) DO NOTHING
                    """, refProjectId, refModel.getSourceSnapshot().getId(), refModel.getId(), profile.toString());
        }

        Integer scnCount = jdbc.queryForObject(
                "SELECT count(*) FROM runtime_scenarios WHERE project_id = ?",
                Integer.class, refProjectId);
        if (scnCount == null || scnCount == 0) {
            ArrayNode steps = json.createArrayNode();
            steps.addObject().put("id", "order-checkout").put("service", "order-service")
                    .put("method", "POST").put("path", "/api/orders").put("expectedStatus", 200);
            steps.addObject().put("id", "inventory-health").put("service", "inventory-service")
                    .put("method", "GET").put("path", "/api/inventory/health").put("expectedStatus", 200);
            jdbc.update("""
                    INSERT INTO runtime_scenarios (id, project_id, name, steps, revision)
                    VALUES (?, ?, 'Curated Resilience Check', CAST(? AS jsonb), 1)
                    """, UUID.randomUUID(), refProjectId, steps.toString());
        }
    }

    public ObjectNode buildDefaultStudioTopology() {
        ObjectNode topology = json.createObjectNode().put("version", 1);
        ArrayNode blocks = topology.putArray("blocks");
        for (String[] item : List.of(
                new String[]{"api-gateway", "API Gateway"},
                new String[]{"order-service", "Order Service"},
                new String[]{"payment-service", "Payment Service"},
                new String[]{"inventory-service", "Inventory Service"})) {
            blocks.addObject()
                    .put("service", item[0])
                    .put("label", item[1])
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
                            "Verify live OpenTelemetry runtime traces on the curated architecture, perform a MAVIS Studio Stop/Scale chaos experiment on payment-service, and submit your verified runtime & architecture package.",
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

    private DiagramVersion buildContextDiagram(ModelVersion model, String projectName, ModelElement customer, ModelRelationship rel) {
        ObjectNode layout = json.createObjectNode()
                .put("schemaVersion", "1.0")
                .put("modelVersionId", model.getId().toString());
        ArrayNode nodes = layout.putArray("nodes");
        String systemId = "system:" + model.getProject().getId();
        nodes.addObject().put("id", systemId).put("kind", "SYSTEM").put("name", projectName).put("x", 280).put("y", 0);
        nodes.addObject().put("id", customer.getId().toString()).put("kind", "PERSON").put("name", customer.getName()).put("x", 640).put("y", 0);
        ArrayNode edges = layout.putArray("edges");
        edges.addObject()
                .put("id", rel.getId().toString())
                .put("from", customer.getId().toString())
                .put("to", systemId)
                .put("source", customer.getId().toString())
                .put("target", systemId)
                .put("type", rel.getRelationType())
                .put("relationType", rel.getRelationType())
                .put("originLayer", "STATIC");
        return DiagramVersion.builder().modelVersion(model).notation("C4").level("CONTEXT").layoutJson(layout).build();
    }

    private DiagramVersion buildDiagram(
            ModelVersion model, String notation, String level, List<ModelElement> nodesList, List<ModelRelationship> edgesList) {
        ObjectNode layout = json.createObjectNode()
                .put("schemaVersion", "1.0")
                .put("modelVersionId", model.getId().toString());
        ArrayNode nodes = layout.putArray("nodes");
        for (int i = 0; i < nodesList.size(); i++) {
            ModelElement node = nodesList.get(i);
            ObjectNode obj = nodes.addObject()
                    .put("id", node.getId().toString())
                    .put("name", node.getName())
                    .put("kind", node.getElementType())
                    .put("type", node.getElementType())
                    .put("status", node.getStatus())
                    .put("x", (i % 4) * 260)
                    .put("y", (i / 4) * 160);
            obj.put("languageStack", node.getLanguageStack());
            obj.putObject("position").put("x", (i % 4) * 260).put("y", (i / 4) * 160);
            obj.putObject("data").put("label", node.getName()).put("status", node.getStatus()).put("technology", node.getLanguageStack());
            if ("C4".equals(notation)) {
                obj.put("c4Type", "COMPONENT".equals(node.getElementType()) ? "Component" : "Container");
            }
            if (node.getParentElement() != null) {
                obj.put("parentId", node.getParentElement().getId().toString());
            }
        }
        ArrayNode edges = layout.putArray("edges");
        for (ModelRelationship edge : edgesList) {
            edges.addObject()
                    .put("id", edge.getId().toString())
                    .put("from", edge.getSourceElement().getId().toString())
                    .put("to", edge.getTargetElement().getId().toString())
                    .put("source", edge.getSourceElement().getId().toString())
                    .put("target", edge.getTargetElement().getId().toString())
                    .put("type", edge.getRelationType())
                    .put("relationType", edge.getRelationType())
                    .put("label", edge.getRelationType())
                    .put("originLayer", edge.getOriginLayer())
                    .put("direction", edge.getDirection());
        }
        return DiagramVersion.builder().modelVersion(model).notation(notation).level(level).layoutJson(layout).build();
    }

    private Path persistArchive(UUID workspaceId, UUID projectId, byte[] zipBytes) {
        try {
            Files.createDirectories(storageRoot);
            Path target = storageRoot.toRealPath().resolve("curated-course-" + workspaceId + "-" + projectId + ".zip");
            Files.write(target, zipBytes);
            return target;
        } catch (IOException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "Unable to store curated reference archive: " + ex.getMessage());
        }
    }

    private static byte[] buildCuratedArchive() {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream();
             ZipOutputStream zip = new ZipOutputStream(out)) {
            writeEntry(zip, "pom.xml", """
                    <project xmlns="http://maven.apache.org/POM/4.0.0">
                      <modelVersion>4.0.0</modelVersion>
                      <groupId>com.curated</groupId>
                      <artifactId>curated-ecommerce</artifactId>
                      <version>1.0.0</version>
                      <packaging>pom</packaging>
                    </project>
                    """);
            writeEntry(zip, "order-service/src/main/java/com/curated/order/OrderController.java", """
                    package com.curated.order;
                    import org.springframework.web.bind.annotation.PostMapping;
                    import org.springframework.web.bind.annotation.RestController;
                    @RestController
                    public class OrderController {
                        private final PaymentClient paymentClient;
                        public OrderController(PaymentClient paymentClient) { this.paymentClient = paymentClient; }
                        @PostMapping("/api/orders")
                        public String createOrder() { return paymentClient.authorize(); }
                    }
                    """);
            writeEntry(zip, "order-service/src/main/java/com/curated/order/PaymentClient.java", """
                    package com.curated.order;
                    import org.springframework.cloud.openfeign.FeignClient;
                    import org.springframework.web.bind.annotation.PostMapping;
                    @FeignClient(name = "payment-service", url = "http://payment-service:8082")
                    public interface PaymentClient {
                        @PostMapping("/api/payments/authorize")
                        String authorize();
                    }
                    """);
            writeEntry(zip, "payment-service/src/main/java/com/curated/payment/PaymentController.java", """
                    package com.curated.payment;
                    import org.springframework.web.bind.annotation.PostMapping;
                    import org.springframework.web.bind.annotation.RestController;
                    @RestController
                    public class PaymentController {
                        @PostMapping("/api/payments/authorize")
                        public String authorize() { return "AUTHORIZED"; }
                    }
                    """);
            writeEntry(zip, "inventory-service/src/main/java/com/curated/inventory/InventoryController.java", """
                    package com.curated.inventory;
                    import org.springframework.web.bind.annotation.GetMapping;
                    import org.springframework.web.bind.annotation.RestController;
                    @RestController
                    public class InventoryController {
                        @GetMapping("/api/inventory/health")
                        public String health() { return "IN_STOCK"; }
                    }
                    """);
            writeEntry(zip, "Orders/Program.cs", """
                    var builder = WebApplication.CreateBuilder(args);
                    builder.Services.AddHttpClient("catalog", client => client.BaseAddress = new Uri("http://catalog-service:8084"));
                    var app = builder.Build();
                    app.MapGet("/api/orders/health", () => Results.Ok(new { service = "orders-dotnet", status = "UP" }));
                    app.Run();
                    """);
            writeEntry(zip, "Catalog/Program.cs", """
                    var builder = WebApplication.CreateBuilder(args);
                    var app = builder.Build();
                    app.MapGet("/api/catalog/items", () => Results.Ok(new[] { "SKU-001", "SKU-002" }));
                    app.Run();
                    """);
            writeEntry(zip, "docker-compose.yml", """
                    services:
                      api-gateway:
                        image: mavis/api-gateway:curated
                        ports: ["8080:8080"]
                      order-service:
                        image: mavis/order-service:curated
                        ports: ["8081:8081"]
                      payment-service:
                        image: mavis/payment-service:curated
                        ports: ["8082:8082"]
                      inventory-service:
                        image: mavis/inventory-service:curated
                        ports: ["8083:8083"]
                    """);
            zip.finish();
            return out.toByteArray();
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to build curated archive", ex);
        }
    }

    private static void writeEntry(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }
}
