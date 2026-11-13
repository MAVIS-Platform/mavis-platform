package com.mavis.platform.workspace.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.platform.workspace.service.CourseCurriculum;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/course-curriculum")
@RequiredArgsConstructor
public class CourseCurriculumController {
    private final CourseCurriculum curriculum;
    private final AccessPolicyService access;

    @GetMapping
    public ApiResponse<List<CourseCurriculum.Preview>> list() {
        access.requireCurrentActiveUser();
        return ApiResponse.success(curriculum.previews());
    }
}
