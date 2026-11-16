package com.mavis.workerclient;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.*;
import java.time.Clock;
import java.time.Duration;
import java.util.concurrent.*;
import static com.mavis.workerclient.WorkerContract.*;

public final class ScopedWorkerClient {
    private final URI endpoint;
    private final String serviceKey;
    private final ArtifactGrantIssuer issuer;
    private final HttpClient http;
    private final Clock clock;
    private final int maxResponseBytes;
    private final ObjectMapper json = new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    public ScopedWorkerClient(URI base, String serviceKey, ArtifactGrantIssuer issuer, Clock clock) {
        this(base, serviceKey, issuer, clock, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build(), 8 * 1024 * 1024);
    }
    public ScopedWorkerClient(URI base, String serviceKey, ArtifactGrantIssuer issuer, Clock clock, HttpClient http, int maxResponseBytes) {
        if (base == null || !base.isAbsolute() || base.getHost() == null || !(base.getScheme().equals("http") || base.getScheme().equals("https")) ||
                base.getUserInfo() != null || base.getQuery() != null || base.getFragment() != null || serviceKey == null || serviceKey.isBlank() || serviceKey.length() > 512 ||
                issuer == null || clock == null || http == null || http.followRedirects() != HttpClient.Redirect.NEVER || maxResponseBytes < 1 || maxResponseBytes > 64 * 1024 * 1024)
            throw new IllegalArgumentException("Invalid Worker transport configuration");
        endpoint = URI.create(base.toString().replaceAll("/+$", "") + "/api/v1/dotnet/analyze");
        this.serviceKey = serviceKey; this.issuer = issuer; this.clock = clock; this.http = http; this.maxResponseBytes = maxResponseBytes;
    }
    public Outcome analyze(Context context) {
        Duration remaining = Duration.between(clock.instant(), context.deadlineUtc());
        if (remaining.isNegative() || remaining.isZero()) return Outcome.failure(Status.TIMED_OUT, "DEADLINE_EXCEEDED");
        if (Thread.currentThread().isInterrupted()) return Outcome.failure(Status.CANCELLED, "CANCELLED");
        try {
            var body = json.writeValueAsBytes(issuer.issue(context));
            Duration timeout = remaining.plusSeconds(2).compareTo(Duration.ofSeconds(30)) > 0 ? Duration.ofSeconds(30) : remaining.plusSeconds(2);
            HttpRequest request = HttpRequest.newBuilder(endpoint).timeout(timeout).header("Content-Type", "application/json")
                    .header("X-Mavis-Worker-Key", serviceKey).POST(HttpRequest.BodyPublishers.ofByteArray(body)).build();
            CompletableFuture<HttpResponse<byte[]>> pending = http.sendAsync(request, ignored -> new BoundedBodySubscriber(maxResponseBytes));
            try {
                HttpResponse<byte[]> response = pending.get(Math.max(1, timeout.toMillis()), TimeUnit.MILLISECONDS);
                if (response.statusCode() == 408) return Outcome.failure(Status.TIMED_OUT, "DEADLINE_EXCEEDED");
                if (response.statusCode() < 200 || response.statusCode() >= 300)
                    return Outcome.failure(response.statusCode() < 500 ? Status.REJECTED : Status.FAILED, "WORKER_HTTP_" + response.statusCode());
                Result result = json.readValue(response.body(), Result.class); ResultValidator.validate(result, context);
                if (!clock.instant().isBefore(context.deadlineUtc())) return Outcome.failure(Status.TIMED_OUT, "LATE_RESULT");
                return new Outcome(Status.COMPLETED, "OK", result);
            } finally { if (!pending.isDone()) pending.cancel(true); }
        } catch (TimeoutException exception) { return Outcome.failure(Status.TIMED_OUT, "TRANSPORT_TIMEOUT"); }
        catch (ExecutionException exception) {
            Throwable cause = exception.getCause();
            if (cause instanceof BoundedBodySubscriber.LimitExceeded) return Outcome.failure(Status.REJECTED, "RESULT_TOO_LARGE");
            return Outcome.failure(cause instanceof HttpTimeoutException ? Status.TIMED_OUT : Status.FAILED,
                    cause instanceof HttpTimeoutException ? "TRANSPORT_TIMEOUT" : "WORKER_UNAVAILABLE");
        }
        catch (InterruptedException exception) { Thread.currentThread().interrupt(); return Outcome.failure(Status.CANCELLED, "CANCELLED"); }
        catch (IllegalArgumentException | com.fasterxml.jackson.core.JsonProcessingException exception) { return Outcome.failure(Status.REJECTED, "INVALID_RESULT_OR_SCOPE"); }
        catch (IOException exception) { return Outcome.failure(Status.REJECTED, "INVALID_RESULT"); }
    }
}
