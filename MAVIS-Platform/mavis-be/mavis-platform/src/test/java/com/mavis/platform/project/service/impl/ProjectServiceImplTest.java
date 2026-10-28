package com.mavis.platform.project.service.impl;

import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.entity.WorkspaceMember;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.SourceSnapshotRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.repository.WorkspaceMemberRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.platform.project.dto.ProjectCreateRequest;
import com.mavis.platform.project.dto.ProjectResponseDTO;
import com.mavis.platform.project.dto.SourceSnapshotResponseDTO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ProjectServiceImplTest {

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private WorkspaceRepository workspaceRepository;

    @Mock
    private AssignmentRepository assignmentRepository;

    @Mock
    private SourceSnapshotRepository sourceSnapshotRepository;

    @Mock
    private WorkspaceMemberRepository workspaceMemberRepository;

    @Mock
    private com.mavis.common.security.AccessPolicyService accessPolicyService;

    @InjectMocks
    private ProjectServiceImpl projectService;

    private UUID currentUserId;
    private User currentUser;
    private UUID workspaceId;
    private Workspace workspace;
    private UUID assignmentId;
    private Assignment assignment;

    @BeforeEach
    void setUp() {
        currentUserId = UUID.randomUUID();
        currentUser = User.builder()
                .id(currentUserId)
                .email("user@fpt.edu.vn")
                .fullName("Test User")
                .build();

        workspaceId = UUID.randomUUID();
        workspace = Workspace.builder()
                .id(workspaceId)
                .name("Software Architecture")
                .createdBy(currentUser)
                .status("ACTIVE")
                .build();

        assignmentId = UUID.randomUUID();
        assignment = Assignment.builder()
                .id(assignmentId)
                .title("Lab 1 Microservices")
                .workspace(workspace)
                .createdBy(currentUser)
                .build();

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(currentUserId.toString(), null, Collections.emptyList())
        );

        when(accessPolicyService.requireCurrentActiveUser()).thenReturn(currentUser);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("Tạo dự án cá nhân PERSONAL khi workspaceId null và không chỉ định projectType")
    void createProject_Personal_Success() {
        ProjectCreateRequest request = ProjectCreateRequest.builder()
                .name("My Personal Microservice")
                .description("Personal playground")
                .repositoryUrl("https://github.com/user/personal")
                .defaultBranch("main")
                .build();

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(currentUser));
        when(projectRepository.save(any(Project.class))).thenAnswer(invocation -> {
            Project p = invocation.getArgument(0);
            p.setId(UUID.randomUUID());
            return p;
        });

        ProjectResponseDTO response = projectService.createProject(request);

        assertThat(response).isNotNull();
        assertThat(response.getProjectType()).isEqualTo("PERSONAL");
        assertThat(response.getIsReferenceTemplate()).isFalse();
        assertThat(response.getWorkspaceId()).isNull();

        ArgumentCaptor<Project> captor = ArgumentCaptor.forClass(Project.class);
        verify(projectRepository).save(captor.capture());
        assertThat(captor.getValue().getProjectType()).isEqualTo("PERSONAL");
        assertThat(captor.getValue().getIsReferenceTemplate()).isFalse();
    }

    @Test
    @DisplayName("Tạo dự án mẫu TEACHER_REFERENCE trong workspace với isReferenceTemplate = true")
    void createProject_TeacherReference_Success() {
        ProjectCreateRequest request = ProjectCreateRequest.builder()
                .name("Template Banking Architecture")
                .workspaceId(workspaceId)
                .projectType("TEACHER_REFERENCE")
                .build();

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(currentUser));
        when(workspaceRepository.findById(workspaceId)).thenReturn(Optional.of(workspace));
        when(projectRepository.save(any(Project.class))).thenAnswer(invocation -> {
            Project p = invocation.getArgument(0);
            p.setId(UUID.randomUUID());
            return p;
        });

        ProjectResponseDTO response = projectService.createProject(request);

        assertThat(response).isNotNull();
        assertThat(response.getProjectType()).isEqualTo("TEACHER_REFERENCE");
        assertThat(response.getIsReferenceTemplate()).isTrue();
        assertThat(response.getWorkspaceId()).isEqualTo(workspaceId);
    }

    @Test
    @DisplayName("Tạo dự án làm bài STUDENT_WORKING mặc định khi có workspaceId")
    void createProject_StudentWorking_Success() {
        ProjectCreateRequest request = ProjectCreateRequest.builder()
                .name("Student Solution")
                .workspaceId(workspaceId)
                .assignmentId(assignmentId)
                .build();

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(currentUser));
        when(workspaceRepository.findById(workspaceId)).thenReturn(Optional.of(workspace));
        when(assignmentRepository.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(projectRepository.save(any(Project.class))).thenAnswer(invocation -> {
            Project p = invocation.getArgument(0);
            p.setId(UUID.randomUUID());
            return p;
        });

        ProjectResponseDTO response = projectService.createProject(request);

        assertThat(response).isNotNull();
        assertThat(response.getProjectType()).isEqualTo("STUDENT_WORKING");
        assertThat(response.getIsReferenceTemplate()).isFalse();
        assertThat(response.getWorkspaceId()).isEqualTo(workspaceId);
        assertThat(response.getAssignmentId()).isEqualTo(assignmentId);
    }

    @Test
    @DisplayName("Kế thừa bản mẫu đã công bố (referenceSnapshotId) và tự động tạo SourceSnapshot cho sinh viên")
    void createProject_ForkFromReferenceSnapshot_Success() {
        UUID refSnapshotId = UUID.randomUUID();
        SourceSnapshot refSnapshot = SourceSnapshot.builder()
                .id(refSnapshotId)
                .sourceType("ZIP_UPLOAD")
                .branchName("main")
                .commitSha("abc1234")
                .artifactHash("sha256:fedcba987654321")
                .storagePath("s3://mavis/templates/ref.zip")
                .isPublished(true)
                .build();

        ProjectCreateRequest request = ProjectCreateRequest.builder()
                .name("Student Fork")
                .workspaceId(workspaceId)
                .referenceSnapshotId(refSnapshotId)
                .build();

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(currentUser));
        when(workspaceRepository.findById(workspaceId)).thenReturn(Optional.of(workspace));
        when(sourceSnapshotRepository.findById(refSnapshotId)).thenReturn(Optional.of(refSnapshot));
        when(projectRepository.save(any(Project.class))).thenAnswer(invocation -> {
            Project p = invocation.getArgument(0);
            p.setId(UUID.randomUUID());
            return p;
        });

        ProjectResponseDTO response = projectService.createProject(request);

        assertThat(response).isNotNull();
        assertThat(response.getReferenceSnapshotId()).isEqualTo(refSnapshotId);

        ArgumentCaptor<SourceSnapshot> snapshotCaptor = ArgumentCaptor.forClass(SourceSnapshot.class);
        verify(sourceSnapshotRepository).save(snapshotCaptor.capture());
        SourceSnapshot savedSnapshot = snapshotCaptor.getValue();
        assertThat(savedSnapshot.getStoragePath()).isEqualTo("s3://mavis/templates/ref.zip");
        assertThat(savedSnapshot.getArtifactHash()).isEqualTo("sha256:fedcba987654321");
        assertThat(savedSnapshot.getSourceType()).isEqualTo("ZIP_UPLOAD");
        assertThat(savedSnapshot.getIsPublished()).isFalse();
        assertThat(savedSnapshot.getCreatedBy()).isEqualTo(currentUser);
    }

    @Test
    @DisplayName("Ném lỗi BAD_REQUEST (BR-11) khi sinh viên kế thừa bản mẫu chưa được công bố")
    void createProject_ForkFromUnpublishedSnapshot_ThrowsBadRequest_BR11() {
        UUID refSnapshotId = UUID.randomUUID();
        SourceSnapshot unpublishedSnapshot = SourceSnapshot.builder()
                .id(refSnapshotId)
                .sourceType("GITHUB_COMMIT")
                .artifactHash("hash123")
                .isPublished(false)
                .build();

        ProjectCreateRequest request = ProjectCreateRequest.builder()
                .name("Student Fork Unpublished")
                .workspaceId(workspaceId)
                .referenceSnapshotId(refSnapshotId)
                .build();

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(currentUser));
        when(workspaceRepository.findById(workspaceId)).thenReturn(Optional.of(workspace));
        when(sourceSnapshotRepository.findById(refSnapshotId)).thenReturn(Optional.of(unpublishedSnapshot));

        assertThatThrownBy(() -> projectService.createProject(request))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.BAD_REQUEST)
                .hasMessageContaining("BR-11");

        verify(projectRepository, never()).save(any());
        verify(sourceSnapshotRepository, never()).save(any());
    }

    @Test
    @DisplayName("Ném lỗi NOT_FOUND khi bản mẫu referenceSnapshotId không tồn tại")
    void createProject_ReferenceSnapshotNotFound_ThrowsNotFound() {
        UUID refSnapshotId = UUID.randomUUID();
        ProjectCreateRequest request = ProjectCreateRequest.builder()
                .name("Student Fork Missing")
                .workspaceId(workspaceId)
                .referenceSnapshotId(refSnapshotId)
                .build();

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(currentUser));
        when(workspaceRepository.findById(workspaceId)).thenReturn(Optional.of(workspace));
        when(sourceSnapshotRepository.findById(refSnapshotId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> projectService.createProject(request))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.NOT_FOUND);
    }

    @Test
    @DisplayName("Công bố bản mẫu publishSnapshot thành công theo BR-12")
    void publishSnapshot_Success_BR12() {
        UUID projectId = UUID.randomUUID();
        Project project = Project.builder()
                .id(projectId)
                .name("Architecture Template")
                .owner(currentUser)
                .workspace(workspace)
                .isReferenceTemplate(false)
                .build();

        UUID snapshotId = UUID.randomUUID();
        SourceSnapshot snapshot = SourceSnapshot.builder()
                .id(snapshotId)
                .project(project)
                .sourceType("GITHUB_COMMIT")
                .artifactHash("hash_abc")
                .isPublished(false)
                .createdBy(currentUser)
                .build();

        when(projectRepository.findWithDetailsById(projectId)).thenReturn(Optional.of(project));
        when(sourceSnapshotRepository.findById(snapshotId)).thenReturn(Optional.of(snapshot));
        when(sourceSnapshotRepository.save(any(SourceSnapshot.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(projectRepository.save(any(Project.class))).thenAnswer(invocation -> invocation.getArgument(0));

        SourceSnapshotResponseDTO result = projectService.publishSnapshot(projectId, snapshotId);

        assertThat(result).isNotNull();
        assertThat(result.getIsPublished()).isTrue();
        assertThat(project.getIsReferenceTemplate()).isTrue();

        verify(sourceSnapshotRepository).save(argThat(SourceSnapshot::getIsPublished));
        verify(projectRepository).save(argThat(Project::getIsReferenceTemplate));
    }

    @Test
    @DisplayName("Ném lỗi FORBIDDEN khi người khác không phải chủ sở hữu/giảng viên công bố bản mẫu")
    void publishSnapshot_NotOwnerOrLecturer_ThrowsForbidden() {
        UUID projectId = UUID.randomUUID();
        User anotherUser = User.builder().id(UUID.randomUUID()).build();
        User anotherCreator = User.builder().id(UUID.randomUUID()).build();
        Workspace otherWorkspace = Workspace.builder().id(UUID.randomUUID()).createdBy(anotherCreator).build();

        Project project = Project.builder()
                .id(projectId)
                .owner(anotherUser)
                .workspace(otherWorkspace)
                .build();

        when(projectRepository.findWithDetailsById(projectId)).thenReturn(Optional.of(project));
        when(workspaceMemberRepository.findByWorkspaceIdAndUserId(otherWorkspace.getId(), currentUserId))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> projectService.publishSnapshot(projectId, UUID.randomUUID()))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.FORBIDDEN);
    }

    @Test
    @DisplayName("Ném lỗi BAD_REQUEST khi snapshot không thuộc về dự án chỉ định")
    void publishSnapshot_SnapshotMismatch_ThrowsBadRequest() {
        UUID projectId = UUID.randomUUID();
        Project project = Project.builder()
                .id(projectId)
                .owner(currentUser).workspace(workspace)
                .build();

        Project otherProject = Project.builder()
                .id(UUID.randomUUID())
                .build();

        UUID snapshotId = UUID.randomUUID();
        SourceSnapshot snapshot = SourceSnapshot.builder()
                .id(snapshotId)
                .project(otherProject)
                .build();

        when(projectRepository.findWithDetailsById(projectId)).thenReturn(Optional.of(project));
        when(sourceSnapshotRepository.findById(snapshotId)).thenReturn(Optional.of(snapshot));

        assertThatThrownBy(() -> projectService.publishSnapshot(projectId, snapshotId))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.BAD_REQUEST);
    }

    @Test
    @DisplayName("Lấy danh sách dự án trong Workspace loại trừ trạng thái DELETED")
    void getProjectsByWorkspace_Success() {
        when(workspaceRepository.findById(workspaceId)).thenReturn(Optional.of(workspace));

        Project p1 = Project.builder()
                .id(UUID.randomUUID())
                .name("Project 1")
                .owner(currentUser)
                .workspace(workspace)
                .status("ACTIVE")
                .build();

        when(projectRepository.findByWorkspaceIdAndStatusNotOrderByCreatedAtDesc(workspaceId, "DELETED"))
                .thenReturn(List.of(p1));

        when(accessPolicyService.canReadProject(p1)).thenReturn(true);
        List<ProjectResponseDTO> results = projectService.getProjectsByWorkspace(workspaceId);

        assertThat(results).hasSize(1);
        assertThat(results.get(0).getName()).isEqualTo("Project 1");
    }

    @Test
    @DisplayName("Lấy danh sách các bản chụp mẫu đã công bố trong Workspace")
    void getPublishedSnapshotsByWorkspace_Success() {
        when(workspaceRepository.findById(workspaceId)).thenReturn(Optional.of(workspace));

        Project p1 = Project.builder()
                .id(UUID.randomUUID())
                .name("Reference Project")
                .build();

        SourceSnapshot snapshot = SourceSnapshot.builder()
                .id(UUID.randomUUID())
                .project(p1)
                .sourceType("GITHUB_COMMIT")
                .artifactHash("hash999")
                .isPublished(true)
                .createdBy(currentUser)
                .build();

        when(sourceSnapshotRepository.findPublishedByWorkspaceId(workspaceId)).thenReturn(List.of(snapshot));

        List<SourceSnapshotResponseDTO> results = projectService.getPublishedSnapshotsByWorkspace(workspaceId);

        assertThat(results).hasSize(1);
        assertThat(results.get(0).getArtifactHash()).isEqualTo("hash999");
        assertThat(results.get(0).getIsPublished()).isTrue();
    }
    @Test void updateCannotChangeBoundRepository() {
        UUID id=UUID.randomUUID();var project=Project.builder().id(id).name("Bound").owner(currentUser).repositoryUrl("https://github.com/example/original").build();
        when(projectRepository.findLockedById(id)).thenReturn(Optional.of(project));
        var request=new com.mavis.platform.project.dto.ProjectUpdateRequest();request.setRepositoryUrl("https://github.com/example/other");
        assertThatThrownBy(()->projectService.updateProject(id,request)).isInstanceOf(BusinessException.class);
        assertThat(project.getRepositoryUrl()).isEqualTo("https://github.com/example/original");verify(projectRepository,never()).save(any());
    }
}
