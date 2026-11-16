package com.mavis.analyzer.orchestrator.controller;

import com.mavis.analyzer.orchestrator.service.impl.AnalysisRequestService;
import com.mavis.common.dto.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController @RequiredArgsConstructor @RequestMapping("/api/v1/analyzer/snapshots")
public class AnalysisRequestController {
    private final AnalysisRequestService requests;
    @PostMapping("/{snapshot}/analyze")
    public ResponseEntity<?> start(@PathVariable UUID snapshot,@RequestHeader(value="Idempotency-Key",required=false)String key){return ResponseEntity.accepted().body(ApiResponse.success(requests.start(snapshot,key)));}
}
