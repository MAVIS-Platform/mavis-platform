package com.mavis.platform.project.controller;
import com.mavis.platform.project.service.ProjectResourceDeletionService;
import com.mavis.common.dto.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
@RestController @RequiredArgsConstructor
public class SnapshotDeletionController {
 private final ProjectResourceDeletionService deletion;
 @DeleteMapping("/api/v1/projects/{projectId}/snapshots/{snapshotId}")
 public ApiResponse<Void> delete(@PathVariable UUID projectId,@PathVariable UUID snapshotId){deletion.deleteSnapshot(projectId,snapshotId);return ApiResponse.success("Snapshot deleted",null);}
}
