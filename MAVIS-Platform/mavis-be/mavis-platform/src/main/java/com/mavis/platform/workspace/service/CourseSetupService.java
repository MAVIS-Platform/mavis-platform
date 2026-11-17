package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.RuntimeConfiguration;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.ModelElementRepository;
import com.mavis.common.repository.ModelRelationshipRepository;
import com.mavis.common.repository.ModelVersionRepository;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.RuntimeConfigurationRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.AccessPolicyService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Read-only, lecturer-facing view of everything required before a student can
 * open a Lab. It points at the exact reference project/runtime profile instead
 * of inferring or inventing a prepared Studio Live topology.
 */
@Service
@RequiredArgsConstructor
public class CourseSetupService {
    private final AccessPolicyService access;
    private final WorkspaceRepository workspaces;
    private final AssignmentRepository assignments;
    private final ProjectRepository projects;
    private final ModelVersionRepository models;
    private final RuntimeConfigurationRepository configurations;
    private final JdbcTemplate jdbc;

    @Autowired(required = false)
    private ModelElementRepository elements;

    @Autowired(required = false)
    private ModelRelationshipRepository relationships;

    @Autowired(required = false)
    private ObjectMapper objectMapper;

    @Autowired(required = false)
    private com.mavis.common.repository.LabStudioExerciseRepository labStudioExercises;

    public record AutoConfigureStudioResult(
            UUID assignmentId,
            int blockCount,
            int connectionCount,
            int topologyRevision,
            boolean studioFrozen,
            Setup setup) {}

    public record ReferenceSetup(
            UUID projectId,
            String projectName,
            UUID modelId,
            UUID snapshotId,
            int modelRevision,
            boolean referenceReady,
            boolean runtimeConfigured,
            boolean runtimeMatchesSource,
            int runtimeRevision,
            List<String> applications,
            int blockCount,
            int connectionCount,
            boolean topologyConfigured) {}

    public record LabSetup(
            UUID assignmentId,
            int position,
            String title,
            boolean published,
            boolean referenceReady,
            boolean requiresRuntime,
            boolean studioReady,
            boolean topologyFrozen,
            boolean quizPublished,
            int quizVersion,
            String state) {}

    public record PasskeySetup(
            boolean active,
            OffsetDateTime expiresAt,
            Integer maxStudents,
            int enrolledStudents) {}

    public record Step(String id, String state, String detail) {}

    public record Setup(
            UUID workspaceId,
            String workspaceName,
            String status,
            boolean courseMode,
            ReferenceSetup reference,
            List<LabSetup> labs,
            PasskeySetup passkey,
            List<Step> steps,
            String nextAction,
            UUID previewAssignmentId) {}

    @Transactional(readOnly = true)
    public Setup setup(UUID workspaceId) {
        access.requireWorkspaceLecturer(workspaceId);
        Workspace workspace = workspaces.findById(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Workspace not found"));

        List<Assignment> ordered = new ArrayList<>(assignments.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId));
        ordered.sort(Comparator
                .comparingInt((Assignment lab) -> lab.getLabOrder() == null ? Integer.MAX_VALUE : lab.getLabOrder())
                .thenComparing(Assignment::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder())));

