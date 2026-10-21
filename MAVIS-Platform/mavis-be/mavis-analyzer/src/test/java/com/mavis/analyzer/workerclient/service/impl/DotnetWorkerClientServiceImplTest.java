package com.mavis.analyzer.workerclient.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.workerclient.dto.DotnetAnalyzeResponseDTO;
import com.mavis.analyzer.workerclient.dto.DotnetElementDTO;
import com.mavis.analyzer.workerclient.dto.DotnetEvidenceDTO;
import com.mavis.analyzer.workerclient.dto.DotnetRelationDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DotnetWorkerClientServiceImplTest {

    @Mock
    private HttpClient mockHttpClient;

    @Mock
    private HttpResponse<String> mockHttpResponse;

    private ObjectMapper objectMapper;
    private DotnetWorkerClientServiceImpl dotnetWorkerClientService;

    @TempDir
    Path tempDir;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        dotnetWorkerClientService = new DotnetWorkerClientServiceImpl(
                "http://localhost:5050",
                mockHttpClient,
                objectMapper
        );
    }

    @Test
    @DisplayName("hasDotnetFiles should return false for null, empty or Java-only directory")
    void shouldReturnFalseWhenNoDotnetFiles() throws IOException {
        assertThat(dotnetWorkerClientService.hasDotnetFiles(null)).isFalse();
        assertThat(dotnetWorkerClientService.hasDotnetFiles("")).isFalse();

        // Thư mục chỉ chứa Java
        Path javaFolder = tempDir.resolve("src/main/java");
        Files.createDirectories(javaFolder);
        Files.createFile(javaFolder.resolve("App.java"));

        assertThat(dotnetWorkerClientService.hasDotnetFiles(tempDir.toString())).isFalse();
    }

    @Test
    @DisplayName("hasDotnetFiles should return true when .sln or .csproj exists")
    void shouldReturnTrueWhenDotnetFilesExist() throws IOException {
        Path csprojFile = tempDir.resolve("OrderService.csproj");
        Files.createFile(csprojFile);

        assertThat(dotnetWorkerClientService.hasDotnetFiles(tempDir.toString())).isTrue();
    }

    @Test
    @DisplayName("hasDotnetFiles should ignore .csproj located in /test/, /bin/, /obj/")
    void shouldIgnoreDotnetFilesInTestOrBinOrObj() throws IOException {
        Path testFolder = tempDir.resolve("src/test/unit");
        Files.createDirectories(testFolder);
        Files.createFile(testFolder.resolve("UnitTest.csproj"));

        Path binFolder = tempDir.resolve("bin/debug");
        Files.createDirectories(binFolder);
        Files.createFile(binFolder.resolve("App.csproj"));

        assertThat(dotnetWorkerClientService.hasDotnetFiles(tempDir.toString())).isFalse();
    }

    @Test
    @DisplayName("analyzeDotnetIfPresent should skip network call when no .NET files exist")
    void shouldSkipNetworkCallWhenNoDotnetFiles() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID snapshotId = UUID.randomUUID();

        DotnetAnalyzeResponseDTO response = dotnetWorkerClientService.analyzeDotnetIfPresent(
                projectId, snapshotId, tempDir.toString()
        );

        assertThat(response).isNotNull();
        assertThat(response.getElements()).isEmpty();
        assertThat(response.getRelationships()).isEmpty();
        assertThat(response.getEvidences()).isEmpty();

        // Không gọi mạng bất kỳ lần nào
        verify(mockHttpClient, never()).send(any(HttpRequest.class), any());
    }

    @Test
    @DisplayName("analyzeDotnetIfPresent should gracefully degrade when C# Roslyn Worker is offline/down")
    void shouldGracefullyDegradeWhenWorkerIsDown() throws Exception {
        // Tạo file C#
        Files.createFile(tempDir.resolve("Ordering.sln"));

        // Giả lập worker offline (ConnectException hoặc IOException)
        when(mockHttpClient.send(any(HttpRequest.class), any()))
                .thenThrow(new IOException("Connection refused: connect"));

        UUID projectId = UUID.randomUUID();
        UUID snapshotId = UUID.randomUUID();

        DotnetAnalyzeResponseDTO response = dotnetWorkerClientService.analyzeDotnetIfPresent(
                projectId, snapshotId, tempDir.toString()
        );

        assertThat(response).isNotNull();
        assertThat(response.getElements()).isEmpty();
        assertThat(response.getRelationships()).isEmpty();
        assertThat(response.getEvidences()).isEmpty();
        // Chứa warning thông báo worker không sẵn sàng
        assertThat(response.getWarnings()).isNotEmpty();
        assertThat(response.getWarnings().get(0)).contains("C# Roslyn Worker unavailable or failed");
    }

    @Test
    @DisplayName("analyzeDotnetIfPresent should return parsed response when C# Worker returns valid 200 OK JSON")
    void shouldReturnParsedResponseOnValidJson() throws Exception {
        // Tạo file C#
        Files.createFile(tempDir.resolve("Ordering.csproj"));

        DotnetAnalyzeResponseDTO mockResponseDTO = DotnetAnalyzeResponseDTO.builder()
                .elements(List.of(
                        DotnetElementDTO.builder()
                                .name("OrderApiController")
                                .elementType("COMPONENT")
                                .languageStack("CSHARP_DOTNET")
                                .parentElementName("order-service")
                                .scope("Controllers/OrderApiController.cs")
                                .build()
                ))
                .relationships(List.of(
                        DotnetRelationDTO.builder()
                                .sourceElementName("OrderApiController")
                                .targetElementName("fruit-catalog-service")
                                .relationType("SERVICE_HTTP_CALL")
                                .originLayer("STATIC")
                                .direction("DIRECTED")
                                .build()
                ))
                .evidences(List.of(
                        DotnetEvidenceDTO.builder()
                                .sourceElementName("OrderApiController")
                                .targetElementName("fruit-catalog-service")
                                .relationType("SERVICE_HTTP_CALL")
                                .locator("Controllers/OrderApiController.cs:45")
                                .adapterVersion("ROSLYN_4.8")
                                .sourceType("STATIC_CODE")
                                .excerpt("await _httpClient.GetAsync(\"http://fruit-catalog-service/fruits\");")
                                .build()
                ))
                .build();

        String jsonPayload = objectMapper.writeValueAsString(mockResponseDTO);

        when(mockHttpResponse.statusCode()).thenReturn(200);
        when(mockHttpResponse.body()).thenReturn(jsonPayload);
        when(mockHttpClient.send(any(HttpRequest.class), any()))
                .thenAnswer(inv -> mockHttpResponse);

        UUID projectId = UUID.randomUUID();
        UUID snapshotId = UUID.randomUUID();

        DotnetAnalyzeResponseDTO response = dotnetWorkerClientService.analyzeDotnetIfPresent(
                projectId, snapshotId, tempDir.toString()
        );

        assertThat(response).isNotNull();
        assertThat(response.getElements()).hasSize(1);
        DotnetElementDTO el = response.getElements().get(0);
        assertThat(el.getName()).isEqualTo("OrderApiController");
        assertThat(el.getLanguageStack()).isEqualTo("CSHARP_DOTNET");
        assertThat(el.getParentElementName()).isEqualTo("order-service");

        assertThat(response.getRelationships()).hasSize(1);
        DotnetRelationDTO rel = response.getRelationships().get(0);
        assertThat(rel.getSourceElementName()).isEqualTo("OrderApiController");
        assertThat(rel.getTargetElementName()).isEqualTo("fruit-catalog-service");
        assertThat(rel.getRelationType()).isEqualTo("SERVICE_HTTP_CALL");

        assertThat(response.getEvidences()).hasSize(1);
        DotnetEvidenceDTO ev = response.getEvidences().get(0);
        assertThat(ev.getAdapterVersion()).isEqualTo("ROSLYN_4.8");
        assertThat(ev.getLocator()).contains("Controllers/OrderApiController.cs:45");
    }

    @Test
    @DisplayName("analyzeDotnetIfPresent should handle non-200 HTTP status gracefully")
    void shouldHandleNon200StatusGracefully() throws Exception {
        Files.createFile(tempDir.resolve("Ordering.csproj"));

        when(mockHttpResponse.statusCode()).thenReturn(500);
        when(mockHttpResponse.body()).thenReturn("Internal Server Error in Roslyn Worker");
        when(mockHttpClient.send(any(HttpRequest.class), any()))
                .thenAnswer(inv -> mockHttpResponse);

        UUID projectId = UUID.randomUUID();
        UUID snapshotId = UUID.randomUUID();

        DotnetAnalyzeResponseDTO response = dotnetWorkerClientService.analyzeDotnetIfPresent(
                projectId, snapshotId, tempDir.toString()
        );

        assertThat(response).isNotNull();
        assertThat(response.getWarnings()).isNotEmpty();
        assertThat(response.getWarnings().get(0)).contains("500");
    }
}
