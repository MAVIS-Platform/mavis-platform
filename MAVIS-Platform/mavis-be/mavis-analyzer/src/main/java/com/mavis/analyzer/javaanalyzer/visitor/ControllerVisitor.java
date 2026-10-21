package com.mavis.analyzer.javaanalyzer.visitor;

import com.github.javaparser.ast.NodeList;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.Expression;
import com.github.javaparser.ast.expr.MemberValuePair;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import lombok.extern.slf4j.Slf4j;

import java.util.List;
import java.util.Optional;

@Slf4j
public class ControllerVisitor extends VoidVisitorAdapter<List<CodeEvidenceDTO>> {

    private final String currentFilePath;

    public ControllerVisitor() {
        this(null);
    }

    public ControllerVisitor(String currentFilePath) {
        this.currentFilePath = currentFilePath;
    }

    @Override
    public void visit(ClassOrInterfaceDeclaration n, List<CodeEvidenceDTO> arg) {
        // a. Kiểm tra class có được đánh dấu @RestController hoặc @Controller không
        boolean isController = n.isAnnotationPresent("RestController") || n.isAnnotationPresent("Controller");
        if (!isController) {
            super.visit(n, arg);
            return;
        }

        // b. Trích xuất base path từ class-level @RequestMapping
        String basePath = "";
        Optional<AnnotationExpr> classMappingOpt = n.getAnnotationByName("RequestMapping");
        if (classMappingOpt.isPresent()) {
            basePath = extractPathFromAnnotation(classMappingOpt.get());
        }

        // c. Duyệt qua tất cả các phương thức trong class
        for (MethodDeclaration method : n.getMethods()) {
            // d. Kiểm tra các HTTP mapping annotations
            String httpMethodType = null;
            String methodPath = "";

            if (method.isAnnotationPresent("GetMapping")) {
                httpMethodType = "GET";
                methodPath = extractPathFromAnnotation(method.getAnnotationByName("GetMapping").get());
            } else if (method.isAnnotationPresent("PostMapping")) {
                httpMethodType = "POST";
                methodPath = extractPathFromAnnotation(method.getAnnotationByName("PostMapping").get());
            } else if (method.isAnnotationPresent("PutMapping")) {
                httpMethodType = "PUT";
                methodPath = extractPathFromAnnotation(method.getAnnotationByName("PutMapping").get());
            } else if (method.isAnnotationPresent("DeleteMapping")) {
                httpMethodType = "DELETE";
                methodPath = extractPathFromAnnotation(method.getAnnotationByName("DeleteMapping").get());
            } else if (method.isAnnotationPresent("PatchMapping")) {
                httpMethodType = "PATCH";
                methodPath = extractPathFromAnnotation(method.getAnnotationByName("PatchMapping").get());
            } else if (method.isAnnotationPresent("RequestMapping")) {
                AnnotationExpr reqAnnotation = method.getAnnotationByName("RequestMapping").get();
                httpMethodType = extractHttpMethodFromRequestMapping(reqAnnotation);
                methodPath = extractPathFromAnnotation(reqAnnotation);
            }

            // e & f. Nếu tìm thấy HTTP mapping, kết hợp base path và ghi log
            if (httpMethodType != null) {
                String fullEndpointPath = combinePaths(basePath, methodPath);
                log.info("Detected API Endpoint: [{}] {}", httpMethodType, fullEndpointPath);

                if (arg != null) {
                    Integer lineNumber = method.getBegin().map(p -> p.line).orElse(null);
                    String rawSnippet = method.toString();
                    String codeSnippet = rawSnippet.length() > 500 ? rawSnippet.substring(0, 500) : rawSnippet;

                    CodeEvidenceDTO evidence = CodeEvidenceDTO.builder()
                            .elementType("REST_API")
                            .identifier(fullEndpointPath)
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

    private String extractPathFromAnnotation(AnnotationExpr annotation) {
        if (annotation == null) {
            return "";
        }
        if (annotation.isSingleMemberAnnotationExpr()) {
            return extractStringValue(annotation.asSingleMemberAnnotationExpr().getMemberValue());
        } else if (annotation.isNormalAnnotationExpr()) {
            for (MemberValuePair pair : annotation.asNormalAnnotationExpr().getPairs()) {
                String name = pair.getNameAsString();
                if ("value".equals(name) || "path".equals(name)) {
                    return extractStringValue(pair.getValue());
                }
            }
        }
        return "";
    }

    private String extractHttpMethodFromRequestMapping(AnnotationExpr annotation) {
        if (annotation != null && annotation.isNormalAnnotationExpr()) {
            for (MemberValuePair pair : annotation.asNormalAnnotationExpr().getPairs()) {
                if ("method".equals(pair.getNameAsString())) {
                    String val = pair.getValue().toString();
                    return val.replace("RequestMethod.", "").replace("{", "").replace("}", "").trim();
                }
            }
        }
        return "REQUEST";
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

    private String combinePaths(String basePath, String methodPath) {
        if (basePath == null) basePath = "";
        if (methodPath == null) methodPath = "";

        basePath = basePath.trim();
        methodPath = methodPath.trim();

        if (basePath.isEmpty() && methodPath.isEmpty()) {
            return "/";
        }

        if (!basePath.isEmpty() && !basePath.startsWith("/")) {
            basePath = "/" + basePath;
        }
        if (!methodPath.isEmpty() && !methodPath.startsWith("/")) {
            methodPath = "/" + methodPath;
        }

        if (basePath.endsWith("/")) {
            basePath = basePath.substring(0, basePath.length() - 1);
        }

        String fullPath = basePath + methodPath;
        fullPath = fullPath.replaceAll("/+", "/");
        if (fullPath.isEmpty()) {
            return "/";
        }
        return fullPath;
    }
}
