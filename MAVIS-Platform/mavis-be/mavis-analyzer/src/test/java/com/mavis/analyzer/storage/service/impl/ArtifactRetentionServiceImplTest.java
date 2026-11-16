package com.mavis.analyzer.storage.service.impl;

import com.mavis.common.entity.Job;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.repository.JobRepository;
import com.mavis.common.repository.ModelVersionRepository;
import com.mavis.common.repository.SourceSnapshotRepository;
import com.mavis.common.repository.SubmissionSnapshotRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ArtifactRetentionServiceImplTest {

    @Mock
    private ModelVersionRepository modelVersionRepository;

    @Mock
    private SubmissionSnapshotRepository submissionSnapshotRepository;

    @Mock
    private JobRepository jobRepository;

    @Mock
    private SourceSnapshotRepository sourceSnapshotRepository;

    @InjectMocks
    private ArtifactRetentionServiceImpl artifactRetentionService;

    @TempDir
    Path tempStorageDir;

    private UUID snapshotId;

    @BeforeEach
    void setUp() {
        snapshotId = UUID.randomUUID();
        ReflectionTestUtils.setField(artifactRetentionService, "uploadDir", tempStorageDir.toString());
    }

    @Test
    @DisplayName("canDeleteSourceSnapshot trả về false khi snapshotId là null")
    void testCanDeleteSourceSnapshot_NullSnapshot_ReturnsFalse() {
        assertThat(artifactRetentionService.canDeleteSourceSnapshot(null)).isFalse();
    }

    @Test
    @DisplayName("canDeleteSourceSnapshot trả về false khi snapshot bị ModelVersion tham chiếu")
    void testCanDeleteSourceSnapshot_PinnedByModelVersion_ReturnsFalse() {
        when(modelVersionRepository.existsBySourceSnapshotId(snapshotId)).thenReturn(true);

        assertThat(artifactRetentionService.canDeleteSourceSnapshot(snapshotId)).isFalse();
    }

    @Test
    @DisplayName("canDeleteSourceSnapshot trả về false khi snapshot bị SubmissionSnapshot tham chiếu")
    void testCanDeleteSourceSnapshot_PinnedBySubmissionSnapshot_ReturnsFalse() {
        when(modelVersionRepository.existsBySourceSnapshotId(snapshotId)).thenReturn(false);
        when(submissionSnapshotRepository.existsBySourceSnapshotId(snapshotId)).thenReturn(true);

        assertThat(artifactRetentionService.canDeleteSourceSnapshot(snapshotId)).isFalse();
    }

    @Test
    @DisplayName("canDeleteSourceSnapshot trả về false khi snapshot có Job đang PENDING hoặc RUNNING")
    void testCanDeleteSourceSnapshot_HasActiveJob_ReturnsFalse() {
        when(modelVersionRepository.existsBySourceSnapshotId(snapshotId)).thenReturn(false);
        when(submissionSnapshotRepository.existsBySourceSnapshotId(snapshotId)).thenReturn(false);
        Job runningJob = Job.builder().id(UUID.randomUUID()).status("RUNNING").build();
        when(jobRepository.findBySourceSnapshotId(snapshotId)).thenReturn(List.of(runningJob));

        assertThat(artifactRetentionService.canDeleteSourceSnapshot(snapshotId)).isFalse();
    }

    @Test
    @DisplayName("canDeleteSourceSnapshot trả về true khi không còn bất kỳ tham chiếu nào")
    void testCanDeleteSourceSnapshot_NoReferences_ReturnsTrue() {
        when(modelVersionRepository.existsBySourceSnapshotId(snapshotId)).thenReturn(false);
        when(submissionSnapshotRepository.existsBySourceSnapshotId(snapshotId)).thenReturn(false);
        Job completedJob = Job.builder().id(UUID.randomUUID()).status("COMPLETED").build();
        when(jobRepository.findBySourceSnapshotId(snapshotId)).thenReturn(List.of(completedJob));

        assertThat(artifactRetentionService.canDeleteSourceSnapshot(snapshotId)).isTrue();
    }

    @Test
    @DisplayName("cleanupUnreferencedArtifacts dọn dẹp file tạm và file không nằm trong SourceSnapshot nào")
    void testCleanupUnreferencedArtifacts_DeletesTempAndUnreferencedFiles() throws IOException {
        Path referencedFile = Files.createFile(tempStorageDir.resolve("referenced.zip"));
        Path unreferencedFile = Files.createFile(tempStorageDir.resolve("unreferenced.zip"));
        Path tempPartFile = Files.createFile(tempStorageDir.resolve(".mavis-upload-12345.part"));

        SourceSnapshot snapshot = SourceSnapshot.builder()
                .id(UUID.randomUUID())
                .storagePath(referencedFile.toString())
                .build();
        when(sourceSnapshotRepository.findAll()).thenReturn(List.of(snapshot));

        int deletedCount = artifactRetentionService.cleanupUnreferencedArtifacts();

        assertThat(deletedCount).isEqualTo(2);
        assertThat(Files.exists(referencedFile)).isTrue();
        assertThat(Files.exists(unreferencedFile)).isFalse();
        assertThat(Files.exists(tempPartFile)).isFalse();
    }

    @Test
    @DisplayName("cleanupUnreferencedArtifacts trả về 0 nếu thư mục lưu trữ không tồn tại")
    void testCleanupUnreferencedArtifacts_NonExistentDir_ReturnsZero() {
        ReflectionTestUtils.setField(artifactRetentionService, "uploadDir", tempStorageDir.resolve("non_existent").toString());

        int deletedCount = artifactRetentionService.cleanupUnreferencedArtifacts();

        assertThat(deletedCount).isEqualTo(0);
    }
}
