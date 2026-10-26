package com.mavis.platform.submission.controller;
import com.mavis.common.dto.ApiResponse;
import com.mavis.platform.submission.service.impl.SubmissionReviewService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
@RestController @RequiredArgsConstructor @RequestMapping("/api/v1/submissions/{submissionId}/review")
public class SubmissionReviewController {
    private final SubmissionReviewService service;
    @GetMapping public ApiResponse<SubmissionReviewService.View> get(@PathVariable UUID submissionId){return ApiResponse.success(service.get(submissionId));}
    @PutMapping public ApiResponse<SubmissionReviewService.View> save(@PathVariable UUID submissionId,@Valid @RequestBody SubmissionReviewService.Save request){return ApiResponse.success(service.save(submissionId,request));}
}
