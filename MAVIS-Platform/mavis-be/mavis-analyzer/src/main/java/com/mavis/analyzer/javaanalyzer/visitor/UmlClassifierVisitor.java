package com.mavis.analyzer.javaanalyzer.visitor;

import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.Modifier;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.*;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.type.Type;
import com.github.javaparser.ast.type.TypeParameter;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Extracts UML 2.5.1 Classifier & Package facts (M4), Method Control-Flow Graph facts (M6),
 * and State Lifecycle transition patterns (M7) from Java AST with strict evidence provenance.
 */
public class UmlClassifierVisitor extends VoidVisitorAdapter<List<CodeEvidenceDTO>> {

    private static final Set<String> PRIMITIVE_OR_BUILT_IN = Set.of(
            "void", "boolean", "Boolean", "byte", "Byte", "short", "Short", "int", "Integer",
            "long", "Long", "float", "Float", "double", "Double", "char", "Character",
            "String", "Object", "UUID", "BigDecimal", "BigInteger", "Instant", "LocalDate",
            "LocalDateTime", "ZonedDateTime", "OffsetDateTime", "Duration",
            "List", "ArrayList", "LinkedList", "Set", "HashSet", "LinkedHashSet", "TreeSet",
            "Map", "HashMap", "LinkedHashMap", "TreeMap", "Collection", "Iterable", "Iterator",
            "Optional", "Stream", "CompletableFuture", "Future",
            "HttpServletRequest", "HttpServletResponse", "HttpSession", "Model",
            "ResponseEntity", "Page", "Pageable", "PageRequest", "Sort",
            "ObjectMapper", "Logger", "ApplicationEventPublisher"
    );

    private static final Set<String> COLLECTION_WRAPPERS = Set.of(
            "List", "ArrayList", "LinkedList", "Set", "HashSet", "LinkedHashSet",
            "TreeSet", "Collection", "Iterable"
    );

    private static final Set<String> REPO_SUPER_INTERFACES = Set.of(
            "JpaRepository", "CrudRepository", "MongoRepository", "PagingAndSortingRepository",
            "ListCrudRepository", "ListPagingAndSortingRepository", "ReactiveMongoRepository",
            "ReactiveCrudRepository", "Repository"
    );

    private final String currentFilePath;

    public UmlClassifierVisitor(String currentFilePath) {
        this.currentFilePath = currentFilePath;
    }

