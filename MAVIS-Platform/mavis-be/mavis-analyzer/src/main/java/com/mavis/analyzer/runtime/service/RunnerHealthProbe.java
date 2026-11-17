package com.mavis.analyzer.runtime.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Live health check for the execution environment behind Studio Live.
 *
 * <p>Configuration readiness only proves a profile is well-formed. Runner sessions additionally
 * need a reachable Docker Engine; without it a Lab must not be advertised as runnable. The probe
 * caches its answer briefly so readiness polling does not spawn a process for every request.</p>
 */
@Component
@Slf4j
public class RunnerHealthProbe {

    private static final long CACHE_MILLIS = 30_000;
    private static final long TIMEOUT_SECONDS = 3;

    private volatile long checkedAt;
    private volatile Health cached = new Health(false, List.of("Runner health has not been probed yet"));

    public record Health(boolean ready, List<String> issues) {}

    public Health probe() {
        long now = System.currentTimeMillis();
        if (now - checkedAt < CACHE_MILLIS) return cached;
        synchronized (this) {
            long current = System.currentTimeMillis();
            if (current - checkedAt < CACHE_MILLIS) return cached;
            cached = check();
            checkedAt = current;
            return cached;
        }
    }

    protected Health check() {
        Process process = null;
        try {
            process = new ProcessBuilder("docker", "info", "--format", "{{.ServerVersion}}")
                    .redirectErrorStream(true)
                    .start();
            if (!process.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                return new Health(false, List.of("Docker Engine did not answer within 3 seconds"));
            }
            String output = new String(process.getInputStream().readNBytes(512), StandardCharsets.UTF_8).trim();
            if (process.exitValue() == 0 && !output.isBlank()) {
                return new Health(true, List.of());
            }
            log.warn("Runner health probe failed: docker info exited with {}", process.exitValue());
            return new Health(false, List.of("Docker Engine is not reachable from the backend"));
        } catch (IOException error) {
            return new Health(false, List.of("Docker CLI is unavailable: " + error.getMessage()));
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            return new Health(false, List.of("Runner health probe was interrupted"));
        } finally {
            if (process != null && process.isAlive()) process.destroyForcibly();
        }
    }
}
