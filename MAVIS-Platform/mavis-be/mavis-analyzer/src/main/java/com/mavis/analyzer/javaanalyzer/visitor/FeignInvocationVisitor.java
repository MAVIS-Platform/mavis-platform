package com.mavis.analyzer.javaanalyzer.visitor;

import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import java.util.List;

/** Candidate typed calls; JavaSourceParser retains only project-resolved Feign receiver types. */
public final class FeignInvocationVisitor extends VoidVisitorAdapter<List<CodeEvidenceDTO>> {
    private final String file;
    public FeignInvocationVisitor(String file) { this.file=file; }
    @Override public void visit(MethodCallExpr node,List<CodeEvidenceDTO> facts) {
        var call=FeignSourceFacts.invocation(node,file);
        if(call!=null && facts!=null) facts.add(call);
        super.visit(node,facts);
    }
}
