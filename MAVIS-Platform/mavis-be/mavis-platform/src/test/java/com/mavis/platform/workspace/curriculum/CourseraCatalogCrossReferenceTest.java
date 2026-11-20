package com.mavis.platform.workspace.curriculum;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.CourseraModuleSpec;
import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.LessonSpec;
import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.QuizQuestionSpec;
import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.RubricCriterion;
import com.mavis.platform.workspace.service.CourseCurriculum;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

class CourseraCatalogCrossReferenceTest {

    @Test
    void javaAndCsharpCatalogsResolve100PercentAgainstLoadedCurriculumJson() throws Exception {
        CourseCurriculum curriculum = new CourseCurriculum(new ObjectMapper());

        verifyTrackCatalog(
                curriculum,
                JavaCourseraCatalog.COURSE_CODE,
                JavaCourseraCatalog.COURSE_TITLE,
                JavaCourseraCatalog.modules(),
                JavaCourseraCatalog.allLessons(),
                "java-v2-ch",
                "Java"
        );
        verifyTrackCatalog(
                curriculum,
                CsharpCourseraCatalog.COURSE_CODE,
                CsharpCourseraCatalog.COURSE_TITLE,
                CsharpCourseraCatalog.modules(),
                CsharpCourseraCatalog.allLessons(),
                "csharp-v2-ch",
                "C#"
        );

        assertEquals("moc-huong-shop", JavaCourseraCatalog.CURATED_REPO_SLUG);
        assertTrue(JavaCourseraCatalog.CURATED_SERVICES.containsAll(
                List.of("api-gateway", "catalog-service", "order-service", "payment-service")));

        assertEquals("fruit-shop-dotnet-microservices", CsharpCourseraCatalog.CURATED_REPO_SLUG);
        assertTrue(CsharpCourseraCatalog.CURATED_SERVICES.containsAll(
                List.of("ApiGateway", "FruitCatalog.API", "FruitBasket.API", "FruitOrdering.API")));
    }

    private static void verifyTrackCatalog(
            CourseCurriculum curriculum,
            String courseCode,
            String courseTitle,
            List<CourseraModuleSpec> modules,
            List<LessonSpec> allLessons,
            String expectedPrefix,
            String expectedTrack) {
        assertFalse(courseCode.isBlank());
        assertTrue(courseTitle.length() <= 255);
        assertEquals(5, modules.size(), "Expected 5 V2 modules for " + courseCode);
        assertEquals(12, allLessons.size(), "Expected 12 V2 lessons for " + courseCode);

        Set<String> coveredChapters = new HashSet<>();
        Set<String> quizQuestionIdsInCatalog = new HashSet<>();
        int totalQuizQuestions = 0;

        for (int i = 0; i < modules.size(); i++) {
            CourseraModuleSpec module = modules.get(i);
            assertEquals(i + 1, module.position());
            assertTrue(module.title().length() <= 255);
            assertTrue(module.labTitle().length() <= 255);
            assertNotNull(module.primaryCurriculumCode());
            assertNotNull(curriculum.chapter(module.primaryCurriculumCode()));

            Set<String> moduleQuestionIds = new HashSet<>();
            for (LessonSpec lesson : module.lessons()) {
                assertTrue(lesson.curriculumCode().startsWith(expectedPrefix));
                CourseCurriculum.Chapter chapter = curriculum.chapter(lesson.curriculumCode());
                assertEquals(expectedTrack, chapter.track());
                assertTrue(coveredChapters.add(lesson.curriculumCode()),
                        "Duplicate lesson mapping in " + courseCode + ": " + lesson.curriculumCode());
                assertTrue(lesson.bodyMarkdown().contains(chapter.lesson()),
                        "Catalog lesson markdown should derive from JSON chapter " + lesson.curriculumCode());
                chapter.questions().forEach(q -> moduleQuestionIds.add(q.id()));
            }

            assertFalse(module.quizQuestions().isEmpty());
            assertEquals(module.lessons().size() * 4, module.quizQuestions().size());
            for (QuizQuestionSpec q : module.quizQuestions()) {
                assertTrue(moduleQuestionIds.contains(q.id()),
                        "Quiz question " + q.id() + " missing from module " + module.position() + " chapters");
                assertTrue(quizQuestionIdsInCatalog.add(q.id()), "Duplicate catalog question " + q.id());
                totalQuizQuestions++;
            }

            assertNotNull(module.essay());
            assertEquals(100, module.essay().rubric().stream().mapToInt(RubricCriterion::weightPoints).sum());
            assertNotNull(module.visualLab());

            var publishReq = V2CurriculumJsonLoader.toQuizPublishRequest(module);
            assertEquals(70, publishReq.passPercent());
            assertEquals(module.quizQuestions().size(), publishReq.questions().size());
        }

        Set<String> expectedChapters = java.util.stream.IntStream.rangeClosed(1, 12)
                .mapToObj(n -> expectedPrefix + String.format("%02d", n))
                .collect(Collectors.toSet());
        assertEquals(expectedChapters, coveredChapters);
        assertEquals(48, totalQuizQuestions);
    }
}
