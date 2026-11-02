package com.mavis.analyzer.javaanalyzer.visitor;

import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import java.util.*;

public class ControllerVisitor extends VoidVisitorAdapter<List<CodeEvidenceDTO>> {
    private final String currentFilePath;
    public ControllerVisitor() { this(null); }
    public ControllerVisitor(String currentFilePath) { this.currentFilePath=currentFilePath; }
    @Override public void visit(ClassOrInterfaceDeclaration type,List<CodeEvidenceDTO> evidence) {
        boolean controller=type.getAnnotations().stream().anyMatch(a->Set.of("RestController","Controller").contains(a.getName().getIdentifier()));
        if(controller && evidence!=null) {
            String anns=type.getAnnotations().stream().map(Object::toString).collect(java.util.stream.Collectors.joining("\n"));
            String decl=(type.isPublic()?"public ":"")+"class "+type.getNameAsString();
            evidence.add(CodeEvidenceDTO.builder().elementType("CONTROLLER_COMPONENT").identifier(type.getNameAsString())
                    .sourceComponent(type.getNameAsString()).filePath(currentFilePath)
                    .lineNumber(type.getBegin().map(p->p.line).orElse(1))
                    .codeSnippet(anns.isEmpty()?decl:anns+"\n"+decl).build());
            var classMapping=type.getAnnotations().stream().filter(a->a.getName().getIdentifier().equals("RequestMapping")).findFirst();
            List<String> roots=classMapping.map(SpringHttpMappings::paths).orElse(List.of(""));
            for(var method:type.getMethods()) for(var mapping:SpringHttpMappings.method(method,false)) for(String root:roots) {
                String path=SpringHttpMappings.join(root,mapping.path());
                var metadata=new LinkedHashMap<String,Object>();
                metadata.put("httpMethod",mapping.method());metadata.put("httpPath",path);
                metadata.put("javaMethod",method.getNameAsString());
                metadata.put("pathResolved",mapping.pathResolved() && !root.contains("${") && classMapping.map(SpringHttpMappings::literalPaths).orElse(true));
                evidence.add(CodeEvidenceDTO.builder().elementType("REST_API").identifier(path)
                        .sourceComponent(type.getNameAsString()).filePath(currentFilePath)
                        .lineNumber(method.getBegin().map(p->p.line).orElse(1))
                        .codeSnippet(SpringHttpMappings.snippet(method)).metadata(metadata).build());
            }
        }
        super.visit(type,evidence);
    }
}
