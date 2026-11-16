package com.mavis.analyzer.javaanalyzer.parser;

import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.TypeDeclaration;
import java.util.*;

/** Compact lexical context; project types are resolved after all source files have been indexed. */
record JavaTypeScope(String packageName, Map<String, String> explicitImports,
                     List<String> wildcardImports, List<String> declaredTypes) {
    static JavaTypeScope from(CompilationUnit unit) {
        Map<String, String> explicit = new LinkedHashMap<>();
        List<String> wildcard = new ArrayList<>(), declared = new ArrayList<>();
        unit.getImports().forEach(i -> {
            if (i.isAsterisk()) { if (!i.isStatic()) wildcard.add(i.getNameAsString()); }
            else explicit.put(i.getName().getIdentifier(), i.getNameAsString());
        });
        unit.findAll(TypeDeclaration.class).forEach(t -> ((TypeDeclaration<?>) t).getFullyQualifiedName().ifPresent(declared::add));
        return new JavaTypeScope(unit.getPackageDeclaration().map(p -> p.getNameAsString()).orElse(""), explicit, wildcard, declared);
    }

    String resolve(String symbol, Set<String> projectTypes) {
        if (symbol == null || symbol.isBlank()) return null;
        String first = symbol.split("\\.", 2)[0], suffix = symbol.substring(first.length());
        // A fully qualified declaration must never degrade to a simple-name match.
        if (symbol.contains(".") && Character.isLowerCase(first.charAt(0))) return projectTypes.contains(symbol) ? symbol : null;
        String imported = explicitImports.get(first);
        if (imported != null) return projectTypes.contains(imported + suffix) ? imported + suffix : null;
        var local = declaredTypes.stream().filter(t -> t.endsWith("." + symbol) || t.equals(symbol)).filter(projectTypes::contains).distinct().toList();
        if (local.size() == 1) return local.get(0);
        if (local.size() > 1) return null;
        String samePackage = packageName.isEmpty() ? symbol : packageName + "." + symbol;
        if (projectTypes.contains(samePackage)) return samePackage;
        var matches = wildcardImports.stream().map(p -> p + "." + symbol).filter(projectTypes::contains).distinct().toList();
        return matches.size() == 1 ? matches.get(0) : null;
    }
}
