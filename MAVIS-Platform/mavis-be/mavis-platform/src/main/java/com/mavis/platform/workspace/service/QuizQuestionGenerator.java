package com.mavis.platform.workspace.service;

import java.util.List;

/**
 * Generates Quiz draft questions from a Lab's theory content.
 *
 * <p>Implementations must ground every question in the supplied theory text. There is no
 * deterministic fallback: if the provider is not configured, generation fails closed instead of
 * inventing questions.</p>
 */
public interface QuizQuestionGenerator {

    List<CourseQuizService.Question> generate(String theory, int count, boolean vietnamese);

    String providerMode();
}
