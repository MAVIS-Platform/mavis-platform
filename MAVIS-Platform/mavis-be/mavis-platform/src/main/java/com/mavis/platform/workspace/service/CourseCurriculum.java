package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.List;

@Component
public class CourseCurriculum {
    public record Source(String publisher, String title, String url) {}
    public record Chapter(String id, String track, String phase, String title, int minutes, String objective,
                          String lesson, String exercise, List<Source> sources,
                          List<CourseQuizService.Question> questions) {}
    public record Preview(String id, String track, String phase, String title, int minutes, String objective,
                          String lesson, String exercise, List<Source> sources) {}

    private final List<Chapter> chapters;

    public CourseCurriculum(ObjectMapper json) throws IOException {
        try (var stream = new ClassPathResource("curriculum/java-csharp-v1.json").getInputStream()) {
            chapters = List.copyOf(json.readValue(stream, new TypeReference<List<Chapter>>() {}));
        }
    }

    public List<Preview> previews() {
        return chapters.stream().map(chapter -> new Preview(chapter.id(), chapter.track(), chapter.phase(), chapter.title(),
                chapter.minutes(), chapter.objective(), chapter.lesson(), chapter.exercise(), chapter.sources())).toList();
    }

    public Chapter chapter(String chapterId) {
        return chapters.stream().filter(item -> item.id().equals(chapterId)).findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Curriculum chapter not found"));
    }

    public CourseQuizService.Publish quizFor(String chapterId) {
        var chapter = chapter(chapterId);
        var text = new StringBuilder(chapter.title()).append("\n\nMục tiêu\n")
                .append(chapter.objective()).append("\n\nLý thuyết\n").append(chapter.lesson())
                .append("\n\nThực hành\n").append(chapter.exercise()).append("\n\nTài liệu đọc");
        for (var source : chapter.sources()) {
            text.append("\n").append(source.publisher()).append(" · ").append(source.title())
                    .append("\n").append(source.url());
        }
        Integer passPercent = (chapter.id() != null
                && (chapter.id().startsWith("java-v2-") || chapter.id().startsWith("csharp-v2-")))
                ? com.mavis.platform.workspace.curriculum.V2CurriculumJsonLoader.DEFAULT_V2_PASS_PERCENT
                : null;
        return new CourseQuizService.Publish(text.toString(), passPercent, chapter.questions());
    }
}
