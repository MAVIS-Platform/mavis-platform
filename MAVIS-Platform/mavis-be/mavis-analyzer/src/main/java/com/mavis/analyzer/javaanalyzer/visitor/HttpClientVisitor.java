package com.mavis.analyzer.javaanalyzer.visitor;

import com.github.javaparser.ast.Node;
import com.github.javaparser.ast.NodeList;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.Expression;
import com.github.javaparser.ast.expr.MemberValuePair;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import lombok.extern.slf4j.Slf4j;

import java.net.URI;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
public class HttpClientVisitor extends VoidVisitorAdapter<List<CodeEvidenceDTO>> {

    private static final Set<String> REST_TEMPLATE_METHODS = Set.of(
            "getForObject", "postForObject", "exchange", "getForEntity", "postForEntity",
            "put", "delete", "patchForObject"
    );

    private static final Pattern URL_HOST_PATTERN = Pattern.compile("https?://([^:/]+)(?::\\d+)?.*");

    protected final String currentFilePath;

    public HttpClientVisitor() {
        this(null);
    }

    public HttpClientVisitor(String currentFilePath) {
        this.currentFilePath = currentFilePath;
    }

    private static final List<String> DECLARATIVE_CLIENT_ANNOTATIONS = List.of(
            "FeignClient", "HttpExchange", "GrpcClient", "WebServiceClient", "RegisterRestClient"
    );

    @Override
    public void visit(ClassOrInterfaceDeclaration n, List<CodeEvidenceDTO> arg) {
        // 1. Phân tích Declarative HTTP/RPC Client (@FeignClient, @HttpExchange, @GrpcClient, ...)
        if (n.isInterface()) {
            Optional<AnnotationExpr> clientAnnOpt = DECLARATIVE_CLIENT_ANNOTATIONS.stream()
                    .map(n::getAnnotationByName)
                    .filter(Optional::isPresent)
                    .map(Optional::get)
                    .findFirst();
            boolean hasExchangeMethod = clientAnnOpt.isEmpty() && n.getMethods().stream().anyMatch(m ->
                    m.getAnnotationByName("HttpExchange").isPresent()
                            || m.getAnnotationByName("GetExchange").isPresent()
                            || m.getAnnotationByName("PostExchange").isPresent()
                            || m.getAnnotationByName("PutExchange").isPresent()
                            || m.getAnnotationByName("DeleteExchange").isPresent()
                            || m.getAnnotationByName("PatchExchange").isPresent());

            var feign=n.getAnnotations().stream().filter(a->a.getName().getIdentifier().equals("FeignClient")).findFirst();
            if(feign.isPresent() && arg!=null) arg.add(FeignSourceFacts.client(n,feign.get(),currentFilePath));
            else if (clientAnnOpt.isPresent() || hasExchangeMethod) {
                String targetServiceName = clientAnnOpt.map(this::extractFeignTarget).orElse("");
                if (targetServiceName == null || targetServiceName.isBlank() || targetServiceName.contains("${")) {
                    targetServiceName = deriveTargetFromClientName(n.getNameAsString());
                }

                log.info("Detected declarative client target service: {} in {}", targetServiceName, n.getNameAsString());

                if (arg != null && targetServiceName != null && !targetServiceName.isBlank()) {
                    Integer lineNumber = n.getBegin().map(p -> p.line).orElse(null);
                    String rawSnippet = n.toString();
                    String codeSnippet = rawSnippet.length() > 500 ? rawSnippet.substring(0, 500) : rawSnippet;

                    CodeEvidenceDTO evidence = CodeEvidenceDTO.builder()
                            .elementType("FEIGN_CLIENT")
                            .identifier(targetServiceName)
                            .sourceComponent(n.getNameAsString())
                            .targetComponent(targetServiceName)
                            .filePath(currentFilePath)
                            .lineNumber(lineNumber)
                            .codeSnippet(codeSnippet)
                            .build();
                    arg.add(evidence);
                }
            }
        }

        super.visit(n, arg);
    }

    private String deriveTargetFromClientName(String className) {
        if (className == null || className.isBlank()) return "";
        String stem = className.replaceAll("(?i)(FeignClient|HttpClient|GrpcClient|RestClient|ServiceClient|ApiClient|Client)$", "");
        if (stem.isBlank()) return "";
        String kebab = stem.replaceAll("([a-z0-9])([A-Z])", "$1-$2").toLowerCase().replaceAll("-service$", "");
        return kebab.isBlank() ? "" : kebab + "-service";
    }

    @Override
    public void visit(MethodCallExpr n, List<CodeEvidenceDTO> arg) {
        String methodName = n.getNameAsString();

        // 2. Phân tích lời gọi RestTemplate
        if (REST_TEMPLATE_METHODS.contains(methodName)) {
            handleRestTemplateCall(n, arg);
        } else if ("uri".equals(methodName)) {
            // 3. Phân tích lời gọi WebClient .uri(...)
            handleWebClientCall(n, arg);
        }

        super.visit(n, arg);
    }

