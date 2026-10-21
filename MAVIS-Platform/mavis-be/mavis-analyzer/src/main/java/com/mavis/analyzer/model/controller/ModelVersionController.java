package com.mavis.analyzer.model.controller;

import com.mavis.analyzer.model.service.ModelVersionService;
import com.mavis.common.dto.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController @RequiredArgsConstructor @RequestMapping("/api/v1/analyzer")
public class ModelVersionController {
    private final ModelVersionService service;
    @GetMapping("/projects/{project}/models") public ApiResponse<?> list(@PathVariable UUID project){return ApiResponse.success(service.list(project));}
    @PostMapping("/models/{base}/revisions") public ApiResponse<?> revise(@PathVariable UUID base,@RequestBody ModelVersionService.RevisionRequest request){return ApiResponse.success(service.revise(base,request));}
    @GetMapping("/models/compare") public ApiResponse<?> compare(@RequestParam UUID baseVersionId,@RequestParam UUID targetVersionId){return ApiResponse.success(service.compare(baseVersionId,targetVersionId));}
}
