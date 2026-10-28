package com.mavis.bootstrap.admin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.CompletableFuture;

/** Cloud Monitoring samples are delayed and not equivalent to a continuously available balance. */
@Component
public class GeminiMonitoringClient {
    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    @Value("${MAVIS_GCP_PROJECT_ID:}") private String projectId;
    @Value("${MAVIS_GCP_MONITORING_TOKEN_FILE:}") private String tokenFile;
    @Value("${MAVIS_GEMINI_QUOTA_TIER:}") private String tier;
    private Map<String,Object> cached;
    private long cacheUntil;
    public GeminiMonitoringClient(ObjectMapper mapper) { this.mapper = mapper; }

    public synchronized Map<String,Object> snapshot() {
        if (cached != null && System.currentTimeMillis() < cacheUntil) return cached;
        Map<String,Object> result = new HashMap<>();
        result.put("providerDataUpdatedAt", Instant.now().toString());
        String prefix = switch (tier == null ? "" : tier) {
            case "free" -> "generate_content_free_tier_";
            case "paid" -> "generate_content_paid_tier_";
            case "paid2" -> "generate_content_paid_tier_2_";
            case "paid3" -> "generate_content_paid_tier_3_";
            default -> "";
        };
        if (projectId == null || !projectId.matches("[a-z0-9][a-z0-9-]{0,61}[a-z0-9]") || tokenFile == null || tokenFile.isBlank() || prefix.isBlank()) {
            result.put("providerDataMessage", "Gemini Monitoring requires a Cloud project, quota tier and refreshed OAuth token file with monitoring.read access.");
            return remember(result);
        }
        try {
            Path path = Path.of(tokenFile);
            if (Files.size(path) > 8192) throw new IllegalStateException("Token file too large");
            String token = Files.readString(path).trim();
            if (token.isEmpty() || token.contains("\n") || token.contains("\r")) throw new IllegalStateException("Invalid token");
            Instant end = Instant.now(); Instant start = end.minus(Duration.ofMinutes(15));
            String requestMetric = "paid".equals(tier) ? "generate_requests_per_model" : prefix+"requests";
            List<String> metrics = List.of(requestMetric+"/limit",requestMetric+"/usage",prefix+"input_token_count/limit",prefix+"input_token_count/usage");
            List<CompletableFuture<HttpResponse<String>>> calls = new ArrayList<>();
            for (String suffix : metrics) {
                String metric = "generativelanguage.googleapis.com/quota/"+suffix;
                String filter = URLEncoder.encode("metric.type=\""+metric+"\"",StandardCharsets.UTF_8);
                String query = "?filter="+filter+"&interval.startTime="+URLEncoder.encode(start.toString(),StandardCharsets.UTF_8)+"&interval.endTime="+URLEncoder.encode(end.toString(),StandardCharsets.UTF_8)+"&view=FULL&pageSize=1000";
                HttpRequest req = HttpRequest.newBuilder(URI.create("https://monitoring.googleapis.com/v3/projects/"+projectId+"/timeSeries"+query)).header("Authorization","Bearer "+token).timeout(Duration.ofSeconds(6)).GET().build();
                calls.add(http.sendAsync(req,HttpResponse.BodyHandlers.ofString()));
            }
            CompletableFuture.allOf(calls.toArray(CompletableFuture[]::new)).handle((v,e)->null).join();
            List<Map<String,Object>> samples = new ArrayList<>(); boolean partial = false;
            for (int i=0;i<calls.size();i++) {
                try {
                    HttpResponse<String> response = calls.get(i).join();
                    if (response.statusCode()!=200) { partial=true; continue; }
                    JsonNode json = mapper.readTree(response.body());
                    if (!json.path("nextPageToken").asText("").isEmpty()) partial=true;
                    List<Map<String,Object>> found = parseSamples(json, metrics.get(i));
                    if (found.isEmpty()) partial=true;
                    samples.addAll(found);
                } catch (Exception e) { partial=true; }
            }
            if (samples.isEmpty()) result.put("providerDataMessage", "Gemini Monitoring returned no quota samples or access was denied; check project, tier, IAM and token expiry.");
            else {
                result.put("geminiQuota",Map.of("scope","project","samples",samples,"partial",partial));
                result.put("providerDataMessage", "Cloud Monitoring samples can be delayed; usage samples are interval deltas, not remaining quota."+(partial?" Some metrics are unavailable.":""));
            }
        } catch (Exception e) { result.put("providerDataMessage", "Gemini Monitoring unavailable; check OAuth token file, project and IAM."); }
        return remember(result);
    }
    private Map<String,Object> remember(Map<String,Object> result) {
        cached = Map.copyOf(result); cacheUntil = System.currentTimeMillis()+30_000; return cached;
    }
    static List<Map<String,Object>> parseSamples(JsonNode data, String metric) {
        List<Map<String,Object>> samples = new ArrayList<>();
        if (!data.path("timeSeries").isArray()) return samples;
        for (JsonNode series : data.path("timeSeries")) {
            JsonNode labels=series.path("metric").path("labels"), point=series.path("points").path(0);
            String model=labels.path("model").asText(), limit=labels.path("limit_name").asText();
            String value=point.path("value").path("int64Value").asText(), measured=point.path("interval").path("endTime").asText();
            if (model.isBlank() || limit.isBlank() || measured.isBlank() || !value.matches("[0-9]{1,18}")) continue;
            Map<String,Object> sample=new LinkedHashMap<>();
            sample.put("model",model); sample.put("metric",metric); sample.put("limitName",limit);
            sample.put("kind",metric.endsWith("/limit")?"limit":"usage"); sample.put("value",Long.parseLong(value)); sample.put("measuredAt",measured);
            String start=point.path("interval").path("startTime").asText(); if (!start.isBlank()) sample.put("startTime",start);
            samples.add(sample);
        }
        return samples;
    }
}
