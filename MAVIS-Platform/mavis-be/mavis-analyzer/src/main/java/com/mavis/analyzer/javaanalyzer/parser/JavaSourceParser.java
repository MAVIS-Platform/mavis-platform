package com.mavis.analyzer.javaanalyzer.parser;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import com.mavis.analyzer.javaanalyzer.visitor.CodeDependencyVisitor;
import com.mavis.analyzer.javaanalyzer.visitor.BeanMessagingVisitor;
import java.util.Map;
import java.util.Set;
import java.util.HashMap;
import java.util.HashSet;
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
        Map<String,String> constants = new HashMap<>();
        Set<String> localTypes = new HashSet<>();

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
                    .sorted()
                    .forEach(file -> parseJavaFile(file, allEvidences, constants, localTypes));
        } catch (IOException e) {
            log.error("Lỗi khi duyệt thư mục dự án: {}", extractedPath, e);
        }

        for (var evidence:allEvidences) {
            if("BEAN_COMPONENT".equals(evidence.getElementType())) {
                var matches=evidence.getSymbolCandidates().stream().filter(localTypes::contains).distinct().toList();
                if(matches.size()==1) {evidence.setElementType("GENERAL_COMPONENT");evidence.setQualifiedName(matches.get(0));}
            } else if("CODE_DEPENDENCY".equals(evidence.getElementType())) {
                var matches=evidence.getSymbolCandidates().stream().filter(localTypes::contains).distinct().toList();
                if(matches.size()==1)evidence.setTargetComponent(matches.get(0));
                evidence.setSourceComponent(evidence.getQualifiedName());
            } else if(evidence.getElementType().startsWith("MESSAGE_")&&evidence.getIdentifier().isBlank()) {
                var values=evidence.getSymbolCandidates().stream().filter(constants::containsKey).map(constants::get).filter(java.util.Objects::nonNull).distinct().toList();
                if(values.size()==1)evidence.setIdentifier(values.get(0));
                else evidence.setElementType("UNRESOLVED_MESSAGE_CHANNEL");
            }
        }
        allEvidences.removeIf(e->"BEAN_COMPONENT".equals(e.getElementType()));
        log.info("Đã hoàn tất phân tích AST. Tổng số code evidences trích xuất được: {}", allEvidences.size());
        return allEvidences;
    }

    private void parseJavaFile(Path javaFile, List<CodeEvidenceDTO> allEvidences, Map<String,String> constants, Set<String> localTypes) {
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

            for (var type:cu.findAll(com.github.javaparser.ast.body.ClassOrInterfaceDeclaration.class)) {
                String qualified=type.getFullyQualifiedName().orElse(type.getNameAsString());localTypes.add(qualified);
                for(var field:type.getFields())if((field.isStatic()&&field.isFinal())||type.isInterface())for(var variable:field.getVariables())variable.getInitializer().filter(value->value.isStringLiteralExpr()).ifPresent(value->{String key=qualified+"."+variable.getNameAsString(),literal=value.asStringLiteralExpr().asString();if(!constants.containsKey(key))constants.put(key,literal);else if(!java.util.Objects.equals(constants.get(key),literal))constants.put(key,null);});
            }
            int evidenceStart = allEvidences.size();
            // Thực thi đủ 4 AST Visitors
            new BeanMessagingVisitor(currentFilePath).visit(cu, allEvidences);
            new ControllerVisitor(currentFilePath).visit(cu, allEvidences);
            new HttpClientVisitor(currentFilePath).visit(cu, allEvidences);
            new CodeDependencyVisitor(currentFilePath).visit(cu, allEvidences);
            new DatabaseAccessVisitor(currentFilePath).visit(cu, allEvidences);
            String packageName = cu.getPackageDeclaration().map(p -> p.getNameAsString() + ".").orElse("");
            for (int i = evidenceStart; i < allEvidences.size(); i++) {
                CodeEvidenceDTO evidence = allEvidences.get(i);
                String symbol = evidence.getSourceComponent() != null ? evidence.getSourceComponent() : evidence.getIdentifier();
                evidence.setQualifiedName(packageName + symbol);
                if("CODE_DEPENDENCY".equals(evidence.getElementType()))evidence.setSymbolCandidates(BeanMessagingVisitor.candidates(cu,evidence.getTargetComponent()));
            }
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
