package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class LlmTheoryDraftGeneratorTest {

    private final LlmTheoryDraftGenerator generator = new LlmTheoryDraftGenerator(new ObjectMapper());

    @Test
    void parsesLessonJsonWrappedInCodeFence() {
        var draft = generator.parse("""
                ```json
                {"title":"Payment boundaries","body":"# Payment\\n\\nOwns its state."}
                ```
                """, "Fallback topic");

        assertEquals("Payment boundaries", draft.title());
        assertEquals("# Payment\n\nOwns its state.", draft.body());
    }

    @Test
    void fallsBackToTheTopicWhenTheProviderOmitsATitle() {
        var draft = generator.parse("{\"body\":\"# Lesson\"}", "Payment topic");

        assertEquals("Payment topic", draft.title());
        assertEquals("# Lesson", draft.body());
    }

    @Test
    void rejectsResponsesWithoutALessonBody() {
        BusinessException error = assertThrows(BusinessException.class,
                () -> generator.parse("{\"title\":\"Only a title\"}", "Topic"));

        assertEquals("AI_INVALID_RESPONSE", error.getStableCode());
    }
}
