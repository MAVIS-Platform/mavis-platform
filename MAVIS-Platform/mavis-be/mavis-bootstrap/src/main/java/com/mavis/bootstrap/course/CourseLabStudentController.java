package com.mavis.bootstrap.course;

import com.mavis.analyzer.runtime.dto.RuntimeSessionResponseDTO;
import com.mavis.common.dto.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class CourseLabStudentController {
    private final CourseLabStudentService studentLabs;

    public CourseLabStudentController(CourseLabStudentService studentLabs) {
        this.studentLabs = studentLabs;
    }

    @GetMapping("/workspaces/{workspaceId}/course-labs/{assignmentId}/student-context")
    public ApiResponse<CourseLabStudentService.StudentLabContextView> studentContext(
            @PathVariable UUID workspaceId,
            @PathVariable UUID assignmentId) {
        return ApiResponse.success(studentLabs.studentContext(workspaceId, assignmentId));
    }

    @GetMapping("/workspaces/{workspaceId}/course-labs/{assignmentId}/studio-sessions")
    public ApiResponse<List<RuntimeSessionResponseDTO>> listStudioSessions(
            @PathVariable UUID workspaceId,
            @PathVariable UUID assignmentId) {
        return ApiResponse.success(studentLabs.listStudioSessions(workspaceId, assignmentId));
    }

    @PostMapping("/workspaces/{workspaceId}/course-labs/{assignmentId}/studio-sessions")
    public ApiResponse<RuntimeSessionResponseDTO> startLabStudioSession(
            @PathVariable UUID workspaceId,
            @PathVariable UUID assignmentId) {
        return ApiResponse.success("MAVIS Studio Live session is ready",
                studentLabs.startLabStudioSession(workspaceId, assignmentId));
    }

    @PostMapping("/workspaces/{workspaceId}/course-labs/{assignmentId}/studio-sessions/{sessionId}/bootstrap-studio")
    public ApiResponse<CourseLabStudentService.BootstrapStudioView> bootstrapSimulatedStudio(
            @PathVariable UUID workspaceId,
            @PathVariable UUID assignmentId,
            @PathVariable UUID sessionId) {
        return ApiResponse.success("Sandbox telemetry activated",
                studentLabs.bootstrapSimulatedStudio(workspaceId, assignmentId, sessionId));
    }
}
