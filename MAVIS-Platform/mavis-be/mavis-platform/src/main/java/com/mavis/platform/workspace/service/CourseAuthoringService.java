package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.mavis.common.entity.CourseDefinition;
import com.mavis.common.entity.CourseItem;
import com.mavis.common.entity.CourseModule;
import com.mavis.common.entity.CourseVersion;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.CourseDefinitionRepository;
import com.mavis.common.repository.CourseItemRepository;
import com.mavis.common.repository.CourseModuleRepository;
import com.mavis.common.repository.CourseVersionRepository;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.utils.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(rollbackFor = Exception.class)
public class CourseAuthoringService {
    private static final Set<String> ITEM_TYPES = Set.of("THEORY", "QUIZ", "ESSAY", "STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB");

    private final AccessPolicyService access;
    private final WorkspaceRepository workspaces;
    private final CourseDefinitionRepository courses;
    private final CourseModuleRepository modules;
    private final CourseItemRepository items;
    private final CourseVersionRepository versions;
    private final UserRepository users;
    private final ObjectMapper mapper;
    private final AssignmentRepository assignments;
    private final JdbcTemplate jdbc;

    public record CourseView(UUID id, UUID workspaceId, String title, String description, String status,
                             int draftRevision, int publishedVersion, List<ModuleView> modules) {}
    public record PublishedView(UUID courseId, int version, int draftRevision, String snapshotDigest,
                                java.time.OffsetDateTime publishedAt, JsonNode snapshot) {}
    public record ModuleView(UUID id, String title, String description, int position, UUID prerequisiteModuleId, List<ItemView> items) {}
    public record ItemView(UUID id, String type, String title, String description, int position,
                           UUID assignmentId, JsonNode content, boolean required) {}
    public record CourseRequest(String title, String description) {}
    public record ModuleRequest(String title, String description, UUID prerequisiteModuleId) {}
    public record ItemRequest(String type, String title, String description, UUID assignmentId,
                              JsonNode content, Boolean required) {}

