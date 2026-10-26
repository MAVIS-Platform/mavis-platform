package com.mavis.analyzer.javaanalyzer.visitor;

import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.type.Type;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import java.util.*;

/** Type-use evidence, separate from runtime calls or injection semantics. */
public final class ProjectTypeDependencyVisitor extends VoidVisitorAdapter<List<CodeEvidenceDTO>> {
    private final String file;
    public ProjectTypeDependencyVisitor(String file) { this.file = file; }

    @Override public void visit(ClassOrInterfaceDeclaration owner, List<CodeEvidenceDTO> output) {
        Set<String> seen = new LinkedHashSet<>();
        Set<String> parameters = new HashSet<>();
        owner.getTypeParameters().forEach(p -> parameters.add(p.getNameAsString()));
        owner.getExtendedTypes().forEach(type -> emit(owner, type, "SUPER_TYPE_REFERENCE", parameters, seen, output));
        owner.getImplementedTypes().forEach(type -> emit(owner, type, "INTERFACE_TYPE_REFERENCE", parameters, seen, output));
        owner.getFields().forEach(f -> emit(owner, f.getElementType(), "FIELD_TYPE_REFERENCE", parameters, seen, output));
        owner.getConstructors().forEach(c -> c.getParameters().forEach(p -> emit(owner, p.getType(), "CONSTRUCTOR_TYPE_REFERENCE", parameters, seen, output)));
        owner.getMethods().forEach(m -> {
            Set<String> methodParameters = new HashSet<>(parameters);
            m.getTypeParameters().forEach(p -> methodParameters.add(p.getNameAsString()));
            emit(owner, m.getType(), m.isAnnotationPresent("Bean") ? "BEAN_TYPE_REFERENCE" : "RETURN_TYPE_REFERENCE", methodParameters, seen, output);
            m.getParameters().forEach(p -> emit(owner, p.getType(), m.isAnnotationPresent("Bean") ? "BEAN_TYPE_REFERENCE" : "PARAMETER_TYPE_REFERENCE", methodParameters, seen, output));
        });
        super.visit(owner, output);
    }

    private void emit(ClassOrInterfaceDeclaration owner, Type type, String kind, Set<String> parameters,
                      Set<String> seen, List<CodeEvidenceDTO> output) {
        for (var reference : type.findAll(ClassOrInterfaceType.class)) {
            // Scoped qualifier nodes (e.g. com.acme) are not separate referenced types.
            if (reference.getParentNode().orElse(null) instanceof ClassOrInterfaceType parent && parent.getScope().orElse(null) == reference) continue;
            String target = reference.getNameWithScope();
            if (parameters.contains(target) || target.equals(owner.getNameAsString()) || !seen.add(target)) continue;
            output.add(CodeEvidenceDTO.builder().elementType("UML_RELATIONSHIP")
                    .identifier(owner.getNameAsString() + " -> " + target)
                    .sourceComponent(owner.getNameAsString()).targetComponent(target)
                    .qualifiedName(owner.getFullyQualifiedName().orElse(owner.getNameAsString()))
                    .filePath(file).lineNumber(reference.getBegin().map(p -> p.line).orElse(1))
                    .codeSnippet(type.asString()).metadata(Map.of("umlRelationKind", "DEPENDENCY", "dependencyKind", kind,
                            "declaredType", type.asString(), "provenance", "SOURCE_EXTRACTED"))
                    .build());
        }
    }
}
