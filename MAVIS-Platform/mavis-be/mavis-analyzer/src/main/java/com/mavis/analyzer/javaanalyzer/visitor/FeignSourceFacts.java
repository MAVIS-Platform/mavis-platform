package com.mavis.analyzer.javaanalyzer.visitor;

import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import java.net.URI;
import java.util.*;

final class FeignSourceFacts {
    private FeignSourceFacts() {}
    static CodeEvidenceDTO client(ClassOrInterfaceDeclaration type, AnnotationExpr annotation, String file) {
        String name=SpringHttpMappings.attribute(annotation,"name");
        String nameAttribute=name.isBlank()?"value":"name";
        if(name.isBlank()) name=SpringHttpMappings.attribute(annotation,"value");
        String url=SpringHttpMappings.attribute(annotation,"url");
        String path=SpringHttpMappings.attribute(annotation,"path");
        boolean urlProvided=!url.isBlank();
        String selector=urlProvided?url:name;
        boolean literal=urlProvided?SpringHttpMappings.literalAttribute(annotation,"url"):
                SpringHttpMappings.literalAttribute(annotation,nameAttribute);
        boolean resolved=literal && !selector.contains("${") && !selector.isBlank();
        if(!urlProvided) resolved=resolved && name.matches("[A-Za-z0-9][A-Za-z0-9._-]*");
        String target=selector, urlPath="";
        if(urlProvided && resolved) {
            try {
                URI uri=URI.create(url.contains("://")?url:"http://"+url);
                target=uri.getHost();urlPath=Optional.ofNullable(uri.getPath()).orElse("");
                resolved=target!=null && !target.isBlank() && Set.of("http","https").contains(uri.getScheme().toLowerCase(Locale.ROOT));
            } catch(IllegalArgumentException error) { resolved=false; }
        }
        var meta=new LinkedHashMap<String,Object>();
        meta.put("clientFramework","OPENFEIGN");meta.put("clientName",name);
        meta.put("contextId",SpringHttpMappings.attribute(annotation,"contextId"));
        meta.put("targetSelector",urlProvided?"ANNOTATION_URL":"SERVICE_NAME");
        meta.put("targetResolved",resolved);meta.put("protocol","HTTP");
        List<Map<String,Object>> operations=new ArrayList<>();
        for(var method:type.getMethods()) for(var mapping:SpringHttpMappings.method(method,true)) {
            var operation=new LinkedHashMap<String,Object>();
            operation.put("javaMethod",method.getNameAsString());operation.put("parameterCount",method.getParameters().size());
            operation.put("httpMethod",mapping.method());operation.put("httpPath",SpringHttpMappings.join(urlPath,path,mapping.path()));
            operation.put("pathResolved",mapping.pathResolved() && !path.contains("${") && (path.isBlank()||SpringHttpMappings.literalAttribute(annotation,"path")));
            operation.put("sourceLine",method.getBegin().map(p->p.line).orElse(1));
            operation.put("snippet",SpringHttpMappings.snippet(method));operations.add(operation);
        }
        meta.put("operations",operations);
        return CodeEvidenceDTO.builder().elementType("FEIGN_CLIENT").identifier(target==null?selector:target)
                .sourceComponent(type.getNameAsString()).targetComponent(target).filePath(file)
                .qualifiedName(type.getFullyQualifiedName().orElse(type.getNameAsString()))
                .lineNumber(annotation.getBegin().map(p->p.line).orElse(1)).codeSnippet(SpringHttpMappings.snippet(annotation)).metadata(meta).build();
    }
    static CodeEvidenceDTO invocation(MethodCallExpr call,String file) {
        boolean explicitThis=call.getScope().filter(s->s.isFieldAccessExpr() && s.asFieldAccessExpr().getScope().isThisExpr()).isPresent();
        String receiver=call.getScope().map(Object::toString).orElse("").replaceFirst("^this\\.","");
        if(!receiver.matches("[A-Za-z_$][A-Za-z0-9_$]*")) return null;
        var owner=call.findAncestor(ClassOrInterfaceDeclaration.class).orElse(null);
        if(owner==null) return null;
        String receiverType=null;
        for(var field:owner.getFields()) for(var variable:field.getVariables())
            if(variable.getNameAsString().equals(receiver)) receiverType=variable.getTypeAsString();
        var method=call.findAncestor(MethodDeclaration.class).orElse(null);
        if(method==null) return null;
        if(method!=null) {
            if(!explicitThis) for(var parameter:method.getParameters()) if(parameter.getNameAsString().equals(receiver)) receiverType=parameter.getTypeAsString();
            // Local aliases/shadowing require data-flow resolution. Never attribute them to a field by name.
            if(!explicitThis && method.findAll(VariableDeclarator.class).stream().anyMatch(v->v.getNameAsString().equals(receiver))) return null;
            if(!explicitThis && call.findAncestor(LambdaExpr.class).stream().anyMatch(l->l.getParameters().stream().anyMatch(p->p.getNameAsString().equals(receiver)))) return null;
            if(!explicitThis && call.findAncestor(com.github.javaparser.ast.stmt.CatchClause.class).stream().anyMatch(c->c.getParameter().getNameAsString().equals(receiver))) return null;
        }
        if(receiverType==null) return null;
        return CodeEvidenceDTO.builder().elementType("FEIGN_INVOCATION").identifier(call.getNameAsString())
                .sourceComponent(owner.getNameAsString()).qualifiedName(owner.getFullyQualifiedName().orElse(owner.getNameAsString()))
                .targetComponent(receiverType.replaceAll("<.*>",""))
                .filePath(file).lineNumber(call.getBegin().map(p->p.line).orElse(1)).codeSnippet(SpringHttpMappings.snippet(call))
                .metadata(new LinkedHashMap<>(Map.of("argumentCount",call.getArguments().size()))).build();
    }
}
