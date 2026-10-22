package com.mavis.analyzer.aiexplain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

/**
 * Nhà cung cấp API Key an toàn cho phân hệ AI Giải thích (Ticket D2, T14).
 * Tự động tìm đọc file API_KEY / API_KEY.txt đã được gitignore hoặc biến môi trường,
 * tuyệt đối không bao giờ in nội dung key ra log.
 */
@Component
@Slf4j
public class ApiKeyProvider {

    @Value("${mavis.ai.api-key:}")
    private String configuredApiKey;

    @Value("${mavis.ai.key-file-path:API_KEY}")
    private String keyFilePath;

    /**
     * Dò tìm và giải quyết API Key cho AI Provider.
     *
     * @return Optional chứa API Key đã được làm sạch, hoặc empty nếu không tìm thấy.
     */
    public Optional<String> resolveApiKey() {
        // 1. Kiểm tra cấu hình application.properties hoặc biến môi trường
        if (configuredApiKey != null && !configuredApiKey.isBlank()) {
            String key = configuredApiKey.trim();
            log.info("Đã nạp thành công AI API Key từ cấu hình ứng dụng (độ dài: {} ký tự)", key.length());
            return Optional.of(key);
        }

        String envKey = System.getenv("MAVIS_AI_API_KEY");
        if (envKey != null && !envKey.isBlank()) {
            String key = envKey.trim();
            log.info("Đã nạp thành công AI API Key từ biến môi trường MAVIS_AI_API_KEY (độ dài: {} ký tự)", key.length());
            return Optional.of(key);
        }

        // 2. Dò tìm file cục bộ theo danh sách ưu tiên
        List<Path> candidatePaths;
        if (keyFilePath != null && !keyFilePath.isBlank() && !keyFilePath.equals("API_KEY")) {
            candidatePaths = List.of(Path.of(keyFilePath));
        } else {
            candidatePaths = List.of(
                    Path.of("API_KEY"),
                    Path.of("API_KEY.txt"),
                    Path.of("MAVIS-Platform/mavis-be/API_KEY"),
                    Path.of("MAVIS-Platform/mavis-be/API_KEY.txt"),
                    Path.of("../API_KEY"),
                    Path.of("../API_KEY.txt"),
                    Path.of("../../API_KEY"),
                    Path.of("../../API_KEY.txt")
            );
        }

        for (Path candidate : candidatePaths) {
            try {
                if (Files.exists(candidate) && Files.isRegularFile(candidate) && Files.isReadable(candidate)) {
                    String content = Files.readString(candidate, StandardCharsets.UTF_8);
                    Optional<String> parsedKey = extractKeyFromContent(content);
                    if (parsedKey.isPresent()) {
                        String key = parsedKey.get();
                        log.info("Đã nạp thành công AI API Key từ file cấu hình cục bộ (độ dài: {} ký tự)", key.length());
                        return Optional.of(key);
                    }
                }
            } catch (IOException e) {
                log.debug("Không thể đọc ứng viên file API Key: {}", candidate);
            }
        }

        log.debug("Không tìm thấy AI API Key trong môi trường hoặc file cục bộ. Sẽ dùng Deterministic Synthesis.");
        return Optional.empty();
    }

    private Optional<String> extractKeyFromContent(String content) {
        if (content == null || content.isBlank()) {
            return Optional.empty();
        }

        String[] lines = content.split("\\r?\\n");
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("#") || trimmed.startsWith("//")) {
                continue;
            }

            if (trimmed.contains("=")) {
                String[] parts = trimmed.split("=", 2);
                if (parts.length > 1 && !parts[1].isBlank()) {
                    String rawVal = parts[1].trim();
                    // Loại bỏ dấu nháy bao quanh nếu có
                    if ((rawVal.startsWith("\"") && rawVal.endsWith("\"")) ||
                            (rawVal.startsWith("'") && rawVal.endsWith("'"))) {
                        rawVal = rawVal.substring(1, rawVal.length() - 1).trim();
                    }
                    if (!rawVal.isBlank()) {
                        return Optional.of(rawVal);
                    }
                }
            } else {
                return Optional.of(trimmed);
            }
        }

        return Optional.empty();
    }
}
