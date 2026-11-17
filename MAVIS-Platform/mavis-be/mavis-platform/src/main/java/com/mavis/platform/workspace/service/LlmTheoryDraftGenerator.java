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
import java.util.List;
import java.util.Optional;

/**
 * Writes a grounded Markdown theory draft from the reference evidence a Lab already pins.
 *
 * <p>Supports OpenAI keys ({@code sk-...}) and Gemini keys. The cheapest reasonable OpenAI model is
 * the default; override with {@code MAVIS_AI_THEORY_OPENAI_MODEL}. No key means no draft: this
 * component never fabricates a lesson.</p>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class LlmTheoryDraftGenerator {

    private static final String GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/";

    private final ObjectMapper json;

    @Autowired(required = false)
    private PlatformRuntimeSettings settings;

    @Value("${mavis.ai.endpoint-url:}")
    private String customEndpointUrl;

    @Value("${mavis.ai.api-key:}")
    private String configuredApiKey;

    @Value("${mavis.ai.key-file-path:API_KEY}")
    private String keyFilePath;

    @Value("${mavis.ai.theory-model:gemini-2.5-flash}")
    private String geminiModel;

    @Value("${mavis.ai.theory-openai-model:gpt-4o-mini}")
    private String openAiModel;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public record Draft(String title, String body, String providerMode, int evidenceCount) {}

    public Draft generate(String topic, boolean vietnamese, String style, List<String> evidence) {
        if (settings != null && !settings.enabled("gemini-ai")) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "AI_NOT_CONFIGURED",
                    "The AI integration is disabled. Enable it before generating a theory draft.");
        }
        String apiKey = resolveApiKey().orElseThrow(() -> new BusinessException(
                ErrorCode.UNPROCESSABLE_ENTITY, "AI_NOT_CONFIGURED",
                "No AI provider key is configured. Set MAVIS_AI_API_KEY to generate a theory draft."));

        String prompt = buildPrompt(topic, vietnamese, style, evidence);
        String response;
        try {
            response = apiKey.startsWith("sk-")
                    ? sendOpenAi(apiKey, prompt)
                    : sendGemini(apiKey, prompt);
        } catch (BusinessException error) {
            throw error;
        } catch (IOException | InterruptedException error) {
            if (error instanceof InterruptedException) Thread.currentThread().interrupt();
            log.warn("Theory draft generation failed: {}", error.getMessage());
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "AI_GENERATION_FAILED",
                    "The AI provider did not return a usable lesson. Try again or write it manually.");
        }
        Draft draft = parse(response, topic);
        return new Draft(draft.title(), draft.body(), draft.providerMode(), evidence.size());
    }

    private String buildPrompt(String topic, boolean vietnamese, String style, List<String> evidence) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("You write one Markdown lesson for a software architecture course. ")
                .append("Ground every claim ONLY in the EVIDENCE list below; never invent services, ")
                .append("endpoints, technologies or numbers. If the evidence is thin, say what the ")
                .append("student should verify in the repository instead of guessing. ")
                .append("Style: ").append(style == null ? "CONCEPT" : style).append(". ")
                .append("Write in ").append(vietnamese ? "Vietnamese (keep code identifiers in English)" : "English")
                .append(". Use headings, short paragraphs, and one checklist at the end. ")
                .append("Return ONLY a JSON object {\"title\":\"...\",\"body\":\"# Markdown lesson...\"}.\n\n")
                .append("TOPIC: ").append(topic == null || topic.isBlank() ? "the Lab topic" : topic).append("\n\n")
                .append("EVIDENCE:\n");
        if (evidence.isEmpty()) {
            prompt.append("- (no evidence excerpts are available; keep the lesson short and verification-oriented)\n");
        } else {
            for (String item : evidence) prompt.append("- ").append(item).append("\n");
        }
        return prompt.toString();
    }

    private String sendOpenAi(String apiKey, String prompt) throws IOException, InterruptedException {
        ObjectNode request = json.createObjectNode();
        request.put("model", openAiModel);
        request.putObject("response_format").put("type", "json_object");
        ArrayNode messages = request.putArray("messages");
        messages.addObject().put("role", "system")
                .put("content", "You author grounded software architecture lessons. Return only the requested JSON object.");
        messages.addObject().put("role", "user").put("content", prompt);

        HttpRequest httpRequest = HttpRequest.newBuilder()
                .uri(URI.create("https://api.openai.com/v1/chat/completions"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .timeout(Duration.ofSeconds(45))
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(request), StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw providerFailure("OpenAI", response.statusCode());
        }
        JsonNode content = json.readTree(response.body()).path("choices").path(0).path("message").path("content");
        if (content.isMissingNode() || content.asText().isBlank()) {
            throw new IOException("OpenAI response missing message content");
        }
        return content.asText();
    }

    private String sendGemini(String apiKey, String prompt) throws IOException, InterruptedException {
        boolean hasCustomUrl = customEndpointUrl != null && !customEndpointUrl.isBlank();
        String targetUrl = hasCustomUrl
                ? customEndpointUrl
                : GEMINI_URL + geminiModel + ":generateContent?key=" + apiKey;
        ObjectNode request = json.createObjectNode();
        ArrayNode parts = request.putArray("contents").addObject().putArray("parts");
        parts.addObject().put("text", prompt);
        request.putObject("generationConfig").put("temperature", 0.3).put("responseMimeType", "application/json");

        HttpRequest httpRequest = HttpRequest.newBuilder()
                .uri(URI.create(targetUrl))
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(45))
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(request), StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw providerFailure("Gemini", response.statusCode());
        }
        JsonNode text = json.readTree(response.body())
                .path("candidates").path(0).path("content").path("parts").path(0).path("text");
        if (text.isMissingNode() || text.asText().isBlank()) {
            throw new IOException("Gemini response missing text candidate");
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
                    provider + " does not offer the configured model. Set MAVIS_AI_THEORY_OPENAI_MODEL to an available model.");
        }
        if (status == 429) {
            return new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "AI_QUOTA_EXHAUSTED",
                    provider + " quota or credits are exhausted. Add credits or write the lesson manually.");
        }
        return new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "AI_GENERATION_FAILED",
                provider + " returned HTTP " + status + ". Try again or write the lesson manually.");
    }

    Draft parse(String raw, String topic) {
        String payload = stripFence(raw == null ? "" : raw.trim());
        JsonNode root;
        try {
            root = json.readTree(payload);
        } catch (IOException error) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "AI_INVALID_RESPONSE",
                    "The AI response was not valid JSON. Try again or write the lesson manually.");
        }
        String title = root.path("title").asText("").trim();
        String body = root.path("body").asText("").trim();
        if (body.isBlank()) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "AI_INVALID_RESPONSE",
                    "The AI response did not contain a lesson body. Try again or write it manually.");
        }
        return new Draft(title.isBlank() ? topic : title, body, "LIVE_LLM_PROVIDER", 0);
    }

    private static String stripFence(String value) {
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
        if (configuredApiKey != null && !configuredApiKey.isBlank()) return Optional.of(configuredApiKey.trim());
        String envKey = System.getenv("MAVIS_AI_API_KEY");
        if (envKey != null && !envKey.isBlank()) return Optional.of(envKey.trim());
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
                            String value = trimmed.split("=", 2)[1].trim().replaceAll("^[\"']|[\"']$", "").trim();
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
