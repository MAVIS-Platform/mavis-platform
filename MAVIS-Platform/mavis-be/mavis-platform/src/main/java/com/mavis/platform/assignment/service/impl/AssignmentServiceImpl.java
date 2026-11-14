package com.mavis.platform.assignment.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.enums.DiagramNotation;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.SubmissionSnapshotRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.repository.WorkspaceMemberRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.CourseLabPolicy;
import com.mavis.common.utils.SecurityUtils;
import com.mavis.platform.assignment.dto.AssignmentCreateRequest;
import com.mavis.platform.assignment.dto.AssignmentResponseDTO;
import com.mavis.platform.assignment.dto.AssignmentUpdateRequest;
import com.mavis.platform.assignment.service.AssignmentService;
import com.mavis.platform.assignment.service.LabReferenceArchive;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(rollbackFor = Exception.class)
public class AssignmentServiceImpl implements AssignmentService {

    private final AssignmentRepository assignmentRepository;
    private final CourseLabPolicy courseLabs;
    private final LabReferenceArchive referenceArchive;
    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final SubmissionSnapshotRepository submissionSnapshotRepository;
    private final UserRepository userRepository;
    private final com.mavis.common.repository.ModelVersionRepository modelVersionRepository;
    private final com.mavis.common.repository.SourceSnapshotRepository sourceSnapshotRepository;
    private final ObjectMapper objectMapper;
    private final com.mavis.common.security.AccessPolicyService accessPolicyService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AssignmentResponseDTO createAssignment(UUID workspaceId, AssignmentCreateRequest request) {
        accessPolicyService.requireWorkspaceLecturer(workspaceId);
        UUID currentUserId = SecurityUtils.getCurrentUserId();
        Workspace workspace = workspaceRepository.findWithCreatorById(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy lớp học"));

        validateDiagramTypes(request.getRequiredDiagramTypes());

        User currentUser = userRepository.findById(currentUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy người dùng hiện tại"));

        JsonNode requiredDiagramTypesNode = request.getRequiredDiagramTypes() != null
                ? objectMapper.valueToTree(request.getRequiredDiagramTypes())
                : null;
        JsonNode aiPolicyNode = toAiPolicyNode(request.getAiPolicy());

        String ruleSetVersion = request.getRuleSetVersion() != null && !request.getRuleSetVersion().isBlank()
                ? request.getRuleSetVersion().trim()
                : "SWD_DEFAULT_V1";
        Boolean requireRuntimeTrace = request.getRequireRuntimeTrace() != null
                ? request.getRequireRuntimeTrace()
                : false;

        if (request.getLabOrder() != null && request.getLabOrder() < 1) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Thứ tự Lab phải >= 1");
        }

        OffsetDateTime now = OffsetDateTime.now();
        Assignment assignment = Assignment.builder()
                .workspace(workspace)
                .createdBy(currentUser)
                .title(request.getTitle().trim())
                .description(request.getDescription())
                .requiredDiagramTypes(requiredDiagramTypesNode)
                .ruleSetVersion(ruleSetVersion)
                .requireRuntimeTrace(requireRuntimeTrace)
                .aiPolicy(aiPolicyNode)
                .labOrder(request.getLabOrder())
                .dueAt(request.getDueAt())
                .createdAt(now)
                .updatedAt(now)
                .build();

        setReference(assignment, request.getReferenceModelId(), request.getClearReferenceSource());
        assignment = assignmentRepository.save(assignment);
        log.info("Assignment created: id={}, title={}, workspaceId={}", assignment.getId(), assignment.getTitle(), workspaceId);

        return toDTO(assignment, 0L);
    }

    @Override
    @Transactional(readOnly = true)
    public List<AssignmentResponseDTO> getAssignmentsByWorkspace(UUID workspaceId) {
        accessPolicyService.requireWorkspaceMember(workspaceId);
        if (!workspaceRepository.existsById(workspaceId)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy lớp học");
        }

        List<Assignment> assignments = assignmentRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId);
        if (assignments.isEmpty()) {
            return Collections.emptyList();
        }

        if (assignments.getFirst().getWorkspace().isCourseMode()) {
            User actor = accessPolicyService.requireCurrentActiveUser();
            if (CourseLabPolicy.isStudent(actor)) {
                assignments = assignments.stream()
                        .filter(assignment -> courseLabs.canOpen(assignment, actor))
                        .sorted(Comparator.comparing(Assignment::getLabOrder))
                        .toList();
            }
        }
        if (assignments.isEmpty()) {
            return List.of();
        }
        List<UUID> assignmentIds = assignments.stream().map(Assignment::getId).toList();
        Map<UUID, Long> submissionCountMap = new HashMap<>();
        List<Object[]> counts = submissionSnapshotRepository.countSubmissionsByAssignmentIds(assignmentIds);
        for (Object[] row : counts) {
            if (row != null && row.length >= 2 && row[0] != null) {
                submissionCountMap.put((UUID) row[0], ((Number) row[1]).longValue());
            }
        }

        return assignments.stream()
                .map(a -> toDTO(a, submissionCountMap.getOrDefault(a.getId(), 0L)))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public AssignmentResponseDTO getAssignmentById(UUID assignmentId) {
        Assignment assignment = assignmentRepository.findWithDetailsById(assignmentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy đề bài tập"));

        accessPolicyService.requireWorkspaceMember(assignment.getWorkspace().getId());
        requireCourseLabAccess(assignment);
        long submissionCount = submissionSnapshotRepository.countByAssignmentId(assignmentId);
        return toDTO(assignment, submissionCount);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AssignmentResponseDTO updateAssignment(UUID assignmentId, AssignmentUpdateRequest request) {
        Assignment assignment = assignmentRepository.findLockedById(assignmentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy đề bài tập"));

        accessPolicyService.requireWorkspaceLecturer(assignment.getWorkspace().getId());

        assignment.setTitle(request.getTitle().trim());
        assignment.setDescription(request.getDescription());

        if (request.getRequiredDiagramTypes() != null) {
            validateDiagramTypes(request.getRequiredDiagramTypes());
            assignment.setRequiredDiagramTypes(objectMapper.valueToTree(request.getRequiredDiagramTypes()));
        }

        if (request.getRuleSetVersion() != null && !request.getRuleSetVersion().isBlank()) {
            assignment.setRuleSetVersion(request.getRuleSetVersion().trim());
        }

        if (request.getRequireRuntimeTrace() != null) {
            assignment.setRequireRuntimeTrace(request.getRequireRuntimeTrace());
        }

        if (request.getAiPolicy() != null) {
            assignment.setAiPolicy(toAiPolicyNode(request.getAiPolicy()));
        }

        if (request.getLabOrder() != null) {
            if (request.getLabOrder() < 1) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Thứ tự Lab phải >= 1");
            }
            if (assignment.getLabOrder() == null) {
                assignment.setLabOrder(request.getLabOrder());
            }
        }

        if (request.getDueAt() != null) {
            assignment.setDueAt(request.getDueAt());
        }

        assignment.setUpdatedAt(OffsetDateTime.now());
        if (assignment.getLabOrder() != null && (Boolean.TRUE.equals(request.getClearReferenceSource())
                || (request.getReferenceModelId() != null
                    && (assignment.getReferenceModel() == null
                        || !request.getReferenceModelId().equals(assignment.getReferenceModel().getId()))))) {
            throw new BusinessException(ErrorCode.CONFLICT, "A published Lab keeps its pinned source");
        }
        if (assignment.getLabOrder() == null) {
            setReference(assignment, request.getReferenceModelId(), request.getClearReferenceSource());
        }
        assignment = assignmentRepository.save(assignment);
        log.info("Assignment updated: id={}", assignmentId);

        long submissionCount = submissionSnapshotRepository.countByAssignmentId(assignmentId);
        return toDTO(assignment, submissionCount);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteAssignment(UUID assignmentId) {
        Assignment assignment = assignmentRepository.findLockedById(assignmentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy đề bài tập"));

        accessPolicyService.requireWorkspaceLecturer(assignment.getWorkspace().getId());

        if (assignment.getLabOrder() != null) {
            throw new BusinessException(ErrorCode.CONFLICT, "Published Labs are part of the course roadmap");
        }
        if (submissionSnapshotRepository.existsByAssignmentId(assignmentId)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Không thể xóa đề bài tập đã có sinh viên nộp bài (BR-14)");
        }

        assignmentRepository.delete(assignment);
        log.info("Deleted assignment {} from workspace {}", assignmentId, assignment.getWorkspace().getId());
    }

    @Override
    @Transactional(readOnly = true)
    public org.springframework.core.io.Resource downloadReferenceSource(UUID assignmentId) {
        var assignment = assignmentRepository.findWithDetailsById(assignmentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Assignment not found"));
        accessPolicyService.requireWorkspaceMember(assignment.getWorkspace().getId());
        requireCourseLabAccess(assignment);
        if (assignment.getReferenceModel() == null) throw new BusinessException(ErrorCode.NOT_FOUND, "No reference source attached");
        return referenceArchive.resolve(assignment.getReferenceModel().getSourceSnapshot(),
                assignment.getLabOrder() != null);
    }

    private void requireCourseLabAccess(Assignment assignment) {
        if (assignment.getWorkspace().isCourseMode()) {
            User actor = accessPolicyService.requireCurrentActiveUser();
            if (CourseLabPolicy.isStudent(actor)) {
                courseLabs.requireOpen(assignment, actor);
            }
        }
    }

    private void setReference(Assignment assignment, UUID modelId, Boolean clear) {
        if (Boolean.TRUE.equals(clear)) {
            if (modelId != null) throw new BusinessException(ErrorCode.BAD_REQUEST, "Cannot clear and select source together");
            assignment.setReferenceModel(null);
            return;
        }
        if (modelId == null) return;
        var model = modelVersionRepository.findById(modelId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Reference version not found"));
        var snapshot = model.getSourceSnapshot();
        var project = snapshot.getProject();
        if (project.getWorkspace() == null || !assignment.getWorkspace().getId().equals(project.getWorkspace().getId())
                || !Boolean.TRUE.equals(project.getIsReferenceTemplate()) || !project.getId().equals(model.getProject().getId())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Choose a teaching reference from this workspace");
        }
        snapshot.setIsPublished(true);
        sourceSnapshotRepository.save(snapshot);
        assignment.setReferenceModel(model);
    }

    private Map<String, Object> referenceDetails(Assignment assignment) {
        var model = assignment.getReferenceModel();
        if (model == null) return null;
        var snapshot = model.getSourceSnapshot();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("projectId", snapshot.getProject().getId());
        result.put("projectName", snapshot.getProject().getName());
        result.put("snapshotId", snapshot.getId());
        result.put("modelId", model.getId());
        result.put("revision", model.getRevision());
        result.put("sourceType", snapshot.getSourceType());
        result.put("repositoryUrl", snapshot.getProject().getRepositoryUrl());
        result.put("branch", snapshot.getBranchName());
        result.put("commitSha", snapshot.getCommitSha());
        result.put("artifactHash", snapshot.getArtifactHash());
        return result;
    }

    private JsonNode toAiPolicyNode(Object rawAiPolicy) {
        if (rawAiPolicy == null) {
            return null;
        }
        if (rawAiPolicy instanceof JsonNode node) {
            return node;
        }
        if (rawAiPolicy instanceof String text) {
            String trimmed = text.trim();
            if (trimmed.isEmpty()) {
                return null;
            }
            if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
                try {
                    return objectMapper.readTree(trimmed);
                } catch (Exception ex) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "Định dạng aiPolicy JSON không hợp lệ");
                }
            }
            return objectMapper.valueToTree(trimmed);
        }
        return objectMapper.valueToTree(rawAiPolicy);
    }

    private void validateDiagramTypes(List<String> diagramTypes) {
        if (diagramTypes == null) {
            return;
        }
        for (String notationStr : diagramTypes) {
            if (notationStr == null || notationStr.isBlank()) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Loại sơ đồ yêu cầu không được để trống");
            }
            if (!com.mavis.common.utils.CourseworkDiagramTypes.supportedRequirement(notationStr.trim().toUpperCase())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Loại sơ đồ không hợp lệ: " + notationStr);
            }
        }
    }

    private void validateLecturerOrCreatorPermission(Workspace workspace, UUID currentUserId) {
        if (workspace == null) {
            return;
        }
        boolean isCreator = workspace.getCreatedBy() != null && currentUserId.equals(workspace.getCreatedBy().getId());
        if (isCreator) {
            return;
        }

        boolean isLecturer = workspaceMemberRepository.findByWorkspaceIdAndUserId(workspace.getId(), currentUserId)
                .map(wm -> "LECTURER".equalsIgnoreCase(wm.getMemberRole()))
                .orElse(false);

        if (!isLecturer) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Chỉ Giảng viên của lớp mới có quyền tạo/chỉnh sửa đề bài tập");
        }
    }

    private AssignmentResponseDTO toDTO(Assignment assignment, long submissionCount) {
        if (assignment == null) {
            return null;
        }

        List<String> diagramTypes = new ArrayList<>();
        if (assignment.getRequiredDiagramTypes() != null && assignment.getRequiredDiagramTypes().isArray()) {
            for (JsonNode node : assignment.getRequiredDiagramTypes()) {
                diagramTypes.add(node.asText());
            }
        }

        OffsetDateTime updatedAt = assignment.getUpdatedAt() != null ? assignment.getUpdatedAt() : OffsetDateTime.now();
        OffsetDateTime createdAt = assignment.getCreatedAt() != null ? assignment.getCreatedAt() : updatedAt;

        return AssignmentResponseDTO.builder()
                .id(assignment.getId())
                .workspaceId(assignment.getWorkspace() != null ? assignment.getWorkspace().getId() : null)
                .workspaceName(assignment.getWorkspace() != null ? assignment.getWorkspace().getName() : null)
                .createdById(assignment.getCreatedBy() != null ? assignment.getCreatedBy().getId() : null)
                .createdByName(assignment.getCreatedBy() != null ? assignment.getCreatedBy().getFullName() : null)
                .title(assignment.getTitle())
                .description(assignment.getDescription())
                .requiredDiagramTypes(diagramTypes)
                .ruleSetVersion(assignment.getRuleSetVersion())
                .requireRuntimeTrace(assignment.getRequireRuntimeTrace())
                .aiPolicy(assignment.getAiPolicy())
                .labOrder(assignment.getLabOrder())
                .referenceSource(referenceDetails(assignment))
                .dueAt(assignment.getDueAt())
                .submissionCount(submissionCount)
                .createdAt(createdAt)
                .updatedAt(updatedAt)
                .build();
    }
}
