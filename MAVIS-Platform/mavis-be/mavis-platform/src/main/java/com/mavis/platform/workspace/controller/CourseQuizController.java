package com.mavis.platform.workspace.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.platform.workspace.service.CourseCurriculum;
import com.mavis.platform.workspace.service.CourseQuizGenerationService;
import com.mavis.platform.workspace.service.CourseQuizService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
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
    private final CourseCurriculum curriculum;
    private final CourseQuizGenerationService generation;

    public record PublishChapter(@NotBlank String chapterId) {}

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

    @GetMapping("/draft")
    public ApiResponse<CourseQuizService.Draft> draft(@PathVariable UUID workspaceId,
                                                       @PathVariable UUID assignmentId) {
        return ApiResponse.success(quizzes.draft(workspaceId, assignmentId));
    }

    @PutMapping("/draft")
    public ApiResponse<CourseQuizService.Draft> saveDraft(@PathVariable UUID workspaceId,
                                                           @PathVariable UUID assignmentId,
                                                           @RequestBody CourseQuizService.Publish request) {
        return ApiResponse.success(quizzes.saveDraft(workspaceId, assignmentId, request));
    }

    @PostMapping("/generate")
    public ApiResponse<CourseQuizGenerationService.Generated> generate(
            @PathVariable UUID workspaceId, @PathVariable UUID assignmentId,
            @RequestBody(required = false) CourseQuizGenerationService.Request request) {
        return ApiResponse.success(generation.generate(workspaceId, assignmentId, request));
    }

    @PostMapping("/draft/curriculum")
    public ApiResponse<CourseQuizService.Draft> importCurriculumDraft(
            @PathVariable UUID workspaceId, @PathVariable UUID assignmentId,
            @Valid @RequestBody PublishChapter request) {
        return ApiResponse.success(quizzes.saveDraft(workspaceId, assignmentId,
                curriculum.quizFor(request.chapterId())));
    }

    @PostMapping("/publish")
    public ApiResponse<CourseQuizService.Quiz> publishDraft(@PathVariable UUID workspaceId,
                                                             @PathVariable UUID assignmentId) {
        return ApiResponse.success(quizzes.publishDraft(workspaceId, assignmentId));
    }

    @GetMapping("/versions")
    public ApiResponse<java.util.List<CourseQuizService.Version>> versions(@PathVariable UUID workspaceId,
                                                                            @PathVariable UUID assignmentId) {
        return ApiResponse.success(quizzes.versions(workspaceId, assignmentId));
    }

    @PostMapping("/curriculum")
    public ApiResponse<CourseQuizService.Quiz> publishChapter(@PathVariable UUID workspaceId,
            @PathVariable UUID assignmentId, @Valid @RequestBody PublishChapter request) {
        return ApiResponse.success(quizzes.publishCurriculum(workspaceId, assignmentId, curriculum.quizFor(request.chapterId())));
    }

    @PostMapping("/attempts")
    public ApiResponse<CourseQuizService.Result> submit(@PathVariable UUID workspaceId, @PathVariable UUID assignmentId,
                                                         @RequestBody CourseQuizService.Submit request) {
        return ApiResponse.success(quizzes.submit(workspaceId, assignmentId, request));
    }
}
