package com.mavis.analyzer.javaanalyzer.visitor;

import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.*;
import java.util.*;

/** Syntax-only mapping contracts. Dynamic expressions are retained, never evaluated. */
public final class SpringHttpMappings {
    private SpringHttpMappings() {}
    public record Mapping(String method, String path, boolean pathResolved) {}
    public static boolean concreteMethod(String method) {
        return Set.of("GET","HEAD","POST","PUT","PATCH","DELETE","OPTIONS","TRACE").contains(method);
    }
    public static String attribute(AnnotationExpr annotation, String key) {
        if (annotation.isSingleMemberAnnotationExpr() && "value".equals(key))
            return value(annotation.asSingleMemberAnnotationExpr().getMemberValue());
        if (annotation.isNormalAnnotationExpr()) for (var pair:annotation.asNormalAnnotationExpr().getPairs())
            if (key.equals(pair.getNameAsString())) return value(pair.getValue());
        return "";
    }
    public static boolean literalAttribute(AnnotationExpr annotation, String key) {
        if (annotation.isSingleMemberAnnotationExpr() && "value".equals(key))
            return annotation.asSingleMemberAnnotationExpr().getMemberValue().isStringLiteralExpr();
        if (annotation.isNormalAnnotationExpr()) for (var pair:annotation.asNormalAnnotationExpr().getPairs())
            if (key.equals(pair.getNameAsString())) return pair.getValue().isStringLiteralExpr();
        return false;
    }
    private static String value(Expression expression) {
        return expression.isStringLiteralExpr() ? expression.asStringLiteralExpr().asString() : expression.toString();
    }
    public static List<String> paths(AnnotationExpr annotation) {
        if (annotation.isSingleMemberAnnotationExpr()) return values(annotation.asSingleMemberAnnotationExpr().getMemberValue());
        if (annotation.isNormalAnnotationExpr()) for (String key:List.of("path","value"))
            for (var pair:annotation.asNormalAnnotationExpr().getPairs()) if (key.equals(pair.getNameAsString())) return values(pair.getValue());
        return List.of("");
    }
    private static List<String> values(Expression expression) {
        if (expression.isArrayInitializerExpr()) return expression.asArrayInitializerExpr().getValues().stream().map(SpringHttpMappings::value).toList();
        return List.of(value(expression));
    }
    public static boolean literalPaths(AnnotationExpr annotation) {
        Expression expression=null;
        if(annotation.isSingleMemberAnnotationExpr()) expression=annotation.asSingleMemberAnnotationExpr().getMemberValue();
        if(annotation.isNormalAnnotationExpr()) for(var pair:annotation.asNormalAnnotationExpr().getPairs())
            if(Set.of("path","value").contains(pair.getNameAsString())) expression=pair.getValue();
        return expression==null || expression.isStringLiteralExpr() || (expression.isArrayInitializerExpr()
                && expression.asArrayInitializerExpr().getValues().stream().allMatch(Expression::isStringLiteralExpr));
    }
    public static List<Mapping> method(MethodDeclaration method, boolean client) {
        List<Mapping> result=new ArrayList<>();
        for(var annotation:method.getAnnotations()) {
            String name=annotation.getName().getIdentifier();
            String verb=switch(name) {
                case "GetMapping" -> "GET"; case "PostMapping" -> "POST"; case "PutMapping" -> "PUT";
                case "DeleteMapping" -> "DELETE"; case "PatchMapping" -> "PATCH"; case "RequestMapping" -> "";
                default -> null;
            };
            if(verb==null) continue;
            List<String> verbs=verb.isEmpty()?List.of(client?"GET":"ANY"):List.of(verb);
            if(name.equals("RequestMapping") && annotation.isNormalAnnotationExpr())
                for(var pair:annotation.asNormalAnnotationExpr().getPairs()) if(pair.getNameAsString().equals("method"))
                    verbs=values(pair.getValue()).stream().map(v->v.substring(v.lastIndexOf('.')+1)).toList();
            for(String v:verbs) for(String path:paths(annotation)) result.add(new Mapping(concreteMethod(v)||"ANY".equals(v)?v:"UNRESOLVED",path,literalPaths(annotation) && !path.contains("${")));
        }
        return result;
    }
    public static String join(String... parts) {
        String joined=String.join("/",parts).replaceAll("/+","/");
        String normalized=(joined.startsWith("/")?joined:"/"+joined).replaceAll("/$","");
        return normalized.isEmpty()?"/":normalized;
    }
    public static String routeKey(String path) {
        return join(path).replaceAll("\\{[^{}]+}","{variable}");
    }
    public static String snippet(com.github.javaparser.ast.Node node) {
        String text=node.getTokenRange().map(Object::toString).orElseGet(node::toString);
        return safeText(text.substring(0,Math.min(text.length(),4000)));
    }
    public static String safeText(String text) {
        return com.mavis.analyzer.runtime.util.SecretRedactor.redactString(text)
                .replaceAll("(?i)(https?://)[^\\s/\"@]+@", "$1[REDACTED]@");
    }
}
