package com.mavis.analyzer.javaanalyzer.parser;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.nio.file.Paths;

import static org.assertj.core.api.Assertions.assertThat;

class JavaSourceParserTest {

    @Test
    @DisplayName("Should ignore test, target, build, and .git folders per BR-26")
    void shouldIgnoreForbiddenPaths() {
        // Test paths
        assertThat(JavaSourceParser.isIgnoredPath(Paths.get("C:/project/src/test/java/TestClass.java"))).isTrue();
        assertThat(JavaSourceParser.isIgnoredPath(Paths.get("C:\\project\\src\\test\\java\\TestClass.java"))).isTrue();

        // Target paths
        assertThat(JavaSourceParser.isIgnoredPath(Paths.get("/project/target/classes/App.java"))).isTrue();
        assertThat(JavaSourceParser.isIgnoredPath(Paths.get("C:\\project\\target\\classes\\App.java"))).isTrue();

        // Build paths
        assertThat(JavaSourceParser.isIgnoredPath(Paths.get("/project/build/classes/App.java"))).isTrue();

        // .git paths
        assertThat(JavaSourceParser.isIgnoredPath(Paths.get("/project/.git/HEAD"))).isTrue();

        // Allowed main production source paths
        assertThat(JavaSourceParser.isIgnoredPath(Paths.get("/project/src/main/java/OrderService.java"))).isFalse();
        assertThat(JavaSourceParser.isIgnoredPath(Paths.get("C:\\project\\src\\main\\java\\OrderService.java"))).isFalse();
    }
}