    @Override
    public void visit(ClassOrInterfaceDeclaration n, List<CodeEvidenceDTO> arg) {
        if (arg == null) {
            super.visit(n, arg);
            return;
        }
        CompilationUnit cu = n.findCompilationUnit().orElse(null);
        String packageName = cu != null ? cu.getPackageDeclaration().map(p -> p.getNameAsString()).orElse("") : "";
        String simpleName = n.getNameAsString();
        String qualifiedName = n.getFullyQualifiedName().orElse(packageName.isEmpty() ? simpleName : packageName + "." + simpleName);
        int line = n.getBegin().map(p -> p.line).orElse(1);

        // Determine visibility strictly from Java AST modifiers (never conflate package-private with C# internal)
        String visibility = resolveVisibility(n.getModifiers(), n.isInterface());
        String visibilitySymbol = visibilitySymbol(visibility);
        String languageVisibility = languageVisibility(visibility);

        // Determine typeKind strictly from AST declaration (NEVER from leading 'I' prefix)
        String typeKind = n.isInterface() ? "INTERFACE" : "CLASS";
        boolean isAbstract = n.isInterface() || n.isAbstract();
        boolean isStatic = n.isStatic();

        List<String> typeParameters = n.getTypeParameters().stream()
                .map(TypeParameter::getNameAsString)
                .toList();

        List<Map<String, Object>> members = new ArrayList<>();
        Set<String> associatedTargetTypes = new LinkedHashSet<>();

        // 1. Fields -> ATTRIBUTE compartment + structural ASSOCIATION candidates
        for (FieldDeclaration field : n.getFields()) {
            String fVis = resolveVisibility(field.getModifiers(), n.isInterface());
            String fVisSymbol = visibilitySymbol(fVis);
            String fLangVis = languageVisibility(fVis);
            boolean fStatic = field.isStatic() || n.isInterface();
            boolean fFinal = field.isFinal() || n.isInterface();
            String rawType = field.getElementType().asString();
            String refTarget = extractReferencedDomainType(rawType, typeParameters);
            boolean isCollection = isCollectionType(rawType);
            int fLine = field.getBegin().map(p -> p.line).orElse(line);

            for (VariableDeclarator varDecl : field.getVariables()) {
                String fieldName = varDecl.getNameAsString();
                String defaultVal = varDecl.getInitializer()
                        .filter(expr -> expr.isLiteralExpr() || expr.isFieldAccessExpr() || expr.isNameExpr())
                        .map(Expression::toString)
                        .orElse(null);
                String signature = fieldName + ": " + rawType;

                Map<String, Object> memberMap = new LinkedHashMap<>();
                memberMap.put("memberKind", "FIELD");
                memberMap.put("name", fieldName);
                memberMap.put("type", rawType);
                memberMap.put("returnType", null);
                memberMap.put("parameters", List.of());
                memberMap.put("genericArity", 0);
                memberMap.put("signature", signature);
                memberMap.put("visibility", fVis);
                memberMap.put("visibilitySymbol", fVisSymbol);
                memberMap.put("languageVisibility", fLangVis);
                memberMap.put("isStatic", fStatic);
                memberMap.put("isAbstract", false);
                memberMap.put("isReadOnly", fFinal);
                memberMap.put("isDerived", false);
                memberMap.put("defaultValue", defaultVal);
                memberMap.put("referencedTargetType", refTarget);
                memberMap.put("isCollectionType", isCollection);
                memberMap.put("line", fLine);
                members.add(memberMap);

                // Emit structural ASSOCIATION for non-static member fields referencing another domain/project type
                if (!fStatic && refTarget != null && !refTarget.equals(simpleName)) {
                    associatedTargetTypes.add(refTarget);
                    String ownership = verifiedFieldOwnership(n, field);
                    CodeEvidenceDTO relation = emitUmlRelationship(
                            arg, cu, simpleName, qualifiedName, refTarget,
                            ownership == null ? "ASSOCIATION" : "COMPOSITION", fieldName, fieldName, signature,
                            rawType, isCollection, fLine, field.toString()
                    );
                    relation.getMetadata().put("injectedReference", hasAnnotation(field, Set.of("Autowired", "Inject", "Resource")) || isIocType(n));
                    if (ownership != null) {
                        relation.getMetadata().put("astVerifiedWholePart", true);
                        relation.getMetadata().put("ownershipEvidence", ownership);
                    }
                }
            }
        }

        // 2. Constructors -> OPERATION compartment + DEPENDENCY candidates (only if not already an associated field)
        for (ConstructorDeclaration ctor : n.getConstructors()) {
            String cVis = resolveVisibility(ctor.getModifiers(), false);
            String cVisSymbol = visibilitySymbol(cVis);
            String cLangVis = languageVisibility(cVis);
            int cLine = ctor.getBegin().map(p -> p.line).orElse(line);
            List<Map<String, String>> params = new ArrayList<>();
            List<String> paramSigParts = new ArrayList<>();

            for (Parameter param : ctor.getParameters()) {
                String pType = param.getTypeAsString();
                String pName = param.getNameAsString();
                params.add(Map.of("name", pName, "type", pType));
                paramSigParts.add(pName + ": " + pType);

                String refTarget = extractReferencedDomainType(pType, typeParameters);
                if (refTarget != null && !refTarget.equals(simpleName) && !associatedTargetTypes.contains(refTarget)) {
                    emitUmlRelationship(
                            arg, cu, simpleName, qualifiedName, refTarget,
                            "DEPENDENCY", null, simpleName + "(" + pName + ")",
                            simpleName + "(" + String.join(", ", paramSigParts) + ")",
                            pType, isCollectionType(pType), cLine, param.toString()
                    );
                }
            }

            String signature = simpleName + "(" + String.join(", ", paramSigParts) + ")";
            Map<String, Object> ctorMap = new LinkedHashMap<>();
            ctorMap.put("memberKind", "CONSTRUCTOR");
            ctorMap.put("name", simpleName);
            ctorMap.put("type", simpleName);
            ctorMap.put("returnType", null);
            ctorMap.put("parameters", params);
            ctorMap.put("genericArity", ctor.getTypeParameters().size());
            ctorMap.put("signature", signature);
            ctorMap.put("visibility", cVis);
            ctorMap.put("visibilitySymbol", cVisSymbol);
            ctorMap.put("languageVisibility", cLangVis);
            ctorMap.put("isStatic", false);
            ctorMap.put("isAbstract", false);
            ctorMap.put("isReadOnly", false);
            ctorMap.put("isDerived", false);
            ctorMap.put("defaultValue", null);
            ctorMap.put("line", cLine);
            members.add(ctorMap);
        }

        // 3. Methods / Operations -> OPERATION compartment (preserving all overloads!) + DEPENDENCY + M6 CFG
        List<Map<String, Object>> methodsCfg = new ArrayList<>();
        for (MethodDeclaration method : n.getMethods()) {
            String mName = method.getNameAsString();
            String mVis = resolveVisibility(method.getModifiers(), n.isInterface());
            String mVisSymbol = visibilitySymbol(mVis);
            String mLangVis = languageVisibility(mVis);
            boolean mStatic = method.isStatic();
            boolean mAbstract = method.isAbstract() || (n.isInterface() && !method.isDefault() && !mStatic);
            String retType = method.getTypeAsString();
            int mLine = method.getBegin().map(p -> p.line).orElse(line);

            List<Map<String, String>> params = new ArrayList<>();
            List<String> paramSigParts = new ArrayList<>();
            for (Parameter param : method.getParameters()) {
                String pType = param.getTypeAsString();
                String pName = param.getNameAsString();
                params.add(Map.of("name", pName, "type", pType));
                paramSigParts.add(pName + ": " + pType);

                String refTarget = extractReferencedDomainType(pType, typeParameters);
                if (refTarget != null && !refTarget.equals(simpleName) && !associatedTargetTypes.contains(refTarget)) {
                    emitUmlRelationship(
                            arg, cu, simpleName, qualifiedName, refTarget,
                            "DEPENDENCY", null, mName,
                            mName + "(" + String.join(", ", paramSigParts) + "): " + retType,
                            pType, isCollectionType(pType), mLine, method.getDeclarationAsString()
                    );
                }
            }

            String retRefTarget = extractReferencedDomainType(retType, typeParameters);
            if (retRefTarget != null && !retRefTarget.equals(simpleName) && !associatedTargetTypes.contains(retRefTarget)) {
                emitUmlRelationship(
                        arg, cu, simpleName, qualifiedName, retRefTarget,
                        "DEPENDENCY", null, mName,
                        mName + "(" + String.join(", ", paramSigParts) + "): " + retType,
                        retType, isCollectionType(retType), mLine, method.getDeclarationAsString()
                );
            }

            String signature = mName + "(" + String.join(", ", paramSigParts) + "): " + retType;
            Map<String, Object> opMap = new LinkedHashMap<>();
            opMap.put("memberKind", "OPERATION");
            opMap.put("name", mName);
            opMap.put("endpointDeclarations", method.getAnnotations().stream().map(Object::toString).filter(a -> a.matches("(?s)@(Get|Post|Put|Delete|Patch|Request)Mapping.*")).toList());
            opMap.put("accessDeclarations", method.getAnnotations().stream().filter(a -> java.util.Set.of("PreAuthorize", "Secured", "RolesAllowed").contains(a.getName().getIdentifier())).map(Object::toString).toList());
            opMap.put("type", retType);
            opMap.put("returnType", retType);
            opMap.put("parameters", params);
            opMap.put("genericArity", method.getTypeParameters().size());
            opMap.put("signature", signature);
            opMap.put("visibility", mVis);
            opMap.put("visibilitySymbol", mVisSymbol);
            opMap.put("languageVisibility", mLangVis);
            opMap.put("isStatic", mStatic);
            opMap.put("isAbstract", mAbstract);
            opMap.put("isReadOnly", false);
            opMap.put("isDerived", false);
            opMap.put("defaultValue", null);
            opMap.put("line", mLine);
            members.add(opMap);

            // M6: Extract Method Control-Flow Graph if body is present
            if (method.getBody().isPresent()) {
                methodsCfg.add(extractMethodCfg(method, simpleName, qualifiedName, signature));
            }
        }

        // 4. Inheritance & Realization
        for (ClassOrInterfaceType ext : n.getExtendedTypes()) {
            String extName = ext.getNameAsString();
            if (REPO_SUPER_INTERFACES.contains(extName)) {
                // Spring Data repository interface; check type arguments for entity dependency
                ext.getTypeArguments().ifPresent(typeArgs -> {
                    if (!typeArgs.isEmpty()) {
                        String entityType = extractReferencedDomainType(typeArgs.get(0).asString(), typeParameters);
                        if (entityType != null && !entityType.equals(simpleName)) {
                            emitUmlRelationship(
                                    arg, cu, simpleName, qualifiedName, entityType,
                                    "DEPENDENCY", null, "manages",
                                    ext.asString(), entityType, false,
                                    ext.getBegin().map(p -> p.line).orElse(line), ext.toString()
                            );
                        }
                    }
                });
                continue;
            }
            emitUmlRelationship(
                    arg, cu, simpleName, qualifiedName, extName,
                    "GENERALIZATION", null, null,
                    "extends " + ext.asString(), ext.asString(), false,
                    ext.getBegin().map(p -> p.line).orElse(line),
                    (n.isInterface() ? "interface " : "class ") + simpleName + " extends " + ext.asString()
            );
        }

        for (ClassOrInterfaceType impl : n.getImplementedTypes()) {
            String implName = impl.getNameAsString();
            emitUmlRelationship(
                    arg, cu, simpleName, qualifiedName, implName,
                    "REALIZATION", null, null,
                    "implements " + impl.asString(), impl.asString(), false,
                    impl.getBegin().map(p -> p.line).orElse(line),
                    "class " + simpleName + " implements " + impl.asString()
            );
        }

        // 5. M7: Extract State Lifecycle transitions if this class manages a state field
        Map<String, Object> stateLifecycle = extractClassStateLifecycle(n, simpleName, qualifiedName);

        Map<String, Object> umlClassifier = new LinkedHashMap<>();
        umlClassifier.put("name", simpleName);
        umlClassifier.put("qualifiedName", qualifiedName);
        umlClassifier.put("packageName", packageName);
        umlClassifier.put("typeKind", typeKind);
        umlClassifier.put("annotations", n.getAnnotations().stream().map(a -> a.getNameAsString()).toList());
        umlClassifier.put("endpointPrefixDeclarations", n.getAnnotations().stream().filter(a -> a.getName().getIdentifier().equals("RequestMapping")).map(Object::toString).toList());
        umlClassifier.put("accessDeclarations", n.getAnnotations().stream().filter(a -> java.util.Set.of("PreAuthorize", "Secured", "RolesAllowed").contains(a.getName().getIdentifier())).map(Object::toString).toList());
        umlClassifier.put("baseTypes", n.getExtendedTypes().stream().map(t -> t.getNameWithScope()).toList());
        umlClassifier.put("interfaceTypes", n.getImplementedTypes().stream().map(t -> t.getNameWithScope()).toList());
        umlClassifier.put("imports", cu == null ? List.of() : cu.getImports().stream().filter(i -> !i.isStatic()).map(i -> i.getNameAsString() + (i.isAsterisk() ? ".*" : "")).toList());
        umlClassifier.put("extractionCompleteness", "COMPLETE");
        umlClassifier.put("metadataSource", "JAVA_AST");
        umlClassifier.put("isAbstract", isAbstract);
        umlClassifier.put("isStatic", isStatic);
        umlClassifier.put("visibility", visibility);
        umlClassifier.put("visibilitySymbol", visibilitySymbol);
        umlClassifier.put("languageVisibility", languageVisibility);
        umlClassifier.put("typeParameters", typeParameters);
        umlClassifier.put("genericArity", typeParameters.size());
        umlClassifier.put("members", members);
        umlClassifier.put("methodsCfg", methodsCfg);
        if (stateLifecycle != null) {
            umlClassifier.put("stateLifecycle", stateLifecycle);
        }
        umlClassifier.put("filePath", currentFilePath);
        umlClassifier.put("line", line);

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("umlClassifier", umlClassifier);
        metadata.put("packageName", packageName);
        metadata.put("typeKind", typeKind);

        String snippet = (n.isInterface() ? "interface " : (isAbstract ? "abstract class " : "class ")) + simpleName;
        arg.add(CodeEvidenceDTO.builder()
                .elementType("CLASS_INTERFACE")
                .identifier(simpleName)
                .sourceComponent(simpleName)
                .qualifiedName(qualifiedName)
                .filePath(currentFilePath)
                .lineNumber(line)
                .codeSnippet(snippet)
                .metadata(metadata)
                .build());

        super.visit(n, arg);
    }