        ReferenceSetup fallbackReference = resolveReference(workspaceId, ordered);
        List<ReferenceSetup> labReferences = ordered.stream()
                .map(lab -> lab.getReferenceModel() == null ? fallbackReference : reference(lab.getReferenceModel()))
                .toList();
        ReferenceSetup reference = selectPrimaryReference(ordered, labReferences, fallbackReference);
        List<LabSetup> labs = ordered.stream().map(lab -> labSetup(lab, fallbackReference)).toList();
        PasskeySetup passkey = passkey(workspaceId, workspace.getMaxStudents());
        boolean hasRuntimeLab = labs.stream().anyMatch(LabSetup::requiresRuntime);
        long runtimeLabs = labs.stream().filter(LabSetup::requiresRuntime).count();
        long frozenRuntimeLabs = labs.stream().filter(LabSetup::requiresRuntime).filter(LabSetup::topologyFrozen).count();
        boolean allReferencesReady = labs.isEmpty() ? reference.referenceReady() : labs.stream().allMatch(LabSetup::referenceReady);
        boolean anyReferenceReady = labs.isEmpty() ? reference.referenceReady() : labs.stream().anyMatch(LabSetup::referenceReady);
        boolean allRuntimeConfigured = true;
        boolean allRuntimeMatchesSource = true;
        boolean allTopologiesConfigured = true;
        for (int i = 0; i < ordered.size(); i++) {
            if (!Boolean.TRUE.equals(ordered.get(i).getRequireRuntimeTrace())) continue;
            ReferenceSetup labRef = labReferences.get(i);
            if (!labRef.runtimeConfigured()) allRuntimeConfigured = false;
            if (!labRef.runtimeMatchesSource()) allRuntimeMatchesSource = false;
            if (!labRef.topologyConfigured()) allTopologiesConfigured = false;
        }
        boolean allPublished = !labs.isEmpty() && labs.stream().allMatch(LabSetup::published);
        boolean allQuizzes = !labs.isEmpty() && labs.stream().filter(LabSetup::published).allMatch(LabSetup::quizPublished);
        UUID preview = labs.stream()
                .filter(lab -> lab.published() && lab.referenceReady())
                .filter(lab -> !lab.requiresRuntime() || (lab.studioReady() && lab.topologyFrozen()))
                .map(LabSetup::assignmentId)
                .findFirst()
                .orElse(null);

        List<Step> steps = new ArrayList<>();
        steps.add(new Step("workspace",
                "ACTIVE".equals(workspace.getStatus()) ? "DONE" : "BLOCKED",
                "ACTIVE".equals(workspace.getStatus())
                        ? "Workspace is active."
                        : "Reactivate the workspace before students can open Labs."));
        steps.add(new Step("reference",
                allReferencesReady ? "DONE" : anyReferenceReady ? "PARTIAL" : "ACTION",
                allReferencesReady
                        ? "Reference model revision " + reference.modelRevision() + " is pinned to a published source snapshot."
                        : "Attach and analyze a curated reference source."));
        if (!hasRuntimeLab) {
            steps.add(new Step("runtime", "DONE", "No Lab requires a runtime trace."));
            steps.add(new Step("studio", "DONE", "No Lab requires Studio Live."));
        } else {
            steps.add(new Step("runtime",
                    allRuntimeConfigured && allRuntimeMatchesSource ? "DONE" : "ACTION",
                    !allRuntimeConfigured
                            ? "Configure runtime applications for the reference project."
                            : !allRuntimeMatchesSource
                            ? "Runtime profile targets a different source or model. Reconfigure it for the published reference."
                            : reference.applications().size() + " runtime applications are configured for the pinned source."));
            boolean topologyReady = allTopologiesConfigured && allRuntimeMatchesSource;
            steps.add(new Step("studio",
                    topologyReady && frozenRuntimeLabs == runtimeLabs ? "DONE"
                            : topologyReady ? "PARTIAL" : "ACTION",
                    !topologyReady
                            ? "Add the prepared Studio Live topology for the reference project."
                            : frozenRuntimeLabs == runtimeLabs
                            ? "All " + runtimeLabs + " runtime Labs have a frozen Studio topology."
                            : reference.blockCount() + " prepared blocks and " + reference.connectionCount()
                            + " connections are configured, but " + (runtimeLabs - frozenRuntimeLabs)
                            + " runtime Lab(s) still need a frozen topology. Publish the Lab, then freeze it from Assignments."));
        }
        steps.add(new Step("labs",
                labs.isEmpty() ? "ACTION" : allPublished ? "DONE" : "PARTIAL",
                labs.isEmpty()
                        ? "Seed curated Labs or create the first Lab."
                        : labs.stream().filter(LabSetup::published).count() + "/" + labs.size() + " Labs are published."));
        if (labs.isEmpty()) {
            steps.add(new Step("quiz", "ACTION", "Publish a Lab before configuring its quiz."));
        } else {
            long published = labs.stream().filter(LabSetup::published).count();
            long withQuiz = labs.stream().filter(LabSetup::published).filter(LabSetup::quizPublished).count();
            steps.add(new Step("quiz",
                    published > 0 && withQuiz == published ? "DONE" : withQuiz > 0 ? "PARTIAL" : "ACTION",
                    withQuiz + "/" + published + " published Labs have a quiz."));
        }
        steps.add(new Step("passkey",
                passkey.active() ? "DONE" : "ACTION",
                passkey.active()
                        ? "Passkey is active until " + passkey.expiresAt() + "."
                        : "Issue a course Passkey so students can enroll."));
        steps.add(new Step("preview",
                preview != null ? "DONE" : "ACTION",
                preview != null
                        ? "Open a Lab to preview the student flow."
                        : "Finish the previous steps to preview the student Lab."));

