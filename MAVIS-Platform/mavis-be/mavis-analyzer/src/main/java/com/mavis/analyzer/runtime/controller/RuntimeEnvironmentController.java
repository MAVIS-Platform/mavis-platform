package com.mavis.analyzer.runtime.controller;
import com.mavis.analyzer.runtime.service.RuntimeSessionEnvironmentService;
import com.mavis.common.dto.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
@RestController @RequiredArgsConstructor
@RequestMapping("/api/v1/analyzer/runtime/sessions")
public class RuntimeEnvironmentController {
 private final RuntimeSessionEnvironmentService environments;
 @GetMapping("/{id}/protected-environment")
 public ResponseEntity<?> read(@PathVariable UUID id){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(environments.readForRunner(id)));}
}
