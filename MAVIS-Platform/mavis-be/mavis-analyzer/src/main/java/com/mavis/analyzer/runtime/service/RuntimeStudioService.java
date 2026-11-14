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
        action.put("status", "PENDING");
        action.put("requestedAt", OffsetDateTime.now().toString());
        control.withArray("actions").add(action);
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
            if (!confirmed) throw error(ErrorCode.UNPROCESSABLE_ENTITY, "Perform a confirmed action before saving Studio evidence. Cancel the session to discard it.");
            control.put("finishRequested", true);
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
        if (!result.has("actions")) result.putArray("actions");
        for(JsonNode snapshot:result.withArray("snapshots"))
            ((ObjectNode)snapshot).remove(java.util.List.of("telemetry","actions","imageData"));
        String execution = session.getExecutionStatus() == null ? "UNKNOWN" : session.getExecutionStatus();
        if (Set.of("COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT", "TIMEOUT").contains(execution))
            for (JsonNode action : result.withArray("actions"))
                if (Set.of("PENDING", "RUNNING").contains(action.path("status").asText()))
                    ((ObjectNode) action).put("status", "INTERRUPTED");
        var services = result.putArray("services");
        result.set("serviceMappings", mapper.valueToTree(session.getConfirmedServiceMappings() == null ? java.util.Map.of() : session.getConfirmedServiceMappings()));
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
    private static BusinessException error(ErrorCode code, String message) { return new BusinessException(code, message); }
}
