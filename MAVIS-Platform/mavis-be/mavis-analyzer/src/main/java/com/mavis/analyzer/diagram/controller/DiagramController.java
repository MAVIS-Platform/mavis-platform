package com.mavis.analyzer.diagram.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.mavis.analyzer.diagram.service.DiagramProjectionService;
import com.mavis.common.dto.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController @RequiredArgsConstructor @RequestMapping("/api/v1/analyzer")
public class DiagramController {
    private final DiagramProjectionService service;
    @GetMapping("/models/{model}/diagrams") public ApiResponse<?> list(@PathVariable UUID model){return ApiResponse.success(service.list(model));}
    @GetMapping("/diagrams/{diagram}") public ApiResponse<?> get(@PathVariable UUID diagram){return ApiResponse.success(service.get(diagram));}
    @PutMapping("/diagrams/{diagram}/layout") public ApiResponse<?> layout(@PathVariable UUID diagram,@RequestBody JsonNode positions){return ApiResponse.success(service.updateLayout(diagram,positions));}
    @GetMapping("/evidences/element/{element}") public ApiResponse<?> element(@PathVariable UUID element){return ApiResponse.success(service.elementEvidence(element));}
    @GetMapping("/evidences/relationship/{relationship}") public ApiResponse<?> relationship(@PathVariable UUID relationship){return ApiResponse.success(service.relationshipEvidence(relationship));}
}
