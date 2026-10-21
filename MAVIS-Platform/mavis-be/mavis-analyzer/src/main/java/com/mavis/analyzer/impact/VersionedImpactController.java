package com.mavis.analyzer.impact;

import com.mavis.common.dto.ApiResponse;
import com.mavis.common.exception.ErrorCode;
import com.mavis.workerclient.ImpactWorkerClient;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController @RequiredArgsConstructor @RequestMapping("/api/v1/analyzer/models/{model}/impact")
public class VersionedImpactController {
    private final WorkerImpactService service;
    @GetMapping public ResponseEntity<?> analyze(@PathVariable UUID model,@RequestParam UUID targetServiceId,@RequestParam(required=false)String graphRevisionId,@RequestParam(defaultValue="10")int maxDepth,@RequestParam(defaultValue="1000")int maxPaths){
        try{return ResponseEntity.ok(ApiResponse.success(service.analyze(model,targetServiceId,graphRevisionId,maxDepth,maxPaths)));}
        catch(ImpactWorkerClient.Unavailable|IllegalArgumentException e){return ResponseEntity.status(503).body(ApiResponse.error(ErrorCode.ANALYSIS_FAILED,"Impact Worker unavailable or returned an invalid response"));}
    }
}