    @Override
    public void visit(EnumDeclaration n, List<CodeEvidenceDTO> arg) {
        if (arg == null) {
            super.visit(n, arg);
            return;
        }
        CompilationUnit cu = n.findCompilationUnit().orElse(null);
        String packageName = cu != null ? cu.getPackageDeclaration().map(p -> p.getNameAsString()).orElse("") : "";
        String simpleName = n.getNameAsString();
        String qualifiedName = n.getFullyQualifiedName().orElse(packageName.isEmpty() ? simpleName : packageName + "." + simpleName);
        int line = n.getBegin().map(p -> p.line).orElse(1);

        String visibility = resolveVisibility(n.getModifiers(), false);
        String visibilitySymbol = visibilitySymbol(visibility);
        String languageVisibility = languageVisibility(visibility);

        List<Map<String, Object>> members = new ArrayList<>();
        List<String> enumLiterals = new ArrayList<>();
        for (EnumConstantDeclaration entry : n.getEntries()) {
            String litName = entry.getNameAsString();
            enumLiterals.add(litName);
            Map<String, Object> litMap = new LinkedHashMap<>();
            litMap.put("memberKind", "ENUM_LITERAL");
            litMap.put("name", litName);
            litMap.put("type", simpleName);
            litMap.put("returnType", null);
            litMap.put("parameters", List.of());
            litMap.put("genericArity", 0);
            litMap.put("signature", litName);
            litMap.put("visibility", "PUBLIC");
            litMap.put("visibilitySymbol", "+");
            litMap.put("languageVisibility", "public");
            litMap.put("isStatic", true);
            litMap.put("isAbstract", false);
            litMap.put("isReadOnly", true);
            litMap.put("isDerived", false);
            litMap.put("defaultValue", null);
            litMap.put("line", entry.getBegin().map(p -> p.line).orElse(line));
            members.add(litMap);
        }

        for (ClassOrInterfaceType impl : n.getImplementedTypes()) {
            emitUmlRelationship(
                    arg, cu, simpleName, qualifiedName, impl.getNameAsString(),
                    "REALIZATION", null, null,
                    "implements " + impl.asString(), impl.asString(), false,
                    impl.getBegin().map(p -> p.line).orElse(line),
                    "enum " + simpleName + " implements " + impl.asString()
            );
        }

        // M7: Bare enum only lists state literals and never fabricates transitions
        Map<String, Object> stateLifecycle = new LinkedHashMap<>();
        stateLifecycle.put("machineName", simpleName);
        stateLifecycle.put("ownerQualifiedName", qualifiedName);
        stateLifecycle.put("stateMachineKind", "ENUM_DECLARATION");
        stateLifecycle.put("states", enumLiterals);
        stateLifecycle.put("initialState", null);
        stateLifecycle.put("finalStates", List.of());
        stateLifecycle.put("transitions", List.of());
        stateLifecycle.put("enumOnlyNoTransitions", true);
        stateLifecycle.put("filePath", currentFilePath);
        stateLifecycle.put("line", line);

        Map<String, Object> umlClassifier = new LinkedHashMap<>();
        umlClassifier.put("name", simpleName);
        umlClassifier.put("qualifiedName", qualifiedName);
        umlClassifier.put("packageName", packageName);
        umlClassifier.put("typeKind", "ENUM");
        umlClassifier.put("isAbstract", false);
        umlClassifier.put("isStatic", true);
        umlClassifier.put("visibility", visibility);
        umlClassifier.put("visibilitySymbol", visibilitySymbol);
        umlClassifier.put("languageVisibility", languageVisibility);
        umlClassifier.put("typeParameters", List.of());
        umlClassifier.put("genericArity", 0);
        umlClassifier.put("members", members);
        umlClassifier.put("methodsCfg", List.of());
        umlClassifier.put("stateLifecycle", stateLifecycle);
        umlClassifier.put("filePath", currentFilePath);
        umlClassifier.put("line", line);

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("umlClassifier", umlClassifier);
        metadata.put("packageName", packageName);
        metadata.put("typeKind", "ENUM");

        arg.add(CodeEvidenceDTO.builder()
                .elementType("CLASS_INTERFACE")
                .identifier(simpleName)
                .sourceComponent(simpleName)
                .qualifiedName(qualifiedName)
                .filePath(currentFilePath)
                .lineNumber(line)
                .codeSnippet("enum " + simpleName + " { " + String.join(", ", enumLiterals) + " }")
                .metadata(metadata)
                .build());

        super.visit(n, arg);
    }

    private static boolean hasAnnotation(com.github.javaparser.ast.nodeTypes.NodeWithAnnotations<?> node, Set<String> names) {
        return node.getAnnotations().stream().anyMatch(a -> names.contains(a.getName().getIdentifier()));
    }

    private static boolean isIocType(ClassOrInterfaceDeclaration owner) {
        return hasAnnotation(owner, Set.of("Service", "Component", "Controller", "RestController", "Repository", "Configuration"));
    }