        String nextAction;
        if (labs.isEmpty()) nextAction = "seed-labs";
        else if (!allReferencesReady) nextAction = "attach-source";
        else if (hasRuntimeLab && (!allRuntimeConfigured || !allRuntimeMatchesSource)) nextAction = "configure-runtime";
        else if (hasRuntimeLab && !allTopologiesConfigured) nextAction = "configure-studio";
        else if (!allPublished) nextAction = "publish-labs";
        else if (hasRuntimeLab && frozenRuntimeLabs < runtimeLabs) nextAction = "freeze-topology";
        else if (!allQuizzes) nextAction = "publish-quiz";
        else if (!passkey.active()) nextAction = "issue-passkey";
        else nextAction = "open-lab";

        return new Setup(workspaceId, workspace.getName(), workspace.getStatus(), workspace.isCourseMode(),
                reference, labs, passkey, steps, nextAction, preview);
    }

    private static ReferenceSetup selectPrimaryReference(
            List<Assignment> ordered,
            List<ReferenceSetup> labReferences,
            ReferenceSetup fallback) {
        for (int i = 0; i < ordered.size(); i++) {
            ReferenceSetup ref = labReferences.get(i);
            boolean requiresRuntime = Boolean.TRUE.equals(ordered.get(i).getRequireRuntimeTrace());
            if (!ref.referenceReady()) return ref;
            if (requiresRuntime && (!ref.runtimeConfigured() || !ref.runtimeMatchesSource() || !ref.topologyConfigured())) {
                return ref;
            }
        }
        return fallback;
    }

    private ReferenceSetup resolveReference(UUID workspaceId, List<Assignment> ordered) {
        ModelVersion model = ordered.stream()
                .map(Assignment::getReferenceModel)
                .filter(Objects::nonNull)
                .findFirst()
                .orElse(null);
        if (model == null) {
            Project referenceProject = projects.findByWorkspaceId(workspaceId).stream()
                    .filter(project -> "TEACHER_REFERENCE".equals(project.getProjectType())
                            || Boolean.TRUE.equals(project.getIsReferenceTemplate()))
                    .findFirst()
                    .orElse(null);
            if (referenceProject != null) {
                model = models.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(referenceProject.getId())
                        .orElse(null);
            }
            if (model == null && referenceProject != null) {
                return emptyReference(referenceProject);
            }
        }
        return model == null ? emptyReference(null) : reference(model);
    }

    private ReferenceSetup reference(ModelVersion model) {
        Project project = model.getProject();
        SourceSnapshot snapshot = model.getSourceSnapshot();
        boolean referenceReady = project != null && !"DELETED".equals(project.getStatus())
                && snapshot != null && Boolean.TRUE.equals(snapshot.getIsPublished())
                && snapshot.getArtifactHash() != null && !snapshot.getArtifactHash().isBlank()
                && snapshot.getStoragePath() != null && !snapshot.getStoragePath().isBlank();
        RuntimeConfiguration configuration = project == null ? null
                : configurations.findById(project.getId()).orElse(null);
        JsonNode profile = configuration == null ? null : configuration.getProfile();
        List<String> applications = objectKeys(profile == null ? null : profile.get("applications"));
        JsonNode topology = profile == null ? null : profile.get("studioTopology");
        int blockCount = arraySize(topology == null ? null : topology.get("blocks"));
        int connectionCount = arraySize(topology == null ? null : topology.get("connections"));
        boolean topologyConfigured = topology != null && topology.isObject()
                && topology.path("version").asInt() == 1 && blockCount > 0;
        boolean runtimeConfigured = configuration != null && !applications.isEmpty();
        boolean matches = configuration != null && snapshot != null
                && Objects.equals(configuration.getSourceSnapshotId(), snapshot.getId())
                && Objects.equals(configuration.getModelVersionId(), model.getId());
        return new ReferenceSetup(project == null ? null : project.getId(),
                project == null ? null : project.getName(),
                model.getId(), snapshot == null ? null : snapshot.getId(), model.getRevision(),
                referenceReady, runtimeConfigured, matches,
                configuration == null ? 0 : configuration.getRevision(),
                applications, blockCount, connectionCount, topologyConfigured);
    }

    private static ReferenceSetup emptyReference(Project project) {
        return new ReferenceSetup(project == null ? null : project.getId(),
                project == null ? null : project.getName(), null, null, 0,
                false, false, false, 0, List.of(), 0, 0, false);
    }

    private LabSetup labSetup(Assignment lab, ReferenceSetup fallback) {
        boolean published = lab.getLabOrder() != null;
        ReferenceSetup reference = lab.getReferenceModel() == null ? fallback : reference(lab.getReferenceModel());
        boolean referenceReady = reference.referenceReady();
        boolean requiresRuntime = Boolean.TRUE.equals(lab.getRequireRuntimeTrace());
        boolean studioReady = referenceReady && reference.runtimeMatchesSource()
                && reference.runtimeConfigured() && reference.topologyConfigured();
        boolean topologyFrozen = lab.getStudioTopologySnapshot() != null
                && lab.getStudioTopologySnapshot().isObject();
        int quizVersion = quizVersion(lab);
        String state = !published ? "DRAFT"
                : requiresRuntime && !studioReady ? "NEEDS_STUDIO"
                : requiresRuntime && !topologyFrozen ? "NEEDS_FREEZE"
                : quizVersion == 0 ? "NEEDS_QUIZ"
                : "READY";
        return new LabSetup(lab.getId(), published ? lab.getLabOrder() : 0, lab.getTitle(),
                published, referenceReady, requiresRuntime, studioReady, topologyFrozen,
                quizVersion > 0, quizVersion, state);
    }

    private int quizVersion(Assignment lab) {
        if (lab.getReferenceModel() == null) return 0;
        Integer version = jdbc.queryForObject("""
                SELECT coalesce(max(version), 0) FROM course_quizzes
                WHERE assignment_id = ? AND reference_model_id = ?
                """, Integer.class, lab.getId(), lab.getReferenceModel().getId());
        return version == null ? 0 : version;
    }

    private PasskeySetup passkey(UUID workspaceId, Integer maxStudents) {
        var key = jdbc.query("""
                SELECT expires_at, revoked_at IS NULL AND expires_at > now() AS active
                FROM course_passkeys WHERE workspace_id = ?
                """, (rs, row) -> new Object[] {
                        rs.getBoolean("active"),
                        rs.getObject("expires_at", OffsetDateTime.class)
                }, workspaceId).stream().findFirst().orElse(null);
        Integer enrolled = jdbc.queryForObject("""
                SELECT count(*) FROM workspace_members
                WHERE workspace_id = ? AND member_role = 'STUDENT'
                """, Integer.class, workspaceId);
        return new PasskeySetup(key != null && Boolean.TRUE.equals(key[0]),
                key == null ? null : (OffsetDateTime) key[1], maxStudents,
                enrolled == null ? 0 : enrolled);
    }

    /**
     * Internal container port declared by the analyzed compose service. Compose
     * entries can be plain ("8080"), protocol-qualified ("8080/tcp") or mapped
     * ("8080:8080"); the last segment is the port the process listens on.
     */
    private static int containerPort(ModelElement element) {
        JsonNode ports = element.getProperties() == null ? null : element.getProperties().path("ports");
        if (ports != null && ports.isArray()) {
            for (JsonNode item : ports) {
                String raw = item.asText("").trim();
                if (raw.isEmpty()) continue;
                String withoutProtocol = raw.split("/")[0];
                String last = withoutProtocol.substring(withoutProtocol.lastIndexOf(':') + 1);
                try {
                    int port = Integer.parseInt(last);
                    if (port >= 1 && port <= 65535) return port;
                } catch (NumberFormatException ignored) {
                    // Try the next declared port.
                }
            }
        }
        return 8080;
    }

    private static boolean looksLikeConnectionController(String name) {
        for (String token : name.toLowerCase(java.util.Locale.ROOT).split("[-_.]")) {
            if (Set.of("route", "router", "gateway", "proxy", "edge", "ingress").contains(token)) return true;
        }
        return false;
    }

    private static List<String> objectKeys(JsonNode node) {
        if (node == null || !node.isObject()) return List.of();
        List<String> keys = new ArrayList<>();
        node.fieldNames().forEachRemaining(keys::add);
        return keys;
    }

    private static int arraySize(JsonNode node) {
        return node != null && node.isArray() ? node.size() : 0;
    }

    @Transactional
    public AutoConfigureStudioResult autoConfigureStudio(UUID workspaceId, UUID assignmentId) {
        access.requireWorkspaceLecturer(workspaceId);
        Workspace workspace = workspaces.findById(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Workspace not found"));
        if (!"ACTIVE".equals(workspace.getStatus())) {
            throw new BusinessException(ErrorCode.CONFLICT, "Workspace is archived");
        }
        Assignment lab = assignments.findLockedById(assignmentId)
                .filter(a -> a.getWorkspace() != null && workspaceId.equals(a.getWorkspace().getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Lab not found"));

        ModelVersion refModel = lab.getReferenceModel();
        if (labStudioExercises != null) {
            var exercise = labStudioExercises.findByAssignmentId(lab.getId()).orElse(null);
            if (exercise != null && exercise.getRuntimeModelId() != null) {
                refModel = models.findById(exercise.getRuntimeModelId()).orElse(refModel);
            }
        }
        ObjectMapper json = objectMapper != null ? objectMapper : new ObjectMapper();
        ObjectNode topology = json.createObjectNode().put("version", 1);
        ArrayNode blocks = topology.putArray("blocks");
        ArrayNode connections = topology.putArray("connections");
        Map<String, UUID> serviceMappings = new LinkedHashMap<>();

        List<ModelElement> containerElements = (refModel != null && elements != null)
                ? elements.findByModelVersionId(refModel.getId()).stream()
                        .filter(el -> "SERVICE_CONTAINER".equalsIgnoreCase(el.getElementType())
                                || "DATABASE".equalsIgnoreCase(el.getElementType())
                                || "MESSAGE_BROKER".equalsIgnoreCase(el.getElementType())
                                || "API_GATEWAY".equalsIgnoreCase(el.getElementType()))
                        .toList()
                : List.of();

        Map<UUID, String> elementNameById = new HashMap<>();
        Map<String, String> runtimeByName = new HashMap<>();
        Map<String, Integer> containerPortByName = new HashMap<>();
        Set<String> controllerNames = new LinkedHashSet<>();
        if (!containerElements.isEmpty()) {
            Set<String> names = new LinkedHashSet<>();
            for (ModelElement el : containerElements) {
                if (el.getName() == null || el.getName().isBlank()) continue;
                String svcName = el.getName().trim();
                elementNameById.put(el.getId(), svcName);
                String stack = el.getLanguageStack() == null ? "" : el.getLanguageStack().toLowerCase();
                runtimeByName.put(svcName, stack.contains(".net") || stack.contains("dotnet") || stack.contains("c#")
                        ? "dotnet8-linux-x64-glibc" : "java");
                containerPortByName.putIfAbsent(svcName, containerPort(el));
                names.add(svcName);
            }

            // A prepared connection controller must be a real service that is not itself a
            // block. Collapse routing/gateway services that sit between two blocks into the
            // connection they carry instead of emitting an invalid self-controlled edge.
            List<String[]> edges = new ArrayList<>();
            if (refModel != null && relationships != null) {
                for (ModelRelationship rel : relationships.findByModelVersionId(refModel.getId())) {
                    if (rel.getSourceElement() == null || rel.getTargetElement() == null) continue;
                    String fromName = elementNameById.get(rel.getSourceElement().getId());
                    String toName = elementNameById.get(rel.getTargetElement().getId());
                    if (fromName != null && toName != null && !fromName.equals(toName)) {
                        edges.add(new String[] { fromName, toName,
                                rel.getRelationType() != null ? rel.getRelationType() : "HTTP" });
                    }
                }
            }
            for (String name : names) {
                if (!looksLikeConnectionController(name)) continue;
                boolean inbound = edges.stream().anyMatch(edge -> edge[1].equals(name) && !edge[0].equals(name));
                boolean outbound = edges.stream().anyMatch(edge -> edge[0].equals(name) && !edge[1].equals(name));
                if (inbound && outbound) controllerNames.add(name);
            }

            Set<String> seenServices = new LinkedHashSet<>();
            for (ModelElement el : containerElements) {
                if (el.getName() == null || el.getName().isBlank()) continue;
                String svcName = el.getName().trim();
                if (!seenServices.add(svcName)) continue;
                if (el.getId() != null) serviceMappings.put(svcName, el.getId());
                if (controllerNames.contains(svcName)) continue;
                blocks.addObject()
                        .put("service", svcName)
                        .put("label", svcName)
                        .put("canScale", true)
                        .put("initiallyStopped", false);
            }

            Set<String> seenConnections = new LinkedHashSet<>();
            for (String controller : controllerNames) {
                for (String[] inbound : edges) {
                    if (!inbound[1].equals(controller)) continue;
                    for (String[] outbound : edges) {
                        if (!outbound[0].equals(controller)) continue;
                        String from = inbound[0];
                        String to = outbound[1];
                        if (from.equals(to) || controllerNames.contains(from) || controllerNames.contains(to)) continue;
                        if (!seenConnections.add(from + "->" + to + "@" + controller)) continue;
                        connections.addObject()
                                .put("from", from)
                                .put("to", to)
                                .put("controllerService", controller)
                                .put("protocol", outbound[2])
                                .put("initiallyStopped", false);
                    }
                }
            }
        } else {
            for (String svc : List.of("order-service", "payment-service", "inventory-service")) {
                blocks.addObject()
                        .put("service", svc)
                        .put("label", svc)
                        .put("canScale", true)
                        .put("initiallyStopped", false);
            }
            controllerNames.add("api-gateway");
            connections.addObject().put("from", "order-service").put("to", "payment-service")
                    .put("controllerService", "api-gateway").put("protocol", "FEIGN_CALL").put("initiallyStopped", false);
            connections.addObject().put("from", "order-service").put("to", "inventory-service")
                    .put("controllerService", "api-gateway").put("protocol", "FEIGN_CALL").put("initiallyStopped", false);
        }

        if (refModel != null && refModel.getProject() != null && refModel.getSourceSnapshot() != null) {
            UUID refProjectId = refModel.getProject().getId();
            RuntimeConfiguration cfg = configurations.findById(refProjectId).orElse(null);
            ObjectNode profile = json.createObjectNode();
            ObjectNode apps = profile.putObject("applications");
            Set<String> applicationNames = new LinkedHashSet<>();
            for (JsonNode b : blocks) {
                String svc = b.path("service").asText("");
                if (!svc.isBlank()) applicationNames.add(svc);
            }
            // Connection controllers are real services too: they must be started and
            // mapped even though they are not draggable blocks.
            applicationNames.addAll(controllerNames);
            for (String svc : applicationNames) {
                apps.putObject(svc)
                        .put("runtime", runtimeByName.getOrDefault(svc, "java"))
                        .put("containerPort", containerPortByName.getOrDefault(svc, 8080))
                        .put("readinessPath", "/health");
            }
            ObjectNode mappingsNode = profile.putObject("serviceMappings");
            serviceMappings.forEach((k, v) -> mappingsNode.put(k, v.toString()));
            profile.set("studioTopology", topology.deepCopy());

            int nextCfgRevision = cfg != null ? cfg.getRevision() + 1 : 1;
            if (cfg == null) {
                jdbc.update("""
                        INSERT INTO runtime_configurations (project_id, source_snapshot_id, model_version_id, profile_id, profile, revision)
                        VALUES (?, ?, ?, 'SPRING_BOOT_DOTNET_COMPOSE_V1', CAST(? AS jsonb), 1)
                        ON CONFLICT (project_id) DO UPDATE SET
                          source_snapshot_id = EXCLUDED.source_snapshot_id,
                          model_version_id = EXCLUDED.model_version_id,
                          profile = EXCLUDED.profile,
                          revision = runtime_configurations.revision + 1
                        """, refProjectId, refModel.getSourceSnapshot().getId(), refModel.getId(), profile.toString());
            } else {
                cfg.setSourceSnapshotId(refModel.getSourceSnapshot().getId());
                cfg.setModelVersionId(refModel.getId());
                if (cfg.getProfileId() == null || cfg.getProfileId().isBlank()) {
                    cfg.setProfileId("SPRING_BOOT_DOTNET_COMPOSE_V1");
                }
                cfg.setProfile(profile);
                cfg.setRevision(nextCfgRevision);
                configurations.save(cfg);
            }

            Integer scnCount = jdbc.queryForObject(
                    "SELECT count(*) FROM runtime_scenarios WHERE project_id = ?",
                    Integer.class, refProjectId);
            if (scnCount == null || scnCount == 0) {
                ArrayNode steps = json.createArrayNode();
                String primaryService = blocks.isEmpty() ? "order-service" : blocks.get(0).path("service").asText("order-service");
                steps.addObject().put("id", "auto-health-check").put("service", primaryService)
                        .put("method", "GET").put("path", "/health").put("expectedStatus", 200);
                jdbc.update("""
                        INSERT INTO runtime_scenarios (id, project_id, name, steps, revision)
                        VALUES (?, ?, 'Auto-Configured Studio Scenario', CAST(? AS jsonb), 1)
                        """, UUID.randomUUID(), refProjectId, steps.toString());
            }
        }

        int nextTopoRev = (lab.getStudioTopologyRevision() != null ? lab.getStudioTopologyRevision() : 0) + 1;
        lab.setStudioTopologySnapshot(topology.deepCopy());
        lab.setStudioTopologyRevision(nextTopoRev);
        lab.setRequireRuntimeTrace(true);
        if ("LEGACY".equalsIgnoreCase(lab.getLabMode() == null ? "LEGACY" : lab.getLabMode())) {
            lab.setLabMode("THEORY_QUIZ_STUDIO");
        }
        assignments.saveAndFlush(lab);

        return new AutoConfigureStudioResult(
                lab.getId(),
                blocks.size(),
                connections.size(),
                nextTopoRev,
                true,
                setup(workspaceId));
    }
}
