package com.mavis.analyzer.workerclient.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.workerclient.dto.DotnetAnalyzeRequestDTO;
import com.mavis.analyzer.workerclient.dto.DotnetAnalyzeResponseDTO;
import com.mavis.analyzer.workerclient.service.DotnetWorkerClientService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

@Service
@Slf4j
public class DotnetWorkerClientServiceImpl implements DotnetWorkerClientService {

    private final String dotnetWorkerUrl;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    @Autowired
    public DotnetWorkerClientServiceImpl(@Value("${mavis.worker.dotnet-url:http://localhost:5050}") String dotnetWorkerUrl) {
        this(dotnetWorkerUrl,
                HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(5))
                        .build(),
                new ObjectMapper());
    }

    public DotnetWorkerClientServiceImpl(String dotnetWorkerUrl, HttpClient httpClient, ObjectMapper objectMapper) {
        this.dotnetWorkerUrl = (dotnetWorkerUrl != null && !dotnetWorkerUrl.isBlank())
                ? dotnetWorkerUrl.replaceAll("/+$", "")
                : "http://localhost:5050";
        this.httpClient = httpClient;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean hasDotnetFiles(String extractedPath) {
        if (extractedPath == null || extractedPath.isBlank()) {
            return false;
        }

        Path rootPath = Paths.get(extractedPath);
        if (!Files.exists(rootPath) || !Files.isDirectory(rootPath)) {
            return false;
        }

        try (Stream<Path> stream = Files.walk(rootPath)) {
            return stream.filter(Files::isRegularFile)
                    .filter(path -> !isIgnoredPath(path))
                    .anyMatch(path -> {
                        String fileName = path.getFileName().toString().toLowerCase();
                        return fileName.endsWith(".sln") || fileName.endsWith(".csproj");
                    });
        } catch (Exception e) {
            log.warn("Lỗi khi kiểm tra file .NET trong {}: {}", extractedPath, e.getMessage());
            return false;
        }
    }

    @Override
    public DotnetAnalyzeResponseDTO analyzeDotnetIfPresent(UUID projectId, UUID snapshotId, String extractedPath) {
        if (!hasDotnetFiles(extractedPath)) {
            log.debug("Không tìm thấy file .sln hoặc .csproj trong {}. Bỏ qua gọi C# Roslyn Worker.", extractedPath);
            return DotnetAnalyzeResponseDTO.builder().build();
        }

        String targetUrl = dotnetWorkerUrl + "/internal/v1/dotnet/analyze";
        log.info("Phát hiện dự án C#/.NET trong {}. Tiến hành gửi yêu cầu phân tích tới C# Roslyn Worker: {}",
                extractedPath, targetUrl);

        try {
            DotnetAnalyzeRequestDTO requestDto = DotnetAnalyzeRequestDTO.builder()
                    .projectId(projectId)
                    .sourceSnapshotId(snapshotId)
                    .extractedSourcePath(extractedPath)
                    .build();

            String requestBodyJson = objectMapper.writeValueAsString(requestDto);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(targetUrl))
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(30))
                    .POST(HttpRequest.BodyPublishers.ofString(requestBodyJson, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));

            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                DotnetAnalyzeResponseDTO responseDto = objectMapper.readValue(response.body(), DotnetAnalyzeResponseDTO.class);
                log.info("C# Roslyn Worker phân tích thành công: {} elements, {} relationships, {} evidences",
                        responseDto.getElements().size(),
                        responseDto.getRelationships().size(),
                        responseDto.getEvidences().size());
                return responseDto;
            } else {
                log.warn("C# Roslyn Worker trả về mã lỗi HTTP {}: {}", response.statusCode(), response.body());
                List<String> warnings = new ArrayList<>();
                warnings.add("C# Roslyn Worker returned HTTP status " + response.statusCode());
                return DotnetAnalyzeResponseDTO.builder()
                        .warnings(warnings)
                        .build();
            }
        } catch (Exception e) {
            // Graceful Degradation: Không làm đứt đoạn tiến trình phân tích Java
            log.warn("Không thể kết nối hoặc nhận phản hồi từ C# Roslyn Worker tại {}: {}. Tiến hành bỏ qua phần C# an toàn.",
                    targetUrl, e.getMessage());
            List<String> warnings = new ArrayList<>();
            warnings.add("C# Roslyn Worker unavailable or failed: " + e.getMessage());
            return DotnetAnalyzeResponseDTO.builder()
                    .warnings(warnings)
                    .build();
        }
    }

    public static boolean isIgnoredPath(Path path) {
        String normalized = path.toString().replace('\\', '/').toLowerCase();
        return normalized.contains("/test/")
                || normalized.contains("/bin/")
                || normalized.contains("/obj/")
                || normalized.contains("/.git/")
                || normalized.contains("/target/")
                || normalized.contains("/build/")
                || normalized.endsWith("/test")
                || normalized.endsWith("/bin")
                || normalized.endsWith("/obj");
    }
}