    private static String verifiedFieldOwnership(ClassOrInterfaceDeclaration owner, FieldDeclaration field) {
        if (!hasAnnotation(owner, Set.of("Entity", "Table", "Document", "Embeddable", "Aggregate", "AggregateRoot", "ValueObject")) || isIocType(owner) ||
            hasAnnotation(field, Set.of("Autowired", "Inject", "Resource"))) return null;
        if (hasAnnotation(field, Set.of("Embedded", "EmbeddedId"))) return "EMBEDDED_VALUE";
        if (hasAnnotation(field, Set.of("ElementCollection"))) return "ELEMENT_COLLECTION";
        for (var annotation : field.getAnnotations()) {
            if (!Set.of("OneToMany", "OneToOne").contains(annotation.getName().getIdentifier()) || !annotation.isNormalAnnotationExpr()) continue;
            boolean orphanRemoval = false, cascadeRemoval = false;
            for (var pair : annotation.asNormalAnnotationExpr().getPairs()) {
                if (pair.getNameAsString().equals("orphanRemoval") && pair.getValue().isBooleanLiteralExpr()) orphanRemoval = pair.getValue().asBooleanLiteralExpr().getValue();
                if (pair.getNameAsString().equals("cascade")) cascadeRemoval = pair.getValue().findAll(NameExpr.class).stream().anyMatch(n -> Set.of("ALL", "REMOVE").contains(n.getNameAsString())) ||
                    pair.getValue().findAll(FieldAccessExpr.class).stream().anyMatch(n -> Set.of("ALL", "REMOVE").contains(n.getNameAsString()));
            }
            if (orphanRemoval && cascadeRemoval) return "CASCADE_ORPHAN_REMOVAL";
        }
        return null;
    }
    private CodeEvidenceDTO emitUmlRelationship(
            List<CodeEvidenceDTO> arg,
            CompilationUnit cu,
            String sourceSimpleName,
            String sourceQualifiedName,
            String targetSimpleName,
            String umlRelationKind,
            String roleName,
            String memberName,
            String memberSignature,
            String declaredType,
            boolean isCollectionType,
            int line,
            String snippet
    ) {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("umlRelationKind", umlRelationKind);
        meta.put("dependencyKind", switch (umlRelationKind) {
            case "GENERALIZATION" -> "INHERITS";
            case "REALIZATION" -> "IMPLEMENTS";
            case "ASSOCIATION" -> "ASSOCIATION";
            default -> "DEPENDENCY";
        });
        meta.put("roleName", roleName);
        meta.put("memberName", memberName);
        meta.put("memberSignature", memberSignature);
        meta.put("declaredType", declaredType);
        meta.put("isCollectionType", isCollectionType);
        meta.put("sourceMultiplicity", null);
        meta.put("targetMultiplicity", null);
        meta.put("multiplicityStatus", "UNKNOWN");
        meta.put("provenance", "SOURCE_EXTRACTED");

        List<String> candidates = cu != null ? BeanMessagingVisitor.candidates(cu, targetSimpleName) : List.of(targetSimpleName);
        String cleanSnippet = snippet != null && snippet.length() > 300 ? snippet.substring(0, 300) : snippet;

        CodeEvidenceDTO evidence = CodeEvidenceDTO.builder()
                .elementType("UML_RELATIONSHIP")
                .identifier(sourceSimpleName + " -[" + umlRelationKind + "]-> " + targetSimpleName)
                .sourceComponent(sourceSimpleName)
                .targetComponent(targetSimpleName)
                .qualifiedName(sourceQualifiedName)
                .filePath(currentFilePath)
                .lineNumber(line)
                .codeSnippet(cleanSnippet)
                .symbolCandidates(candidates)
                .metadata(meta)
                .build();
        arg.add(evidence);
        return evidence;
    }

    private Map<String, Object> extractMethodCfg(MethodDeclaration method, String className, String qualifiedClassName, String signature) {
        List<Map<String, Object>> nodes = new ArrayList<>();
        List<Map<String, Object>> edges = new ArrayList<>();
        List<String> unsupported = new ArrayList<>();
        int[] counter = {0};

        String initId = "cfg-init-" + (++counter[0]);
        int startLine = method.getBegin().map(p -> p.line).orElse(1);
        int endLine = method.getEnd().map(p -> p.line).orElse(startLine);

        nodes.add(cfgNode(initId, "INITIAL", "Start " + method.getNameAsString(), className, startLine));
        List<String> tails = buildStmtCfg(method.getBody().orElseThrow(), List.of(initId), null, className, nodes, edges, unsupported, counter);

        if (!tails.isEmpty()) {
            String finalId = "cfg-final-" + (++counter[0]);
            nodes.add(cfgNode(finalId, "ACTIVITY_FINAL", "End " + method.getNameAsString(), className, endLine));
            for (String tail : tails) {
                edges.add(cfgEdge("cfg-e-" + (++counter[0]), tail, finalId, "CONTROL_FLOW", null));
            }
        }

        Map<String, Object> cfg = new LinkedHashMap<>();
        cfg.put("methodName", method.getNameAsString());
        cfg.put("sourceBody", method.getBody().orElseThrow().toString().substring(0, Math.min(12000, method.getBody().orElseThrow().toString().length())));
        var owner = method.findAncestor(ClassOrInterfaceDeclaration.class).orElse(null);
        var receiverTypes = new java.util.LinkedHashMap<String, String>();
        if (owner != null) for (var field : owner.getFields()) for (var variable : field.getVariables()) receiverTypes.put(variable.getNameAsString(), variable.getTypeAsString());
        for (var param : method.getParameters()) receiverTypes.put(param.getNameAsString(), param.getTypeAsString());
        var calls = new ArrayList<Map<String, Object>>();
        for (var call : method.findAll(com.github.javaparser.ast.expr.MethodCallExpr.class)) {
            String scope = call.getScope().map(Object::toString).orElse("").replaceFirst("^this\\.", "");
            if (!receiverTypes.containsKey(scope)) continue;
            var item = new LinkedHashMap<String, Object>();
            item.put("receiver", scope);item.put("receiverType", receiverTypes.get(scope));item.put("methodName", call.getNameAsString());
            item.put("arguments", call.getArguments().toString());
            item.put("argumentCount", call.getArguments().size());
            item.put("argumentTypes", call.getArguments().stream().map(argument -> {
                if (argument.isStringLiteralExpr()) return "String";
                if (argument.isBooleanLiteralExpr()) return "boolean";
                if (argument.isCharLiteralExpr()) return "char";
                if (argument.isIntegerLiteralExpr()) return "int";
                if (argument.isLongLiteralExpr()) return "long";
                if (argument.isObjectCreationExpr()) return argument.asObjectCreationExpr().getTypeAsString();
                if (argument.isNameExpr()) return receiverTypes.getOrDefault(argument.asNameExpr().getNameAsString(), "UNKNOWN");
                return "UNKNOWN";
            }).toList());
            item.put("line", call.getBegin().map(p -> p.line).orElse(startLine));
            item.put("endLine", call.getEnd().map(p -> p.line).orElse(startLine));item.put("endColumn", call.getEnd().map(p -> p.column).orElse(0));
            var loopConditions = new ArrayList<String>();
            for (var parent = call.getParentNode().orElse(null); parent != null && parent != method; parent = parent.getParentNode().orElse(null)) {
                if (parent instanceof com.github.javaparser.ast.stmt.ForEachStmt loop) loopConditions.add(loop.getVariable() + " : " + loop.getIterable());
                if (parent instanceof com.github.javaparser.ast.expr.LambdaExpr lambda && lambda.getParentNode().orElse(null) instanceof com.github.javaparser.ast.expr.MethodCallExpr loop && loop.getNameAsString().equals("forEach")) loopConditions.add("each " + lambda.getParameters() + " in " + loop.getScope().map(Object::toString).orElse("collection"));
            }
            item.put("loopConditions", loopConditions);calls.add(item);
        }
        calls.sort(java.util.Comparator.comparingInt((Map<String,Object> call) -> (Integer) call.get("endLine")).thenComparingInt(call -> (Integer) call.get("endColumn")));
        cfg.put("calls", calls);
        var endpoints = new ArrayList<String>();
        for (var annotation : method.getAnnotations()) {
            String name = annotation.getName().getIdentifier();
            if (java.util.Set.of("GetMapping", "PostMapping", "PutMapping", "DeleteMapping", "PatchMapping", "RequestMapping").contains(name)) endpoints.add(annotation.toString());
        }
        cfg.put("endpointDeclarations", endpoints);
        cfg.put("signature", signature);
        cfg.put("ownerName", className);
        cfg.put("ownerQualifiedName", qualifiedClassName);
        cfg.put("filePath", currentFilePath);
        cfg.put("startLine", startLine);
        cfg.put("endLine", endLine);
        cfg.put("extractionCompleteness", unsupported.isEmpty() ? "COMPLETE" : "PARTIAL");
        cfg.put("unsupportedConstructs", unsupported);
        cfg.put("nodes", nodes);
        cfg.put("edges", edges);
        return cfg;
    }

