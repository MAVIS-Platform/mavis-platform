package com.mavis.analyzer.graph.service.impl;

import com.mavis.common.entity.ModelElement;
import java.util.*;

/** Resolution must be unambiguous and independent of database/file iteration order. */
public final class ArchitectureResolver {
    private ArchitectureResolver() {}
    public static String path(String value) {
        if (value == null || value.isBlank()) return "";
        return value.replace('\\', '/').replaceAll("/+", "/").replaceAll("/$", "");
    }
    private static boolean under(String file, String root) {
        return !root.isEmpty() && (file.equals(root) || file.startsWith(root + "/"));
    }
    public static ModelElement owner(List<ModelElement> elements, String filePath) {
        String file = path(filePath);
        if (file.isEmpty()) return null;
        var services = elements.stream().filter(e -> "SERVICE_CONTAINER".equals(e.getElementType())).toList();
        var candidates = services.stream().filter(e -> e.getProperties() != null
                && under(file, path(e.getProperties().path("buildContext").asText("")))).toList();
        if (!candidates.isEmpty()) {
            int longest = candidates.stream().mapToInt(e -> path(e.getProperties().path("buildContext").asText()).length()).max().orElse(0);
            var nearest = candidates.stream().filter(e -> path(e.getProperties().path("buildContext").asText()).length() == longest).toList();
            return nearest.size() == 1 ? nearest.get(0) : null;
        }
        var segments = Arrays.asList(file.split("/"));
        candidates = services.stream().filter(e -> e.getName() != null && segments.contains(e.getName())).toList();
        if (candidates.size() == 1) return candidates.get(0);
        // Explicit module scope is valid; a shared repository scope is ambiguous.
        candidates = services.stream().filter(e -> under(file, path(e.getScope()))
                && (e.getProperties() == null || !path(e.getScope()).equals(path(e.getProperties().path("sourcePath").asText(""))))).toList();
        return candidates.size() == 1 ? candidates.get(0) : null;
    }
    public static ModelElement component(List<ModelElement> elements, String name, String filePath) {
        if (name == null || name.isBlank()) return null;
        var owner = owner(elements, filePath);
        if (owner == null) return null;
        var matches = elements.stream().filter(e -> "COMPONENT".equals(e.getElementType())
                && e.getParentElement() != null && same(e.getParentElement(), owner)
                && (name.equals(e.getName()) || (e.getProperties() != null
                    && name.equals(e.getProperties().path("qualifiedName").asText())))).toList();
        var exactFile = matches.stream().filter(e -> path(filePath).equals(path(e.getScope()))).toList();
        if (exactFile.size() == 1) return exactFile.get(0);
        return matches.size() == 1 ? matches.get(0) : null;
    }
    public static boolean same(ModelElement a, ModelElement b) {
        return a == b || (a.getId() != null && a.getId().equals(b.getId()));
    }
    public static ModelElement target(List<ModelElement> elements, String name) {
        if (name == null || name.isBlank() || name.contains("${")) return null;
        var matches = elements.stream().filter(e -> name.equalsIgnoreCase(e.getName())).toList();
        if (matches.size() == 1) return matches.get(0);
        String lower = name.trim().toLowerCase(Locale.ROOT);
        String stem = lower.replaceAll("-service$", "");
        var suffixMatches = elements.stream()
                .filter(e -> ("SERVICE_CONTAINER".equals(e.getElementType()) || "EXTERNAL_SYSTEM".equals(e.getElementType()))
                        && e.getName() != null)
                .filter(e -> {
                    String elLower = e.getName().toLowerCase(Locale.ROOT);
                    return elLower.endsWith("-" + lower)
                            || lower.endsWith("-" + elLower)
                            || elLower.replaceAll("-service$", "").equals(stem)
                            || elLower.endsWith("-" + stem + "-service");
                })
                .toList();
        return suffixMatches.size() == 1 ? suffixMatches.get(0) : null;
    }
    public static String technology(String image) {
        if (image == null || image.isBlank()) return null;
        String base = image.toLowerCase(Locale.ROOT).split("@", 2)[0];
        base = base.substring(base.lastIndexOf('/') + 1).split(":", 2)[0];
        return switch (base) {
            case "postgres", "postgresql" -> "PostgreSQL";
            case "mysql" -> "MySQL";
            case "mariadb" -> "MariaDB";
            case "mongo", "mongodb" -> "MongoDB";
            case "redis" -> "Redis";
            case "kafka", "cp-kafka", "confluent-kafka", "eventuate-kafka" -> "Apache Kafka";
            case "rabbitmq" -> "RabbitMQ";
            case "zookeeper", "cp-zookeeper", "eventuate-zookeeper" -> "ZooKeeper";
            case "zipkin" -> "Zipkin";
            case "dynamodb-local" -> "DynamoDB Local";
            default -> null;
        };
    }
}