package com.mavis.platform.workspace.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.platform.workspace.service.QuizBankService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/quiz-bank/questions")
@RequiredArgsConstructor
public class QuizBankController {
    private final QuizBankService bank;

    @GetMapping
    public ApiResponse<List<QuizBankService.View>> list(@PathVariable UUID workspaceId) {
        return ApiResponse.success(bank.list(workspaceId));
    }

    @PostMapping
    public ApiResponse<QuizBankService.View> save(@PathVariable UUID workspaceId,
                                                  @Valid @RequestBody QuizBankService.QuestionBody body) {
        return ApiResponse.success(bank.save(workspaceId, body));
    }

    @PutMapping("/{questionId}")
    public ApiResponse<QuizBankService.View> update(@PathVariable UUID workspaceId,
                                                    @PathVariable UUID questionId,
                                                    @Valid @RequestBody QuizBankService.QuestionBody body) {
        return ApiResponse.success(bank.update(workspaceId, questionId, body));
    }

    @DeleteMapping("/{questionId}")
    public ApiResponse<Void> delete(@PathVariable UUID workspaceId, @PathVariable UUID questionId) {
        bank.delete(workspaceId, questionId);
        return ApiResponse.success(null);
    }
}
