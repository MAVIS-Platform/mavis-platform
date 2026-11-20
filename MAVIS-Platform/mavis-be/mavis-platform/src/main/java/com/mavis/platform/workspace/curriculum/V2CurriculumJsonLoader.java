package com.mavis.platform.workspace.curriculum;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.CourseraModuleSpec;
import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.LessonSpec;
import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.QuizQuestionSpec;
import com.mavis.platform.workspace.service.CourseCurriculum;
import com.mavis.platform.workspace.service.CourseQuizService;
import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Shared loader mapping V2 chapters from classpath {@code curriculum/java-csharp-v1.json}
 * into Coursera catalog specs for both Java 21 and C# .NET 8 tracks.
 */
final class V2CurriculumJsonLoader {
    private static final Map<String, CourseCurriculum.Chapter> CHAPTERS_BY_ID = loadAll();

    private V2CurriculumJsonLoader() {}

    private static Map<String, CourseCurriculum.Chapter> loadAll() {
        ObjectMapper mapper = new ObjectMapper();
        try (var stream = new ClassPathResource("curriculum/java-csharp-v1.json").getInputStream()) {
            List<CourseCurriculum.Chapter> all = mapper.readValue(stream, new TypeReference<>() {});
            Map<String, CourseCurriculum.Chapter> index = new LinkedHashMap<>(all.size() * 2);
            for (CourseCurriculum.Chapter chapter : all) {
                if (chapter != null && chapter.id() != null) {
                    index.put(chapter.id(), chapter);
                }
            }
            return Map.copyOf(index);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to load curriculum/java-csharp-v1.json", ex);
        }
    }

    static CourseCurriculum.Chapter requireChapter(String chapterId) {
        CourseCurriculum.Chapter chapter = CHAPTERS_BY_ID.get(chapterId);
        if (chapter == null) {
            throw new IllegalStateException("Missing V2 curriculum chapter: " + chapterId);
        }
        return chapter;
    }

    static LessonSpec toLessonSpec(String chapterId, String summary) {
        CourseCurriculum.Chapter ch = requireChapter(chapterId);
        String body = ch.lesson() + "\n\n---\n\n" + ch.exercise();
        String normalizedSummary = (summary != null && !summary.isBlank()) ? summary : ch.objective();
        return new LessonSpec(
                ch.id(),
                truncate255(ch.title()),
                normalizedSummary,
                ch.minutes(),
                body
        );
    }

    static List<QuizQuestionSpec> toQuizQuestions(List<String> chapterIds) {
        return chapterIds.stream()
                .map(V2CurriculumJsonLoader::requireChapter)
                .flatMap(ch -> ch.questions().stream().map(q -> new QuizQuestionSpec(
                        q.id(),
                        q.prompt(),
                        q.type() != null && !q.type().isBlank() ? q.type() : "SINGLE_CHOICE",
                        q.options(),
                        q.correctOption() != null ? q.correctOption() : 0,
                        q.explanation() != null && !q.explanation().isBlank()
                                ? q.explanation()
                                : ch.objective(),
                        q.points() != null && q.points() > 0 ? q.points() : 1
                )))
                .toList();
    }

    static CourseQuizService.Publish toQuizPublishRequest(CourseraModuleSpec module) {
        String lessonMarkdown = module.lessons().isEmpty()
                ? module.description()
                : module.lessons().stream()
                        .map(LessonSpec::bodyMarkdown)
                        .collect(Collectors.joining("\n\n---\n\n"));
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

    private static String truncate255(String value) {
        if (value == null || value.length() <= 255) {
            return value;
        }
        return value.substring(0, 252) + "...";
    }
}