    private void handleRestTemplateCall(MethodCallExpr n, List<CodeEvidenceDTO> arg) {
        if (arg == null || n.getArguments().isEmpty()) {
            return;
        }

        Expression urlArg = n.getArgument(0);
        String targetIdentifier = extractTargetFromUrlExpr(urlArg);

        if (targetIdentifier != null && !targetIdentifier.isBlank()) {
            String enclosingClass = findEnclosingClassName(n);
            Integer line = n.getBegin().map(p -> p.line).orElse(null);
            String snippet = n.toString();

            log.info("Detected RestTemplate HTTP call to: {} from class: {}", targetIdentifier, enclosingClass);

            CodeEvidenceDTO evidence = CodeEvidenceDTO.builder()
                    .elementType("REST_TEMPLATE_CALL")
                    .identifier(targetIdentifier)
                    .endpointAlias(urlArg.isStringLiteralExpr() ? com.mavis.analyzer.workerclient.service.impl.ServiceBindingIndex.alias(urlArg.asStringLiteralExpr().asString()) : null)
                    .sourceComponent(enclosingClass)
                    .targetComponent(targetIdentifier)
                    .filePath(currentFilePath)
                    .lineNumber(line)
                    .codeSnippet(snippet.length() > 500 ? snippet.substring(0, 500) : snippet)
                    .build();
            arg.add(evidence);
        }
    }

    private void handleWebClientCall(MethodCallExpr n, List<CodeEvidenceDTO> arg) {
        if (arg == null || n.getArguments().isEmpty()) {
            return;
        }

        Expression urlArg = n.getArgument(0);
        String targetIdentifier = extractTargetFromUrlExpr(urlArg);

        if (targetIdentifier != null && !targetIdentifier.isBlank()) {
            String enclosingClass = findEnclosingClassName(n);
            Integer line = n.getBegin().map(p -> p.line).orElse(null);
            String snippet = n.toString();

            log.info("Detected WebClient HTTP call to: {} from class: {}", targetIdentifier, enclosingClass);

            CodeEvidenceDTO evidence = CodeEvidenceDTO.builder()
                    .elementType("WEB_CLIENT_CALL")
                    .identifier(targetIdentifier)
                    .endpointAlias(urlArg.isStringLiteralExpr() ? com.mavis.analyzer.workerclient.service.impl.ServiceBindingIndex.alias(urlArg.asStringLiteralExpr().asString()) : null)
                    .sourceComponent(enclosingClass)
                    .targetComponent(targetIdentifier)
                    .filePath(currentFilePath)
                    .lineNumber(line)
                    .codeSnippet(snippet.length() > 500 ? snippet.substring(0, 500) : snippet)
                    .build();
            arg.add(evidence);
        }
    }

    private String extractTargetFromUrlExpr(Expression expr) {
        if (expr == null) return null;
        String raw = expr.toString();

        if (expr.isStringLiteralExpr()) {
            String val = expr.asStringLiteralExpr().getValue();
            return extractHostFromUrl(val);
        }

        Matcher matcher = URL_HOST_PATTERN.matcher(raw);
        if (matcher.find()) {
            return matcher.group(1).trim();
        }

        // Nếu là biến URL (ví dụ catalogServiceUrl, paymentUrl)
        if (raw.matches("[a-zA-Z0-9_.-]+")) {
            return raw;
        }

        return null;
    }

    private String extractHostFromUrl(String url) {
        if (url == null) return null;
        try {
            Matcher m = URL_HOST_PATTERN.matcher(url);
            if (m.matches()) {
                return m.group(1).trim();
            }
            URI uri = URI.create(url);
            if (uri.getHost() != null) {
                return uri.getHost();
            }
        } catch (Exception ignored) {
        }
        return url;
    }

    private String extractFeignTarget(AnnotationExpr annotation) {
        if (annotation == null) {
            return "";
        }

        String name = null;
        String url = null;

        if (annotation.isSingleMemberAnnotationExpr()) {
            name = extractStringValue(annotation.asSingleMemberAnnotationExpr().getMemberValue());
        } else if (annotation.isNormalAnnotationExpr()) {
            for (MemberValuePair pair : annotation.asNormalAnnotationExpr().getPairs()) {
                String key = pair.getNameAsString();
                if ("name".equals(key) || "value".equals(key)) {
                    name = extractStringValue(pair.getValue());
                } else if ("url".equals(key)) {
                    url = extractStringValue(pair.getValue());
                }
            }
        }

        if (name != null && !name.isBlank()) {
            return name;
        }
        if (url != null && !url.isBlank()) {
            return extractHostFromUrl(url);
        }
        return "";
    }

    private String extractStringValue(Expression expr) {
        if (expr == null) {
            return "";
        }
        if (expr.isStringLiteralExpr()) {
            return expr.asStringLiteralExpr().getValue();
        } else if (expr.isArrayInitializerExpr()) {
            NodeList<Expression> values = expr.asArrayInitializerExpr().getValues();
            if (!values.isEmpty()) {
                return extractStringValue(values.get(0));
            }
        }
        String raw = expr.toString();
        if (raw.startsWith("\"") && raw.endsWith("\"") && raw.length() >= 2) {
            return raw.substring(1, raw.length() - 1);
        }
        return raw;
    }

    private String findEnclosingClassName(Node node) {
        Node current = node;
        while (current != null) {
            if (current instanceof ClassOrInterfaceDeclaration cid) {
                return cid.getNameAsString();
            }
            current = current.getParentNode().orElse(null);
        }
        return "UnknownClass";
    }
}
