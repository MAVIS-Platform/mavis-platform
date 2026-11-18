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
        int totalVisualLabs = 0;

        assertTrue(JavaCourseraCatalog.COURSE_TITLE.length() <= 255, "Course title must fit VARCHAR(255)");
        for (int i = 0; i < modules.size(); i++) {
            CourseraModuleSpec module = modules.get(i);
            assertEquals(i + 1, module.position());
            assertNotNull(module.title());
            assertFalse(module.title().isBlank());
            assertTrue(module.title().length() <= 255, "Module title must fit VARCHAR(255)");
            assertTrue(module.labTitle().length() <= 255, "Lab title must fit VARCHAR(255)");
            assertEquals(3, module.lessons().size());
            assertEquals(10, module.quizQuestions().size());
            assertNotNull(module.essay());
            assertTrue(module.essay().title().length() <= 255, "Essay title must fit VARCHAR(255)");
            assertNotNull(module.visualLab(), "Module " + module.position() + " must define a visualLab");
            assertTrue(module.visualLab().title().length() <= 255, "Visual lab title must fit VARCHAR(255)");
            totalVisualLabs++;

            for (var lesson : module.lessons()) {
                assertFalse(lesson.title().isBlank());
                assertTrue(lesson.title().length() <= 255, "Lesson title must fit VARCHAR(255)");
                assertFalse(lesson.bodyMarkdown().isBlank());
                assertTrue(lesson.bodyMarkdown().length() >= 1500,
                        "Lesson " + lesson.curriculumCode() + " must carry full verbatim textbook markdown");
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
        assertEquals(6, totalVisualLabs);
        assertEquals(36, totalLessons + totalQuizQuestions / 10 + totalEssays + totalVisualLabs);
    }
}
