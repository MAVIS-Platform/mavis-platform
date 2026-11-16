package com.mavis.analyzer.aiexplain.config;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class ApiKeyProviderTest {

    private ApiKeyProvider apiKeyProvider;

    @BeforeEach
    void setUp() {
        apiKeyProvider = new ApiKeyProvider(new com.mavis.common.config.PlatformRuntimeSettings());
    }

    @Test
    @DisplayName("Ưu tiên lấy key từ cấu hình mavis.ai.api-key nếu có")
    void testResolveApiKey_FromConfiguredProperty() {
        ReflectionTestUtils.setField(apiKeyProvider, "configuredApiKey", "  test-only-api-key-fixture-1  ");

        Optional<String> resolved = apiKeyProvider.resolveApiKey();

        assertThat(resolved).isPresent();
        assertThat(resolved.get()).isEqualTo("test-only-api-key-fixture-1");
    }

    @Test
    @DisplayName("Đọc tự động key từ file tạm theo đường dẫn keyFilePath dạng raw text")
    void testResolveApiKey_FromCustomFile_RawKey(@TempDir Path tempDir) throws IOException {
        Path keyFile = tempDir.resolve("API_KEY");
        Files.writeString(keyFile, "test-only-api-key-fixture-3\n", StandardCharsets.UTF_8);

        ReflectionTestUtils.setField(apiKeyProvider, "keyFilePath", keyFile.toAbsolutePath().toString());

        Optional<String> resolved = apiKeyProvider.resolveApiKey();

        assertThat(resolved).isPresent();
        assertThat(resolved.get()).isEqualTo("test-only-api-key-fixture-3");
    }

    @Test
    @DisplayName("Đọc tự động key từ file tạm có tiền tố API_KEY= và comment")
    void testResolveApiKey_FromFileWithPrefix(@TempDir Path tempDir) throws IOException {
        Path keyFile = tempDir.resolve("API_KEY.txt");
        String fileContent = "# File cấu hình bí mật\n" +
                "\n" +
                "API_KEY=\"test-only-api-key-fixture-2\"\n";
        Files.writeString(keyFile, fileContent, StandardCharsets.UTF_8);

        ReflectionTestUtils.setField(apiKeyProvider, "keyFilePath", keyFile.toAbsolutePath().toString());

        Optional<String> resolved = apiKeyProvider.resolveApiKey();

        assertThat(resolved).isPresent();
        assertThat(resolved.get()).isEqualTo("test-only-api-key-fixture-2");
    }

    @Test
    @DisplayName("Trả về Optional.empty() khi file không tồn tại hoặc trống")
    void testResolveApiKey_FileNotFound(@TempDir Path tempDir) {
        Path nonExistent = tempDir.resolve("non_existent_key");
        ReflectionTestUtils.setField(apiKeyProvider, "keyFilePath", nonExistent.toAbsolutePath().toString());

        Optional<String> resolved = apiKeyProvider.resolveApiKey();

        // Không cấu hình key và đường dẫn không tồn tại -> empty
        assertThat(resolved).isEmpty();
    }

    @Test
    @DisplayName("Trả về Optional.empty() khi file chỉ chứa comment")
    void testResolveApiKey_EmptyOrCommentOnlyFile(@TempDir Path tempDir) throws IOException {
        Path keyFile = tempDir.resolve("empty_key.txt");
        Files.writeString(keyFile, "# comment line 1\n// comment line 2\n   \n", StandardCharsets.UTF_8);
        ReflectionTestUtils.setField(apiKeyProvider, "keyFilePath", keyFile.toAbsolutePath().toString());

        Optional<String> resolved = apiKeyProvider.resolveApiKey();

        assertThat(resolved).isEmpty();
    }
    @Test void disabledAiDoesNotResolveConfiguredSecret(){var settings=new com.mavis.common.config.PlatformRuntimeSettings();var keys=new ApiKeyProvider(settings);ReflectionTestUtils.setField(keys,"configuredApiKey","test-secret");settings.updateIntegration("gemini-ai",false,1,n->{});assertThat(keys.resolveApiKey()).isEmpty();}
}
