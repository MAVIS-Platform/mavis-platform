package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;

class CurriculumV2IntegrityTest {
    private static final Pattern CODE_FENCE_OR_INLINE = Pattern.compile("```[\\s\\S]*?```|`[^`\\n]+`");
    private static final Pattern RAW_LATEX = Pattern.compile("\\$\\$|\\$(?!\\{)(?!\\s)[^$\\n]+?(?<!\\s)\\$|\\\\(?:rightarrow|leftarrow|to|ge|le|times|approx|text|prod|dots)\\b");
    private static final Pattern RAW_QUIZ_MARKDOWN = Pattern.compile("\\*\\*|`|\\\\[\\[\\]]|(?:^|[\\s(])\\*[^*\\n]+?\\*(?=[\\s).,;:?!]|$)");
    private static final Pattern LEADING_NUMBERING = Pattern.compile("^\\s*(?:Câu\\s*\\d+(?:\\.\\d+)?[:.\\s-]*|\\d+[.)]\\s+)", Pattern.CASE_INSENSITIVE);

    @Test
    void loadsAll24V2ChaptersWith96ValidatedQuestionsAndZeroDuplicates() throws Exception {
        CourseCurriculum curriculum = new CourseCurriculum(new ObjectMapper());
        var previews = curriculum.previews();

        Set<String> seenChapterIds = new HashSet<>();
        for (var p : previews) {
            assertTrue(seenChapterIds.add(p.id()), "Duplicate chapter ID in curriculum JSON: " + p.id());
        }

        int javaV2Count = 0;
        int csharpV2Count = 0;
        int v2QuestionsCount = 0;
        Set<String> seenQuestionIds = new HashSet<>();

        for (int i = 1; i <= 12; i++) {
            String pad = String.format("%02d", i);
            javaV2Count += validateV2Chapter(curriculum, "java-v2-ch" + pad, "Java", seenQuestionIds);
            csharpV2Count += validateV2Chapter(curriculum, "csharp-v2-ch" + pad, "C#", seenQuestionIds);
            v2QuestionsCount += 8;
        }

        assertEquals(12, javaV2Count);
        assertEquals(12, csharpV2Count);
        assertEquals(96, v2QuestionsCount);
        assertEquals(96, seenQuestionIds.size());
    }

    @Test
    void preservesLegacyChapterIdsReferencedByExistingAcceptanceTestsAndSeeders() throws Exception {
        CourseCurriculum curriculum = new CourseCurriculum(new ObjectMapper());
        for (String legacyId : Set.of("java-f01", "java-01", "java-04", "java-07", "java-12", "csharp-13")) {
            assertNotNull(curriculum.chapter(legacyId), "Legacy chapter ID missing: " + legacyId);
        }
    }

    private static int validateV2Chapter(
            CourseCurriculum curriculum,
            String id,
            String expectedTrack,
            Set<String> seenQuestionIds) {
        CourseCurriculum.Chapter ch = curriculum.chapter(id);
        assertEquals(expectedTrack, ch.track(), "Unexpected track for " + id);
        assertNotNull(ch.phase());
        assertTrue(ch.phase().startsWith("V2"), "Expected V2 phase for " + id);
        assertFalse(ch.title().isBlank(), "Blank title for " + id);
        assertFalse(ch.objective().isBlank(), "Blank objective for " + id);
        assertTrue(ch.lesson().length() >= 1500, "Lesson markdown too short for " + id);
        assertTrue(ch.exercise().length() >= 60, "Exercise markdown too short for " + id);
        assertFalse(RAW_LATEX.matcher(stripCodeSegments(ch.lesson())).find(), "Raw LaTeX leak in lesson for " + id);
        assertFalse(RAW_LATEX.matcher(stripCodeSegments(ch.exercise())).find(), "Raw LaTeX leak in exercise for " + id);
        assertNotNull(ch.sources());
        assertFalse(ch.sources().isEmpty(), "Missing sources for " + id);
        assertTrue(ch.sources().stream().allMatch(s -> s.url() != null && s.url().startsWith("https://")),
                "All sources must have https:// URLs for " + id);

        assertNotNull(ch.questions());
        assertEquals(4, ch.questions().size(), "Expected exactly 4 questions for " + id);
        for (CourseQuizService.Question q : ch.questions()) {
            assertNotNull(q.id(), "Question ID must be populated for " + id);
            assertTrue(seenQuestionIds.add(q.id()), "Duplicate question ID: " + q.id());
            assertFalse(q.prompt().isBlank(), "Blank question prompt: " + q.id());
            assertFalse(LEADING_NUMBERING.matcher(q.prompt()).find(), "Duplicated leading number in prompt: " + q.id());
            assertFalse(RAW_QUIZ_MARKDOWN.matcher(q.prompt()).find(), "Raw Markdown in prompt: " + q.id());
            assertFalse(RAW_LATEX.matcher(q.prompt()).find(), "Raw LaTeX in prompt: " + q.id());
            assertNotNull(q.options());
            assertEquals(4, q.options().size(), "Expected 4 options for " + q.id());
            for (String option : q.options()) {
                assertFalse(option == null || option.isBlank(), "Blank option in " + q.id());
                assertFalse(RAW_QUIZ_MARKDOWN.matcher(option).find(), "Raw Markdown in option: " + q.id());
                assertFalse(RAW_LATEX.matcher(option).find(), "Raw LaTeX in option: " + q.id());
            }
            assertNotNull(q.correctOption(), "Missing correctOption for " + q.id());
            assertTrue(q.correctOption() >= 0 && q.correctOption() < q.options().size(),
                    "Out-of-bounds correctOption for " + q.id());
            assertNotNull(q.explanation(), "Missing explanation for " + q.id());
            assertFalse(q.explanation().isBlank(), "Blank explanation for " + q.id());
            assertFalse(RAW_QUIZ_MARKDOWN.matcher(q.explanation()).find(), "Raw Markdown in explanation: " + q.id());
            assertFalse(RAW_LATEX.matcher(q.explanation()).find(), "Raw LaTeX in explanation: " + q.id());
        }
        return 1;
    }

    private static String stripCodeSegments(String markdown) {
        return CODE_FENCE_OR_INLINE.matcher(markdown == null ? "" : markdown).replaceAll(" ");
    }
}
