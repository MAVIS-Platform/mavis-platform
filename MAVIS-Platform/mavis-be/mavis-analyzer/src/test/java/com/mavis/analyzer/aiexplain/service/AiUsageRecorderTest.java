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
}
