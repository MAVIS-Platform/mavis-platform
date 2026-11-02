package com.mavis.analyzer.javaanalyzer.visitor;

import com.github.javaparser.ast.NodeList;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.Expression;
import com.github.javaparser.ast.expr.MemberValuePair;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import lombok.extern.slf4j.Slf4j;

import java.util.List;
import java.util.Optional;
import java.util.Set;

@Slf4j
public class DatabaseAccessVisitor extends VoidVisitorAdapter<List<CodeEvidenceDTO>> {

    private static final Set<String> REPO_SUPER_INTERFACES = Set.of(
            "JpaRepository", "CrudRepository", "MongoRepository", "PagingAndSortingRepository",
            "ListCrudRepository", "ListPagingAndSortingRepository", "ReactiveMongoRepository",
            "ReactiveCrudRepository", "Repository"
    );

    private final String currentFilePath;

    public DatabaseAccessVisitor() {
        this(null);
    }

    public DatabaseAccessVisitor(String currentFilePath) {
        this.currentFilePath = currentFilePath;
    }

    @Override
    public void visit(ClassOrInterfaceDeclaration n, List<CodeEvidenceDTO> arg) {
        if (arg == null) {
            super.visit(n, arg);
            return;
        }

        String name = n.getNameAsString();

        // 1. Kiểm tra Repository (Interface kế thừa Spring Data hoặc có @Repository)
        boolean isRepoInterface = n.isInterface() && extendsSpringDataRepository(n);
        boolean hasRepoAnnotation = n.isAnnotationPresent("Repository");

        if (isRepoInterface || hasRepoAnnotation) {
            String managedEntity = extractManagedEntity(n);
            Integer line = n.getBegin().map(p -> p.line).orElse(null);
            String snippet = declarationSnippet(n);

            log.info("Detected Database Repository: {} (managed entity: {})", name, managedEntity);

            arg.add(CodeEvidenceDTO.builder()
                    .elementType("DATABASE_REPOSITORY")
                    .identifier(name)
                    .sourceComponent(name)
                    .targetComponent(managedEntity != null ? managedEntity : "DATABASE")
                    .filePath(currentFilePath)
                    .lineNumber(line)
                    .codeSnippet(snippet.length() > 500 ? snippet.substring(0, 500) : snippet)
                    .build());
        }

        // 2. Kiểm tra Entity (@Entity hoặc @Table hoặc @Document)
        boolean isEntity = n.isAnnotationPresent("Entity") || n.isAnnotationPresent("Table") || n.isAnnotationPresent("Document");
        if (isEntity && !n.isInterface()) {
            String tableName = extractTableName(n);
            Integer line = n.getBegin().map(p -> p.line).orElse(null);
            String snippet = declarationSnippet(n);

            log.info("Detected Database Entity: {} (table: {})", name, tableName);

            arg.add(CodeEvidenceDTO.builder()
                    .elementType("DATABASE_ENTITY")
                    .identifier(tableName)
                    .sourceComponent(name)
                    .targetComponent(tableName)
                    .filePath(currentFilePath)
                    .lineNumber(line)
                    .codeSnippet(snippet.length() > 500 ? snippet.substring(0, 500) : snippet)
                    .build());
        }

        super.visit(n, arg);
    }

    private static String declarationSnippet(ClassOrInterfaceDeclaration n) {
        String anns = n.getAnnotations().stream()
                .map(AnnotationExpr::toString)
                .collect(java.util.stream.Collectors.joining("\n"));
        String decl = (n.isPublic() ? "public " : "") + (n.isInterface() ? "interface " : "class ") + n.getNameAsString();
        return anns.isEmpty() ? decl : anns + "\n" + decl;
    }

    private boolean extendsSpringDataRepository(ClassOrInterfaceDeclaration n) {
        for (ClassOrInterfaceType extendedType : n.getExtendedTypes()) {
            String typeName = extendedType.getNameAsString();
            if (REPO_SUPER_INTERFACES.contains(typeName) || typeName.endsWith("Repository")) {
                return true;
            }
        }
        return false;
    }

    private String extractManagedEntity(ClassOrInterfaceDeclaration n) {
        for (ClassOrInterfaceType extendedType : n.getExtendedTypes()) {
            Optional<NodeList<com.github.javaparser.ast.type.Type>> typeArgsOpt = extendedType.getTypeArguments();
            if (typeArgsOpt.isPresent() && !typeArgsOpt.get().isEmpty()) {
                return typeArgsOpt.get().get(0).asString();
            }
        }
        return null;
    }

    private String extractTableName(ClassOrInterfaceDeclaration n) {
        Optional<AnnotationExpr> tableOpt = n.getAnnotationByName("Table");
        if (tableOpt.isPresent()) {
            String tbl = extractAttribute(tableOpt.get(), "name");
            if (tbl != null && !tbl.isBlank()) {
                return tbl;
            }
        }

        Optional<AnnotationExpr> docOpt = n.getAnnotationByName("Document");
        if (docOpt.isPresent()) {
            String col = extractAttribute(docOpt.get(), "collection");
            if (col != null && !col.isBlank()) {
                return col;
            }
        }

        return n.getNameAsString();
    }

    private String extractAttribute(AnnotationExpr annotation, String attributeName) {
        if (annotation.isSingleMemberAnnotationExpr()) {
            return stripQuotes(annotation.asSingleMemberAnnotationExpr().getMemberValue().toString());
        } else if (annotation.isNormalAnnotationExpr()) {
            for (MemberValuePair pair : annotation.asNormalAnnotationExpr().getPairs()) {
                if (attributeName.equals(pair.getNameAsString())) {
                    return stripQuotes(pair.getValue().toString());
                }
            }
        }
        return null;
    }

    private String stripQuotes(String s) {
        if (s == null) return "";
        s = s.trim();
        if ((s.startsWith("\"") && s.endsWith("\"")) || (s.startsWith("'") && s.endsWith("'"))) {
            if (s.length() >= 2) {
                return s.substring(1, s.length() - 1).trim();
            }
        }
        return s;
    }
}
