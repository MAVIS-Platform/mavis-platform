package com.mavis.common.utils;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HashUtilsTest {

    @TempDir
    Path tempDir;

    @Test
    @DisplayName("sha256Hex - Tính mã băm SHA-256 từ byte array chuẩn 64 hex")
    void sha256Hex_FromByteArray() {
        byte[] data = "Hello World".getBytes();
        String hash = HashUtils.sha256Hex(data);

        // Expected SHA-256 for "Hello World"
        assertThat(hash).hasSize(64);
        assertThat(hash).isEqualTo("a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e");
    }

    @Test
    @DisplayName("sha256Hex - Tính mã băm SHA-256 từ file Path chuẩn 64 hex")
    void sha256Hex_FromPath() throws IOException {
        Path testFile = tempDir.resolve("test.txt");
        Files.write(testFile, "Hello World".getBytes());

        String hash = HashUtils.sha256Hex(testFile);
        assertThat(hash).hasSize(64);
        assertThat(hash).isEqualTo("a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e");
    }

    @Test
    @DisplayName("sha256Hex - Tính mã băm SHA-256 từ InputStream chuẩn 64 hex")
    void sha256Hex_FromInputStream() throws IOException {
        ByteArrayInputStream bais = new ByteArrayInputStream("Hello World".getBytes());
        String hash = HashUtils.sha256Hex(bais);

        assertThat(hash).hasSize(64);
        assertThat(hash).isEqualTo("a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e");
    }

    @Test
    @DisplayName("sha256Hex - Ném IllegalArgumentException khi đầu vào null")
    void sha256Hex_NullInputs() {
        assertThatThrownBy(() -> HashUtils.sha256Hex((Path) null))
                .isInstanceOf(IllegalArgumentException.class);

        assertThatThrownBy(() -> HashUtils.sha256Hex((byte[]) null))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
