package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.security.AccessPolicyService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class QuizBankServiceTest {
    private final AccessPolicyService access = mock(AccessPolicyService.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final QuizBankService service = new QuizBankService(access, jdbc, new ObjectMapper());
    private final UUID workspaceId = UUID.randomUUID();

    @Test
    void rejectsInvalidBankQuestionBeforeItReachesTheDatabase() {
        var body = new QuizBankService.QuestionBody(null, null, "", "INVALID", List.of("Only one"),
                0, null, "", 1);
        assertThrows(BusinessException.class, () -> service.save(workspaceId, body));
        verifyNoInteractions(jdbc);
    }

    @Test
    void rejectsModuleFromAnotherWorkspace() {
        UUID moduleId = UUID.randomUUID();
        when(jdbc.queryForObject(contains("JOIN course_definitions"), eq(Integer.class),
                eq(moduleId), eq(workspaceId))).thenReturn(0);
        var body = new QuizBankService.QuestionBody(moduleId, null, "What is a boundary?",
                "SINGLE_CHOICE", List.of("API", "Database"), 0, null, "", 1);

        assertThrows(BusinessException.class, () -> service.save(workspaceId, body));
    }
}
