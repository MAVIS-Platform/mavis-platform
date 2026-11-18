package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.common.config.PlatformRuntimeSettings;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Generates Quiz questions from theory through the configured LLM provider.
 *
 * <p>Supports OpenAI keys ({@code sk-...}) and Google Gemini keys. Key resolution mirrors the
 * analyzer AI explanation provider: application property, then {@code MAVIS_AI_API_KEY}, then a
 * local {@code API_KEY} file. Keys are never logged. When no key is available this component throws
 * {@code AI_NOT_CONFIGURED}; it does not fall back to fabricated questions.</p>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class LlmQuizQuestionGenerator implements QuizQuestionGenerator {

    private static final String DEFAULT_GEMINI_URL =
            "https://generativelanguage.googleapis.com/v1beta/models/";
    private static final int MAX_THEORY_CHARS = 24_000;

    private final ObjectMapper json;

    @Autowired(required = false)
    private PlatformRuntimeSettings settings;

    @Value("${mavis.ai.endpoint-url:}")
    private String customEndpointUrl;

    @Value("${mavis.ai.api-key:}")
    private String configuredApiKey;

    @Value("${mavis.ai.key-file-path:API_KEY}")
    private String keyFilePath;

    @Value("${mavis.ai.quiz-model:gemini-2.5-flash}")
    private String model;

    @Value("${mavis.ai.quiz-openai-model:gpt-4o-mini}")
    private String openAiModel;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    @Override
    public String providerMode() {
        return "LIVE_LLM_PROVIDER";
    }

    @Override
    public List<CourseQuizService.Question> generate(String theory, int count, boolean vietnamese) {
        if (settings != null && !settings.enabled("gemini-ai")) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "AI_NOT_CONFIGURED",
                    "The Gemini AI integration is disabled. Enable it before generating questions.");
        }
        String apiKey = resolveApiKey().orElseThrow(() -> new BusinessException(
                ErrorCode.UNPROCESSABLE_ENTITY, "AI_NOT_CONFIGURED",
                "No AI provider key is configured. Set MAVIS_AI_API_KEY or add an API_KEY file to generate questions."));

        String prompt = buildPrompt(theory, count, vietnamese);
        String responseText;
        try {
            responseText = apiKey.startsWith("sk-") ? sendOpenAi(apiKey, prompt) : sendGemini(apiKey, prompt);
        } catch (BusinessException error) {
            throw error;
        } catch (IOException | InterruptedException error) {
            if (error instanceof InterruptedException) Thread.currentThread().interrupt();
            log.warn("Quiz question generation call failed: {}", error.getMessage());
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "AI_GENERATION_FAILED",
                    "The AI provider did not return a usable response. Try again or write the questions manually.");
        }
        List<CourseQuizService.Question> questions = parseQuestions(responseText, count);
        if (questions.isEmpty()) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "AI_INVALID_RESPONSE",
                    "The AI response did not contain valid Quiz questions. Try again or write them manually.");
        }
        return questions;
    }

    private String buildPrompt(String theory, int count, boolean vietnamese) {
        String trimmedTheory = theory.length() > MAX_THEORY_CHARS
                ? theory.substring(0, MAX_THEORY_CHARS)
                : theory;
        StringBuilder prompt = new StringBuilder();
        prompt.append("You author graded quizzes for a software architecture course. ")
                .append("Use ONLY facts stated in the THEORY section. Do not invent services, endpoints, ")
                .append("technologies, numbers, or claims that are not in the theory. ")
                .append("Generate exactly ").append(count).append(" questions mixing SINGLE_CHOICE, ")
                .append("MULTI_CHOICE and TRUE_FALSE. Each question needs 2-4 plausible options, exactly one ")
                .append("correct answer for SINGLE_CHOICE/TRUE_FALSE, at least one for MULTI_CHOICE, ")
                .append("and a short explanation that points back to the theory. ")
                .append("Write prompts and explanations in ")
                .append(vietnamese ? "Vietnamese (keep technical identifiers in English). " : "English. ")
                .append("Return ONLY a JSON object of the form ")
                .append("{\"questions\":[{\"prompt\":\"...\",\"type\":\"SINGLE_CHOICE\",\"options\":[\"...\",\"...\"],")
                .append("\"correctOption\":0,\"correctOptions\":null,\"explanation\":\"...\",\"points\":1}]}. ")
                .append("For MULTI_CHOICE set correctOptions to the zero-based indexes of all correct options ")
                .append("and omit correctOption. For TRUE_FALSE use options [\"True\",\"False\"].\n\n")
                .append("THEORY:\n---\n").append(trimmedTheory).append("\n---\n");
        return prompt.toString();
    }

    private String sendOpenAi(String apiKey, String prompt) throws IOException, InterruptedException {
        boolean deepSeek = isDeepSeekKey(apiKey);
        String targetUrl = (customEndpointUrl != null && !customEndpointUrl.isBlank())
                ? customEndpointUrl
                : (deepSeek ? "https://api.deepseek.com/v1/chat/completions" : "https://api.openai.com/v1/chat/completions");
        String targetModel = (deepSeek && "gpt-4o-mini".equals(openAiModel)) ? "deepseek-flash" : openAiModel;
        ObjectNode request = json.createObjectNode();
        request.put("model", targetModel);
        request.putObject("response_format").put("type", "json_object");
        ArrayNode messages = request.putArray("messages");
        messages.addObject().put("role", "system")
                .put("content", "You author graded software architecture quizzes. Return only the requested JSON object.");
        messages.addObject().put("role", "user").put("content", prompt);

        HttpRequest httpRequest = HttpRequest.newBuilder()
                .uri(URI.create(targetUrl))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .timeout(Duration.ofSeconds(40))
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(request), StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw providerFailure(deepSeek ? "DeepSeek" : "OpenAI", response.statusCode());
        }
        JsonNode content = json.readTree(response.body()).path("choices").path(0).path("message").path("content");
        if (content.isMissingNode() || content.asText().isBlank()) {
            throw new IOException("OpenAI response missing message content");
        }
        return content.asText();
    }

    private static boolean isDeepSeekKey(String apiKey) {
        return apiKey != null && apiKey.matches("^sk-[0-9a-f]{32}$");
    }

    private String sendGemini(String apiKey, String prompt) throws IOException, InterruptedException {
        boolean hasCustomUrl = customEndpointUrl != null && !customEndpointUrl.isBlank();
        String targetUrl = hasCustomUrl
                ? customEndpointUrl
                : DEFAULT_GEMINI_URL + model + ":generateContent?key=" + apiKey;

        ObjectNode request = json.createObjectNode();
        ObjectNode content = request.putArray("contents").addObject();
        ArrayNode parts = content.putArray("parts");
        parts.addObject().put("text", prompt);
        ObjectNode generationConfig = request.putObject("generationConfig");
        generationConfig.put("temperature", 0.3);
        generationConfig.put("responseMimeType", "application/json");

        HttpRequest httpRequest = HttpRequest.newBuilder()
                .uri(URI.create(targetUrl))
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(40))
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(request), StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw providerFailure("AI provider", response.statusCode());
        }
        JsonNode body = json.readTree(response.body());
        JsonNode text = body.path("candidates").path(0).path("content").path("parts").path(0).path("text");
        if (text.isMissingNode() || text.asText().isBlank()) {
            throw new IOException("AI provider response missing text candidate");
        }
        return text.asText();
    }

    private static BusinessException providerFailure(String provider, int status) {
        if (status == 401 || status == 403) {
            return new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "AI_AUTH_FAILED",
                    provider + " rejected the configured API key.");
        }
        if (status == 404) {
            return new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "AI_MODEL_UNAVAILABLE",
                    provider + " does not offer the configured model. Set MAVIS_AI_QUIZ_OPENAI_MODEL to an available model.");
        }
        if (status == 429) {
            return new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "AI_QUOTA_EXHAUSTED",
                    provider + " quota or credits are exhausted. Add credits or write the questions manually.");
        }
        return new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "AI_GENERATION_FAILED",
                provider + " returned HTTP " + status + ". Try again or write the questions manually.");
    }

    List<CourseQuizService.Question> parseQuestions(String raw, int requestedCount) {
        if (raw == null || raw.isBlank()) return List.of();
        String payload = stripCodeFence(raw.trim());
        JsonNode root;
        try {
            root = json.readTree(payload);
        } catch (IOException error) {
            log.warn("AI quiz response was not valid JSON");
            return List.of();
        }
        JsonNode array = root.isArray() ? root : root.path("questions");
        if (!array.isArray()) return List.of();

        List<CourseQuizService.Question> questions = new ArrayList<>();
        for (JsonNode node : array) {
            if (questions.size() >= requestedCount) break;
            CourseQuizService.Question question = toQuestion(node);
            if (question == null) continue;
            try {
                questions.add(CourseQuizService.normalizeQuestion(question, questions.size()));
            } catch (BusinessException ignored) {
                log.debug("Skipping AI question that failed Quiz validation");
            }
        }
        return List.copyOf(questions);
    }

    private CourseQuizService.Question toQuestion(JsonNode node) {
        if (!node.isObject()) return null;
        String prompt = node.path("prompt").asText("").trim();
        if (prompt.isBlank()) return null;
        String type = node.path("type").asText("SINGLE_CHOICE").trim().toUpperCase();
        List<String> options = new ArrayList<>();
        JsonNode optionNodes = node.path("options");
        if (optionNodes.isArray()) {
            for (JsonNode option : optionNodes) options.add(option.asText("").trim());
        }
        Integer correctOption = node.hasNonNull("correctOption") ? node.path("correctOption").asInt() : null;
        List<Integer> correctOptions = new ArrayList<>();
        JsonNode correctNodes = node.path("correctOptions");
        if (correctNodes.isArray()) {
            for (JsonNode correct : correctNodes) correctOptions.add(correct.asInt());
        }
        String explanation = node.path("explanation").asText("").trim();
        int points = node.hasNonNull("points") ? node.path("points").asInt(1) : 1;
        String id = node.path("id").asText("");
        return new CourseQuizService.Question(
                id.isBlank() ? null : id,
                prompt,
                type,
                options,
                "MULTI_CHOICE".equals(type) ? null : correctOption,
                "MULTI_CHOICE".equals(type) ? correctOptions : null,
                explanation,
                points);
    }

    private static String stripCodeFence(String value) {
        String text = value;
        if (text.startsWith("```")) {
            int firstNewline = text.indexOf('\n');
            if (firstNewline >= 0) text = text.substring(firstNewline + 1);
            int closing = text.lastIndexOf("```");
            if (closing >= 0) text = text.substring(0, closing);
        }
        return text.trim();
    }

    private Optional<String> resolveApiKey() {
        if (configuredApiKey != null && !configuredApiKey.isBlank()) {
            return Optional.of(configuredApiKey.trim());
        }
        String envKey = System.getenv("MAVIS_AI_API_KEY");
        if (envKey != null && !envKey.isBlank()) {
            return Optional.of(envKey.trim());
        }
        List<Path> candidates = keyFilePath != null && !keyFilePath.isBlank() && !keyFilePath.equals("API_KEY")
                ? List.of(Path.of(keyFilePath))
                : List.of(Path.of("API_KEY"), Path.of("API_KEY.txt"),
                        Path.of("MAVIS-Platform/mavis-be/API_KEY"), Path.of("MAVIS-Platform/mavis-be/API_KEY.txt"),
                        Path.of("../API_KEY"), Path.of("../API_KEY.txt"),
                        Path.of("../../API_KEY"), Path.of("../../API_KEY.txt"));
        for (Path candidate : candidates) {
            try {
                if (Files.exists(candidate) && Files.isRegularFile(candidate) && Files.isReadable(candidate)) {
                    String content = Files.readString(candidate, StandardCharsets.UTF_8);
                    for (String line : content.split("\\r?\\n")) {
                        String trimmed = line.trim();
                        if (trimmed.isEmpty() || trimmed.startsWith("#") || trimmed.startsWith("//")) continue;
                        if (trimmed.contains("=")) {
                            String value = trimmed.split("=", 2)[1].trim();
                            value = value.replaceAll("^[\"']|[\"']$", "").trim();
                            if (!value.isBlank()) return Optional.of(value);
                        } else {
                            return Optional.of(trimmed);
                        }
                    }
                }
            } catch (IOException error) {
                log.debug("AI key candidate could not be read: {}", candidate);
            }
        }
        return Optional.empty();
    }
}
