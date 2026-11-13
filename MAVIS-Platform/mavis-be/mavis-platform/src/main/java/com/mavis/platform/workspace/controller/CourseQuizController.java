package com.mavis.platform.workspace.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.platform.workspace.service.CourseQuizService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/course-labs/{assignmentId}/quiz")
@RequiredArgsConstructor
public class CourseQuizController {
    private final CourseQuizService quizzes;

    @GetMapping
    public ResponseEntity<ApiResponse<CourseQuizService.Quiz>> get(
            @PathVariable UUID workspaceId, @PathVariable UUID assignmentId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(quizzes.get(workspaceId, assignmentId)));
    }

    @PostMapping
    public ApiResponse<CourseQuizService.Quiz> publish(@PathVariable UUID workspaceId, @PathVariable UUID assignmentId,
                                                       @RequestBody CourseQuizService.Publish request) {
        return ApiResponse.success(quizzes.publish(workspaceId, assignmentId, request));
    }

    @PostMapping("/attempts")
    public ApiResponse<CourseQuizService.Result> submit(@PathVariable UUID workspaceId, @PathVariable UUID assignmentId,
                                                         @RequestBody CourseQuizService.Submit request) {
        return ApiResponse.success(quizzes.submit(workspaceId, assignmentId, request));
    }
}
