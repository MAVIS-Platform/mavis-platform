package com.mavis.analyzer.javaanalyzer.parser;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.stream.Stream;

@Component
@Slf4j
public class JavaSourceParser {

    public void parseProject(String extractedPath) {
        if (extractedPath == null || extractedPath.isBlank()) {
            log.warn("Đường dẫn trích xuất mã nguồn trống hoặc không hợp lệ: {}", extractedPath);
            return;
        }

        Path rootPath = Paths.get(extractedPath);
        if (!Files.exists(rootPath) || !Files.isDirectory(rootPath)) {
            log.warn("Đường dẫn trích xuất không tồn tại hoặc không phải là thư mục: {}", extractedPath);
            return;
        }

        log.info("Bắt đầu duyệt và phân tích các file .java trong thư mục: {}", extractedPath);

        try (Stream<Path> stream = Files.walk(rootPath)) {
            stream.filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().toLowerCase().endsWith(".java"))
                    .forEach(this::parseJavaFile);
        } catch (IOException e) {
            log.error("Lỗi khi duyệt thư mục dự án: {}", extractedPath, e);
        }
    }

    private void parseJavaFile(Path javaFile) {
        try {
            StringBuilder codeBuilder = new StringBuilder();
            try (BufferedReader reader = Files.newBufferedReader(javaFile, StandardCharsets.UTF_8)) {
                char[] buffer = new char[8192];
                int charsRead;
                while ((charsRead = reader.read(buffer)) != -1) {
                    codeBuilder.append(buffer, 0, charsRead);
                }
            }

            String sourceCode = codeBuilder.toString();
            CompilationUnit cu = StaticJavaParser.parse(sourceCode);
            log.info("Phân tích cú pháp thành công file Java: {}", javaFile.toAbsolutePath());

            new com.mavis.analyzer.javaanalyzer.visitor.ControllerVisitor().visit(cu, null);
            new com.mavis.analyzer.javaanalyzer.visitor.FeignClientVisitor().visit(cu, null);
        } catch (Exception e) {
            log.error("Lỗi khi phân tích cú pháp file Java: {}", javaFile.toAbsolutePath(), e);
        }
    }
}
