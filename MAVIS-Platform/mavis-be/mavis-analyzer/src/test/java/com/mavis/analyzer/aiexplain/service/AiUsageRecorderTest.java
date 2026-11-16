package com.mavis.analyzer.aiexplain.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import static org.mockito.Mockito.*;

class AiUsageRecorderTest {
    @Test void recordsGeminiThinkingTokensAndSkipsMissingUsage() throws Exception {
        DataSource ds = mock(DataSource.class); Connection c = mock(Connection.class); PreparedStatement p = mock(PreparedStatement.class);
        when(ds.getConnection()).thenReturn(c); when(c.prepareStatement(anyString())).thenReturn(p);
        AiUsageRecorder recorder = new AiUsageRecorder(ds); ObjectMapper mapper = new ObjectMapper();
        recorder.recordResponse("gemini", "gemini-2.5-flash", mapper.readTree("{\"usageMetadata\":{\"promptTokenCount\":20,\"candidatesTokenCount\":4,\"thoughtsTokenCount\":6}}"));
        verify(p).setLong(5, 20); verify(p).setLong(6, 10); verify(p).executeUpdate();
        recorder.recordResponse("gemini", "gemini-2.5-flash", mapper.readTree("{}"));
        verify(ds, times(1)).getConnection();
    }
    @Test void recordsAuthenticatedActor() throws Exception {
        DataSource ds = mock(DataSource.class); Connection c = mock(Connection.class); PreparedStatement p = mock(PreparedStatement.class);
        when(ds.getConnection()).thenReturn(c); when(c.prepareStatement(anyString())).thenReturn(p);
        java.util.UUID userId = java.util.UUID.randomUUID();
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(userId.toString(), "unused", java.util.List.of()));
        try {
            new AiUsageRecorder(ds).recordResponse("openai", "model", new ObjectMapper().readTree("{\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":2}}"));
            verify(p).setObject(7, userId);
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test void readsNewestEventsWithUserAndBoundsLimit() throws Exception {
        DataSource ds = mock(DataSource.class); Connection c = mock(Connection.class); PreparedStatement p = mock(PreparedStatement.class);
        java.sql.ResultSet rs = mock(java.sql.ResultSet.class);
        when(ds.getConnection()).thenReturn(c); when(c.prepareStatement(anyString())).thenReturn(p); when(p.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true, false);
        java.util.UUID requestId = java.util.UUID.randomUUID(), userId = java.util.UUID.randomUUID();
        when(rs.getObject(1, java.util.UUID.class)).thenReturn(requestId);
        when(rs.getObject(8, java.util.UUID.class)).thenReturn(userId);
        when(rs.getTimestamp(2)).thenReturn(java.sql.Timestamp.from(java.time.Instant.parse("2026-10-28T10:00:00Z")));
        when(rs.getString(9)).thenReturn("Test User"); when(rs.getString(10)).thenReturn("test@example.com");
        var events = new AiUsageRecorder(ds).recentEvents(999);
        verify(p).setInt(1, 200);
        verify(c).prepareStatement(contains("ORDER BY e.recorded_at DESC,e.request_id DESC"));
        org.assertj.core.api.Assertions.assertThat(events.getFirst().userId()).isEqualTo(userId);
        org.assertj.core.api.Assertions.assertThat(events.getFirst().userName()).isEqualTo("Test User");
        org.assertj.core.api.Assertions.assertThat(events.getFirst().recordedAt()).isEqualTo("2026-10-28T10:00:00Z");
    }
}
