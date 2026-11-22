package com.mavis.analyzer.runtime.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.runtime.security.RunnerServiceAuthGuard;
import com.mavis.common.entity.RuntimeSession;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.RuntimeSessionRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.security.CourseLabPolicy;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.OffsetDateTime;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class RuntimeStudioService {
    private final RuntimeSessionRepository sessions;
    private final AccessPolicyService access;
    private final CourseLabPolicy labs;
    private final RunnerServiceAuthGuard runner;
    private final ObjectMapper mapper;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    @org.springframework.context.annotation.Lazy
    private com.mavis.analyzer.runtime.service.impl.RuntimeQueueCoordinator queueCoordinator;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private StudioTelemetryHub telemetryHub;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private jakarta.persistence.EntityManager entityManager;

    public record ActionRequest(@NotNull UUID actionId,
                                @NotNull @Pattern(regexp="START|STOP|SCALE|PAUSE|RESUME|THROTTLE_CPU|SET_LOAD|SET_ENV|SWAP_VERSION") String action,
                                @NotBlank @Size(max=128) String service,
                                @Min(1) @Max(8) Integer replicas,
                                @Min(10) @Max(100) Integer cpuPercent,
                                @Min(1) @Max(50) Integer targetRps,
                                @Size(max=64) String envKey,
                                @Size(max=256) String envValue,
                                @Size(max=256) String targetImage) {
        public ActionRequest(UUID actionId, String action, String service, Integer replicas) {
            this(actionId, action, service, replicas, null, null, null, null, null);
        }
        public ActionRequest(UUID actionId, String action, String service, Integer replicas, Integer cpuPercent) {
            this(actionId, action, service, replicas, cpuPercent, null, null, null, null);
        }
        public ActionRequest(UUID actionId, String action, String service, Integer replicas, Integer cpuPercent, Integer targetRps) {
            this(actionId, action, service, replicas, cpuPercent, targetRps, null, null, null);
        }
    }
    public record PredictionRequest(
            @NotEmpty @Size(max = 20) java.util.List<@NotBlank @Size(max = 128) String> predictedServices,
            @Size(max = 2000) String rationale) {}
    public record AckRequest(@NotNull UUID actionId, @NotNull UUID sessionId, @NotBlank String resourceProject,
                             @NotNull @Pattern(regexp="CONFIRMED|FAILED") String status, JsonNode result) {}
    public record TelemetryRequest(@NotNull UUID sessionId, @NotBlank String resourceProject,
                                   @NotNull JsonNode telemetry) {}
    public record CaptureRequest(@NotBlank @Size(max=4000) String explanation,
        @Size(max=1500000) String imageData, @Size(max=100) String observedAt) {
        public CaptureRequest(String explanation) {this(explanation,null,null);}
    }
    @Transactional(readOnly = true)
    public JsonNode receipt(UUID id) {
        RuntimeSession session=sessions.findById(id).orElseThrow(()->error(ErrorCode.NOT_FOUND,"Runtime session not found."));
        access.requireProjectReadAccess(session.getProject());
        ObjectNode control=control(session);
        if(session.getRunnerReceiptJson()==null) throw error(ErrorCode.NOT_FOUND,"Runner receipt has not been committed.");
        ObjectNode result=mapper.createObjectNode().put("sessionId",id.toString()).put("digest",session.getReceiptDigest());
        result.set("signature",control.path("receiptSignature"));
        result.set("receipt",session.getRunnerReceiptJson().deepCopy());
        return result;
    }
    @Transactional(readOnly = true)
    public JsonNode snapshot(UUID id, UUID snapshotId) {
        RuntimeSession session=sessions.findById(id).orElseThrow(()->error(ErrorCode.NOT_FOUND,"Runtime session not found."));
        access.requireProjectReadAccess(session.getProject());
        for(JsonNode snapshot:control(session).withArray("snapshots"))
            if(snapshotId.toString().equals(snapshot.path("id").asText())) return snapshot;
        throw error(ErrorCode.NOT_FOUND,"Studio snapshot not found.");
    }

    @Transactional
    public JsonNode telemetry(UUID id, TelemetryRequest request) {
        runner.requireRunnerService();
        RuntimeSession session = sessions.findById(id)
                .orElseThrow(() -> error(ErrorCode.NOT_FOUND, "Runtime session not found."));
        if (!id.equals(request.sessionId()) || !request.resourceProject().equals(session.getResourceProject()))
            throw error(ErrorCode.CONFLICT, "Runner allocation mismatch.");
        if (session.getCancelRequestedAt() != null || session.getRunnerReceiptJson() != null ||
            !("RUNNING".equals(session.getExecutionStatus()) || "ALLOCATED".equals(session.getExecutionStatus())))
            return mapper.createObjectNode().put("sessionId", id.toString()).put("resourceProject", request.resourceProject());
        if (!request.telemetry().isObject() || request.telemetry().toString().length() > 524288)
            throw error(ErrorCode.BAD_REQUEST, "Telemetry exceeds the session budget.");
        JsonNode redacted = com.mavis.analyzer.runtime.util.SecretRedactor.redactJson(request.telemetry());
        String nowIso = OffsetDateTime.now().toString();
        if (telemetryHub != null) {
            boolean forcePersist = !"RUNNING".equals(session.getExecutionStatus());
            boolean shouldPersistDb = telemetryHub.publish(id, redacted, nowIso, forcePersist, session.getExecutionStatus());
            if (!shouldPersistDb) {
                return mapper.createObjectNode().put("sessionId", id.toString()).put("resourceProject", request.resourceProject());
            }
        }
        // Flush any outer test-tx changes, then detach the unlocked L1 entity before acquiring the row lock.
        if (entityManager != null) {
            entityManager.flush();
            entityManager.detach(session);
        }
        RuntimeSession lockedSession = locked(id);
        if (!request.resourceProject().equals(lockedSession.getResourceProject()))
            throw error(ErrorCode.CONFLICT, "Runner allocation mismatch.");
        if (lockedSession.getCancelRequestedAt() != null || lockedSession.getRunnerReceiptJson() != null ||
            !("RUNNING".equals(lockedSession.getExecutionStatus()) || "ALLOCATED".equals(lockedSession.getExecutionStatus())))
            return mapper.createObjectNode().put("sessionId", id.toString()).put("resourceProject", request.resourceProject());
        ObjectNode control = control(lockedSession);
        String previousObservedAt = control.path("telemetry").path("observedAt").asText("");
        control.set("telemetry", redacted);
        control.put("telemetryReceivedAt", nowIso);
        // Keep the last few frame ids: with 1-3s frames the UI's frame may lag slightly behind when the user clicks Capture.
        if (!previousObservedAt.isBlank()) {
            var recent = control.withArray("recentObservedAt");
            recent.add(previousObservedAt);
            while (recent.size() > 6) recent.remove(0);
        }
        save(lockedSession, control);
        if ("RUNNING".equals(lockedSession.getExecutionStatus())
                && (extractExerciseCriteria(lockedSession) != null || control.hasNonNull("prediction"))) {
            notifyStateAfterCommit(lockedSession);
        }
        return mapper.createObjectNode().put("sessionId", id.toString()).put("resourceProject", request.resourceProject());
    }

    @Transactional
    public JsonNode capture(UUID id, CaptureRequest request) {
        RuntimeSession session = locked(id);
        access.requireProjectWriteAccess(session.getProject());
        if (queueCoordinator != null) queueCoordinator.recordUiHeartbeat(id);
        ObjectNode control = control(session);
        expireStaleActions(control);
        StudioTelemetryHub.SessionSnapshot liveSnapshot = telemetryHub != null ? telemetryHub.latest(id).orElse(null) : null;
        JsonNode effectiveTelemetry = liveSnapshot != null ? liveSnapshot.latestTelemetry()
                : (control.hasNonNull("telemetry") ? control.get("telemetry") : null);
        if (effectiveTelemetry == null || effectiveTelemetry.isNull())
            throw error(ErrorCode.UNPROCESSABLE_ENTITY, "Wait for observed telemetry before capturing evidence.");
        if (request.observedAt() != null && !request.observedAt().equals(effectiveTelemetry.path("observedAt").asText())) {
            boolean recentFrame = request.observedAt().equals(control.path("telemetry").path("observedAt").asText());
            for (JsonNode seen : control.withArray("recentObservedAt")) recentFrame |= request.observedAt().equals(seen.asText());
            if (liveSnapshot != null) recentFrame |= liveSnapshot.recentObservedAt().contains(request.observedAt());
            if (!recentFrame) throw error(ErrorCode.CONFLICT, "Telemetry changed. Capture the refreshed view again.");
        }
        for(JsonNode action:control.withArray("actions"))
            if(java.util.Set.of("PENDING","RUNNING").contains(action.path("status").asText()))
                throw error(ErrorCode.CONFLICT,"Wait for the action result before capturing evidence.");
        if (control.withArray("snapshots").size() >= 8) throw error(ErrorCode.CONFLICT, "Snapshot limit reached.");
        // Persist the latest in-memory telemetry frame durably alongside the frozen snapshot.
        if (liveSnapshot != null) {
            control.set("telemetry", effectiveTelemetry.deepCopy());
            if (liveSnapshot.receivedAt() != null) control.put("telemetryReceivedAt", liveSnapshot.receivedAt());
        }
        ObjectNode evidence = mapper.createObjectNode().put("id", UUID.randomUUID().toString())
            .put("sessionId", id.toString()).put("sourceSnapshotId", session.getSourceSnapshot().getId().toString())
            .put("modelVersionId", session.getModelVersion() == null ? "" : session.getModelVersion().getId().toString())
            .put("capturedAt", OffsetDateTime.now().toString()).put("explanation", request.explanation().trim());
        evidence.set("telemetry", effectiveTelemetry.deepCopy());
        evidence.set("actions", control.withArray("actions").deepCopy());
        JsonNode exerciseCriteria = extractExerciseCriteria(session);
        if (control.hasNonNull("prediction")) {
            evidence.set("prediction", control.get("prediction").deepCopy());
        }
        if (exerciseCriteria != null || control.hasNonNull("prediction")) {
            java.util.List<JsonNode> history = liveSnapshot != null ? liveSnapshot.history() : java.util.List.of();
            evidence.set("exerciseEvaluation",
                    StudioExerciseEvaluator.evaluate(mapper, exerciseCriteria, control, effectiveTelemetry, history));
        }
        if(request.imageData()!=null) {
            try {
                if(!request.imageData().startsWith("data:image/png;base64,") || request.imageData().length()>1500000) throw new IllegalArgumentException();
                byte[] png=java.util.Base64.getDecoder().decode(request.imageData().substring(22));
                if(png.length<24 || !java.util.Arrays.equals(java.util.Arrays.copyOf(png,8),new byte[]{(byte)137,80,78,71,13,10,26,10}))
                    throw new IllegalArgumentException();
                var dimensions=java.nio.ByteBuffer.wrap(png,16,8);
                int width=dimensions.getInt(),height=dimensions.getInt();
                if(width<1||height<1||width>2000||height>2000)throw new IllegalArgumentException();
                evidence.put("imageData",request.imageData());
            } catch(IllegalArgumentException invalid) {throw error(ErrorCode.BAD_REQUEST,"Snapshot image must be a bounded PNG.");}
        }
        try {
            evidence.put("digest", com.mavis.analyzer.runtime.utils.CanonicalReceiptDigestUtils.computeDigest(evidence));
        } catch (Exception failure) { throw error(ErrorCode.INTERNAL_SERVER_ERROR, "Could not freeze snapshot."); }
        control.withArray("snapshots").add(evidence);
        control.put("lastUiActivityAt", OffsetDateTime.now().toString());
        save(session, control);
        notifyStateAfterCommit(session);
        return evidence;
    }

    @Transactional(readOnly = true)
    public JsonNode state(UUID id) {
        RuntimeSession session = sessions.findById(id).orElseThrow(() -> error(ErrorCode.NOT_FOUND, "Runtime session not found."));
        access.requireProjectReadAccess(session.getProject());
        if (queueCoordinator != null) queueCoordinator.recordUiHeartbeat(id);
        return view(session);
    }

    /** Opens a real-time Server-Sent Events stream for live telemetry and action transitions. */
    @Transactional(readOnly = true)
    public org.springframework.web.servlet.mvc.method.annotation.SseEmitter subscribeStream(UUID id) {
        RuntimeSession session = sessions.findById(id).orElseThrow(() -> error(ErrorCode.NOT_FOUND, "Runtime session not found."));
        access.requireProjectReadAccess(session.getProject());
        if (queueCoordinator != null) queueCoordinator.recordUiHeartbeat(id);
        JsonNode initial = view(session);
        if (telemetryHub == null) {
            throw error(ErrorCode.INTERNAL_SERVER_ERROR, "Studio stream hub is unavailable.");
        }
        return telemetryHub.subscribe(id, initial);
    }

    @Transactional
    public JsonNode submitPrediction(UUID id, PredictionRequest request) {
        RuntimeSession session = locked(id);
        access.requireProjectWriteAccess(session.getProject());
        if (queueCoordinator != null) queueCoordinator.recordUiHeartbeat(id);
        requireRunning(session);
        ObjectNode control = control(session);
        if (control.path("finishRequested").asBoolean()) throw error(ErrorCode.CONFLICT, "Studio is finishing.");
        if (control.hasNonNull("prediction")) {
            throw error(ErrorCode.CONFLICT, "Change Impact prediction is already locked for this session.");
        }
        for (JsonNode action : control.withArray("actions")) {
            if ("CONFIRMED".equals(action.path("status").asText())) {
                throw error(ErrorCode.CONFLICT, "Lock your Change Impact prediction before applying a change.");
            }
        }
        var allowedServices = session.getConfirmedServiceMappings() == null
                ? Set.<String>of()
                : session.getConfirmedServiceMappings().keySet();
        java.util.List<String> cleaned = request.predictedServices().stream()
                .map(s -> s == null ? "" : s.trim())
                .filter(s -> !s.isBlank())
                .distinct()
                .sorted()
                .toList();
        if (cleaned.isEmpty()) {
            throw error(ErrorCode.BAD_REQUEST, "Select at least one service to predict.");
        }
        for (String svc : cleaned) {
            if (!allowedServices.contains(svc) || "mavis-collector".equals(svc)) {
                throw error(ErrorCode.BAD_REQUEST, "Predicted service is outside the confirmed session scope: " + svc);
            }
        }
        ObjectNode prediction = mapper.createObjectNode();
        var arr = prediction.putArray("predictedServices");
        cleaned.forEach(arr::add);
        prediction.put("rationale", request.rationale() == null ? "" : request.rationale().trim());
        prediction.put("lockedAt", OffsetDateTime.now().toString());
        control.set("prediction", prediction);
        control.put("lastUiActivityAt", OffsetDateTime.now().toString());
        save(session, control);
        notifyStateAfterCommit(session);
        return view(session);
    }

    @Transactional
    public JsonNode submit(UUID id, ActionRequest request) {
        RuntimeSession session = locked(id);
        access.requireProjectWriteAccess(session.getProject());
        if (queueCoordinator != null) queueCoordinator.recordUiHeartbeat(id);
        labs.requireRuntimeReadiness(session.getProject());
        ObjectNode control = control(session);
        for (JsonNode action : control.withArray("actions")) {
            if (request.actionId().toString().equals(action.path("actionId").asText())) {
                if (!request.action().equals(action.path("action").asText()) ||
                    !request.service().equals(action.path("service").asText()) ||
                    (request.replicas() == null ? action.hasNonNull("replicas") : request.replicas() != action.path("replicas").asInt()) ||
                    (request.cpuPercent() == null ? action.hasNonNull("cpuPercent") : request.cpuPercent() != action.path("cpuPercent").asInt()) ||
                    (request.targetRps() == null ? action.hasNonNull("targetRps") : request.targetRps() != action.path("targetRps").asInt()) ||
                    !java.util.Objects.equals(request.envKey(), action.hasNonNull("envKey") ? action.path("envKey").asText() : null) ||
                    !java.util.Objects.equals(request.envValue(), action.hasNonNull("envValue") ? action.path("envValue").asText() : null) ||
                    !java.util.Objects.equals(request.targetImage(), action.hasNonNull("targetImage") ? action.path("targetImage").asText() : null))
                    throw error(ErrorCode.CONFLICT, "Action ID was already used for a different command.");
                return view(session);
            }
        }
        requireRunning(session);
        var topology = PreparedStudioTopology.read(
            session.getScenarioConfig().path("profile"),
            session.getConfirmedServiceMappings() == null ? Set.of() : session.getConfirmedServiceMappings().keySet(), mapper);
        JsonNode allowedActionsNode = session.getScenarioConfig() == null ? null : session.getScenarioConfig().path("allowedActions");
        if (allowedActionsNode != null && allowedActionsNode.isArray() && !allowedActionsNode.isEmpty()) {
            Set<String> allowedSet = new java.util.HashSet<>();
            for (JsonNode entry : allowedActionsNode) {
                if (entry != null && entry.isTextual() && !entry.asText().isBlank()) {
                    allowedSet.add(entry.asText().trim().toUpperCase(Locale.ROOT));
                }
            }
            if (!allowedSet.isEmpty()) {
                String requestedAction = request.action().toUpperCase(Locale.ROOT);
                boolean permitted = allowedSet.contains(requestedAction);
                if (!permitted && topology != null) {
                    boolean isController = false;
                    for (var link : topology.path("connections")) {
                        if (request.service().equals(link.path("controllerService").asText())) {
                            isController = true;
                            break;
                        }
                    }
                    if (isController) {
                        permitted = ("START".equals(requestedAction) && allowedSet.contains("CONNECT"))
                                || ("STOP".equals(requestedAction) && allowedSet.contains("DISCONNECT"));
                    }
                }
                if (!permitted) {
                    throw new BusinessException(ErrorCode.FORBIDDEN, "STUDIO_ACTION_NOT_ALLOWED",
                            "This lab does not allow " + request.action() + ".");
                }
            }
        }
        if (topology != null) {
            boolean allowed = false;
            for (var block : topology.path("blocks"))
                allowed |= request.service().equals(block.path("service").asText()) &&
                    (!"SCALE".equals(request.action()) || block.path("canScale").asBoolean());
            for (var link : topology.path("connections"))
                allowed |= request.service().equals(link.path("controllerService").asText()) &&
                    !("SCALE".equals(request.action()) || "THROTTLE_CPU".equals(request.action()) || "SET_LOAD".equals(request.action())
                            || "SET_ENV".equals(request.action()) || "SWAP_VERSION".equals(request.action()));
            if (!allowed) throw error(ErrorCode.BAD_REQUEST, "Action is not enabled for this prepared block or connection.");
        }
        if (control.path("finishRequested").asBoolean()) throw error(ErrorCode.CONFLICT, "Studio is finishing.");
        if (control.withArray("actions").size() >= 32) throw error(ErrorCode.CONFLICT, "Studio action limit reached.");
        expireStaleActions(control);
        for (JsonNode action : control.withArray("actions"))
            if ("PENDING".equals(action.path("status").asText()) || "RUNNING".equals(action.path("status").asText()))
                throw error(ErrorCode.CONFLICT, "Wait for the current action to complete.");
        if (session.getConfirmedServiceMappings() == null || !session.getConfirmedServiceMappings().containsKey(request.service()) ||
            "mavis-collector".equals(request.service()))
            throw error(ErrorCode.BAD_REQUEST, "Service is outside the confirmed session scope.");
        if (("SCALE".equals(request.action())) != (request.replicas() != null))
            throw error(ErrorCode.BAD_REQUEST, "Replicas are required only for SCALE.");
        if (("THROTTLE_CPU".equals(request.action())) != (request.cpuPercent() != null))
            throw error(ErrorCode.BAD_REQUEST, "cpuPercent (10-100) is required only for THROTTLE_CPU.");
        if (("SET_LOAD".equals(request.action())) != (request.targetRps() != null))
            throw error(ErrorCode.BAD_REQUEST, "targetRps (1-50) is required only for SET_LOAD.");
        if (("SET_ENV".equals(request.action())) != (request.envKey() != null || request.envValue() != null))
            throw error(ErrorCode.BAD_REQUEST, "envKey and envValue are required only for SET_ENV.");
        if ("SET_ENV".equals(request.action())) {
            String k = request.envKey() == null ? "" : request.envKey().trim();
            if (!k.matches("^[A-Z][A-Z0-9_]{0,63}$") || "PATH".equals(k)
                    || java.util.List.of("OTEL_", "JAVA_", "JDK_", "DOTNET_", "CORECLR_", "LD_", "MAVIS_").stream().anyMatch(k::startsWith)
                    || request.envValue() == null || request.envValue().contains("\n") || request.envValue().contains("\r") || request.envValue().contains("\0")) {
                throw error(ErrorCode.BAD_REQUEST, "Invalid or reserved environment variable override.");
            }
            JsonNode allow = session.getScenarioConfig().path("profile").path("allowedEnvKeys").path(request.service());
            if (allow.isArray() && !allow.isEmpty()) {
                boolean listed = false;
                for (JsonNode entry : allow) listed |= k.equals(entry.asText(""));
                if (!listed) throw error(ErrorCode.BAD_REQUEST, "Environment variable is not in the lecturer allowlist for this service.");
            }
        }
        if (("SWAP_VERSION".equals(request.action())) != (request.targetImage() != null))
            throw error(ErrorCode.BAD_REQUEST, "targetImage is required only for SWAP_VERSION.");
        if ("SWAP_VERSION".equals(request.action())) {
            String img = request.targetImage() == null ? "" : request.targetImage().trim();
            if (!(img.startsWith("sha256:") || img.contains("@sha256:"))) {
                throw error(ErrorCode.BAD_REQUEST, "SWAP_VERSION requires a digest-pinned image reference.");
            }
        }
        ObjectNode action = mapper.valueToTree(request);
        action.put("requestedAt", OffsetDateTime.now().toString());
        if (control.path("simulatedSandbox").asBoolean(false)) {
            int before = currentSimulatedReplicas(control, request.service());
            int after = switch (request.action()) {
                case "STOP", "PAUSE" -> 0;
                case "START", "RESUME" -> Math.max(1, before == 0 ? 1 : before);
                case "SCALE" -> request.replicas() == null ? 1 : request.replicas();
                case "THROTTLE_CPU", "SET_LOAD", "SET_ENV", "SWAP_VERSION" -> before;
                default -> before;
            };
            if ((Set.of("STOP", "PAUSE").contains(request.action()) && before == 0)
                    || (Set.of("START", "RESUME").contains(request.action()) && before > 0)
                    || ("THROTTLE_CPU".equals(request.action()) && before == 0)
                    || ("SCALE".equals(request.action()) && before == after)) {
                throw error(ErrorCode.CONFLICT, "Service already in requested replica state.");
            }
            int prevRps = Math.max(1, control.path("simulatedProbeRps").asInt(5));
            int nextRps = "SET_LOAD".equals(request.action()) && request.targetRps() != null ? request.targetRps() : prevRps;
            control.put("simulatedProbeRps", nextRps);
            double throttleFactor = "THROTTLE_CPU".equals(request.action()) && request.cpuPercent() != null
                    ? 100.0 / Math.max(10, request.cpuPercent())
                    : 1.0;
            double loadFactor = 1.0 + Math.max(0, nextRps - 5) * 0.03;
            ObjectNode result = mapper.createObjectNode()
                    .put("action", request.action())
                    .put("service", request.service())
                    .put("replicasBefore", before)
                    .put("replicasAfter", after)
                    .put("confirmed", true);
            ObjectNode metricsBefore = result.putObject("metricsBefore")
                    .put("runningReplicas", before)
                    .put("errorRate", before == 0 ? 1.0 : 0.0)
                    .put("errorRatePercent", before == 0 ? 100.0 : 0.0)
                    .put("requestCount", 3)
                    .put("p95LatencyMs", before == 0 ? 0.0 : Math.max(12.0, 48.0 / Math.max(1, before)));
            if ("SET_LOAD".equals(request.action())) {
                metricsBefore.put("targetRps", prevRps);
            }
            ObjectNode metricsAfter = result.putObject("metricsAfter")
                    .put("runningReplicas", after)
                    .put("errorRate", after == 0 ? 1.0 : 0.0)
                    .put("errorRatePercent", after == 0 ? 100.0 : 0.0)
                    .put("requestCount", 3)
                    .put("p95LatencyMs", after == 0 ? 0.0 : Math.max(12.0, (48.0 / Math.max(1, after)) * throttleFactor * loadFactor));
            if (request.cpuPercent() != null) {
                metricsAfter.put("cpuPercent", request.cpuPercent());
            }
            if (request.targetRps() != null) {
                metricsAfter.put("targetRps", request.targetRps());
            }
            action.put("status", "CONFIRMED");
            action.put("completedAt", OffsetDateTime.now().toString());
            action.set("result", result);
            control.withArray("actions").add(action);
            applySimulatedTelemetryUpdate(session, control, request.service(), after);
            save(session, control);
            notifyStateAfterCommit(session);
            return view(session);
        }
        action.put("status", "PENDING");
        control.withArray("actions").add(action);
        control.put("lastUiActivityAt", OffsetDateTime.now().toString());
        save(session, control);
        notifyStateAfterCommit(session);
        return view(session);
    }

    @Transactional
    public JsonNode bootstrapSimulatedSandbox(UUID id) {
        RuntimeSession session = locked(id);
        access.requireProjectWriteAccess(session.getProject());
        String exec = session.getExecutionStatus() == null ? "NOT_STARTED" : session.getExecutionStatus().toUpperCase(Locale.ROOT);
        if (Set.of("COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT", "TIMEDOUT", "TIMEOUT").contains(exec)) {
            throw error(ErrorCode.CONFLICT, "Studio session has already finished.");
        }
        ObjectNode control = control(session);
        if ("RUNNING".equals(exec) && control.hasNonNull("telemetry") && !control.path("simulatedSandbox").asBoolean(false)) {
            return view(session);
        }
        if (!control.path("simulatedSandbox").asBoolean(false)
                && Set.of("ALLOCATED", "RUNNING", "CANCELLING").contains(exec)) {
            throw error(ErrorCode.CONFLICT, "The Runner owns this session. Wait for telemetry or cancel it before starting a simulation.");
        }
        session.setScenarioStatus("APPROVED");
        session.setExecutionStatus("RUNNING");
        if (session.getStartedAt() == null) {
            session.setStartedAt(OffsetDateTime.now());
        }
        control.put("simulatedSandbox", true);
        if (!control.hasNonNull("telemetry")) {
            initializeSimulatedTelemetry(session, control);
        }
        save(session, control);
        notifyStateAfterCommit(session);
        return view(session);
    }

    @Transactional
    public JsonNode finish(UUID id) {
        RuntimeSession session = locked(id);
        access.requireProjectWriteAccess(session.getProject());
        ObjectNode control = control(session);
        if (!control.path("finishRequested").asBoolean()) {
            requireRunning(session);
            expireStaleActions(control);
            boolean confirmed = false;
            for (JsonNode action : control.withArray("actions")) {
                if (Set.of("PENDING", "RUNNING").contains(action.path("status").asText()))
                    throw error(ErrorCode.CONFLICT, "Wait for the current action before finishing.");
                confirmed |= "CONFIRMED".equals(action.path("status").asText());
            }
            if (!confirmed) throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "INCOMPLETE_SCENARIO",
                    "Perform a confirmed action before saving Studio evidence. Cancel the session to discard it.");
            JsonNode exerciseCriteria = extractExerciseCriteria(session);
            if (exerciseCriteria != null || control.hasNonNull("prediction")) {
                StudioTelemetryHub.SessionSnapshot liveSnapshot = telemetryHub != null ? telemetryHub.latest(id).orElse(null) : null;
                JsonNode effectiveTelemetry = liveSnapshot != null && liveSnapshot.latestTelemetry() != null
                        ? liveSnapshot.latestTelemetry()
                        : (control.hasNonNull("telemetry") ? control.get("telemetry") : null);
                java.util.List<JsonNode> history = liveSnapshot != null ? liveSnapshot.history() : java.util.List.of();
                control.set("finalExerciseEvaluation",
                        StudioExerciseEvaluator.evaluate(mapper, exerciseCriteria, control, effectiveTelemetry, history));
            }
            control.put("finishRequested", true);
            if (control.path("simulatedSandbox").asBoolean(false)) {
                completeSimulatedSession(session, control);
            }
            save(session, control);
            notifyStateAfterCommit(session);
        }
        return view(session);
    }

    @Transactional
    public JsonNode poll(UUID id, String resourceProject) {
        runner.requireRunnerService();
        RuntimeSession session = sessions.findById(id)
                .orElseThrow(() -> error(ErrorCode.NOT_FOUND, "Runtime session not found."));
        if (!resourceProject.equals(session.getResourceProject())) throw error(ErrorCode.CONFLICT, "Runner allocation mismatch.");
        if (session.getScenarioConfig() == null || !session.getScenarioConfig().path("interactiveStudio").asBoolean())
            throw error(ErrorCode.CONFLICT, "This session does not support interactive Studio.");
        ObjectNode response = mapper.createObjectNode().put("sessionId", id.toString()).put("resourceProject", resourceProject);
        if (session.getCancelRequestedAt() != null) {
            return response.put("finishRequested", true).put("cancelRequested", true);
        }
        if (!"RUNNING".equals(session.getExecutionStatus())) {
            return response.put("finishRequested", true).put("cancelRequested", false);
        }
        JsonNode existingControl = session.getStudioControl();
        JsonNode existingActions = existingControl != null ? existingControl.path("actions") : null;
        boolean hasPending = false;
        if (existingActions != null && existingActions.isArray()) {
            for (JsonNode node : existingActions) {
                String status = node.path("status").asText();
                if ("RUNNING".equals(status)) {
                    response.put("finishRequested", false).put("cancelRequested", false).set("command", node.deepCopy());
                    return response;
                }
                if ("PENDING".equals(status)) {
                    hasPending = true;
                    break;
                }
            }
        }
        if (!hasPending) {
            boolean finishRequested = existingControl != null && existingControl.path("finishRequested").asBoolean();
            return response.put("finishRequested", finishRequested).put("cancelRequested", false);
        }
        // Only lock the session row and rewrite studio_control when actually claiming a PENDING action.
        // Flush any outer test-tx changes, then detach the unlocked L1 entity before acquiring the row lock.
        if (entityManager != null) {
            entityManager.flush();
            entityManager.detach(session);
        }
        RuntimeSession lockedSession = locked(id);
        if (!resourceProject.equals(lockedSession.getResourceProject())) throw error(ErrorCode.CONFLICT, "Runner allocation mismatch.");
        if (lockedSession.getCancelRequestedAt() != null) {
            return response.put("finishRequested", true).put("cancelRequested", true);
        }
        if (!"RUNNING".equals(lockedSession.getExecutionStatus())) {
            return response.put("finishRequested", true).put("cancelRequested", false);
        }
        ObjectNode control = control(lockedSession);
        for (JsonNode node : control.withArray("actions")) {
            String status = node.path("status").asText();
            if ("PENDING".equals(status)) {
                ObjectNode action = (ObjectNode) node;
                action.put("status", "RUNNING");
                save(lockedSession, control);
                response.put("finishRequested", false).put("cancelRequested", false).set("command", action.deepCopy());
                return response;
            }
            if ("RUNNING".equals(status)) {
                response.put("finishRequested", false).put("cancelRequested", false).set("command", node.deepCopy());
                return response;
            }
        }
        return response.put("finishRequested", control.path("finishRequested").asBoolean()).put("cancelRequested", false);
    }

    @Transactional
    public JsonNode acknowledge(UUID id, AckRequest request) {
        runner.requireRunnerService();
        RuntimeSession session = locked(id);
        if (!id.equals(request.sessionId()) || !request.resourceProject().equals(session.getResourceProject()))
            throw error(ErrorCode.CONFLICT, "Runner allocation mismatch.");
        ObjectNode control = control(session);
        for (JsonNode node : control.withArray("actions")) {
            if (request.actionId().toString().equals(node.path("actionId").asText())) {
                ObjectNode action = (ObjectNode) node;
                if (Set.of("CONFIRMED", "FAILED").contains(action.path("status").asText())) {
                    if (!request.status().equals(action.path("status").asText()) ||
                        !(request.result() == null ? action.path("result").isNull() || action.path("result").isMissingNode()
                            : request.result().equals(action.get("result"))))
                        throw error(ErrorCode.CONFLICT, "Action acknowledgement differs from committed result.");
                    return mapper.createObjectNode().put("actionId", request.actionId().toString()).put("status", request.status());
                }
                // A late ack for an action expired as INTERRUPTED still records the real outcome instead of failing the runner.
                if (!Set.of("RUNNING", "INTERRUPTED").contains(action.path("status").asText())) throw error(ErrorCode.CONFLICT, "Action has not been dispatched.");
                if (request.result() != null && request.result().toString().length() > 65536) throw error(ErrorCode.BAD_REQUEST, "Action result exceeds budget.");
                if ("CONFIRMED".equals(request.status()) && (request.result() == null ||
                    !request.result().path("confirmed").asBoolean() ||
                    !action.path("action").asText().equals(request.result().path("action").asText()) ||
                    !action.path("service").asText().equals(request.result().path("service").asText()) ||
                    !changedReplicaState(action.path("action").asText(), request.result()) ||
                    ("SCALE".equals(action.path("action").asText()) && action.path("replicas").asInt() != request.result().path("replicasAfter").asInt())))
                    throw error(ErrorCode.BAD_REQUEST, "Confirmed result does not match the dispatched action.");
                action.put("status", request.status()).put("completedAt", OffsetDateTime.now().toString());
                action.set("result", request.result());
                save(session, control);
                notifyStateAfterCommit(session);
                return mapper.createObjectNode().put("actionId", request.actionId().toString()).put("status", request.status());
            }
        }
        throw error(ErrorCode.NOT_FOUND, "Unknown Studio action.");
    }

    private RuntimeSession locked(UUID id) {
        return sessions.findLockedById(id).orElseThrow(() -> error(ErrorCode.NOT_FOUND, "Runtime session not found."));
    }

    /** Longest legitimate action: compose wait (60s) + readiness (60s) + workload replay (150s), plus margin. */
    private static final java.time.Duration ACTION_STALE_AFTER = java.time.Duration.ofSeconds(300);

    /** A runner that died mid-action never acks; without this the session's Submit/Capture/Finish stay blocked forever. */
    static void expireStaleActions(ObjectNode control) {
        OffsetDateTime cutoff = OffsetDateTime.now().minus(ACTION_STALE_AFTER);
        for (JsonNode node : control.withArray("actions")) {
            if (!"RUNNING".equals(node.path("status").asText())) continue;
            try {
                if (OffsetDateTime.parse(node.path("requestedAt").asText()).isBefore(cutoff))
                    ((ObjectNode) node).put("status", "INTERRUPTED");
            } catch (java.time.format.DateTimeParseException ignored) {
                // Unparseable legacy timestamp: leave the action as is.
            }
        }
    }
    private ObjectNode control(RuntimeSession session) {
        if (session.getScenarioConfig() == null || !session.getScenarioConfig().path("interactiveStudio").asBoolean())
            throw error(ErrorCode.CONFLICT, "This session does not support interactive Studio.");
        if (session.getStudioControl() instanceof ObjectNode object) return object.deepCopy();
        ObjectNode object = mapper.createObjectNode().put("finishRequested", false);
        object.putArray("actions");
        return object;
    }
    private JsonNode view(RuntimeSession session) {
        boolean interactive = session.getScenarioConfig() != null && session.getScenarioConfig().path("interactiveStudio").asBoolean();
        ObjectNode result = interactive ? control(session) : mapper.createObjectNode().put("finishRequested", false);
        if (!result.has("finishRequested") || !result.get("finishRequested").isBoolean()) result.put("finishRequested", false);
        if (!result.has("actions") || !result.get("actions").isArray()) result.putArray("actions");
        for(JsonNode snapshot:result.withArray("snapshots"))
            ((ObjectNode)snapshot).remove(java.util.List.of("telemetry","actions","imageData"));
        String execution = session.getExecutionStatus() == null ? "UNKNOWN" : session.getExecutionStatus();
        boolean terminal = Set.of("COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT", "TIMEDOUT", "TIMEOUT").contains(execution);
        if (terminal)
            for (JsonNode action : result.withArray("actions"))
                if (Set.of("PENDING", "RUNNING").contains(action.path("status").asText()))
                    ((ObjectNode) action).put("status", "INTERRUPTED");
        java.util.List<JsonNode> historyList = java.util.List.of();
        if (interactive && telemetryHub != null && !terminal) {
            var liveOpt = telemetryHub.latest(session.getId());
            if (liveOpt.isPresent()) {
                var live = liveOpt.get();
                if (live.latestTelemetry() != null) {
                    result.set("telemetry", live.latestTelemetry());
                    if (live.receivedAt() != null) result.put("telemetryReceivedAt", live.receivedAt());
                }
                if (!live.history().isEmpty()) {
                    historyList = live.history();
                    var historyNode = result.putArray("telemetryHistory");
                    int from = Math.max(0, live.history().size() - 60);
                    for (int i = from; i < live.history().size(); i++) {
                        historyNode.add(live.history().get(i));
                    }
                }
            }
        }
        JsonNode exerciseCriteria = extractExerciseCriteria(session);
        if (exerciseCriteria != null) {
            result.set("exerciseCriteria", exerciseCriteria.deepCopy());
        }
        if (interactive && (exerciseCriteria != null || result.hasNonNull("prediction"))) {
            if (terminal && result.hasNonNull("finalExerciseEvaluation") && result.get("finalExerciseEvaluation").isObject()) {
                result.set("exerciseEvaluation", result.get("finalExerciseEvaluation").deepCopy());
            } else {
                JsonNode effectiveTelemetry = result.hasNonNull("telemetry") ? result.get("telemetry") : null;
                result.set("exerciseEvaluation",
                        StudioExerciseEvaluator.evaluate(mapper, exerciseCriteria, result, effectiveTelemetry, historyList));
            }
        }
        var services = result.putArray("services");
        JsonNode topology = null;
        try {
            topology = PreparedStudioTopology.read(
                session.getScenarioConfig() == null ? null : session.getScenarioConfig().path("profile"),
                session.getConfirmedServiceMappings() == null ? Set.of() : session.getConfirmedServiceMappings().keySet(), mapper);
        } catch (BusinessException ignored) {
            // Read-only state polling on failed/unmapped sessions must still surface status & cleanupState.
        }
        if (topology != null) result.set("topology", topology);
        result.set("serviceMappings", mapper.valueToTree(session.getConfirmedServiceMappings() == null ? java.util.Map.of() : session.getConfirmedServiceMappings()));
        appendPinnedLimits(result, session);
        if (session.getConfirmedServiceMappings() != null)
            session.getConfirmedServiceMappings().keySet().stream().filter(name -> !"mavis-collector".equals(name)).sorted().forEach(services::add);
        if (queueCoordinator != null && "QUEUED".equalsIgnoreCase(execution)) {
            Integer pos = queueCoordinator.queuePosition(session);
            if (pos != null) result.put("queuePosition", pos);
            result.put("activeSlots", queueCoordinator.countActiveSessions());
            result.put("maxSlots", queueCoordinator.getMaxActiveStudioSessions());
        }
        return result.put("sessionId", session.getId().toString()).put("interactive", interactive)
            .put("projectId", session.getProject().getId() == null ? "" : session.getProject().getId().toString())
            .put("modelVersionId", session.getModelVersion() == null ? "" : session.getModelVersion().getId().toString())
            .put("sourceSnapshotId", session.getSourceSnapshot() == null ? "" : session.getSourceSnapshot().getId().toString())
            .put("receiptDigest", session.getReceiptDigest())
            .put("executionStatus", execution).put("cleanupStatus", session.getCleanupStatus() == null ? "UNKNOWN" : session.getCleanupStatus());
    }
    private void requireRunning(RuntimeSession session) {
        if (!"RUNNING".equals(session.getExecutionStatus()) || session.getCancelRequestedAt() != null || session.getRunnerReceiptJson() != null)
            throw error(ErrorCode.CONFLICT, "Studio session is not running.");
    }
    private void save(RuntimeSession session, ObjectNode control) {
        session.setStudioControl(control);
        sessions.save(session);
    }

    public void publishSessionState(RuntimeSession session) {
        notifyStateAfterCommit(session);
    }

    private void notifyStateAfterCommit(RuntimeSession session) {
        if (telemetryHub == null || session == null || session.getId() == null) return;
        UUID sessionId = session.getId();
        JsonNode snapshot = view(session);
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                    new org.springframework.transaction.support.TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            telemetryHub.notifyState(sessionId, snapshot);
                        }
                    });
        } else {
            telemetryHub.notifyState(sessionId, snapshot);
        }
    }
    /** Public, bounded profile facts for the Live inspector. Never expose environment values. */
    private static void appendPinnedLimits(ObjectNode result, RuntimeSession session) {
        JsonNode config = session.getScenarioConfig();
        if (config == null || !config.path("profile").isObject()) return;
        JsonNode profile = config.path("profile");
        ObjectNode limits = result.putObject("limits");
        limits.put("memoryMiB", profile.path("memoryMiB").asInt(512));
        limits.put("cpus", profile.path("cpus").asDouble(1));
        limits.put("timeoutSeconds", config.path("scenario").path("timeoutSeconds").asInt(300));
        ObjectNode services = limits.putObject("services");
        JsonNode applications = profile.path("applications");
        if (!applications.isObject()) return;
        applications.fields().forEachRemaining(entry -> {
            if (!entry.getValue().isObject()) return;
            services.putObject(entry.getKey())
                .put("runtime", entry.getValue().path("runtime").asText(""))
                .put("containerPort", entry.getValue().path("containerPort").asInt(0))
                .put("readinessPath", entry.getValue().path("readinessPath").asText("/health"));
        });
    }
    private static boolean changedReplicaState(String action, JsonNode result) {
        if (!result.path("replicasBefore").canConvertToInt() || !result.path("replicasAfter").canConvertToInt()) return false;
        int before = result.path("replicasBefore").asInt();
        int after = result.path("replicasAfter").asInt();
        if (before < 0 || before > 8 || after < 0 || after > 8) return false;
        return switch (action) {
            case "STOP", "PAUSE" -> before > 0 && after == 0;
            case "START" -> before == 0 && after > 0;
            case "RESUME" -> (before == 0 && after > 0)
                    || (result.path("metricsBefore").path("pausedReplicas").asInt(0) > 0 && after > before);
            case "SCALE" -> before > 0 && after > 0 && before != after;
            case "THROTTLE_CPU" -> {
                int pct = result.path("metricsAfter").path("cpuPercent").asInt(0);
                yield before > 0 && after == before && pct >= 10 && pct <= 100;
            }
            case "SET_LOAD" -> {
                int rps = result.path("metricsAfter").path("targetRps").asInt(0);
                yield before >= 0 && after == before && rps >= 1 && rps <= 50;
            }
            case "SET_ENV" -> {
                String k = result.path("metricsAfter").path("envKey").asText("");
                yield after >= 1 && !k.isBlank();
            }
            case "SWAP_VERSION" -> {
                String img = result.path("metricsAfter").path("image").asText("");
                yield after >= 1 && (img.startsWith("sha256:") || img.contains("@sha256:"));
            }
            default -> false;
        };
    }

    private static JsonNode extractExerciseCriteria(RuntimeSession session) {
        if (session == null || session.getScenarioConfig() == null) return null;
        JsonNode node = session.getScenarioConfig().get("exerciseCriteria");
        return node != null && node.isObject() ? node : null;
    }

    private int currentSimulatedReplicas(ObjectNode control, String service) {
        for (JsonNode item : control.path("telemetry").path("services")) {
            if (service.equals(item.path("service").asText())) {
                return Math.max(0, item.path("runningReplicas").asInt(1));
            }
        }
        return 1;
    }

    private void initializeSimulatedTelemetry(RuntimeSession session, ObjectNode control) {
        var replicaMap = new java.util.LinkedHashMap<String, Integer>();
        var blocks = session.getScenarioConfig() == null ? null : session.getScenarioConfig().path("profile").path("studioTopology").path("blocks");
        if (blocks != null && blocks.isArray() && !blocks.isEmpty()) {
            for (JsonNode block : blocks) {
                String svc = block.path("service").asText("");
                if (!svc.isBlank() && !"mavis-collector".equals(svc)) {
                    replicaMap.put(svc, block.path("initiallyStopped").asBoolean(false) ? 0 : 1);
                }
            }
        }
        if (session.getConfirmedServiceMappings() != null) {
            session.getConfirmedServiceMappings().keySet().stream()
                    .filter(name -> name != null && !name.isBlank() && !"mavis-collector".equals(name))
                    .sorted()
                    .forEach(name -> replicaMap.putIfAbsent(name, 1));
        }
        writeSimulatedTelemetry(control, replicaMap);
    }

    private void applySimulatedTelemetryUpdate(RuntimeSession session, ObjectNode control, String service, int newReplicas) {
        var replicaMap = new java.util.LinkedHashMap<String, Integer>();
        for (JsonNode item : control.path("telemetry").path("services")) {
            String name = item.path("service").asText("");
            if (!name.isBlank()) {
                replicaMap.put(name, Math.max(0, item.path("runningReplicas").asInt(1)));
            }
        }
        if (replicaMap.isEmpty() && session.getConfirmedServiceMappings() != null) {
            session.getConfirmedServiceMappings().keySet().stream()
                    .filter(name -> name != null && !name.isBlank() && !"mavis-collector".equals(name))
                    .sorted()
                    .forEach(name -> replicaMap.put(name, 1));
        }
        replicaMap.put(service, newReplicas);
        writeSimulatedTelemetry(control, replicaMap);
    }

    private void writeSimulatedTelemetry(ObjectNode control, java.util.Map<String, Integer> replicaMap) {
        String now = OffsetDateTime.now().toString();
        ObjectNode telemetry = mapper.createObjectNode().put("observedAt", now);
        var servicesArray = telemetry.putArray("services");
        var serviceNames = new java.util.ArrayList<>(replicaMap.keySet());
        for (var entry : replicaMap.entrySet()) {
            String svc = entry.getKey();
            int count = Math.max(0, entry.getValue());
            ObjectNode svcNode = servicesArray.addObject()
                    .put("service", svc)
                    .put("replicas", Math.max(1, count))
                    .put("runningReplicas", count)
                    .put("logs", count == 0
                            ? svc + " container stopped (chaos fault active)"
                            : svc + " running " + count + " replica(s) — HTTP 200 healthy");
            var stats = svcNode.putArray("stats");
            for (int i = 1; i <= count; i++) {
                stats.addObject()
                        .put("containerId", "sandbox-" + svc + "-" + i)
                        .put("cpu", String.format(Locale.ROOT, "%.1f%%", Math.max(1.2, 6.4 / count)))
                        .put("memory", String.format(Locale.ROOT, "%d MiB", 64 + i * 8))
                        .put("network", String.format(Locale.ROOT, "%.1f KB/s", 2.4 * count));
            }
        }
        String traceId = UUID.randomUUID().toString().replace("-", "");
        var spansArray = telemetry.putArray("spans");
        var interactionsArray = telemetry.putArray("interactions");
        String prevSpanId = null;
        String prevService = null;
        for (int i = 0; i < serviceNames.size(); i++) {
            String svc = serviceNames.get(i);
            int running = replicaMap.getOrDefault(svc, 1);
            String spanId = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            boolean failed = running == 0;
            spansArray.addObject()
                    .put("traceId", traceId)
                    .put("spanId", spanId)
                    .put("runtimeService", svc)
                    .put("operationName", "GET /" + svc + "/health")
                    .put("circuitOpen", failed)
                    .put("spanStatus", failed ? "ERROR" : "OK")
                    .put("httpStatusCode", failed ? 503 : 200)
                    .put("durationNanoseconds", String.valueOf(failed ? 45_000_000L : Math.max(4_000_000L, 18_000_000L / Math.max(1, running))));
            if (prevSpanId != null && prevService != null) {
                interactionsArray.addObject()
                        .put("traceId", traceId)
                        .put("fromService", prevService)
                        .put("toService", svc)
                        .put("parentSpanId", prevSpanId)
                        .put("childSpanId", spanId);
            }
            prevSpanId = spanId;
            prevService = svc;
        }
        int simTargetRps = Math.max(1, control.path("simulatedProbeRps").asInt(5));
        boolean anyDown = replicaMap.values().stream().anyMatch(c -> c <= 0);
        int simReqs = simTargetRps;
        int simErrs = anyDown ? simReqs : 0;
        double simP95 = anyDown ? 45.0 : Math.round((18.0 + Math.max(0, simTargetRps - 5) * 1.4) * 100.0) / 100.0;
        ObjectNode probeNode = telemetry.putObject("probe")
                .put("targetRps", simTargetRps)
                .put("rps", (double) simTargetRps)
                .put("requests", simReqs)
                .put("errors", simErrs)
                .put("errorRatePercent", anyDown ? 100.0 : 0.0)
                .put("p50Ms", Math.round(simP95 * 0.55 * 100.0) / 100.0)
                .put("p95Ms", simP95)
                .put("p99Ms", Math.round(simP95 * 1.35 * 100.0) / 100.0);
        probeNode.putArray("routes");
        telemetry.putArray("warnings").add("SIMULATED_SANDBOX_TELEMETRY");
        control.set("telemetry", telemetry);
        control.put("telemetryReceivedAt", now);
    }

    private void completeSimulatedSession(RuntimeSession session, ObjectNode control) {
        ObjectNode receipt = mapper.createObjectNode();
        var infraActions = receipt.putArray("infrastructureActions");
        for (JsonNode action : control.withArray("actions")) {
            if ("CONFIRMED".equals(action.path("status").asText()) && action.path("result").isObject()) {
                infraActions.add(action.path("result").deepCopy());
            }
        }
        var traceNode = receipt.putObject("outcome").putObject("trace");
        var spans = traceNode.putArray("spans");
        JsonNode currentSpans = control.path("telemetry").path("spans");
        if (currentSpans.isArray() && !currentSpans.isEmpty()) {
            currentSpans.forEach(s -> spans.add(s.deepCopy()));
        } else {
            spans.addObject()
                    .put("traceId", UUID.randomUUID().toString().replace("-", ""))
                    .put("spanId", "00f067aa0ba902b7")
                    .put("runtimeService", serviceNamesOrDefault(session))
                    .put("operationName", "GET /health")
                    .put("httpStatusCode", 200);
        }
        String digest = com.mavis.analyzer.runtime.utils.CanonicalReceiptDigestUtils.computeDigest(receipt);
        session.setRunnerReceiptJson(receipt);
        session.setReceiptDigest(digest);
        control.remove("receiptSignature");
        session.setExecutionStatus("COMPLETED");
        session.setScenarioStatus("NOT_RUN");
        session.setEvidenceStatus("UNAVAILABLE");
        session.setCleanupStatus("NOT_APPLICABLE");
        session.setTraceQuality("SIMULATED");
        session.setTraceStatus("COMPLETE");
        session.setSandboxEnforcementConfirmed(false);
        session.setCompletedAt(OffsetDateTime.now());
    }

    private static String serviceNamesOrDefault(RuntimeSession session) {
        if (session.getConfirmedServiceMappings() != null && !session.getConfirmedServiceMappings().isEmpty()) {
            return session.getConfirmedServiceMappings().keySet().iterator().next();
        }
        return "order-service";
    }

    private static BusinessException error(ErrorCode code, String message) { return new BusinessException(code, message); }
}
