package com.mavis.analyzer.upload.service.impl;

import com.mavis.analyzer.storage.service.StorageService;
import com.mavis.analyzer.upload.dto.GitHubImportRequest;
import com.mavis.analyzer.upload.dto.IngestionResponseDTO;
import com.mavis.common.contract.AnalyzeRequestEvent;
import com.mavis.common.entity.Job;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.User;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.JobRepository;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.SourceSnapshotRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SourceIngestionServiceImplTest {

    @Mock
    private StorageService storageService;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private SourceSnapshotRepository sourceSnapshotRepository;

    @Mock
    private JobRepository jobRepository;

    @Mock
    private HttpClient httpClient;

    @Mock
    private HttpResponse<InputStream> httpResponse;

    @Mock private com.mavis.common.config.PlatformRuntimeSettings settings;

    @Mock private com.mavis.common.security.AccessPolicyService accessPolicy;

    @InjectMocks
    private SourceIngestionServiceImpl sourceIngestionService;

    @TempDir
    Path tempDir;

    private UUID currentUserId;
    private User owner;
    private Project sampleProject;
    private Path sampleZipFile;

    @BeforeEach
    void setUp() throws IOException {
        currentUserId = UUID.randomUUID();
        owner = User.builder()
                .id(currentUserId)
                .email("student@fpt.edu.vn")
                .fullName("Test Student")
                .build();

        sampleProject = Project.builder()
                .id(UUID.randomUUID())
                .name("Demo Service")
                .owner(owner)
                .build();

        sampleZipFile = tempDir.resolve("sample.zip");
        Files.write(sampleZipFile, "test-zip-content".getBytes());

        sourceIngestionService.setHttpClient(httpClient);

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(currentUserId.toString(), null, java.util.Collections.emptyList())
        );
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void guidedTemplateUploadRequiresCurrentLecturerPermission() {
        UUID workspaceId = UUID.randomUUID();
        sampleProject.setWorkspace(com.mavis.common.entity.Workspace.builder()
                .id(workspaceId).courseMode(true).build());
        sampleProject.setProjectType("TEACHER_REFERENCE");
        sampleProject.setIsReferenceTemplate(true);
        when(projectRepository.findLockedById(sampleProject.getId())).thenReturn(Optional.of(sampleProject));
        org.mockito.Mockito.doThrow(new BusinessException(ErrorCode.FORBIDDEN))
                .when(accessPolicy).requireWorkspaceLecturer(workspaceId);
        MockMultipartFile file = new MockMultipartFile("file", "project.zip", "application/zip", new byte[]{1});

        assertThatThrownBy(() -> sourceIngestionService.ingestZipUpload(sampleProject.getId(), file))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.FORBIDDEN);
        org.mockito.Mockito.verifyNoInteractions(storageService, sourceSnapshotRepository);
    }

    @Test
    @DisplayName("ingestZipUpload - Thành công tạo snapshot và job")
    void ingestZipUpload_Success() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "project.zip", "application/zip", "dummy-zip-data".getBytes()
        );

        when(projectRepository.findLockedById(sampleProject.getId())).thenReturn(Optional.of(sampleProject));
        when(storageService.store(file)).thenReturn(sampleZipFile.toAbsolutePath().toString());

        UUID snapshotId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();

        when(sourceSnapshotRepository.save(any(SourceSnapshot.class))).thenAnswer(invocation -> {
            SourceSnapshot s = invocation.getArgument(0);
            s.setId(snapshotId);
            return s;
        });


        IngestionResponseDTO response = sourceIngestionService.ingestZipUpload(sampleProject.getId(), file);

        assertThat(response).isNotNull();
        assertThat(response.getProjectId()).isEqualTo(sampleProject.getId());
        assertThat(response.getSnapshotId()).isEqualTo(snapshotId);
        assertThat(response.getJobId()).isNull();
        assertThat(response.getSourceType()).isEqualTo("ZIP_UPLOAD");
        assertThat(response.getJobStatus()).isNull();
        assertThat(response.isAnalysisRequired()).isTrue();
        assertThat(response.getArtifactHash()).isNotBlank();
        assertThat(response.getStoragePath()).isEqualTo(sampleZipFile.toAbsolutePath().toString());

        org.mockito.Mockito.verifyNoInteractions(eventPublisher, jobRepository);
    }

    @Test
    @DisplayName("ingestZipUpload - Ném BAD_REQUEST khi file rỗng")
    void ingestZipUpload_FileEmpty_ThrowsBadRequest() {
        MockMultipartFile emptyFile = new MockMultipartFile(
                "file", "test.zip", "application/zip", new byte[0]
        );

        assertThatThrownBy(() -> sourceIngestionService.ingestZipUpload(sampleProject.getId(), emptyFile))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.BAD_REQUEST);
    }

    @Test
    @DisplayName("ingestZipUpload - Ném BAD_REQUEST khi file không phải định dạng .zip")
    void ingestZipUpload_InvalidExtension_ThrowsBadRequest() {
        MockMultipartFile nonZipFile = new MockMultipartFile(
                "file", "script.sh", "text/plain", "echo hello".getBytes()
        );

        assertThatThrownBy(() -> sourceIngestionService.ingestZipUpload(sampleProject.getId(), nonZipFile))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.BAD_REQUEST);
    }

    @Test
    @DisplayName("ingestZipUpload - Ném NOT_FOUND khi không tìm thấy Project")
    void ingestZipUpload_ProjectNotFound_ThrowsNotFound() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "project.zip", "application/zip", "content".getBytes()
        );
        UUID nonExistentProjectId = UUID.randomUUID();
        when(projectRepository.findLockedById(nonExistentProjectId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> sourceIngestionService.ingestZipUpload(nonExistentProjectId, file))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.NOT_FOUND);
    }

    @Test
    @DisplayName("ingestZipUpload - Ném FORBIDDEN khi user không phải owner")
    void ingestZipUpload_ForbiddenUser_ThrowsForbidden() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "project.zip", "application/zip", "content".getBytes()
        );

        User anotherUser = User.builder().id(UUID.randomUUID()).build();
        Project anotherProject = Project.builder()
                .id(UUID.randomUUID())
                .name("Another Project")
                .owner(anotherUser)
                .build();

        when(projectRepository.findLockedById(anotherProject.getId())).thenReturn(Optional.of(anotherProject));

        assertThatThrownBy(() -> sourceIngestionService.ingestZipUpload(anotherProject.getId(), file))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.FORBIDDEN);
    }

    @Test
    @DisplayName("ingestFromGitHub - Thành công tải archive và tạo snapshot, job")
    void ingestFromGitHub_Success() throws IOException, InterruptedException {
        GitHubImportRequest request = GitHubImportRequest.builder()
                .projectId(sampleProject.getId())
                .repositoryUrl("https://github.com/octocat/Hello-World.git")
                .branchName("master")
                .commitSha("7fd1a60b01f91b314f59955a4e4d4e80d8edf11d")
                .build();

        when(projectRepository.findLockedById(sampleProject.getId())).thenReturn(Optional.of(sampleProject));

        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn(new ByteArrayInputStream("fake-zip-data".getBytes()));
        doReturn(httpResponse).when(httpClient).send(any(HttpRequest.class), any());

        when(storageService.store(any(InputStream.class), anyString()))
                .thenReturn(sampleZipFile.toAbsolutePath().toString());

        UUID snapshotId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();

        when(sourceSnapshotRepository.save(any(SourceSnapshot.class))).thenAnswer(inv -> {
            SourceSnapshot s = inv.getArgument(0);
            s.setId(snapshotId);
            return s;
        });


        IngestionResponseDTO response = sourceIngestionService.ingestFromGitHub(request);

        assertThat(response).isNotNull();
        assertThat(response.getProjectId()).isEqualTo(sampleProject.getId());
        assertThat(response.getSnapshotId()).isEqualTo(snapshotId);
        assertThat(response.getJobId()).isNull();
        assertThat(response.getSourceType()).isEqualTo("GITHUB_COMMIT");
        assertThat(response.getJobStatus()).isNull();
        assertThat(response.isAnalysisRequired()).isTrue();
        assertThat(response.getArtifactHash()).isNotBlank();

        org.mockito.Mockito.verifyNoInteractions(eventPublisher, jobRepository);
    }

    @Test
    @DisplayName("ingestFromGitHub - Ném BAD_REQUEST khi GitHub trả lỗi HTTP >= 400")
    void ingestFromGitHub_HttpError_ThrowsBadRequest() throws IOException, InterruptedException {
        GitHubImportRequest request = GitHubImportRequest.builder()
                .projectId(sampleProject.getId())
                .repositoryUrl("https://github.com/octocat/NonExistentRepo")
                .branchName("main")
                .build();

        when(projectRepository.findLockedById(sampleProject.getId())).thenReturn(Optional.of(sampleProject));
        when(httpResponse.statusCode()).thenReturn(404);
        doReturn(httpResponse).when(httpClient).send(any(HttpRequest.class), any());

        assertThatThrownBy(() -> sourceIngestionService.ingestFromGitHub(request))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.BAD_REQUEST);

        verify(storageService, never()).store(any(InputStream.class), anyString());
    }

    @Test
    @DisplayName("ingestFromGitHub - Ném BAD_REQUEST khi thiếu request hoặc repositoryUrl")
    void ingestFromGitHub_MissingFields_ThrowsBadRequest() {
        GitHubImportRequest invalidReq = GitHubImportRequest.builder()
                .projectId(sampleProject.getId())
                .repositoryUrl("")
                .build();

        assertThatThrownBy(() -> sourceIngestionService.ingestFromGitHub(invalidReq))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.BAD_REQUEST);
    }
 @Test void disabledGitHubRejectsBeforeNetworkOrWrites(){doThrow(new BusinessException(ErrorCode.FORBIDDEN)).when(settings).requireIntegration("github");assertThatThrownBy(()->sourceIngestionService.ingestFromGitHub(null)).isInstanceOf(BusinessException.class);verifyNoInteractions(projectRepository,storageService,eventPublisher);}
    @Test void boundRepositoryCannotBeReplaced() throws Exception {
        sampleProject.setRepositoryUrl("https://github.com/example/original");
        when(projectRepository.findLockedById(sampleProject.getId())).thenReturn(Optional.of(sampleProject));
        var request=GitHubImportRequest.builder().projectId(sampleProject.getId()).repositoryUrl("https://github.com/example/other").branchName("main").build();
        assertThatThrownBy(()->sourceIngestionService.ingestFromGitHub(request)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(httpClient);verifyNoInteractions(storageService);
        assertThat(sampleProject.getRepositoryUrl()).isEqualTo("https://github.com/example/original");
    }
    @Test void boundGitHubProjectRejectsZipSnapshots() {
        sampleProject.setRepositoryUrl("https://github.com/example/original");
        when(projectRepository.findLockedById(sampleProject.getId())).thenReturn(Optional.of(sampleProject));
        var file=new MockMultipartFile("file","source.zip","application/zip","test".getBytes());
        assertThatThrownBy(()->sourceIngestionService.ingestZipUpload(sampleProject.getId(),file)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(storageService);
    }
    @Test void differentBranchKeepsRepositoryAndExistingDefault() throws Exception {
        sampleProject.setRepositoryUrl("https://github.com/example/original");sampleProject.setDefaultBranch("main");
        when(projectRepository.findLockedById(sampleProject.getId())).thenReturn(Optional.of(sampleProject));
        when(httpResponse.statusCode()).thenReturn(200);when(httpResponse.body()).thenReturn(new ByteArrayInputStream("zip".getBytes()));
        doReturn(httpResponse).when(httpClient).send(any(HttpRequest.class),any());when(storageService.store(any(InputStream.class),anyString())).thenReturn(sampleZipFile.toString());
        when(sourceSnapshotRepository.save(any(SourceSnapshot.class))).thenAnswer(inv->{SourceSnapshot snap=inv.getArgument(0);snap.setId(UUID.randomUUID());assertThat(snap.getBranchName()).isEqualTo("develop");return snap;});
        sourceIngestionService.ingestFromGitHub(GitHubImportRequest.builder().projectId(sampleProject.getId()).repositoryUrl("https://github.com/EXAMPLE/original.git").branchName("develop").build());
        assertThat(sampleProject.getRepositoryUrl()).isEqualTo("https://github.com/example/original");assertThat(sampleProject.getDefaultBranch()).isEqualTo("main");verify(projectRepository,never()).save(any());
    }

    @Test
    @DisplayName("F02-002 & F02-005: Chặn student import GitHub vào courseMode (403) và giảng viên ingest 2 SHA tạo 2 snapshot độc lập")
    void courseModeBlocksStudentGitHubAndKeepsTwoLecturerShaVersions() throws Exception {
        UUID workspaceId = UUID.randomUUID();
        sampleProject.setWorkspace(com.mavis.common.entity.Workspace.builder().id(workspaceId).courseMode(true).build());
        sampleProject.setRepositoryUrl("https://github.com/example/curated");
        sampleProject.setProjectType("TEACHER_REFERENCE");
        sampleProject.setIsReferenceTemplate(true);
        when(projectRepository.findLockedById(sampleProject.getId())).thenReturn(Optional.of(sampleProject));

        doThrow(new BusinessException(ErrorCode.FORBIDDEN, "Lecturer required"))
                .when(accessPolicy).requireWorkspaceLecturer(workspaceId);
        assertThatThrownBy(() -> sourceIngestionService.ingestFromGitHub(GitHubImportRequest.builder()
                .projectId(sampleProject.getId())
                .repositoryUrl("https://github.com/example/curated")
                .commitSha("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
                .build()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);

        sampleProject.setProjectType("STUDENT_WORKING");
        sampleProject.setIsReferenceTemplate(false);
        doNothing().when(accessPolicy).requireWorkspaceLecturer(workspaceId);
        assertThatThrownBy(() -> sourceIngestionService.ingestFromGitHub(GitHubImportRequest.builder()
                .projectId(sampleProject.getId())
                .repositoryUrl("https://github.com/example/curated")
                .commitSha("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
                .build()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);

        sampleProject.setProjectType("TEACHER_REFERENCE");
        sampleProject.setIsReferenceTemplate(true);
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn(
                new ByteArrayInputStream("zip-v1".getBytes()),
                new ByteArrayInputStream("zip-v2".getBytes()));
        doReturn(httpResponse).when(httpClient).send(any(HttpRequest.class), any());
        when(storageService.store(any(InputStream.class), anyString())).thenReturn(sampleZipFile.toString());

        java.util.List<String> recordedShas = new java.util.ArrayList<>();
        when(sourceSnapshotRepository.save(any(SourceSnapshot.class))).thenAnswer(inv -> {
            SourceSnapshot snap = inv.getArgument(0);
            snap.setId(UUID.randomUUID());
            recordedShas.add(snap.getCommitSha());
            return snap;
        });

        IngestionResponseDTO first = sourceIngestionService.ingestFromGitHub(GitHubImportRequest.builder()
                .projectId(sampleProject.getId())
                .repositoryUrl("https://github.com/example/curated")
                .commitSha("1111111111111111111111111111111111111111")
                .build());
        IngestionResponseDTO second = sourceIngestionService.ingestFromGitHub(GitHubImportRequest.builder()
                .projectId(sampleProject.getId())
                .repositoryUrl("https://github.com/example/curated")
                .commitSha("2222222222222222222222222222222222222222")
                .build());

        assertThat(first.getSnapshotId()).isNotEqualTo(second.getSnapshotId());
        assertThat(recordedShas).containsExactly(
                "1111111111111111111111111111111111111111",
                "2222222222222222222222222222222222222222");
    }
}
