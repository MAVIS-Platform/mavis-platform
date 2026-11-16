package com.mavis.platform.workspace.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.platform.workspace.service.CourseAccessService;
import com.mavis.platform.workspace.service.CourseLabSeederService;
import com.mavis.platform.workspace.service.CourseSetupService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class CourseAccessController {
    private final CourseAccessService courses;
    private final CourseLabSeederService seeder;
    private final CourseSetupService setup;

    public record IssueKey(@Min(1) @Max(168) int validHours, @Min(1) @Max(10000) Integer maxStudents) {}
    public record RedeemKey(@NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{22}") String code) {}
    public record SeedCuratedRequest(String preset) {}

    @GetMapping("/workspaces/{workspaceId}/course-roadmap")
    public ApiResponse<CourseAccessService.Roadmap> roadmap(@PathVariable UUID workspaceId) {
        return ApiResponse.success(courses.roadmap(workspaceId));
    }

    @GetMapping("/workspaces/{workspaceId}/course-setup")
    public ApiResponse<CourseSetupService.Setup> courseSetup(@PathVariable UUID workspaceId) {
        return ApiResponse.success(setup.setup(workspaceId));
    }

    @PostMapping("/workspaces/{workspaceId}/course-labs/{assignmentId}/publish")
    public ApiResponse<CourseAccessService.Lab> publish(@PathVariable UUID workspaceId, @PathVariable UUID assignmentId) {
        return ApiResponse.success(courses.publish(workspaceId, assignmentId));
    }

    @PostMapping("/workspaces/{workspaceId}/course-labs/{assignmentId}/freeze-topology")
    public ApiResponse<CourseAccessService.Lab> freezeTopology(
            @PathVariable UUID workspaceId, @PathVariable UUID assignmentId,
            @RequestParam(required = false) UUID sessionId) {
        return ApiResponse.success(courses.freezeTopology(workspaceId, assignmentId, sessionId));
    }

    @PostMapping("/workspaces/{workspaceId}/course-labs/seed-curated")
    public ApiResponse<CourseAccessService.Roadmap> seedCurated(
            @PathVariable UUID workspaceId,
            @RequestBody(required = false) SeedCuratedRequest request) {
        return ApiResponse.success(seeder.seedCurated(workspaceId, request != null ? request.preset() : null));
    }

    @GetMapping("/workspaces/{workspaceId}/course-passkey")
    public ApiResponse<CourseAccessService.KeyStatus> keyStatus(@PathVariable UUID workspaceId) {
        return ApiResponse.success(courses.keyStatus(workspaceId));
    }

    @PostMapping("/workspaces/{workspaceId}/course-passkey")
    public ResponseEntity<ApiResponse<CourseAccessService.Passkey>> issue(
            @PathVariable UUID workspaceId, @Valid @RequestBody IssueKey request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(courses.issue(workspaceId, request.validHours(), request.maxStudents())));
    }

    @PostMapping("/workspaces/{workspaceId}/course-passkey/revoke")
    public ApiResponse<Void> revoke(@PathVariable UUID workspaceId) {
        courses.revoke(workspaceId);
        return ApiResponse.success(null);
    }

    @PostMapping("/course-enrollments/redeem")
    public ApiResponse<CourseAccessService.Enrollment> redeem(
            @Valid @RequestBody RedeemKey request,
            @RequestHeader(value = "Idempotency-Key", required = false) UUID requestId) {
        return ApiResponse.success(courses.redeem(request.code(), requestId));
    }
}
