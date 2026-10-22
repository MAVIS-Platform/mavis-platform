package com.mavis.analyzer.javaanalyzer.parser;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import com.mavis.analyzer.javaanalyzer.visitor.CodeDependencyVisitor;
import com.mavis.analyzer.javaanalyzer.visitor.ControllerVisitor;
import com.mavis.analyzer.javaanalyzer.visitor.DatabaseAccessVisitor;
import com.mavis.analyzer.javaanalyzer.visitor.HttpClientVisitor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

@Component
@Slf4j
public class JavaSourceParser {

    public List<CodeEvidenceDTO> parseProject(String extractedPath) {
        List<CodeEvidenceDTO> allEvidences = new ArrayList<>();

        if (extractedPath == null || extractedPath.isBlank()) {
            log.warn("Đường dẫn trích xuất mã nguồn trống hoặc không hợp lệ: {}", extractedPath);
            return allEvidences;
        }

        Path rootPath = Paths.get(extractedPath);
        if (!Files.exists(rootPath) || !Files.isDirectory(rootPath)) {
            log.warn("Đường dẫn trích xuất không tồn tại hoặc không phải là thư mục: {}", extractedPath);
            return allEvidences;
        }

        log.info("Bắt đầu duyệt và phân tích các file .java trong thư mục: {}", extractedPath);

        try (Stream<Path> stream = Files.walk(rootPath)) {
            stream.filter(Files::isRegularFile)
                    // BR-26: Bỏ qua hoàn toàn thư mục test, target, build, .git
                    .filter(path -> !isIgnoredPath(path))
                    .filter(path -> path.getFileName().toString().toLowerCase().endsWith(".java"))
                    .forEach(file -> parseJavaFile(file, allEvidences));
        } catch (IOException e) {
            log.error("Lỗi khi duyệt thư mục dự án: {}", extractedPath, e);
        }

        log.info("Đã hoàn tất phân tích AST. Tổng số code evidences trích xuất được: {}", allEvidences.size());
        return allEvidences;
    }

    private void parseJavaFile(Path javaFile, List<CodeEvidenceDTO> allEvidences) {
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
            String currentFilePath = javaFile.toAbsolutePath().toString();

            // Thực thi đủ 4 AST Visitors
            new ControllerVisitor(currentFilePath).visit(cu, allEvidences);
            new HttpClientVisitor(currentFilePath).visit(cu, allEvidences);
            new CodeDependencyVisitor(currentFilePath).visit(cu, allEvidences);
            new DatabaseAccessVisitor(currentFilePath).visit(cu, allEvidences);
        } catch (Exception e) {
            log.error("Lỗi khi phân tích cú pháp file Java: {}", javaFile.toAbsolutePath(), e);
        }
    }

    public static boolean isIgnoredPath(Path path) {
        String normalized = path.toString().replace('\\', '/').toLowerCase();
        return normalized.contains("/test/")
                || normalized.contains("/target/")
                || normalized.contains("/build/")
                || normalized.contains("/.git/")
                || normalized.endsWith("/test")
                || normalized.endsWith("/target")
                || normalized.endsWith("/build");
    }
}
