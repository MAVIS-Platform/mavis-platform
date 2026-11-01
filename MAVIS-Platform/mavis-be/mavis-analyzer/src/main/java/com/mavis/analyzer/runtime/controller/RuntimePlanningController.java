package com.mavis.analyzer.runtime.controller;
import com.mavis.analyzer.runtime.service.RuntimePlanningService;
import com.mavis.analyzer.runtime.service.RuntimePlanningService.*;
import com.mavis.common.dto.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
@RestController @RequestMapping("/api/v1/analyzer/projects/{projectId}/runtime-plan") @RequiredArgsConstructor
public class RuntimePlanningController {
 private final RuntimePlanningService planning;
 @GetMapping public ApiResponse<?> configuration(@PathVariable UUID projectId){return ApiResponse.success(planning.configuration(projectId));}
 @PutMapping public ApiResponse<?> save(@PathVariable UUID projectId,@Valid @RequestBody ConfigurationRequest r){return ApiResponse.success(planning.saveConfiguration(projectId,r));}
 @PostMapping("/build-images") public ApiResponse<?> buildImages(@PathVariable UUID projectId,@RequestBody(required=false) BuildImagesRequest r){return ApiResponse.success(planning.buildSandboxImages(projectId,r));}
 @GetMapping("/scenarios") public ApiResponse<?> scenarios(@PathVariable UUID projectId){return ApiResponse.success(planning.scenarios(projectId));}
 @PostMapping("/scenarios") public ApiResponse<?> create(@PathVariable UUID projectId,@Valid @RequestBody ScenarioRequest r){return ApiResponse.success(planning.saveScenario(projectId,null,r));}
 @PutMapping("/scenarios/{scenarioId}") public ApiResponse<?> update(@PathVariable UUID projectId,@PathVariable UUID scenarioId,@Valid @RequestBody ScenarioRequest r){return ApiResponse.success(planning.saveScenario(projectId,scenarioId,r));}
 @PostMapping("/scenarios/generate") public ApiResponse<?> generate(@PathVariable UUID projectId,@RequestBody(required=false) GenerateScenarioRequest r){return ApiResponse.success(planning.generateScenario(projectId,r));}
 @PostMapping("/start") public ApiResponse<?> start(@PathVariable UUID projectId,@Valid @RequestBody StartRequest r){return ApiResponse.success(planning.start(projectId,r));}
}
