package com.mavis.analyzer.model.controller;
import com.mavis.analyzer.model.service.*;
import com.mavis.common.dto.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
@RestController @RequiredArgsConstructor
@RequestMapping("/api/v1/analyzer/models/{modelId}/context-review")
public class ContextReviewController {
 private final ContextReviewService service;
 @PostMapping public ApiResponse<?> review(@PathVariable UUID modelId,@RequestBody ContextReviewService.Request request){return ApiResponse.success(service.review(modelId,request));}
}
