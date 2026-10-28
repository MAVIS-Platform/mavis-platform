package com.mavis.analyzer.aiexplain.service;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.*;

/** Records only provider-reported counts; uses an independent connection so telemetry failure cannot abort AI work. */
@Service
@Slf4j
public class AiUsageRecorder {
    private final DataSource dataSource;
    public AiUsageRecorder(DataSource dataSource) { this.dataSource = dataSource; }

    public boolean record(String source, String provider, String model, UUID requestId, long input, long output) {
        if (!Set.of("java", "next").contains(source) || !Set.of("openai", "gemini").contains(provider)
                || model == null || model.isBlank() || model.length() > 128 || requestId == null
                || input < 0 || output < 0 || input > 100_000_000L || output > 100_000_000L) return false;
        try (Connection c = dataSource.getConnection();
             PreparedStatement p = c.prepareStatement("INSERT INTO ai_usage_events (request_id,source,provider,model,input_tokens,output_tokens) VALUES (?,?,?,?,?,?) ON CONFLICT (request_id) DO NOTHING")) {
            p.setObject(1, requestId); p.setString(2, source); p.setString(3, provider);
            p.setString(4, model); p.setLong(5, input); p.setLong(6, output); p.executeUpdate();
            return true;
        } catch (SQLException e) {
            log.warn("AI usage storage unavailable (check migration V20 and database connectivity)");
            return false;
        }
    }

    public void recordResponse(String provider, String model, JsonNode response) {
        JsonNode usage = response.path(provider.equals("openai") ? "usage" : "usageMetadata");
        JsonNode in = usage.path(provider.equals("openai") ? "prompt_tokens" : "promptTokenCount");
        JsonNode out = usage.path(provider.equals("openai") ? "completion_tokens" : "candidatesTokenCount");
        if (in.isIntegralNumber() && out.isIntegralNumber() && in.canConvertToLong() && out.canConvertToLong()) {
            long output = out.longValue();
            JsonNode thoughts = usage.path("thoughtsTokenCount");
            if (provider.equals("gemini") && thoughts.isIntegralNumber() && thoughts.canConvertToLong()) {
                try { output = Math.addExact(output, thoughts.longValue()); }
                catch (ArithmeticException ignored) { return; }
            }
            record("java", provider, model, UUID.randomUUID(), in.longValue(), output);
        }
    }

    public record Totals(String provider, String model, long inputTokens, long outputTokens, long requestCount, String source) {}
    public List<Totals> totals() throws SQLException {
        String sql = "SELECT provider,model,source,SUM(input_tokens),SUM(output_tokens),COUNT(*) FROM ai_usage_events GROUP BY provider,model,source";
        try (Connection c = dataSource.getConnection(); PreparedStatement p = c.prepareStatement(sql); ResultSet rs = p.executeQuery()) {
            List<Totals> result = new ArrayList<>();
            while (rs.next()) result.add(new Totals(rs.getString(1), rs.getString(2), rs.getLong(4), rs.getLong(5), rs.getLong(6), rs.getString(3)));
            return result;
        }
    }
}
