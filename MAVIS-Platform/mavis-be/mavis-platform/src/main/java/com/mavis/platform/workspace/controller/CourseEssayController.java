package com.mavis.platform.workspace.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.platform.workspace.dto.CourseEssayDtos.EssaySubmissionView;
import com.mavis.platform.workspace.dto.CourseEssayDtos.GradeEssayRequest;
import com.mavis.platform.workspace.dto.CourseEssayDtos.SubmitEssayRequest;
import com.mavis.platform.workspace.service.CourseEssayService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class CourseEssayController {
    private final CourseEssayService essayService;

    @GetMapping("/workspaces/{workspaceId}/course-essays")
    public ApiResponse<List<EssaySubmissionView>> list(@PathVariable UUID workspaceId) {
        return ApiResponse.success(essayService.listForWorkspace(workspaceId));
    }

    @PostMapping("/workspaces/{workspaceId}/course-items/{itemId}/essay-submissions")
    public ApiResponse<EssaySubmissionView> submit(
            @PathVariable UUID workspaceId,
            @PathVariable UUID itemId,
            @Valid @RequestBody SubmitEssayRequest request) {
        return ApiResponse.success(essayService.submitEssay(workspaceId, itemId, request));
    }

    @PutMapping("/workspaces/{workspaceId}/essay-submissions/{submissionId}/grade")
    public ApiResponse<EssaySubmissionView> grade(
            @PathVariable UUID workspaceId,
            @PathVariable UUID submissionId,
            @Valid @RequestBody GradeEssayRequest request) {
        return ApiResponse.success(essayService.gradeEssay(workspaceId, submissionId, request));
    }
}
