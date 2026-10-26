package com.mavis.analyzer.detector.docker.service.impl;

import com.mavis.analyzer.detector.docker.dto.DetectedConnectionDTO;
import com.mavis.analyzer.detector.docker.dto.DetectedContainerDTO;
import java.nio.file.*;
import java.util.*;
import java.util.regex.Pattern;

final class ComposeReferenceScanner {
    private ComposeReferenceScanner() { }

    static void scan(Path root, Path compose, List<String> lines, List<DetectedContainerDTO> containers) {
        for (int index = 0; index < containers.size(); index++) {
            var source = containers.get(index);
            int end = index + 1 < containers.size() ? containers.get(index + 1).getLineNumber() - 1 : lines.size();
            int environmentIndent = -1, linksIndent = -1;
            String dockerfileName = "Dockerfile";
            for (int i = source.getLineNumber(); i < end; i++) {
                String raw = lines.get(i), text = raw.trim();
                if (text.isEmpty() || text.startsWith("#")) continue;
                int indent = raw.length() - raw.stripLeading().length();
                if (indent <= environmentIndent) environmentIndent = -1;
                if (indent <= linksIndent) linksIndent = -1;
                if (text.startsWith("environment:")) {
                    environmentIndent = indent;
                    String inline = text.substring(12).trim();
                    if (inline.startsWith("{") || inline.startsWith("[")) {
                        for (String entry : inline.substring(1, inline.length() - 1).split(",(?=\\s*[A-Za-z_\"'])")) inspectEnvironment(source, entry, i + 1, containers);
                    }
                } else if (environmentIndent >= 0) {
                    inspectEnvironment(source, text.replaceFirst("^-\\s*", ""), i + 1, containers);
                } else if (text.startsWith("links:")) {
                    linksIndent = indent;
                    String inline = text.substring(6).trim();
                    if (inline.startsWith("[") && inline.endsWith("]")) for (String link : inline.substring(1, inline.length() - 1).split(",")) addLink(source, link, i + 1, containers);
                } else if (linksIndent >= 0 && text.startsWith("-")) {
                    addLink(source, text.substring(1), i + 1, containers);
                } else if (text.startsWith("dockerfile:")) {
                    dockerfileName = unquote(text.substring(11));
                }
            }
            for (var dependency : source.getDependsOn()) {
                var target = containers.stream().filter(c -> c.getServiceName().equals(dependency.getTargetService())).findFirst().orElse(null);
                if (target != null && source.getConnections().stream().noneMatch(c -> c.targetService().equals(target.getServiceName()))) {
                    add(source, target, "STARTUP_DEPENDENCY", targetPort(target), "depends_on", dependency.getLineNumber());
                }
            }
            inspectArtifact(root, compose, source, dockerfileName);
        }
    }

    private static void inspectEnvironment(DetectedContainerDTO source, String entry, int line, List<DetectedContainerDTO> containers) {
        entry = unquote(entry);
        var assignment = Pattern.compile("^['\"]?([A-Za-z_][A-Za-z0-9_]*)['\"]?\\s*[:=]\\s*(.*)$").matcher(entry);
        if (!assignment.matches()) return;
        String value = unquote(assignment.group(2));
        if (value.contains("${")) return; // An unresolved substitution is not an endpoint.
        for (var target : containers) {
            if (target == source) continue;
            var ref = Pattern.compile("(?:^|://|[,\\s])" + Pattern.quote(target.getServiceName()) + "(?::([0-9]{1,5}))?(?=$|[/,\\s?#])").matcher(value);
            while (ref.find()) {
                boolean uri = value.substring(0, ref.end()).contains("://");
                if (ref.group(1) == null && !uri && !value.equals(target.getServiceName())) continue;
                Integer port = ref.group(1) == null ? targetPort(target) : Integer.valueOf(ref.group(1));
                if (port != null && (port < 1 || port > 65535)) continue;
                String protocol = value.startsWith("https://") ? "HTTPS" : value.startsWith("http://") ? "HTTP" : "TCP";
                add(source, target, protocol, port, "environment:" + assignment.group(1), line);
            }
        }
    }

    private static void addLink(DetectedContainerDTO source, String value, int line, List<DetectedContainerDTO> containers) {
        String name = unquote(value).split(":", 2)[0];
        containers.stream().filter(c -> c.getServiceName().equals(name)).findFirst().ifPresent(target -> add(source, target, "DECLARED_LINK", targetPort(target), "links", line));
    }

    private static void add(DetectedContainerDTO source, DetectedContainerDTO target, String protocol, Integer port, String declaration, int line) {
        if (source == target) return;
        if (source.getConnections().stream().noneMatch(c -> c.targetService().equals(target.getServiceName()) && c.protocol().equals(protocol) && Objects.equals(c.port(), port))) {
            source.getConnections().add(new DetectedConnectionDTO(target.getServiceName(), protocol, port, declaration, line));
        }
    }

    private static Integer targetPort(DetectedContainerDTO target) {
        return target.getPorts().stream().map(p -> p.split("/")[0]).map(p -> p.substring(p.lastIndexOf(':') + 1)).filter(p -> p.matches("[0-9]{1,5}")).map(Integer::valueOf).filter(p -> p > 0 && p <= 65535).findFirst().orElse(null);
    }

    private static void inspectArtifact(Path root, Path compose, DetectedContainerDTO source, String dockerfileName) {
        if (source.getBuildContext() == null || source.getBuildContext().contains("${")) return;
        try {
            Path context = compose.getParent().resolve(source.getBuildContext()).normalize().toRealPath();
            Path dockerfile = context.resolve(dockerfileName).normalize().toRealPath();
            if (!context.startsWith(root.toRealPath()) || !dockerfile.startsWith(context) || Files.size(dockerfile) > 131072) return;
            var content = Files.readAllLines(dockerfile);
            for (int i = 0; i < content.size(); i++) {
                String text = content.get(i).trim();
                if (!text.matches("(?i)^(COPY|ADD)\\s+.*")) continue;
                var jars = Pattern.compile("([^\\s\"',\\[\\]]+\\.jar)(?=$|[\\s\"',\\]])").matcher(text);
                String artifact = null;
                while (jars.find()) if (!jars.group(1).matches(".*[?*$].*")) artifact = jars.group(1);
                if (artifact != null) {
                    source.setArtifactName(artifact.substring(artifact.lastIndexOf('/') + 1));
                    source.setArtifactLocator(root.toRealPath().relativize(dockerfile) + ":" + (i + 1));
                    return;
                }
            }
        } catch (java.io.IOException | java.nio.file.InvalidPathException ignored) { /* Missing or external build inputs remain unresolved. */ }
    }

    private static String unquote(String text) {
        text = text.trim();
        if (text.length() > 1 && ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'")))) return text.substring(1, text.length() - 1);
        return text;
    }
}