    private List<String> buildStmtCfg(
            Statement stmt,
            List<String> incomingIds,
            String pendingGuard,
            String partitionName,
            List<Map<String, Object>> nodes,
            List<Map<String, Object>> edges,
            List<String> unsupported,
            int[] counter
    ) {
        if (incomingIds.isEmpty()) return List.of();
        int line = stmt.getBegin().map(p -> p.line).orElse(1);

        if (stmt.isBlockStmt()) {
            List<String> current = incomingIds;
            String guard = pendingGuard;
            for (Statement child : stmt.asBlockStmt().getStatements()) {
                current = buildStmtCfg(child, current, guard, partitionName, nodes, edges, unsupported, counter);
                guard = null;
                if (current.isEmpty()) break;
            }
            return current;
        }

        if (stmt.isExpressionStmt() && stmt.asExpressionStmt().getExpression() instanceof com.github.javaparser.ast.expr.MethodCallExpr call
                && call.getNameAsString().equals("forEach") && call.getArguments().size() == 1 && call.getArgument(0) instanceof LambdaExpr lambda
                && call.getScope().isPresent() && call.getScope().get().isNameExpr()) {
            String header = "cfg-each-" + (++counter[0]);String decision = "cfg-each-dec-" + (++counter[0]);
            nodes.add(cfgNode(header, "MERGE", "forEach loop", partitionName, line));
            nodes.add(cfgNode(decision, "DECISION", "each " + lambda.getParameters() + " in " + call.getScope().get(), partitionName, line));
            connectAll(incomingIds, header, pendingGuard, edges, counter);
            edges.add(cfgEdge("cfg-e-" + (++counter[0]), header, decision, "CONTROL_FLOW", null));
            var tails = buildStmtCfg(lambda.getBody(), List.of(decision), "[next item]", partitionName, nodes, edges, unsupported, counter);
            for (String tail : tails) edges.add(cfgEdge("cfg-e-" + (++counter[0]), tail, header, "CONTROL_FLOW", null));
            String exit = "cfg-each-exit-" + (++counter[0]);nodes.add(cfgNode(exit, "MERGE", "iteration complete", partitionName, line));
            edges.add(cfgEdge("cfg-e-" + (++counter[0]), decision, exit, "CONTROL_FLOW", "[no more items]"));
            return List.of(exit);
        }

        if (stmt.isIfStmt()) {
            IfStmt ifStmt = stmt.asIfStmt();
            String decId = "cfg-dec-" + (++counter[0]);
            String condText = ifStmt.getCondition().toString();
            if (!ifStmt.getCondition().findAll(LambdaExpr.class).isEmpty()) {
                unsupported.add("LAMBDA@" + line);
            }
            nodes.add(cfgNode(decId, "DECISION", condText, partitionName, line));
            connectAll(incomingIds, decId, pendingGuard, edges, counter);

            List<String> thenTails = buildStmtCfg(ifStmt.getThenStmt(), List.of(decId), "[" + condText + "]", partitionName, nodes, edges, unsupported, counter);
            List<String> elseTails;
            if (ifStmt.getElseStmt().isPresent()) {
                elseTails = buildStmtCfg(ifStmt.getElseStmt().get(), List.of(decId), "[else]", partitionName, nodes, edges, unsupported, counter);
            } else {
                elseTails = List.of(decId + "::[else]");
            }

            if (thenTails.isEmpty() && elseTails.isEmpty()) {
                return List.of();
            }
            if (thenTails.isEmpty()) {
                return elseTails;
            }
            if (elseTails.isEmpty()) {
                return thenTails;
            }

            List<String> openTails = new ArrayList<>();
            openTails.addAll(thenTails);
            openTails.addAll(elseTails);

            String mergeId = "cfg-merge-" + (++counter[0]);
            nodes.add(cfgNode(mergeId, "MERGE", "merge", partitionName, ifStmt.getEnd().map(p -> p.line).orElse(line)));
            for (String t : openTails) {
                if (t.contains("::")) {
                    String[] parts = t.split("::", 2);
                    edges.add(cfgEdge("cfg-e-" + (++counter[0]), parts[0], mergeId, "CONTROL_FLOW", parts[1]));
                } else {
                    edges.add(cfgEdge("cfg-e-" + (++counter[0]), t, mergeId, "CONTROL_FLOW", null));
                }
            }
            return List.of(mergeId);
        }

        if (stmt.isDoStmt()) {
            DoStmt doStmt = stmt.asDoStmt();
            String mergeId = "cfg-loop-merge-" + (++counter[0]);
            nodes.add(cfgNode(mergeId, "MERGE", "do-loop-head", partitionName, line));
            connectAll(incomingIds, mergeId, pendingGuard, edges, counter);

            List<String> bodyTails = buildStmtCfg(doStmt.getBody(), List.of(mergeId), null, partitionName, nodes, edges, unsupported, counter);
            if (bodyTails.isEmpty()) {
                return List.of();
            }

            int endLine = doStmt.getEnd().map(p -> p.line).orElse(line);
            String decId = "cfg-loop-dec-" + (++counter[0]);
            String condText = doStmt.getCondition().toString();
            if (!doStmt.getCondition().findAll(LambdaExpr.class).isEmpty()) {
                unsupported.add("LAMBDA@" + endLine);
            }
            nodes.add(cfgNode(decId, "DECISION", condText, partitionName, endLine));
            connectAll(bodyTails, decId, null, edges, counter);
            edges.add(cfgEdge("cfg-e-" + (++counter[0]), decId, mergeId, "CONTROL_FLOW", "[" + condText + "]"));

            String exitId = "cfg-loop-exit-" + (++counter[0]);
            nodes.add(cfgNode(exitId, "MERGE", "loop-exit", partitionName, endLine));
            edges.add(cfgEdge("cfg-e-" + (++counter[0]), decId, exitId, "CONTROL_FLOW", "[else]"));
            return List.of(exitId);
        }

        if (stmt.isWhileStmt() || stmt.isForStmt() || stmt.isForEachStmt()) {
            String mergeId = "cfg-loop-merge-" + (++counter[0]);
            String decId = "cfg-loop-dec-" + (++counter[0]);
            String condText;
            Statement body;
            if (stmt.isWhileStmt()) {
                condText = stmt.asWhileStmt().getCondition().toString();
                body = stmt.asWhileStmt().getBody();
            } else if (stmt.isForStmt()) {
                condText = stmt.asForStmt().getCompare().map(Expression::toString).orElse("loop");
                body = stmt.asForStmt().getBody();
            } else {
                condText = stmt.asForEachStmt().getVariable() + " : " + stmt.asForEachStmt().getIterable();
                body = stmt.asForEachStmt().getBody();
            }
            nodes.add(cfgNode(mergeId, "MERGE", "loop-head", partitionName, line));
            connectAll(incomingIds, mergeId, pendingGuard, edges, counter);
            nodes.add(cfgNode(decId, "DECISION", condText, partitionName, line));
            edges.add(cfgEdge("cfg-e-" + (++counter[0]), mergeId, decId, "CONTROL_FLOW", null));

            List<String> bodyTails = buildStmtCfg(body, List.of(decId), "[" + condText + "]", partitionName, nodes, edges, unsupported, counter);
            for (String bt : bodyTails) {
                connectAll(List.of(bt), mergeId, null, edges, counter);
            }
            String exitId = "cfg-loop-exit-" + (++counter[0]);
            nodes.add(cfgNode(exitId, "MERGE", "loop-exit", partitionName, stmt.getEnd().map(p -> p.line).orElse(line)));
            edges.add(cfgEdge("cfg-e-" + (++counter[0]), decId, exitId, "CONTROL_FLOW", "[else]"));
            return List.of(exitId);
        }

        if (stmt.isBreakStmt()) {
            unsupported.add("BREAK@" + line);
            String actId = "cfg-act-" + (++counter[0]);
            nodes.add(cfgNode(actId, "ACTION", "break", partitionName, line));
            connectAll(incomingIds, actId, pendingGuard, edges, counter);
            return List.of();
        }

        if (stmt.isContinueStmt()) {
            unsupported.add("CONTINUE@" + line);
            String actId = "cfg-act-" + (++counter[0]);
            nodes.add(cfgNode(actId, "ACTION", "continue", partitionName, line));
            connectAll(incomingIds, actId, pendingGuard, edges, counter);
            return List.of();
        }

        if (stmt.isYieldStmt()) {
            unsupported.add("YIELD@" + line);
            String actId = "cfg-act-" + (++counter[0]);
            nodes.add(cfgNode(actId, "ACTION", summarizeStmt(stmt), partitionName, line));
            connectAll(incomingIds, actId, pendingGuard, edges, counter);
            return List.of();
        }

        if (stmt.isSynchronizedStmt()) {
            unsupported.add("SYNCHRONIZED@" + line);
            return buildStmtCfg(stmt.asSynchronizedStmt().getBody(), incomingIds, pendingGuard, partitionName, nodes, edges, unsupported, counter);
        }

        if (stmt.isReturnStmt()) {
            ReturnStmt ret = stmt.asReturnStmt();
            if (ret.getExpression().isPresent() && !ret.getExpression().get().findAll(LambdaExpr.class).isEmpty()) {
                unsupported.add("LAMBDA@" + line);
            }
            String actId = "cfg-act-" + (++counter[0]);
            String label = ret.getExpression().map(e -> "return " + summarizeExpr(e)).orElse("return");
            nodes.add(cfgNode(actId, "ACTION", label, partitionName, line));
            connectAll(incomingIds, actId, pendingGuard, edges, counter);
            String finalId = "cfg-final-" + (++counter[0]);
            nodes.add(cfgNode(finalId, "ACTIVITY_FINAL", "Return", partitionName, line));
            edges.add(cfgEdge("cfg-e-" + (++counter[0]), actId, finalId, "CONTROL_FLOW", null));
            return List.of();
        }

        if (stmt.isThrowStmt()) {
            String actId = "cfg-act-" + (++counter[0]);
            nodes.add(cfgNode(actId, "ACTION", "throw " + summarizeExpr(stmt.asThrowStmt().getExpression()), partitionName, line));
            connectAll(incomingIds, actId, pendingGuard, edges, counter);
            String flowFinalId = "cfg-flow-final-" + (++counter[0]);
            nodes.add(cfgNode(flowFinalId, "FLOW_FINAL", "Exception exit", partitionName, line));
            edges.add(cfgEdge("cfg-e-" + (++counter[0]), actId, flowFinalId, "CONTROL_FLOW", null));
            return List.of();
        }

        if (stmt.isTryStmt()) {
            unsupported.add("TRY_CATCH_FINALLY@" + line);
            return buildStmtCfg(stmt.asTryStmt().getTryBlock(), incomingIds, pendingGuard, partitionName, nodes, edges, unsupported, counter);
        }

        if (stmt.isSwitchStmt()) {
            SwitchStmt sw = stmt.asSwitchStmt();
            String decId = "cfg-dec-" + (++counter[0]);
            nodes.add(cfgNode(decId, "DECISION", "switch (" + sw.getSelector() + ")", partitionName, line));
            connectAll(incomingIds, decId, pendingGuard, edges, counter);
            List<String> branchTails = new ArrayList<>();
            List<SwitchEntry> entries = sw.getEntries();
            for (int idx = 0; idx < entries.size(); idx++) {
                SwitchEntry entry = entries.get(idx);
                int entryLine = entry.getBegin().map(p -> p.line).orElse(line);
                String guard = entry.getLabels().isEmpty()
                        ? "[else]"
                        : "[" + entry.getLabels().stream().map(Expression::toString).collect(Collectors.joining(", ")) + "]";
                List<String> cur = List.of(decId);
                String g = guard;
                boolean endedWithBreak = false;
                for (Statement s : entry.getStatements()) {
                    if (s.isBreakStmt()) {
                        endedWithBreak = true;
                        break;
                    }
                    cur = buildStmtCfg(s, cur, g, partitionName, nodes, edges, unsupported, counter);
                    g = null;
                    if (cur.isEmpty()) break;
                }
                if (!entry.getStatements().isEmpty() && !endedWithBreak && !cur.isEmpty() && idx < entries.size() - 1) {
                    unsupported.add("SWITCH_FALLTHROUGH@" + entryLine);
                }
                branchTails.addAll(cur);
            }
            if (branchTails.isEmpty()) return List.of();
            String mergeId = "cfg-merge-" + (++counter[0]);
            nodes.add(cfgNode(mergeId, "MERGE", "switch-merge", partitionName, sw.getEnd().map(p -> p.line).orElse(line)));
            for (String bt : branchTails) {
                connectAll(List.of(bt), mergeId, null, edges, counter);
            }
            return List.of(mergeId);
        }

        if (!stmt.findAll(LambdaExpr.class).isEmpty()) {
            unsupported.add("LAMBDA@" + line);
        }

        String actId = "cfg-act-" + (++counter[0]);
        String label = summarizeStmt(stmt);
        nodes.add(cfgNode(actId, "ACTION", label, partitionName, line));
        connectAll(incomingIds, actId, pendingGuard, edges, counter);

        if (stmt.isExpressionStmt() && stmt.asExpressionStmt().getExpression().isAssignExpr()) {
            AssignExpr assign = stmt.asExpressionStmt().getExpression().asAssignExpr();
            if (assign.getValue().isFieldAccessExpr()) {
                FieldAccessExpr fa = assign.getValue().asFieldAccessExpr();
                String scopeName = fa.getScope().toString();
                String constName = fa.getNameAsString();
                if (!scopeName.isEmpty()
                        && Character.isUpperCase(scopeName.charAt(0))
                        && constName.equals(constName.toUpperCase())
                        && constName.length() > 1) {
                    String objId = actId + "-obj";
                    Map<String, Object> objNode = cfgNode(objId, "OBJECT_NODE", scopeName + " [" + constName + "]", partitionName, line);
                    objNode.put("objectType", scopeName);
                    objNode.put("objectState", constName);
                    nodes.add(objNode);
                    edges.add(cfgEdge("cfg-e-" + (++counter[0]), actId, objId, "OBJECT_FLOW", null));
                }
            }
        }

        return List.of(actId);
    }

