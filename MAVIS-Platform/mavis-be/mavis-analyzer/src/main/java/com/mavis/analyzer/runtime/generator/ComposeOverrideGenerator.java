package com.mavis.analyzer.runtime.generator;

import org.springframework.stereotype.Component;

import java.util.Collection;

@Component
public class ComposeOverrideGenerator {

    public static final String SANDBOX_NETWORK = "mavis_sandbox_net";
    public static final String OTEL_ENDPOINT = "http://otel-collector:4317";
    public static final String DEFAULT_CPUS = "1.0";
    public static final String DEFAULT_MEM_LIMIT = "1024m";
    public static final int DEFAULT_PIDS_LIMIT = 128;

    /**
     * Sinh nội dung YAML cho file docker-compose.mavis-override.yml
     * áp đặt giới hạn tài nguyên, cô lập mạng sandbox và gán biến môi trường OpenTelemetry.
     */
    public String generateOverrideYaml(Collection<String> serviceNames) {
        StringBuilder sb = new StringBuilder();
        sb.append("version: '3.8'\n\n");
        sb.append("services:\n");

        if (serviceNames == null || serviceNames.isEmpty()) {
            sb.append("  default-service:\n");
            appendServiceOverrides(sb, "default-service");
        } else {
            for (String serviceName : serviceNames) {
                sb.append("  ").append(serviceName).append(":\n");
                appendServiceOverrides(sb, serviceName);
            }
        }

        sb.append("\nnetworks:\n");
        sb.append("  ").append(SANDBOX_NETWORK).append(":\n");
        sb.append("    driver: bridge\n");

        return sb.toString();
    }

    private void appendServiceOverrides(StringBuilder sb, String serviceName) {
        sb.append("    cpus: '").append(DEFAULT_CPUS).append("'\n");
        sb.append("    mem_limit: ").append(DEFAULT_MEM_LIMIT).append("\n");
        sb.append("    pids_limit: ").append(DEFAULT_PIDS_LIMIT).append("\n");
        sb.append("    networks:\n");
        sb.append("      - ").append(SANDBOX_NETWORK).append("\n");
        sb.append("    environment:\n");
        sb.append("      - OTEL_EXPORTER_OTLP_ENDPOINT=").append(OTEL_ENDPOINT).append("\n");
        sb.append("      - OTEL_SERVICE_NAME=").append(serviceName).append("\n");
    }
}
