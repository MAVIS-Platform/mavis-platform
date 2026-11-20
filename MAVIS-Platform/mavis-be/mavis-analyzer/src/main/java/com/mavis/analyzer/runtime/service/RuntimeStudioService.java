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

    public record ActionRequest(@NotNull UUID actionId, @NotNull @Pattern(regexp="START|STOP|SCALE") String action,
                                @NotBlank @Size(max=128) String service, @Min(1) @Max(8) Integer replicas) {}
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
        RuntimeSession session = locked(id);
        if (!id.equals(request.sessionId()) || !request.resourceProject().equals(session.getResourceProject()))
            throw error(ErrorCode.CONFLICT, "Runner allocation mismatch.");
        if(session.getCancelRequestedAt()!=null || session.getRunnerReceiptJson()!=null ||
            !"RUNNING".equals(session.getExecutionStatus()))
            return mapper.createObjectNode().put("sessionId",id.toString()).put("resourceProject",request.resourceProject());
        if (!request.telemetry().isObject() || request.telemetry().toString().length() > 524288)
            throw error(ErrorCode.BAD_REQUEST, "Telemetry exceeds the session budget.");
        ObjectNode control = control(session);
        control.set("telemetry", com.mavis.analyzer.runtime.util.SecretRedactor.redactJson(request.telemetry()));
        control.put("telemetryReceivedAt", OffsetDateTime.now().toString());
        save(session, control);
        return mapper.createObjectNode().put("sessionId", id.toString()).put("resourceProject", request.resourceProject());
    }

    @Transactional
    public JsonNode capture(UUID id, CaptureRequest request) {
        RuntimeSession session = locked(id);
        access.requireProjectWriteAccess(session.getProject());
        ObjectNode control = control(session);
        if (!control.hasNonNull("telemetry")) throw error(ErrorCode.UNPROCESSABLE_ENTITY, "Wait for observed telemetry before capturing evidence.");
        if(request.observedAt()!=null && !request.observedAt().equals(control.path("telemetry").path("observedAt").asText()))
            throw error(ErrorCode.CONFLICT,"Telemetry changed. Capture the refreshed view again.");
        for(JsonNode action:control.withArray("actions"))
            if(java.util.Set.of("PENDING","RUNNING").contains(action.path("status").asText()))
                throw error(ErrorCode.CONFLICT,"Wait for the action result before capturing evidence.");
        if (control.withArray("snapshots").size() >= 8) throw error(ErrorCode.CONFLICT, "Snapshot limit reached.");
        ObjectNode evidence = mapper.createObjectNode().put("id", UUID.randomUUID().toString())
            .put("sessionId", id.toString()).put("sourceSnapshotId", session.getSourceSnapshot().getId().toString())
            .put("modelVersionId", session.getModelVersion() == null ? "" : session.getModelVersion().getId().toString())
            .put("capturedAt", OffsetDateTime.now().toString()).put("explanation", request.explanation().trim());
        evidence.set("telemetry", control.path("telemetry").deepCopy());
        evidence.set("actions", control.withArray("actions").deepCopy());
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
        save(session, control);
        return evidence;
    }

    @Transactional(readOnly = true)
    public JsonNode state(UUID id) {
        RuntimeSession session = sessions.findById(id).orElseThrow(() -> error(ErrorCode.NOT_FOUND, "Runtime session not found."));
        access.requireProjectReadAccess(session.getProject());
        return view(session);
    }

    @Transactional
    public JsonNode submit(UUID id, ActionRequest request) {
        RuntimeSession session = locked(id);
        access.requireProjectWriteAccess(session.getProject());
        labs.requireRuntimeReadiness(session.getProject());
        ObjectNode control = control(session);
        for (JsonNode action : control.withArray("actions")) {
            if (request.actionId().toString().equals(action.path("actionId").asText())) {
                if (!request.action().equals(action.path("action").asText()) ||
                    !request.service().equals(action.path("service").asText()) ||
                    (request.replicas() == null ? action.hasNonNull("replicas") : request.replicas() != action.path("replicas").asInt()))
                    throw error(ErrorCode.CONFLICT, "Action ID was already used for a different command.");
                return view(session);
            }
        }
        requireRunning(session);
        var topology = PreparedStudioTopology.read(
            session.getScenarioConfig().path("profile"),
            session.getConfirmedServiceMappings() == null ? Set.of() : session.getConfirmedServiceMappings().keySet(), mapper);
        if (topology != null) {
            boolean allowed = false;
            for (var block : topology.path("blocks"))
                allowed |= request.service().equals(block.path("service").asText()) &&
                    (!"SCALE".equals(request.action()) || block.path("canScale").asBoolean());
            for (var link : topology.path("connections"))
                allowed |= request.service().equals(link.path("controllerService").asText()) && !"SCALE".equals(request.action());
            if (!allowed) throw error(ErrorCode.BAD_REQUEST, "Action is not enabled for this prepared block or connection.");
        }
        if (control.path("finishRequested").asBoolean()) throw error(ErrorCode.CONFLICT, "Studio is finishing.");
        if (control.withArray("actions").size() >= 32) throw error(ErrorCode.CONFLICT, "Studio action limit reached.");
        for (JsonNode action : control.withArray("actions"))
            if ("PENDING".equals(action.path("status").asText()) || "RUNNING".equals(action.path("status").asText()))
                throw error(ErrorCode.CONFLICT, "Wait for the current action to complete.");
        if (session.getConfirmedServiceMappings() == null || !session.getConfirmedServiceMappings().containsKey(request.service()) ||
            "mavis-collector".equals(request.service()))
            throw error(ErrorCode.BAD_REQUEST, "Service is outside the confirmed session scope.");
        if (("SCALE".equals(request.action())) != (request.replicas() != null))
            throw error(ErrorCode.BAD_REQUEST, "Replicas are required only for SCALE.");
        ObjectNode action = mapper.valueToTree(request);
        action.put("requestedAt", OffsetDateTime.now().toString());
        if (control.path("simulatedSandbox").asBoolean(false)) {
            int before = currentSimulatedReplicas(control, request.service());
            int after = switch (request.action()) {
                case "STOP" -> 0;
                case "START" -> Math.max(1, before == 0 ? 1 : before);
                case "SCALE" -> request.replicas() == null ? 1 : request.replicas();
                default -> before;
            };
            if (("STOP".equals(request.action()) && before == 0)
                    || ("START".equals(request.action()) && before > 0)
                    || ("SCALE".equals(request.action()) && before == after)) {
                throw error(ErrorCode.CONFLICT, "Service already in requested replica state.");
            }
            ObjectNode result = mapper.createObjectNode()
                    .put("action", request.action())
                    .put("service", request.service())
                    .put("replicasBefore", before)
                    .put("replicasAfter", after)
                    .put("confirmed", true);
            result.putObject("metricsBefore")
                    .put("runningReplicas", before)
                    .put("errorRate", before == 0 ? 1.0 : 0.0)
                    .put("errorRatePercent", before == 0 ? 100.0 : 0.0)
                    .put("requestCount", 3)
                    .put("p95LatencyMs", before == 0 ? 0.0 : Math.max(12.0, 48.0 / Math.max(1, before)));
            result.putObject("metricsAfter")
                    .put("runningReplicas", after)
                    .put("errorRate", after == 0 ? 1.0 : 0.0)
                    .put("errorRatePercent", after == 0 ? 100.0 : 0.0)
                    .put("requestCount", 3)
                    .put("p95LatencyMs", after == 0 ? 0.0 : Math.max(12.0, 48.0 / Math.max(1, after)));
            action.put("status", "CONFIRMED");
            action.put("completedAt", OffsetDateTime.now().toString());
            action.set("result", result);
            control.withArray("actions").add(action);
            applySimulatedTelemetryUpdate(session, control, request.service(), after);
            save(session, control);
            return view(session);
        }
        action.put("status", "PENDING");
        control.withArray("actions").add(action);
        save(session, control);
        return view(session);
    }

    @Transactional
    public JsonNode bootstrapSimulatedSandbox(UUID id) {
        RuntimeSession session = locked(id);
        access.requireProjectWriteAccess(session.getProject());
        String exec = session.getExecutionStatus() == null ? "NOT_STARTED" : session.getExecutionStatus().toUpperCase(Locale.ROOT);
        if (Set.of("COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT", "TIMEOUT").contains(exec)) {
            throw error(ErrorCode.CONFLICT, "Studio session has already finished.");
        }
        ObjectNode control = control(session);
        if ("RUNNING".equals(exec) && control.hasNonNull("telemetry") && !control.path("simulatedSandbox").asBoolean(false)) {
            return view(session);
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
        return view(session);
    }

    @Transactional
    public JsonNode finish(UUID id) {
        RuntimeSession session = locked(id);
        access.requireProjectWriteAccess(session.getProject());
        ObjectNode control = control(session);
        if (!control.path("finishRequested").asBoolean()) {
            requireRunning(session);
            boolean confirmed = false;
            for (JsonNode action : control.withArray("actions")) {
                if (Set.of("PENDING", "RUNNING").contains(action.path("status").asText()))
                    throw error(ErrorCode.CONFLICT, "Wait for the current action before finishing.");
                confirmed |= "CONFIRMED".equals(action.path("status").asText());
            }
            if (!confirmed) throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "INCOMPLETE_SCENARIO",
                    "Perform a confirmed action before saving Studio evidence. Cancel the session to discard it.");
            control.put("finishRequested", true);
            if (control.path("simulatedSandbox").asBoolean(false)) {
                completeSimulatedSession(session, control);
            }
            save(session, control);
        }
        return view(session);
    }

    @Transactional
    public JsonNode poll(UUID id, String resourceProject) {
        runner.requireRunnerService();
        RuntimeSession session = locked(id);
        if (!resourceProject.equals(session.getResourceProject())) throw error(ErrorCode.CONFLICT, "Runner allocation mismatch.");
        ObjectNode control = control(session);
        ObjectNode response = mapper.createObjectNode().put("sessionId", id.toString()).put("resourceProject", resourceProject);
        if (session.getCancelRequestedAt() != null || !"RUNNING".equals(session.getExecutionStatus())) {
            return response.put("finishRequested", true);
        }
        for (JsonNode node : control.withArray("actions")) {
            if ("PENDING".equals(node.path("status").asText()) || "RUNNING".equals(node.path("status").asText())) {
                ObjectNode action = (ObjectNode) node;
                action.put("status", "RUNNING");
                save(session, control);
                response.put("finishRequested", false).set("command", action.deepCopy());
                return response;
            }
        }
        return response.put("finishRequested", control.path("finishRequested").asBoolean());
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
                if (!"RUNNING".equals(action.path("status").asText())) throw error(ErrorCode.CONFLICT, "Action has not been dispatched.");
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
                return mapper.createObjectNode().put("actionId", request.actionId().toString()).put("status", request.status());
            }
        }
        throw error(ErrorCode.NOT_FOUND, "Unknown Studio action.");
    }

    private RuntimeSession locked(UUID id) {
        return sessions.findLockedById(id).orElseThrow(() -> error(ErrorCode.NOT_FOUND, "Runtime session not found."));
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
        if (Set.of("COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT", "TIMEOUT").contains(execution))
            for (JsonNode action : result.withArray("actions"))
                if (Set.of("PENDING", "RUNNING").contains(action.path("status").asText()))
                    ((ObjectNode) action).put("status", "INTERRUPTED");
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
            case "STOP" -> before > 0 && after == 0;
            case "START" -> before == 0 && after > 0;
            case "SCALE" -> before > 0 && after > 0 && before != after;
            default -> false;
        };
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
        control.put("receiptSignature", "hmac-sha256:" + com.mavis.common.utils.HashUtils.sha256Hex(
                ("sandbox-receipt:" + digest).getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        session.setExecutionStatus("COMPLETED");
        session.setScenarioStatus("PASSED");
        session.setEvidenceStatus("AVAILABLE");
        session.setCleanupStatus("CONFIRMED");
        session.setTraceQuality("SIMULATED_VERIFIED");
        session.setTraceStatus("COMPLETE");
        session.setSandboxEnforcementConfirmed(true);
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