    public CourseView startDraft(UUID workspaceId) {
        access.requireWorkspaceLecturer(workspaceId);
        CourseDefinition course = courses.findLockedByWorkspaceId(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Course not found"));
        if ("ARCHIVED".equals(course.getStatus())) throw new BusinessException(ErrorCode.CONFLICT, "Archived Course cannot be edited");
        if ("PUBLISHED".equals(course.getStatus())) {
            course.setStatus("DRAFT");
            course.setDraftRevision(course.getDraftRevision() + 1);
            courses.save(course);
        }
        return view(course);
    }

    @Transactional(readOnly = true)
    public PublishedView publishedForLearner(UUID workspaceId) {
        access.requireWorkspaceMember(workspaceId);
        CourseDefinition course = courses.findByWorkspaceId(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Course not found"));
        if (course.getPublishedVersion() < 1) throw new BusinessException(ErrorCode.NOT_FOUND, "Course has not been published");
        CourseVersion version = versions.findByCourseIdAndVersion(course.getId(), course.getPublishedVersion())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Published Course version not found"));
        JsonNode learnerSnapshot = version.getSnapshot().deepCopy();
        JsonNode moduleNodes = learnerSnapshot.path("modules");
        if (moduleNodes.isArray()) {
            moduleNodes.forEach(moduleNode -> {
                JsonNode itemNodes = moduleNode.path("items");
                if (itemNodes.isArray()) itemNodes.forEach(itemNode -> {
                    if ("QUIZ".equals(itemNode.path("type").asText())) ((com.fasterxml.jackson.databind.node.ObjectNode)itemNode).set("content", JsonNodeFactory.instance.objectNode());
                });
            });
        }
        return new PublishedView(course.getId(), version.getVersion(), version.getDraftRevision(),
                version.getSnapshotDigest(), version.getPublishedAt(), learnerSnapshot);
    }

    @Transactional(readOnly = true)
    public List<PublishedView> versions(UUID workspaceId) {
        access.requireWorkspaceLecturer(workspaceId);
        access.requireWorkspaceMember(workspaceId);
        CourseDefinition course = courses.findByWorkspaceId(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Course not found"));
        return versions.findByCourseIdOrderByVersionDesc(course.getId()).stream()
                .map(version -> new PublishedView(course.getId(), version.getVersion(), version.getDraftRevision(),
                        version.getSnapshotDigest(), version.getPublishedAt(), version.getSnapshot()))
                .toList();
    }

    @Transactional(readOnly = true)
    public PublishedView version(UUID workspaceId, int versionNumber) {
        access.requireWorkspaceMember(workspaceId);
        CourseDefinition course = courses.findByWorkspaceId(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Course not found"));
        CourseVersion version = versions.findByCourseIdAndVersion(course.getId(), versionNumber)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Course version not found"));
        return new PublishedView(course.getId(), version.getVersion(), version.getDraftRevision(),
                version.getSnapshotDigest(), version.getPublishedAt(), version.getSnapshot());
    }

    public PublishedView publish(UUID workspaceId) {
        access.requireWorkspaceLecturer(workspaceId);
        CourseDefinition course = courses.findLockedByWorkspaceId(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Course draft not found"));
        requireDraft(course);
        List<CourseModule> courseModules = modules.findByCourseIdOrderByPositionAsc(course.getId());
        if (courseModules.isEmpty()) throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "Add at least one module before publishing");
        List<ModuleView> moduleViews = courseModules.stream().map(module -> {
            List<CourseItem> moduleItems = items.findByModuleIdOrderByPositionAsc(module.getId());
            if (moduleItems.isEmpty()) throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "Every module must contain at least one learning item");
            for (CourseItem item : moduleItems) {
                if (item.getAssignmentId() != null && !assignmentBelongsToWorkspace(item.getAssignmentId(), workspaceId)) {
                    throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "A course item references a Lab outside this workspace");
                }
                validateItemForPublish(item, workspaceId);
            }
            return new ModuleView(module.getId(), module.getTitle(), module.getDescription(), module.getPosition(), module.getPrerequisiteModuleId(),
                    moduleItems.stream().map(item -> new ItemView(item.getId(), item.getItemType(), item.getTitle(),
                            item.getDescription(), item.getPosition(), item.getAssignmentId(), item.getContent(), item.isRequired())).toList());
        }).toList();
        JsonNode snapshot = mapper.valueToTree(new CourseSnapshot(course.getId(), workspaceId, course.getTitle(),
                course.getDescription(), moduleViews));
        String digest = digest(snapshot);
        int versionNumber = course.getPublishedVersion() + 1;
        if (versions.existsByCourseIdAndSnapshotDigest(course.getId(), digest)) {
            throw new BusinessException(ErrorCode.CONFLICT, "This exact Course content has already been published");
        }
        User publisher = users.findById(SecurityUtils.getCurrentUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Current user not found"));
        CourseVersion version = CourseVersion.builder().course(course).version(versionNumber)
                .draftRevision(course.getDraftRevision()).snapshot(snapshot).snapshotDigest(digest).publishedBy(publisher).build();
        version = versions.save(version);
        course.setPublishedVersion(versionNumber);
        course.setStatus("PUBLISHED");
        courses.save(course);
        return new PublishedView(course.getId(), versionNumber, course.getDraftRevision(), digest, version.getPublishedAt(), snapshot);
    }

    private record CourseSnapshot(UUID courseId, UUID workspaceId, String title, String description,
                                  List<ModuleView> modules) {}

    private void validateItemForPublish(CourseItem item, UUID workspaceId) {
        JsonNode content = item.getContent();
        if (content == null || !content.isObject()) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "Learning item content must be a JSON object");
        }
        if ("THEORY".equals(item.getItemType())) {
            JsonNode body = content.get("body");
            if (body == null || !body.isTextual() || body.asText().isBlank()) {
                throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "Theory item requires content.body");
            }
        }
        if ("ESSAY".equals(item.getItemType())) {
            JsonNode prompt = content.get("prompt");
            JsonNode rubric = content.get("rubric");
            if (prompt == null || !prompt.isTextual() || prompt.asText().isBlank()
                    || rubric == null || (!rubric.isArray() && !rubric.isObject())) {
                throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "Essay item requires prompt and rubric content");
            }
        }
        if ("QUIZ".equals(item.getItemType()) && item.getAssignmentId() == null) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "Quiz item must link to its versioned Quiz Lab");
        }
        if ("QUIZ".equals(item.getItemType())) {
            Integer quizCount = jdbc.queryForObject("SELECT count(*) FROM course_quizzes WHERE assignment_id = ? AND version > 0", Integer.class, item.getAssignmentId());
            if (quizCount == null || quizCount < 1) throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "Quiz item must link to a Lab with a published Quiz version");
        }
        if (Set.of("STATIC_LAB", "IMPACT_LAB", "RUNTIME_LAB").contains(item.getItemType()) && item.getAssignmentId() == null) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "Lab item must link to a published Workspace Assignment");
        }
        if ("RUNTIME_LAB".equals(item.getItemType()) && !assignments.findWithDetailsById(item.getAssignmentId())
                .map(assignment -> Boolean.TRUE.equals(assignment.getRequireRuntimeTrace())).orElse(false)) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "Runtime Lab must require a runtime trace");
        }
    }

    private boolean assignmentBelongsToWorkspace(UUID assignmentId, UUID workspaceId) {
        return assignments.existsByIdAndWorkspaceId(assignmentId, workspaceId);
    }

    private String digest(JsonNode snapshot) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(snapshot.toString().getBytes(StandardCharsets.UTF_8));
            return "sha256:" + HexFormat.of().formatHex(hash);
        } catch (Exception ex) {
            throw new IllegalStateException("SHA-256 is unavailable", ex);
        }
    }

    @Transactional(readOnly = true)
    public CourseView get(UUID workspaceId) {
        access.requireWorkspaceLecturer(workspaceId);
        CourseDefinition course = courses.findByWorkspaceId(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Course draft not found"));
        return view(course);
    }

    public CourseView saveDraft(UUID workspaceId, CourseRequest request) {
        access.requireWorkspaceLecturer(workspaceId);
        if (request == null || request.title() == null || request.title().isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Course title is required");
        }
        String title = request.title().trim();
        if (title.length() > 255) throw new BusinessException(ErrorCode.BAD_REQUEST, "Course title exceeds 255 characters");

        Workspace workspace = workspaces.findLockedById(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Workspace not found"));
        CourseDefinition course = courses.findByWorkspaceId(workspaceId).orElseGet(() -> {
            workspace.setCourseMode(true);
            return CourseDefinition.builder().workspace(workspace).title(title).description(request.description()).draftRevision(0).build();
        });
        if (course.getStatus().equals("PUBLISHED")) {
            throw new BusinessException(ErrorCode.CONFLICT, "Start a new draft from the published version before editing");
        }
        if (course.getStatus().equals("ARCHIVED")) {
            throw new BusinessException(ErrorCode.CONFLICT, "Archived Course cannot be edited");
        }
        course.setTitle(title);
        course.setDescription(request.description());
        course.setDraftRevision(course.getDraftRevision() + 1);
        return view(courses.save(course));
    }

    public CourseView addModule(UUID workspaceId, ModuleRequest request) {
        access.requireWorkspaceLecturer(workspaceId);
        CourseDefinition course = requireCourse(workspaceId);
        requireDraft(course);
        if (request == null || request.title() == null || request.title().isBlank() || request.title().trim().length() > 255) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Module title is required and must be at most 255 characters");
        }
        List<CourseModule> current = modules.findByCourseIdOrderByPositionAsc(course.getId());
        UUID prerequisite = request.prerequisiteModuleId();
        if (prerequisite != null && current.stream().noneMatch(module -> module.getId().equals(prerequisite))) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Prerequisite must be an earlier module in this Course");
        }
        CourseModule module = CourseModule.builder().course(course).title(request.title().trim())
                .description(request.description()).prerequisiteModuleId(prerequisite).position(current.size() + 1).build();
        modules.save(module);
        bump(course);
        return view(course);
    }

    public CourseView addItem(UUID workspaceId, UUID moduleId, ItemRequest request) {
        access.requireWorkspaceLecturer(workspaceId);
        CourseDefinition course = requireCourse(workspaceId);
        requireDraft(course);
        CourseModule module = findModule(course, moduleId);
        validateItemRequest(workspaceId, request);
        List<CourseItem> current = items.findByModuleIdOrderByPositionAsc(moduleId);
        CourseItem item = CourseItem.builder().module(module).itemType(request.type().trim().toUpperCase())
                .title(request.title().trim()).description(request.description()).position(current.size() + 1)
                .assignmentId(request.assignmentId()).content(request.content() == null ? JsonNodeFactory.instance.objectNode() : request.content())
                .required(request.required() == null || request.required()).build();
        items.save(item);
        bump(course);
        return view(course);
    }

    public CourseView updateModule(UUID workspaceId, UUID moduleId, ModuleRequest request) {
        access.requireWorkspaceLecturer(workspaceId);
        CourseDefinition course = requireCourse(workspaceId);
        requireDraft(course);
        CourseModule module = findModule(course, moduleId);
        if (request == null || request.title() == null || request.title().isBlank()
                || request.title().trim().length() > 255) {
            throw new BusinessException(ErrorCode.BAD_REQUEST,
                    "Module title is required and must be at most 255 characters");
        }
        UUID prerequisite = request.prerequisiteModuleId();
        if (prerequisite != null) {
            CourseModule candidate = modules.findByCourseIdOrderByPositionAsc(course.getId()).stream()
                    .filter(value -> value.getId().equals(prerequisite))
                    .findFirst()
                    .orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST,
                            "Prerequisite must be an earlier module in this Course"));
            if (candidate.getPosition() >= module.getPosition()) {
                throw new BusinessException(ErrorCode.BAD_REQUEST,
                        "Prerequisite must be an earlier module in this Course");
            }
        }
        module.setTitle(request.title().trim());
        module.setDescription(request.description());
        module.setPrerequisiteModuleId(prerequisite);
        modules.save(module);
        bump(course);
        return view(course);
    }

    public CourseView moveModule(UUID workspaceId, UUID moduleId, String direction) {
        access.requireWorkspaceLecturer(workspaceId);
        CourseDefinition course = requireCourse(workspaceId);
        requireDraft(course);
        List<CourseModule> ordered = new java.util.ArrayList<>(modules.findByCourseIdOrderByPositionAsc(course.getId()));
        int index = indexOfModule(ordered, moduleId);
        int target = moveTarget(index, ordered.size(), direction);
        if (target < 0) return view(course);
        List<CourseModule> reordered = new java.util.ArrayList<>(ordered);
        CourseModule moving = reordered.remove(index);
        reordered.add(target, moving);
        validateModuleOrder(reordered);
        for (CourseModule module : ordered) {
            module.setPosition(-module.getPosition());
            modules.saveAndFlush(module);
        }
        int position = 1;
        for (CourseModule module : reordered) {
            module.setPosition(position++);
            modules.saveAndFlush(module);
        }
        bump(course);
        return view(course);
    }

    public CourseView updateItem(UUID workspaceId, UUID moduleId, UUID itemId, ItemRequest request) {
        access.requireWorkspaceLecturer(workspaceId);
        CourseDefinition course = requireCourse(workspaceId);
        requireDraft(course);
        findModule(course, moduleId);
        validateItemRequest(workspaceId, request);
        CourseItem item = items.findById(itemId)
                .filter(candidate -> candidate.getModule().getId().equals(moduleId))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Course item not found"));
        applyItem(item, request);
        items.save(item);
        bump(course);
        return view(course);
    }

    public CourseView moveItem(UUID workspaceId, UUID moduleId, UUID itemId, String direction) {
        access.requireWorkspaceLecturer(workspaceId);
        CourseDefinition course = requireCourse(workspaceId);
        requireDraft(course);
        findModule(course, moduleId);
        List<CourseItem> ordered = new java.util.ArrayList<>(items.findByModuleIdOrderByPositionAsc(moduleId));
        int index = -1;
        for (int i = 0; i < ordered.size(); i++) {
            if (ordered.get(i).getId().equals(itemId)) {
                index = i;
                break;
            }
        }
        if (index < 0) throw new BusinessException(ErrorCode.NOT_FOUND, "Course item not found");
        int target = moveTarget(index, ordered.size(), direction);
        if (target < 0) return view(course);
        CourseItem moving = ordered.get(index);
        CourseItem neighbor = ordered.get(target);
        int movingPosition = moving.getPosition();
        int neighborPosition = neighbor.getPosition();
        moving.setPosition(-movingPosition);
        items.saveAndFlush(moving);
        neighbor.setPosition(movingPosition);
        items.saveAndFlush(neighbor);
        moving.setPosition(neighborPosition);
        items.saveAndFlush(moving);
        bump(course);
        return view(course);
    }

    public CourseView deleteItem(UUID workspaceId, UUID moduleId, UUID itemId) {
        access.requireWorkspaceLecturer(workspaceId);
        CourseDefinition course = requireCourse(workspaceId);
        requireDraft(course);
        findModule(course, moduleId);
        CourseItem item = items.findById(itemId)
                .filter(candidate -> candidate.getModule().getId().equals(moduleId))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Course item not found"));
        items.delete(item);
        items.flush();
        List<CourseItem> remaining = items.findByModuleIdOrderByPositionAsc(moduleId);
        int position = 1;
        for (CourseItem current : remaining) {
            if (current.getPosition() != position) {
                current.setPosition(position);
                items.saveAndFlush(current);
            }
            position++;
        }
        bump(course);
        return view(course);
    }

    private CourseModule findModule(CourseDefinition course, UUID moduleId) {
        return modules.findById(moduleId)
                .filter(candidate -> candidate.getCourse().getId().equals(course.getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Course module not found"));
    }

    private void validateItemRequest(UUID workspaceId, ItemRequest request) {
        if (request == null || request.type() == null || !ITEM_TYPES.contains(request.type().trim().toUpperCase())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Unsupported course item type");
        }
        if (request.title() == null || request.title().isBlank() || request.title().trim().length() > 255) {
            throw new BusinessException(ErrorCode.BAD_REQUEST,
                    "Course item title is required and must be at most 255 characters");
        }
        if (request.assignmentId() != null && !assignments.existsByIdAndWorkspaceId(request.assignmentId(), workspaceId)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Linked Lab must belong to this Workspace");
        }
    }

    private void applyItem(CourseItem item, ItemRequest request) {
        item.setItemType(request.type().trim().toUpperCase());
        item.setTitle(request.title().trim());
        item.setDescription(request.description());
        item.setAssignmentId(request.assignmentId());
        item.setContent(request.content() == null ? JsonNodeFactory.instance.objectNode() : request.content());
        item.setRequired(request.required() == null || request.required());
    }

    private void validateModuleOrder(List<CourseModule> ordered) {
        java.util.Map<UUID, Integer> indexById = new java.util.HashMap<>();
        for (int i = 0; i < ordered.size(); i++) {
            indexById.put(ordered.get(i).getId(), i);
        }
        for (int i = 0; i < ordered.size(); i++) {
            UUID prerequisite = ordered.get(i).getPrerequisiteModuleId();
            if (prerequisite == null) continue;
            Integer prerequisiteIndex = indexById.get(prerequisite);
            if (prerequisiteIndex == null || prerequisiteIndex >= i) {
                throw new BusinessException(ErrorCode.BAD_REQUEST,
                        "Module prerequisite must remain before the module");
            }
        }
    }

    private int indexOfModule(List<CourseModule> ordered, UUID moduleId) {
        for (int i = 0; i < ordered.size(); i++) {
            if (ordered.get(i).getId().equals(moduleId)) return i;
        }
        throw new BusinessException(ErrorCode.NOT_FOUND, "Course module not found");
    }

    private int moveTarget(int index, int size, String direction) {
        if ("UP".equalsIgnoreCase(direction)) {
            return index > 0 ? index - 1 : -1;
        }
        if ("DOWN".equalsIgnoreCase(direction)) {
            return index < size - 1 ? index + 1 : -1;
        }
        throw new BusinessException(ErrorCode.BAD_REQUEST, "Direction must be UP or DOWN");
    }

    private CourseDefinition requireCourse(UUID workspaceId) {
        return courses.findByWorkspaceId(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Create the Course draft first"));
    }

    private void requireDraft(CourseDefinition course) {
        if (!"DRAFT".equals(course.getStatus())) {
            throw new BusinessException(ErrorCode.CONFLICT, "Published Course content is immutable; create a new draft revision");
        }
    }

    private void bump(CourseDefinition course) {
        course.setDraftRevision(course.getDraftRevision() + 1);
        courses.save(course);
    }

    private CourseView view(CourseDefinition course) {
        List<ModuleView> moduleViews = modules.findByCourseIdOrderByPositionAsc(course.getId()).stream().map(module ->
                new ModuleView(module.getId(), module.getTitle(), module.getDescription(), module.getPosition(), module.getPrerequisiteModuleId(),
                        items.findByModuleIdOrderByPositionAsc(module.getId()).stream().map(item ->
                                new ItemView(item.getId(), item.getItemType(), item.getTitle(), item.getDescription(),
                                        item.getPosition(), item.getAssignmentId(), item.getContent(), item.isRequired())).toList())
        ).toList();
        return new CourseView(course.getId(), course.getWorkspace().getId(), course.getTitle(), course.getDescription(),
                course.getStatus(), course.getDraftRevision(), course.getPublishedVersion(), moduleViews);
    }
}
