package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class LlmQuizQuestionGeneratorTest {

    private final LlmQuizQuestionGenerator generator =
            new LlmQuizQuestionGenerator(new ObjectMapper());

    @Test
    void parsesSingleAndMultipleChoiceQuestionsAndSkipsInvalidOnes() {
        String raw = """
                {"questions":[
                  {"prompt":"Which service owns payment state?","type":"SINGLE_CHOICE",
                   "options":["orders","payment"],"correctOption":1,
                   "explanation":"The theory assigns payment state to the payment service.","points":2},
                  {"prompt":"Select the boundaries","type":"MULTI_CHOICE",
                   "options":["orders","payment","gateway"],"correctOptions":[0,1],
                   "explanation":"Orders and payment are boundaries; gateway is external."},
                  {"prompt":"Broken","type":"SINGLE_CHOICE","options":["one"],"correctOption":0},
                  {"prompt":"","type":"SINGLE_CHOICE","options":["a","b"],"correctOption":0}
                ]}
                """;

        List<CourseQuizService.Question> questions = generator.parseQuestions(raw, 10);

        assertEquals(2, questions.size());
        assertEquals("SINGLE_CHOICE", questions.get(0).type());
        assertEquals(1, questions.get(0).correctOption());
        assertEquals(2, questions.get(0).points());
        assertEquals("MULTI_CHOICE", questions.get(1).type());
        assertEquals(List.of(0, 1), questions.get(1).correctOptions());
        assertNull(questions.get(1).correctOption());
    }

    @Test
    void acceptsJsonWrappedInCodeFence() {
        String raw = """
                ```json
                {"questions":[{"prompt":"What is C1?","type":"TRUE_FALSE",
                "options":["True","False"],"correctOption":0,"explanation":"System context."}]}
                ```
                """;

        List<CourseQuizService.Question> questions = generator.parseQuestions(raw, 5);

        assertEquals(1, questions.size());
        assertEquals("TRUE_FALSE", questions.get(0).type());
        assertEquals("What is C1?", questions.get(0).prompt());
    }

    @Test
    void stopsAtRequestedCount() {
        String raw = """
                {"questions":[
                  {"prompt":"A","type":"SINGLE_CHOICE","options":["x","y"],"correctOption":0},
                  {"prompt":"B","type":"SINGLE_CHOICE","options":["x","y"],"correctOption":1},
                  {"prompt":"C","type":"SINGLE_CHOICE","options":["x","y"],"correctOption":0}
                ]}
                """;

        assertEquals(2, generator.parseQuestions(raw, 2).size());
    }

    @Test
    void returnsEmptyForBlankOrNonJsonPayloads() {
        assertTrue(generator.parseQuestions("", 5).isEmpty());
        assertTrue(generator.parseQuestions("not json", 5).isEmpty());
        assertTrue(generator.parseQuestions("{\"unexpected\":true}", 5).isEmpty());
    }

    @Test
    void buildPromptEnforcesSourceGroundedTagsForTheoryAndDiagrams() {
        String promptVi = generator.buildPrompt("[SOURCE: THEORY]\nDDD\n[SOURCE: STATIC_DIAGRAMS]\norder-service -> order-db", 5, true);
        assertTrue(promptVi.contains("source-grounded"));
        assertTrue(promptVi.contains("[Lý thuyết]"));
        assertTrue(promptVi.contains("[Sơ đồ tĩnh]"));
        assertTrue(promptVi.contains("order-service -> order-db"));
    }
}
