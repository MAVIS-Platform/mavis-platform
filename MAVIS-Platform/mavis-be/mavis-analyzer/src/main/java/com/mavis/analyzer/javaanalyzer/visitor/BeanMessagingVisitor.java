package com.mavis.analyzer.javaanalyzer.visitor;
import com.github.javaparser.ast.*;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import java.util.*;

/** Recognises explicit bean factories and literal/constant messaging declarations only. */
public final class BeanMessagingVisitor extends VoidVisitorAdapter<List<CodeEvidenceDTO>> {
    private final String file;
    public BeanMessagingVisitor(String file){this.file=file;}
    public static List<String> candidates(CompilationUnit cu,String symbol) {
        if(symbol==null||symbol.isBlank())return List.of();
        var names=new LinkedHashSet<String>();names.add(symbol);
        String first=symbol.split("\\.",2)[0],suffix=symbol.substring(first.length());
        for(var item:cu.getImports()) {
            if(item.isAsterisk())names.add(item.getNameAsString()+"."+symbol);
            else if(item.getName().getIdentifier().equals(first))names.add(item.getNameAsString()+suffix);
            else if(item.isStatic()&&item.getName().getIdentifier().equals(symbol))names.add(item.getNameAsString());
        }
        cu.getPackageDeclaration().ifPresent(p->names.add(p.getNameAsString()+"."+symbol));
        return List.copyOf(names);
    }
    @Override public void visit(MethodDeclaration method,List<CodeEvidenceDTO> output) {
        if(method.isAnnotationPresent("Bean")&&method.getType().isClassOrInterfaceType()) {
            var cu=method.findCompilationUnit().orElseThrow();
            String type=method.getType().asClassOrInterfaceType().getNameWithScope();
            output.add(CodeEvidenceDTO.builder().elementType("BEAN_COMPONENT").identifier(type.substring(type.lastIndexOf('.')+1)).sourceComponent(type.substring(type.lastIndexOf('.')+1)).filePath(file).lineNumber(method.getBegin().map(p->p.line).orElse(1)).codeSnippet("@Bean "+method.getNameAsString()).symbolCandidates(candidates(cu,type)).build());
        }
        for(var annotation:method.getAnnotations()) {
            if(annotation.getName().getIdentifier().equals("KafkaListener")&&hasImport(method,"org.springframework.kafka")) {
                if(annotation instanceof NormalAnnotationExpr normal) for(var pair:normal.getPairs()) if(pair.getNameAsString().equals("topics")) {
                    if(pair.getValue() instanceof ArrayInitializerExpr array)array.getValues().forEach(v->emit(method,v,"MESSAGE_SUBSCRIBE","Kafka topic",output));
                    else emit(method,pair.getValue(),"MESSAGE_SUBSCRIBE","Kafka topic",output);
                }
            }
        }
        super.visit(method,output);
    }
    @Override public void visit(MethodCallExpr call,List<CodeEvidenceDTO> output) {
        String name=call.getNameAsString(),scope=call.getScope().map(Object::toString).orElse("");
        if(!call.getArguments().isEmpty()) {
            if(name.equals("withChannel")&&scope.contains("CommandEndpointBuilder")&&hasImport(call,"io.eventuate.tram"))emit(call,call.getArgument(0),"MESSAGE_PUBLISH","Eventuate command channel",output);
            if(name.equals("fromChannel")&&scope.contains("SagaCommandHandlersBuilder")&&hasImport(call,"io.eventuate.tram"))emit(call,call.getArgument(0),"MESSAGE_SUBSCRIBE","Eventuate command channel",output);
            if(name.equals("send")&&hasImport(call,"org.springframework.kafka")&&call.getScope().isPresent()) {
                var owner=call.findAncestor(ClassOrInterfaceDeclaration.class).orElse(null);
                if(owner!=null&&owner.getFields().stream().anyMatch(field->field.getElementType().asString().contains("KafkaTemplate")&&field.getVariables().stream().anyMatch(v->v.getNameAsString().equals(scope))))emit(call,call.getArgument(0),"MESSAGE_PUBLISH","Kafka topic",output);
            }
        }
        super.visit(call,output);
    }
    private boolean hasImport(Node node,String prefix){return node.findCompilationUnit().orElseThrow().getImports().stream().anyMatch(i->i.getNameAsString().startsWith(prefix+"."));}
    private void emit(Node node,Expression channel,String type,String protocol,List<CodeEvidenceDTO> output) {
        var owner=node.findAncestor(ClassOrInterfaceDeclaration.class).orElse(null);if(owner==null)return;
        String name=owner.getNameAsString(),value=channel.isStringLiteralExpr()?channel.asStringLiteralExpr().asString():"";
        var cu=node.findCompilationUnit().orElseThrow();
        if(output.stream().noneMatch(e->"MESSAGING_COMPONENT".equals(e.getElementType())&&name.equals(e.getIdentifier())&&file.equals(e.getFilePath())))output.add(CodeEvidenceDTO.builder().elementType("MESSAGING_COMPONENT").identifier(name).sourceComponent(name).filePath(file).lineNumber(owner.getBegin().map(p->p.line).orElse(1)).codeSnippet(protocol+" declaration").build());
        output.add(CodeEvidenceDTO.builder().elementType(type).identifier(value).sourceComponent(name).endpointAlias(protocol).filePath(file).lineNumber(node.getBegin().map(p->p.line).orElse(1)).codeSnippet(node.toString().substring(0,Math.min(500,node.toString().length()))).symbolCandidates(value.isEmpty()?candidates(cu,channel.toString()):List.of()).build());
    }
}