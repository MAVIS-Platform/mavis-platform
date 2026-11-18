package com.mavis.platform.workspace.curriculum;

import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.CourseraModuleSpec;
import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.RubricCriterion;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class JavaCourseraCatalogTest {

    @Test
    void providesSixModulesWith18Lessons60QuizQuestionsAnd6EssayRubrics() {
        var modules = JavaCourseraCatalog.modules();
        assertEquals(6, modules.size());

        int totalLessons = 0;
        int totalQuizQuestions = 0;
        int totalEssays = 0;

        for (int i = 0; i < modules.size(); i++) {
            CourseraModuleSpec module = modules.get(i);
            assertEquals(i + 1, module.position());
            assertNotNull(module.title());
            assertFalse(module.title().isBlank());
            assertEquals(3, module.lessons().size());
            assertEquals(10, module.quizQuestions().size());
            assertNotNull(module.essay());

            for (var lesson : module.lessons()) {
                assertFalse(lesson.title().isBlank());
                assertFalse(lesson.bodyMarkdown().isBlank());
                totalLessons++;
            }

            for (var q : module.quizQuestions()) {
                assertFalse(q.prompt().isBlank());
                assertEquals(4, q.options().size());
                assertTrue(q.correctOption() >= 0 && q.correctOption() < q.options().size());
                assertNotNull(q.explanation());
                assertFalse(q.explanation().isBlank());
                totalQuizQuestions++;
            }

            int rubricSum = module.essay().rubric().stream()
                    .mapToInt(RubricCriterion::weightPoints)
                    .sum();
            assertEquals(100, rubricSum, "Module " + module.position() + " essay rubric must total 100 points");
            totalEssays++;

            var publishReq = JavaCourseraCatalog.toQuizPublishRequest(module);
            assertEquals(70, publishReq.passPercent());
            assertEquals(10, publishReq.questions().size());
        }

        assertEquals(18, totalLessons);
        assertEquals(60, totalQuizQuestions);
        assertEquals(6, totalEssays);
    }
}
