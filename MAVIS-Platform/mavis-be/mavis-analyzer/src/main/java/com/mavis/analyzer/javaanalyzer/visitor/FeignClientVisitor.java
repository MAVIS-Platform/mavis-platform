package com.mavis.analyzer.javaanalyzer.visitor;

import com.github.javaparser.ast.NodeList;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.Expression;
import com.github.javaparser.ast.expr.MemberValuePair;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import lombok.extern.slf4j.Slf4j;

import java.util.List;
import java.util.Optional;

@Slf4j
public class FeignClientVisitor extends VoidVisitorAdapter<List<CodeEvidenceDTO>> {

    private final String currentFilePath;

    public FeignClientVisitor() {
        this(null);
    }

    public FeignClientVisitor(String currentFilePath) {
        this.currentFilePath = currentFilePath;
    }

    @Override
    public void visit(ClassOrInterfaceDeclaration n, List<CodeEvidenceDTO> arg) {
        // a. Kiểm tra khai báo có phải là interface không
        if (!n.isInterface()) {
            super.visit(n, arg);
            return;
        }

        // b. Kiểm tra interface có annotation @FeignClient không
        Optional<AnnotationExpr> feignClientOpt = n.getAnnotationByName("FeignClient");
        if (feignClientOpt.isEmpty()) {
            super.visit(n, arg);
            return;
        }

        // c. Trích xuất tên service đích từ các thuộc tính name, value hoặc single attribute
        AnnotationExpr annotation = feignClientOpt.get();
        String targetServiceName = extractTargetServiceName(annotation);

        // d. Ghi log kết quả phát hiện
        log.info("Detected FeignClient target service: {}", targetServiceName);

        if (arg != null) {
            Integer lineNumber = n.getBegin().map(p -> p.line).orElse(null);
            String rawSnippet = n.toString();
            String codeSnippet = rawSnippet.length() > 500 ? rawSnippet.substring(0, 500) : rawSnippet;

            CodeEvidenceDTO evidence = CodeEvidenceDTO.builder()
                    .elementType("FEIGN_CLIENT")
                    .identifier(targetServiceName)
                    .filePath(currentFilePath)
                    .lineNumber(lineNumber)
                    .codeSnippet(codeSnippet)
                    .build();
            arg.add(evidence);
        }

        super.visit(n, arg);
    }

    private String extractTargetServiceName(AnnotationExpr annotation) {
        if (annotation == null) {
            return "";
        }

        if (annotation.isSingleMemberAnnotationExpr()) {
            return extractStringValue(annotation.asSingleMemberAnnotationExpr().getMemberValue());
        } else if (annotation.isNormalAnnotationExpr()) {
            for (MemberValuePair pair : annotation.asNormalAnnotationExpr().getPairs()) {
                String key = pair.getNameAsString();
                if ("name".equals(key) || "value".equals(key)) {
                    return extractStringValue(pair.getValue());
                }
            }
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
}
