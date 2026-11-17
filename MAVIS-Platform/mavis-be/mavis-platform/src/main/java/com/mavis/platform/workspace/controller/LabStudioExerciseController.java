package com.mavis.platform.workspace.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.platform.workspace.service.LabStudioExerciseService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/course-labs/{assignmentId}/studio-exercise")
@RequiredArgsConstructor
public class LabStudioExerciseController {

    private final LabStudioExerciseService exercises;

    @GetMapping
    public ApiResponse<LabStudioExerciseService.ExerciseView> get(
            @PathVariable UUID workspaceId, @PathVariable UUID assignmentId) {
        return ApiResponse.success(exercises.get(workspaceId, assignmentId));
    }

    @PutMapping
    public ApiResponse<LabStudioExerciseService.ExerciseView> save(
            @PathVariable UUID workspaceId, @PathVariable UUID assignmentId,
            @RequestBody LabStudioExerciseService.ExerciseRequest request) {
        return ApiResponse.success(exercises.save(workspaceId, assignmentId, request));
    }
}
