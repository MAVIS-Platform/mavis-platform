package com.mavis.bootstrap.admin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.aiexplain.service.AiUsageRecorder;
import com.mavis.common.dto.ApiResponse;
import com.mavis.common.security.AccessPolicyService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.SQLException;
import java.time.*;
import java.util.*;

@RestController
public class AiUsageController {
    private final AccessPolicyService policy;
    private final AiUsageRecorder recorder;
    private final ObjectMapper mapper;
    private final GeminiMonitoringClient geminiMonitoring;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    @Value("${MAVIS_AI_USAGE_INGEST_KEY:}") private String ingestKey;
    @Value("${OPENAI_ADMIN_KEY:}") private String adminKey;
    @Value("${OPENAI_PROJECT_ID:}") private String projectId;
    private Map<String,Object> providerCache;
    private long providerCacheUntil;

    public AiUsageController(AccessPolicyService policy, AiUsageRecorder recorder, ObjectMapper mapper, GeminiMonitoringClient geminiMonitoring) {
        this.policy = policy; this.recorder = recorder; this.mapper = mapper; this.geminiMonitoring = geminiMonitoring;
    }
    public record Ingest(@NotBlank @Pattern(regexp="openai|gemini") String provider,
                         @NotBlank @Size(max=128) String model,
                         @NotNull UUID requestId,
                         @NotNull @Min(0) @Max(100000000) Long inputTokens,
                         @NotNull @Min(0) @Max(100000000) Long outputTokens, UUID userId) {}

    @PostMapping("/api/v1/internal/ai-usage")
    public ApiResponse<?> ingest(@RequestHeader(value="X-MAVIS-AI-USAGE-KEY", required=false) String key,
                                 @Valid @RequestBody Ingest event) {
        if (ingestKey == null || ingestKey.length() < 32)
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Usage ingest is not configured");
        if (key == null || !MessageDigest.isEqual(ingestKey.getBytes(StandardCharsets.UTF_8), key.getBytes(StandardCharsets.UTF_8)))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        if (!recorder.record("next", event.provider(), event.model(), event.requestId(), event.inputTokens(), event.outputTokens(), event.userId()))
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Usage storage unavailable");
        return ApiResponse.success(Map.of("recorded", true));
    }

    @GetMapping("/api/v1/admin/ai-usage")
    public ApiResponse<?> usage() {
        policy.requireSystemAdmin();
        List<AiUsageRecorder.Totals> totals = null;
        try { totals = recorder.totals(); } catch (SQLException ignored) { /* report unavailable, never fake zero */ }
        boolean storageAvailable = totals != null;
        List<Map<String,Object>> providers = new ArrayList<>();
        Map<String,Object> openAiProjectData = openAiProjectData();
        Map<String,Object> geminiProjectData = geminiMonitoring.snapshot();
        for (String provider : List.of("openai", "gemini")) {
            List<AiUsageRecorder.Totals> providerRows = storageAvailable ? totals.stream().filter(t -> t.provider().equals(provider)).toList() : List.of();
            List<String> models = providerRows.stream().map(AiUsageRecorder.Totals::model).distinct().sorted().toList();
            if (models.isEmpty()) models = Collections.singletonList(null);
            for (String model : models) {
            Map<String,Object> item = new LinkedHashMap<>();
            item.put("provider", provider); item.put("model", model);
            List<AiUsageRecorder.Totals> rows = providerRows.stream().filter(t -> Objects.equals(t.model(), model)).toList();
            item.put("usage", rows.isEmpty() ? null : Map.of("inputTokens", rows.stream().mapToLong(AiUsageRecorder.Totals::inputTokens).sum(),
                    "outputTokens", rows.stream().mapToLong(AiUsageRecorder.Totals::outputTokens).sum(),
                    "requestCount", rows.stream().mapToLong(AiUsageRecorder.Totals::requestCount).sum()));
            item.put("coverage", Map.of("java", rows.stream().anyMatch(r -> r.source().equals("java")) ? "OBSERVED" : "UNKNOWN",
                    "next", rows.stream().anyMatch(r -> r.source().equals("next")) ? "OBSERVED" : "UNKNOWN"));
            item.put("scope", "MAVIS recorded requests only, since telemetry was enabled; incomplete when data is unavailable");
            item.put("limits", null); item.put("cost", null); item.put("balance", null); item.put("providerUsage", null); item.put("geminiQuota", null);
            item.put("status", rows.isEmpty() ? "UNAVAILABLE" : "AVAILABLE");
            item.put("message", storageAvailable ? "Usage is provider-reported for recorded requests only; unobserved sources and missing usage are unknown." : "Usage storage unavailable; apply migration V20.");
            if (provider.equals("openai")) item.putAll(openAiProjectData);
            else item.putAll(geminiProjectData);
            providers.add(item);
            }
        }
        Map<String,Object> out = new LinkedHashMap<>();
        out.put("status", storageAvailable ? "AVAILABLE" : "UNAVAILABLE");
        out.put("updatedAt", Instant.now().toString());
        out.put("message", storageAvailable ? "Usage covers recorded MAVIS requests only." : "Usage storage unavailable; apply migration V20.");
        out.put("providers", providers);
        try {
            out.put("events", recorder.recentEvents(200));
            out.put("eventsAvailable", true);
        } catch (SQLException ignored) {
            out.put("events", List.of());
            out.put("eventsAvailable", false);
        }
        return ApiResponse.success(out);
    }

