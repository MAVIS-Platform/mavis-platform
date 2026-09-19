package com.mavis.analyzer.ai.controller;

import com.mavis.analyzer.ai.service.AiExplanationService;
import com.mavis.common.entity.AiExplanation;
import com.mavis.common.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/analyzer/ai")
@RequiredArgsConstructor
@Tag(name = "AI Explanation", description = "APIs for AI-powered architectural explanations")
public class AiExplanationController {

    private final AiExplanationService aiExplanationService;

    @PostMapping("/explain-node")
    @Operation(summary = "Generate AI explanation for a Service Node", description = "Generates an explanation using AI and deducts 1 AI credit from the user's subscription.")
    public ApiResponse<AiExplanation> explainNode(
            @RequestParam UUID sessionId,
            @RequestParam UUID nodeId,
            @RequestParam UUID userId) {
        
        AiExplanation explanation = aiExplanationService.explainNode(sessionId, nodeId, userId);
        
        return ApiResponse.<AiExplanation>builder()
                .code(200)
                .message("Successfully generated AI explanation")
                .data(explanation)
                .build();
    }
}
