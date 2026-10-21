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
import com.mavis.common.utils.SecurityUtils;
import com.mavis.platform.assignment.dto.AssignmentCreateRequest;
import com.mavis.platform.assignment.dto.AssignmentResponseDTO;
import com.mavis.platform.assignment.dto.AssignmentUpdateRequest;
import com.mavis.platform.assignment.service.AssignmentService;
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
    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final SubmissionSnapshotRepository submissionSnapshotRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AssignmentResponseDTO createAssignment(UUID workspaceId, AssignmentCreateRequest request) {
        UUID currentUserId = SecurityUtils.getCurrentUserId();
        Workspace workspace = workspaceRepository.findWithCreatorById(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy lớp học"));

        validateLecturerOrCreatorPermission(workspace, currentUserId);
        validateDiagramTypes(request.getRequiredDiagramTypes());

        User currentUser = userRepository.findById(currentUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy người dùng hiện tại"));

        JsonNode requiredDiagramTypesNode = request.getRequiredDiagramTypes() != null
                ? objectMapper.valueToTree(request.getRequiredDiagramTypes())
                : null;
        JsonNode aiPolicyNode = request.getAiPolicy() != null
                ? objectMapper.valueToTree(request.getAiPolicy())
                : null;

        String ruleSetVersion = request.getRuleSetVersion() != null && !request.getRuleSetVersion().isBlank()
                ? request.getRuleSetVersion().trim()
                : "SWD_DEFAULT_V1";
        Boolean requireRuntimeTrace = request.getRequireRuntimeTrace() != null
                ? request.getRequireRuntimeTrace()
                : false;

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
                .dueAt(request.getDueAt())
                .createdAt(now)
                .updatedAt(now)
                .build();

        assignment = assignmentRepository.save(assignment);
        log.info("Assignment created: id={}, title={}, workspaceId={}", assignment.getId(), assignment.getTitle(), workspaceId);

        return toDTO(assignment, 0L);
    }

    @Override
    @Transactional(readOnly = true)
    public List<AssignmentResponseDTO> getAssignmentsByWorkspace(UUID workspaceId) {
        if (!workspaceRepository.existsById(workspaceId)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy lớp học");
        }

        List<Assignment> assignments = assignmentRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId);
        if (assignments.isEmpty()) {
            return Collections.emptyList();
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

        long submissionCount = submissionSnapshotRepository.countByAssignmentId(assignmentId);
        return toDTO(assignment, submissionCount);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AssignmentResponseDTO updateAssignment(UUID assignmentId, AssignmentUpdateRequest request) {
        UUID currentUserId = SecurityUtils.getCurrentUserId();
        Assignment assignment = assignmentRepository.findWithDetailsById(assignmentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy đề bài tập"));

        validateLecturerOrCreatorPermission(assignment.getWorkspace(), currentUserId);

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
            assignment.setAiPolicy(objectMapper.valueToTree(request.getAiPolicy()));
        }

        if (request.getDueAt() != null) {
            assignment.setDueAt(request.getDueAt());
        }

        assignment.setUpdatedAt(OffsetDateTime.now());
        assignment = assignmentRepository.save(assignment);
        log.info("Assignment updated: id={}", assignmentId);

        long submissionCount = submissionSnapshotRepository.countByAssignmentId(assignmentId);
        return toDTO(assignment, submissionCount);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteAssignment(UUID assignmentId) {
        UUID currentUserId = SecurityUtils.getCurrentUserId();
        Assignment assignment = assignmentRepository.findWithDetailsById(assignmentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy đề bài tập"));

        validateLecturerOrCreatorPermission(assignment.getWorkspace(), currentUserId);

        if (submissionSnapshotRepository.existsByAssignmentId(assignmentId)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Không thể xóa đề bài tập đã có sinh viên nộp bài (BR-14)");
        }

        assignmentRepository.delete(assignment);
        log.info("Deleted assignment {} from workspace {}", assignmentId, assignment.getWorkspace().getId());
    }

    private void validateDiagramTypes(List<String> diagramTypes) {
        if (diagramTypes == null) {
            return;
        }
        for (String notationStr : diagramTypes) {
            if (notationStr == null || notationStr.isBlank()) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Loại sơ đồ yêu cầu không được để trống");
            }
            try {
                DiagramNotation.valueOf(notationStr.trim().toUpperCase());
            } catch (IllegalArgumentException e) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Loại sơ đồ không hợp lệ: " + notationStr + ". Các loại hợp lệ: " + Arrays.toString(DiagramNotation.values()));
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
                .dueAt(assignment.getDueAt())
                .submissionCount(submissionCount)
                .createdAt(createdAt)
                .updatedAt(updatedAt)
                .build();
    }
}