    private synchronized Map<String,Object> openAiProjectData() {
        long now = System.currentTimeMillis();
        if (providerCache != null && now < providerCacheUntil) return providerCache;
        Map<String,Object> data = new HashMap<>();
        enrichOpenAi(data);
        data.put("providerDataUpdatedAt", Instant.now().toString());
        providerCache = Map.copyOf(data);
        providerCacheUntil = System.currentTimeMillis() + 30_000;
        return providerCache;
    }

    private void enrichOpenAi(Map<String,Object> item) {
        if (adminKey == null || adminKey.isBlank() || projectId == null || !projectId.matches("proj_[A-Za-z0-9_-]{1,120}")) {
            item.put("providerDataMessage", "OpenAI project limits and costs require OPENAI_ADMIN_KEY and OPENAI_PROJECT_ID.");
            return;
        }
        List<String> errors = new ArrayList<>();
        Instant now = Instant.now();
        Instant monthStart = now.atZone(ZoneOffset.UTC).withDayOfMonth(1).toLocalDate().atStartOfDay(ZoneOffset.UTC).toInstant();
        try {
            JsonNode response = getOpenAi("/organization/usage/completions?start_time=" + monthStart.getEpochSecond() + "&end_time=" + now.getEpochSecond() + "&limit=31&bucket_width=1d&project_ids%5B%5D=" + URLEncoder.encode(projectId,StandardCharsets.UTF_8));
            if (response.path("has_more").asBoolean()) throw new IllegalStateException("Incomplete usage");
            long input = 0, output = 0, count = 0;
            for (JsonNode bucket : response.path("data")) for (JsonNode entry : bucket.path("results")) {
                if (!entry.path("input_tokens").isIntegralNumber() || !entry.path("output_tokens").isIntegralNumber() || !entry.path("num_model_requests").isIntegralNumber()) throw new IllegalStateException("Unknown usage");
                input = Math.addExact(input, entry.path("input_tokens").longValue());
                output = Math.addExact(output, entry.path("output_tokens").longValue());
                count = Math.addExact(count, entry.path("num_model_requests").longValue());
            }
            item.put("providerUsage", Map.of("scope","project","inputTokens",input,"outputTokens",output,"requestCount",count,"startTime",monthStart.toString(),"endTime",now.toString()));
        } catch (Exception e) { errors.add("project usage unavailable"); }
        try {
            JsonNode response = getOpenAi("/organization/projects/" + projectId + "/rate_limits?limit=100");
            if (response.path("has_more").asBoolean()) throw new IllegalStateException("Incomplete limits");
            List<Map<String,Object>> models = new ArrayList<>();
            for (JsonNode m : response.path("data")) {
                if (m.path("model").isTextual() && m.path("max_requests_per_1_minute").isNumber() && m.path("max_tokens_per_1_minute").isNumber())
                    models.add(Map.of("model",m.path("model").asText(),"requestsPerMinute",m.path("max_requests_per_1_minute").asLong(),"tokensPerMinute",m.path("max_tokens_per_1_minute").asLong()));
            }
            item.put("limits",Map.of("scope","project","models",models));
        } catch (Exception e) { errors.add("project rate limits unavailable"); }
        try {
            Instant start = monthStart;
            JsonNode response = getOpenAi("/organization/costs?start_time=" + start.getEpochSecond() + "&end_time=" + now.getEpochSecond() + "&limit=31&project_ids%5B%5D=" + URLEncoder.encode(projectId,StandardCharsets.UTF_8));
            if (response.path("has_more").asBoolean()) throw new IllegalStateException("Incomplete costs");
            BigDecimal amount = BigDecimal.ZERO; String currency = null;
            for (JsonNode bucket : response.path("data")) for (JsonNode entry : bucket.path("results")) {
                JsonNode value = entry.path("amount").path("value");
                String unit = entry.path("amount").path("currency").asText();
                if (!value.isNumber() || unit.isBlank() || (currency != null && !currency.equals(unit))) throw new IllegalStateException("Unknown cost");
                currency = unit; amount = amount.add(value.decimalValue());
            }
            if (currency != null) item.put("cost", Map.of("scope","project","amount",amount,"currency",currency,"startTime",start.toString(),"endTime",now.toString()));
            else errors.add("project costs returned no currency data");
        } catch (Exception e) { errors.add("project costs unavailable"); }
        item.put("providerDataMessage", errors.isEmpty() ? "Provider project data; balance unavailable." : String.join("; ", errors));
    }
    private JsonNode getOpenAi(String path) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.openai.com/v1" + path))
                .header("Authorization", "Bearer " + adminKey).timeout(Duration.ofSeconds(6)).GET().build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new IllegalStateException("Provider request failed");
        JsonNode root = mapper.readTree(response.body());
        if (!root.path("data").isArray()) throw new IllegalStateException("Invalid provider response");
        return root;
    }
}
