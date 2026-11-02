package com.mavis.analyzer.javaanalyzer.visitor;

import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.ConstructorDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import lombok.extern.slf4j.Slf4j;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Slf4j
public class CodeDependencyVisitor extends VoidVisitorAdapter<List<CodeEvidenceDTO>> {

    private static final Set<String> IGNORED_TYPES = Set.of(
            "String", "int", "Integer", "long", "Long", "double", "Double", "float", "Float",
            "boolean", "Boolean", "byte", "short", "char", "Character", "Object", "UUID",
            "List", "Map", "Set", "Collection", "Optional", "CompletableFuture",
            "HttpServletRequest", "HttpServletResponse", "HttpSession", "Model",
            "ObjectMapper", "Logger", "ApplicationEventPublisher"
    );

    private final String currentFilePath;

    public CodeDependencyVisitor() {
        this(null);
    }

    public CodeDependencyVisitor(String currentFilePath) {
        this.currentFilePath = currentFilePath;
    }

    @Override
    public void visit(ClassOrInterfaceDeclaration n, List<CodeEvidenceDTO> arg) {
        if (arg == null || n.isInterface()) {
            super.visit(n, arg);
            return;
        }

        String className = n.getNameAsString();
        boolean isService = n.isAnnotationPresent("Service");
        boolean isComponent = n.isAnnotationPresent("Component");

        // 1. Nếu là @Service hoặc @Component, ghi nhận component
        if (isService || isComponent) {
            Integer line = n.getBegin().map(p -> p.line).orElse(null);
            String anns = n.getAnnotations().stream().map(Object::toString).collect(java.util.stream.Collectors.joining("\n"));
            String decl = (n.isPublic() ? "public " : "") + "class " + className;
            String snippet = anns.isEmpty() ? decl : anns + "\n" + decl;

            log.info("Detected Component [Service/Component]: {}", className);
            arg.add(CodeEvidenceDTO.builder()
                    .elementType(isService ? "SERVICE_COMPONENT" : "GENERAL_COMPONENT")
                    .identifier(className)
                    .sourceComponent(className).qualifiedName(n.getFullyQualifiedName().orElse(className))
                    .filePath(currentFilePath)
                    .lineNumber(line)
                    .codeSnippet(snippet.length() > 500 ? snippet.substring(0, 500) : snippet)
                    .build());
        }

        // 2. Thu thập các dependency được inject (Constructor Injection, Lombok, @Autowired)
        Set<String> detectedDependencies = new HashSet<>();
        boolean hasRequiredArgs = n.isAnnotationPresent("RequiredArgsConstructor");
        boolean hasAllArgs = n.isAnnotationPresent("AllArgsConstructor");

        // a. Constructor Injection
        for (ConstructorDeclaration constructor : n.getConstructors()) {
            for (Parameter param : constructor.getParameters()) {
                String typeName = cleanTypeName(param.getTypeAsString());
                if (isComponentDependency(typeName) && detectedDependencies.add(typeName)) {
                    Integer line = param.getBegin().map(p -> p.line).orElse(constructor.getBegin().map(p -> p.line).orElse(null));
                    log.info("Detected Code Dependency via Constructor: {} -> {}", className, typeName);

                    arg.add(CodeEvidenceDTO.builder()
                            .elementType("CODE_DEPENDENCY")
                            .identifier(className + " -> " + typeName)
                            .sourceComponent(className).qualifiedName(n.getFullyQualifiedName().orElse(className))
                            .targetComponent(typeName)
                            .filePath(currentFilePath)
                            .lineNumber(line)
                            .codeSnippet(param.toString())
                            .build());
                }
            }
        }

        // b. Field Injection hoặc Lombok Fields (@RequiredArgsConstructor, @AllArgsConstructor, @Autowired)
        for (FieldDeclaration field : n.getFields()) {
            if (field.isStatic()) {
                continue;
            }

            boolean isAutowired = field.isAnnotationPresent("Autowired") || field.isAnnotationPresent("Inject");
            boolean isLombokInjected = (hasRequiredArgs && field.isFinal()) || hasAllArgs;

            if (isAutowired || isLombokInjected) {
                String typeName = cleanTypeName(field.getElementType().asString());
                if (isComponentDependency(typeName) && detectedDependencies.add(typeName)) {
                    Integer line = field.getBegin().map(p -> p.line).orElse(null);
                    log.info("Detected Code Dependency via Field/Lombok: {} -> {}", className, typeName);

                    arg.add(CodeEvidenceDTO.builder()
                            .elementType("CODE_DEPENDENCY")
                            .identifier(className + " -> " + typeName)
                            .sourceComponent(className).qualifiedName(n.getFullyQualifiedName().orElse(className))
                            .targetComponent(typeName)
                            .filePath(currentFilePath)
                            .lineNumber(line)
                            .codeSnippet(field.toString())
                            .build());
                }
            }
        }

        super.visit(n, arg);
    }

    private boolean isComponentDependency(String typeName) {
        if (typeName == null || typeName.isBlank()) {
            return false;
        }
        String simpleName = typeName.substring(typeName.lastIndexOf('.') + 1);
        if (IGNORED_TYPES.contains(simpleName)) {
            return false;
        }
        // Phải là một class/interface PascalCase hợp lệ
        return Character.isUpperCase(simpleName.charAt(0));
    }

    private String cleanTypeName(String rawType) {
        if (rawType == null) return "";
        String trimmed = rawType.trim();
        // Bỏ generic nếu có, ví dụ Optional<OrderRepository> -> OrderRepository
        int genericStart = trimmed.indexOf('<');
        if (genericStart != -1) {
            int genericEnd = trimmed.lastIndexOf('>');
            if (genericEnd > genericStart) {
                String inner = trimmed.substring(genericStart + 1, genericEnd).trim();
                // Nếu là kiểu bọc như Optional<T>, lấy T
                if (trimmed.startsWith("Optional") || trimmed.startsWith("List") || trimmed.startsWith("Set")) {
                    return cleanTypeName(inner);
                }
            }
            trimmed = trimmed.substring(0, genericStart).trim();
        }
        return trimmed;
    }
}