    private void connectAll(List<String> incomingIds, String targetId, String guard, List<Map<String, Object>> edges, int[] counter) {
        for (String inc : incomingIds) {
            if (inc.contains("::")) {
                String[] parts = inc.split("::", 2);
                edges.add(cfgEdge("cfg-e-" + (++counter[0]), parts[0], targetId, "CONTROL_FLOW", parts[1]));
            } else {
                edges.add(cfgEdge("cfg-e-" + (++counter[0]), inc, targetId, "CONTROL_FLOW", guard));
            }
        }
    }

    private Map<String, Object> cfgNode(String id, String kind, String label, String partition, int line) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("id", id);
        node.put("kind", kind);
        node.put("label", label);
        node.put("partition", partition);
        node.put("line", line);
        node.put("filePath", currentFilePath);
        return node;
    }

    private Map<String, Object> cfgEdge(String id, String from, String to, String flowKind, String guard) {
        Map<String, Object> edge = new LinkedHashMap<>();
        edge.put("id", id);
        edge.put("from", from);
        edge.put("to", to);
        edge.put("flowKind", flowKind);
        edge.put("guard", guard);
        return edge;
    }

    private Map<String, Object> extractClassStateLifecycle(ClassOrInterfaceDeclaration n, String simpleName, String qualifiedName) {
        Set<String> declaredEnumTypes = new LinkedHashSet<>();
        n.findCompilationUnit().ifPresent(cu -> {
            for (EnumDeclaration ed : cu.findAll(EnumDeclaration.class)) {
                declaredEnumTypes.add(ed.getNameAsString());
            }
        });

        FieldDeclaration stateField = null;
        String stateFieldName = null;
        String stateTypeName = null;
        String initialState = null;

        for (FieldDeclaration field : n.getFields()) {
            if (field.isStatic()) continue;
            for (VariableDeclarator v : field.getVariables()) {
                String vName = v.getNameAsString();
                String vType = field.getElementType().asString();
                boolean isStateNamedField = vName.matches("(?i).*(status|state|phase|stage)$");
                if ((PRIMITIVE_OR_BUILT_IN.contains(vType) && !("String".equals(vType) && isStateNamedField))
                        || field.getElementType().isPrimitiveType()) {
                    continue;
                }
                boolean isKnownEnum = declaredEnumTypes.contains(vType)
                        || vType.matches("(?i).*(Status|State|Phase|Stage)$");
                if (isKnownEnum || isStateNamedField) {
                    stateField = field;
                    stateFieldName = vName;
                    stateTypeName = vType;
                    if (v.getInitializer().isPresent()) {
                        initialState = extractEnumConstantName(v.getInitializer().get());
                    }
                    break;
                }
            }
            if (stateField != null) break;
        }
        if (stateField == null || stateFieldName == null) {
            return null;
        }

        // Check constructors for initial state assignment if not in field initializer
        for (ConstructorDeclaration ctor : n.getConstructors()) {
            for (AssignExpr assign : ctor.findAll(AssignExpr.class)) {
                if (isTargetField(assign.getTarget(), stateFieldName)) {
                    String candidateInit = extractEnumConstantName(assign.getValue());
                    if (candidateInit != null && initialState == null) {
                        initialState = candidateInit;
                    }
                }
            }
        }

        Set<String> discoveredStates = new LinkedHashSet<>();
        if (initialState != null) discoveredStates.add(initialState);
        List<Map<String, Object>> transitions = new ArrayList<>();
        List<String> unresolvedAssignments = new ArrayList<>();

        for (MethodDeclaration method : n.getMethods()) {
            String trigger = method.getNameAsString();
            for (AssignExpr assign : method.findAll(AssignExpr.class)) {
                if (!isTargetField(assign.getTarget(), stateFieldName)) continue;
                String toState = extractEnumConstantName(assign.getValue());
                if (toState == null) continue;
                discoveredStates.add(toState);

                int tLine = assign.getBegin().map(p -> p.line).orElse(method.getBegin().map(p -> p.line).orElse(1));
                ResolvedStateGuard resolved = resolveStateGuardForAssignment(assign, method, stateFieldName);

                if (resolved.fromState == null) {
                    unresolvedAssignments.add("UNRESOLVED_SOURCE_STATE@" + tLine + ":" + trigger + "->" + toState);
                    continue;
                }

                String fromState = resolved.fromState;
                String guardText = resolved.guardText;
                discoveredStates.add(fromState);

                Map<String, Object> tr = new LinkedHashMap<>();
                tr.put("id", "tr-" + trigger + "-" + fromState + "-" + toState + "-" + tLine);
                tr.put("fromState", fromState);
                tr.put("toState", toState);
                tr.put("trigger", trigger);
                tr.put("guard", guardText);
                tr.put("effect", stateFieldName + " = " + toState);
                tr.put("transitionKind", fromState.equals(toState) ? "SELF" : "EXTERNAL");
                tr.put("provenance", "SOURCE_EXTRACTED");
                tr.put("filePath", currentFilePath);
                tr.put("line", tLine);
                transitions.add(tr);
            }
        }

        if (transitions.isEmpty() && discoveredStates.isEmpty()) {
            return null;
        }

        Map<String, Object> lifecycle = new LinkedHashMap<>();
        lifecycle.put("machineName", simpleName + " (" + stateTypeName + ")");
        lifecycle.put("ownerQualifiedName", qualifiedName);
        lifecycle.put("stateFieldName", stateFieldName);
        lifecycle.put("stateTypeName", stateTypeName);
        lifecycle.put("stateMachineKind", "STATEFUL_CLASS");
        lifecycle.put("states", new ArrayList<>(discoveredStates));
        lifecycle.put("initialState", initialState);
        lifecycle.put("finalStates", List.of());
        lifecycle.put("transitions", transitions);
        lifecycle.put("unresolvedAssignments", unresolvedAssignments);
        lifecycle.put("extractionCompleteness", unresolvedAssignments.isEmpty() ? "COMPLETE" : "PARTIAL");
        lifecycle.put("enumOnlyNoTransitions", transitions.isEmpty());
        lifecycle.put("filePath", currentFilePath);
        lifecycle.put("line", n.getBegin().map(p -> p.line).orElse(1));
        return lifecycle;
    }

    private record ResolvedStateGuard(String fromState, String guardText, boolean blockedByAmbiguousBranch) {}

    private ResolvedStateGuard resolveStateGuardForAssignment(AssignExpr assign, MethodDeclaration method, String fieldName) {
        // 1. Walk enclosing IfStmt ancestors from innermost to outermost
        com.github.javaparser.ast.Node cursor = assign;
        while (cursor != null && cursor != method) {
            if (cursor instanceof IfStmt ifStmt) {
                boolean inThen = ifStmt.getThenStmt().isAncestorOf(assign);
                boolean inElse = ifStmt.getElseStmt().isPresent()
                        && ifStmt.getElseStmt().get().isAncestorOf(assign);
                Expression cond = ifStmt.getCondition();
                if (inThen) {
                    String pos = extractPositiveEqualityState(cond, fieldName);
                    if (pos != null) {
                        return new ResolvedStateGuard(pos, cond.toString(), false);
                    }
                    String neg = extractNegativeInequalityState(cond, fieldName);
                    if (neg != null) {
                        // Inside then-branch of `status != X`: source state is not uniquely resolved
                        return new ResolvedStateGuard(null, null, true);
                    }
                } else if (inElse) {
                    String posInCond = extractPositiveEqualityState(cond, fieldName);
                    if (posInCond != null) {
                        // Inside else-branch of `status == X`: means `status != X`, NOT `status == X`!
                        return new ResolvedStateGuard(null, null, true);
                    }
                    String negInCond = extractNegativeInequalityState(cond, fieldName);
                    if (negInCond != null) {
                        // Inside else-branch of `status != X`: means `status == X`
                        return new ResolvedStateGuard(negInCond, fieldName + " == " + negInCond, false);
                    }
                }
            } else if (cursor instanceof SwitchEntry entry) {
                Optional<SwitchStmt> swOpt = entry.findAncestor(SwitchStmt.class);
                if (swOpt.isPresent() && isTargetField(swOpt.get().getSelector(), fieldName)) {
                    if (entry.getLabels().size() == 1) {
                        String labelState = extractEnumConstantName(entry.getLabels().get(0));
                        if (labelState != null) {
                            return new ResolvedStateGuard(labelState, fieldName + " == " + labelState, false);
                        }
                    }
                    return new ResolvedStateGuard(null, null, true);
                }
            }
            cursor = cursor.getParentNode().orElse(null);
        }

        // 2. Check dominating early-exit guard clauses in the method body prior to this assignment
        if (method.getBody().isPresent()) {
            int assignLine = assign.getBegin().map(p -> p.line).orElse(Integer.MAX_VALUE);
            for (Statement stmt : method.getBody().get().getStatements()) {
                int stmtLine = stmt.getBegin().map(p -> p.line).orElse(0);
                if (stmtLine >= assignLine) break;
                if (stmt.isIfStmt()) {
                    IfStmt guardIf = stmt.asIfStmt();
                    if (guardIf.getElseStmt().isEmpty() && statementAlwaysExits(guardIf.getThenStmt())) {
                        String requiredState = extractNegativeInequalityState(guardIf.getCondition(), fieldName);
                        if (requiredState != null) {
                            return new ResolvedStateGuard(requiredState, fieldName + " == " + requiredState, false);
                        }
                    }
                }
            }
        }

        return new ResolvedStateGuard(null, null, false);
    }

    private boolean statementAlwaysExits(Statement stmt) {
        if (stmt.isReturnStmt() || stmt.isThrowStmt()) return true;
        if (stmt.isBlockStmt()) {
            List<Statement> stmts = stmt.asBlockStmt().getStatements();
            if (stmts.isEmpty()) return false;
            Statement last = stmts.get(stmts.size() - 1);
            return last.isReturnStmt() || last.isThrowStmt();
        }
        return false;
    }

    private boolean isTargetField(Expression target, String fieldName) {
        if (target.isNameExpr()) {
            return target.asNameExpr().getNameAsString().equals(fieldName);
        }
        if (target.isFieldAccessExpr()) {
            FieldAccessExpr fa = target.asFieldAccessExpr();
            return fa.getNameAsString().equals(fieldName) && fa.getScope().isThisExpr();
        }
        return false;
    }

    private String extractPositiveEqualityState(Expression cond, String fieldName) {
        if (cond.isUnaryExpr() && cond.asUnaryExpr().getOperator() == UnaryExpr.Operator.LOGICAL_COMPLEMENT) {
            return extractNegativeInequalityState(cond.asUnaryExpr().getExpression(), fieldName);
        }
        if (cond.isMethodCallExpr()) {
            MethodCallExpr mc = cond.asMethodCallExpr();
            if ((mc.getNameAsString().equals("equals") || mc.getNameAsString().equals("equalsIgnoreCase"))
                    && mc.getArguments().size() == 1 && mc.getScope().isPresent()) {
                if (isTargetField(mc.getScope().get(), fieldName)) {
                    return extractEnumConstantName(mc.getArgument(0));
                }
                if (isTargetField(mc.getArgument(0), fieldName)) {
                    return extractEnumConstantName(mc.getScope().get());
                }
            }
        }
        for (BinaryExpr bin : cond.findAll(BinaryExpr.class)) {
            if (bin.getOperator() == BinaryExpr.Operator.OR) {
                return null;
            }
            if (bin.getOperator() == BinaryExpr.Operator.EQUALS) {
                if (isTargetField(bin.getLeft(), fieldName)) {
                    return extractEnumConstantName(bin.getRight());
                }
                if (isTargetField(bin.getRight(), fieldName)) {
                    return extractEnumConstantName(bin.getLeft());
                }
            }
        }
        return null;
    }

    private String extractNegativeInequalityState(Expression cond, String fieldName) {
        if (cond.isUnaryExpr() && cond.asUnaryExpr().getOperator() == UnaryExpr.Operator.LOGICAL_COMPLEMENT) {
            return extractPositiveEqualityState(cond.asUnaryExpr().getExpression(), fieldName);
        }
        if (cond.isBinaryExpr()) {
            BinaryExpr bin = cond.asBinaryExpr();
            if (bin.getOperator() == BinaryExpr.Operator.NOT_EQUALS) {
                if (isTargetField(bin.getLeft(), fieldName)) {
                    return extractEnumConstantName(bin.getRight());
                }
                if (isTargetField(bin.getRight(), fieldName)) {
                    return extractEnumConstantName(bin.getLeft());
                }
            }
        }
        return null;
    }

    private String extractEnumConstantName(Expression expr) {
        if (expr == null) return null;
        if (expr.isFieldAccessExpr()) {
            return expr.asFieldAccessExpr().getNameAsString();
        }
        if (expr.isNameExpr()) {
            String name = expr.asNameExpr().getNameAsString();
            if (name.toUpperCase().equals(name) && !name.isEmpty()) return name;
        }
        if (expr.isStringLiteralExpr()) {
            String val = expr.asStringLiteralExpr().asString().trim();
            if (val.matches("[A-Z][A-Z0-9_]{1,40}")) return val;
        }
        return null;
    }

    private String summarizeStmt(Statement stmt) {
        String s = stmt.toString().replaceAll("\\s+", " ").trim();
        return s.length() > 80 ? s.substring(0, 77) + "..." : s;
    }

    private String summarizeExpr(Expression expr) {
        String s = expr.toString().replaceAll("\\s+", " ").trim();
        return s.length() > 64 ? s.substring(0, 61) + "..." : s;
    }

    private String resolveVisibility(Iterable<Modifier> modifiers, boolean inInterface) {
        for (Modifier mod : modifiers) {
            Modifier.Keyword kw = mod.getKeyword();
            if (kw == Modifier.Keyword.PUBLIC) return "PUBLIC";
            if (kw == Modifier.Keyword.PRIVATE) return "PRIVATE";
            if (kw == Modifier.Keyword.PROTECTED) return "PROTECTED";
        }
        return inInterface ? "PUBLIC" : "PACKAGE_PRIVATE";
    }

    private String visibilitySymbol(String visibility) {
        return switch (visibility) {
            case "PUBLIC" -> "+";
            case "PRIVATE" -> "-";
            case "PROTECTED" -> "#";
            default -> "~";
        };
    }

    private String languageVisibility(String visibility) {
        return switch (visibility) {
            case "PUBLIC" -> "public";
            case "PRIVATE" -> "private";
            case "PROTECTED" -> "protected";
            default -> "package-private";
        };
    }

    private boolean isCollectionType(String rawType) {
        if (rawType == null) return false;
        String trimmed = rawType.trim();
        if (trimmed.endsWith("[]")) return true;
        int genericStart = trimmed.indexOf('<');
        if (genericStart > 0) {
            String outer = trimmed.substring(0, genericStart).trim();
            String shortOuter = outer.substring(outer.lastIndexOf('.') + 1);
            return COLLECTION_WRAPPERS.contains(shortOuter) || Set.of("Map", "HashMap", "LinkedHashMap", "SortedMap", "TreeMap").contains(shortOuter);
        }
        return false;
    }

    private String extractReferencedDomainType(String rawType, List<String> typeParameters) {
        if (rawType == null || rawType.isBlank()) return null;
        String trimmed = rawType.trim();
        if (trimmed.endsWith("[]")) {
            trimmed = trimmed.substring(0, trimmed.length() - 2).trim();
        }
        int genericStart = trimmed.indexOf('<');
        if (genericStart != -1) {
            int genericEnd = trimmed.lastIndexOf('>');
            String outer = trimmed.substring(0, genericStart).trim();
            String shortOuter = outer.substring(outer.lastIndexOf('.') + 1);
            boolean map = Set.of("Map", "HashMap", "LinkedHashMap", "SortedMap", "TreeMap").contains(shortOuter);
            if (genericEnd > genericStart && (map || COLLECTION_WRAPPERS.contains(shortOuter) || Set.of("Optional", "CompletableFuture", "ResponseEntity").contains(shortOuter))) {
                String inner = trimmed.substring(genericStart + 1, genericEnd).trim();
                if (map) {
                    int depth = 0, comma = -1;
                    for (int i = 0; i < inner.length(); i++) {
                        if (inner.charAt(i) == '<') depth++; else if (inner.charAt(i) == '>') depth--;
                        else if (inner.charAt(i) == ',' && depth == 0) comma = i;
                    }
                    if (comma >= 0) inner = inner.substring(comma + 1).trim();
                }
                return extractReferencedDomainType(inner, typeParameters);
            }
            trimmed = outer;
        }
        String simple = trimmed.substring(trimmed.lastIndexOf('.') + 1);
        if (simple.isEmpty() || PRIMITIVE_OR_BUILT_IN.contains(simple) || typeParameters.contains(simple)) {
            return null;
        }
        return Character.isUpperCase(simple.charAt(0)) ? trimmed : null;
    }
}
