package com.mavis.analyzer.orchestrator.controller;
import com.mavis.analyzer.orchestrator.service.impl.JobControlService;
import com.mavis.common.dto.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
@RestController @RequiredArgsConstructor @RequestMapping("/api/v1/analyzer/jobs")
public class JobControlController {
    private final JobControlService controls;
    @PostMapping("/{job}/cancel") public ApiResponse<?> cancel(@PathVariable UUID job){return ApiResponse.success(controls.cancel(job));}
    @GetMapping("/{job}/attempts") public ApiResponse<?> history(@PathVariable UUID job){return ApiResponse.success(controls.history(job));}
}
