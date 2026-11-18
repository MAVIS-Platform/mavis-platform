package com.mavis.platform.workspace.curriculum;

import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.*;
import com.mavis.platform.workspace.service.CourseQuizService;

import java.util.List;

/**
 * Complete 6-Module Coursera Java Microservices Curriculum Catalog:
 * - 6 Modules
 * - 18 in-depth Theory lessons
 * - 60 multiple-choice Quiz questions with detailed explanations
 * - 6 architectural Essay assignments with 100-point Rubrics
 * - 4 Visual Architecture / Runtime Studio labs
 */
public final class JavaCourseraCatalog {
    public static final String COURSE_CODE = "JAVA-MS-2026";
    public static final String COURSE_TITLE = "Kiến Trúc & Phát Triển Java Microservices Toàn Diện (Chuẩn Coursera)";
    public static final String COURSE_DESCRIPTION =
            "Khóa học toàn diện gồm 6 Chương: Java 21 & Spring Boot 3, C4 Model & DDD Bounded Context, " +
            "OpenFeign & Reverse BFS, Resilience4j & Messaging, Saga & JWT Security, OpenTelemetry & Production-Ready Microservices.";

    private JavaCourseraCatalog() {}

    public static List<CourseraModuleSpec> modules() {
        return List.of(
                Module1JavaFoundationsProvider.module(),
                Module2ArchitectureAndDddProvider.module(),
                Module3CommunicationAndGatewayProvider.module(),
                Module4ResilienceAndMessagingProvider.module(),
                Module5SagaSecurityAndDataProvider.module(),
                Module6ObservabilityAndPrdProvider.module()
        );
    }

    public static CourseQuizService.Publish toQuizPublishRequest(CourseraModuleSpec module) {
        LessonSpec primary = module.lessons().isEmpty() ? null : module.lessons().getFirst();
        String lessonMarkdown = primary != null
                ? primary.bodyMarkdown()
                : module.description();
        List<CourseQuizService.Question> questions = module.quizQuestions().stream()
                .map(q -> new CourseQuizService.Question(
                        q.id(),
                        q.prompt(),
                        q.type(),
                        q.options(),
                        q.correctOption(),
                        null,
                        q.explanation(),
                        q.points()))
                .toList();
        return new CourseQuizService.Publish(lessonMarkdown, 70, questions);
    }
}
