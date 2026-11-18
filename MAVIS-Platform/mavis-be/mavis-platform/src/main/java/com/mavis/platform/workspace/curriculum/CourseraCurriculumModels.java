package com.mavis.platform.workspace.curriculum;

import java.util.List;

/**
 * Strongly typed domain specifications for the 6-module Coursera-style
 * Java Microservices curriculum.
 */
public final class CourseraCurriculumModels {
    private CourseraCurriculumModels() {}

    public record LessonSpec(
            String curriculumCode,
            String title,
            String summary,
            int estimatedMinutes,
            String bodyMarkdown
    ) {}

    public record QuizQuestionSpec(
            String id,
            String prompt,
            String type,
            List<String> options,
            int correctOption,
            String explanation,
            int points
    ) {}

    public record RubricCriterion(
            String criterion,
            int weightPoints,
            String excellentDescription
    ) {}

    public record EssaySpec(
            String title,
            String description,
            String promptMarkdown,
            List<RubricCriterion> rubric
    ) {}

    public record VisualLabSpec(
            String itemType,
            String title,
            String description,
            boolean requireRuntimeTrace,
            List<String> requiredDiagramTypes
    ) {}

    public record CourseraModuleSpec(
            int position,
            String title,
            String description,
            String labTitle,
            String labDescription,
            String primaryCurriculumCode,
            List<LessonSpec> lessons,
            List<QuizQuestionSpec> quizQuestions,
            EssaySpec essay,
            VisualLabSpec visualLab
    ) {}
}
