package com.mavis.analyzer.aiexplain.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.aiexplain.config.ApiKeyProvider;
import com.mavis.analyzer.aiexplain.dto.AiExplainRequestDTO;
import com.mavis.analyzer.aiexplain.dto.AiExplanationResponseDTO;
import com.mavis.analyzer.aiexplain.dto.EvidenceSummaryDTO;
import com.mavis.analyzer.aiexplain.service.AiExplanationService;
import com.mavis.analyzer.aiexplain.service.AiUsageRecorder;
import com.mavis.analyzer.runtime.util.SecretRedactor;
import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.utils.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Phân hệ giải thích kiến trúc bằng AI có kiểm soát & trích dẫn bằng chứng (Ticket D2, T14, V13).
 * Đảm bảo:
 * 1. Khử sạch bí mật mã nguồn (SecretRedactor) trước khi gọi LLM.
 * 2. Deterministic Fallback khi không có key hoặc LLM timeout/lỗi mạng (D2).
 * 3. Citation Allowlist Validation: loại bỏ 100% bằng chứng ảo giác.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AiExplanationServiceImpl implements AiExplanationService {
    private boolean isVietnamese(AiExplainRequestDTO request) {
        return request != null && "vi".equalsIgnoreCase(request.getLocale());
    }

    private final AiExplanationRepository aiExplanationRepository;
    private final ModelVersionRepository modelVersionRepository;
    private final ModelElementRepository modelElementRepository;
    private final ModelRelationshipRepository modelRelationshipRepository;
    private final RuntimeSessionRepository runtimeSessionRepository;
    private final EvidenceRepository evidenceRepository;
    private final UserRepository userRepository;
    private final ApiKeyProvider apiKeyProvider;
    private final ObjectMapper objectMapper;

    @Autowired(required = false)
    private AccessPolicyService accessPolicyService;
    @Autowired(required = false)
    private AiUsageRecorder aiUsageRecorder;
    @Autowired
    private GroundedFindingExplanation groundedFindingExplanation;

    @Value("${mavis.ai.endpoint-url:}")
    private String customEndpointUrl;

    private static final Set<String> VALID_SCOPES = Set.of(
            "ELEMENT", "RELATIONSHIP", "DIAGRAM_VIEW", "RUNTIME_TRACE", "CHANGE_IMPACT", "RULE_FINDING"
    );

    private static final String DEFAULT_GEMINI_URL =
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=";

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AiExplanationResponseDTO generateOrGetExplanation(AiExplainRequestDTO request) {
        log.info("Xử lý yêu cầu giải thích AI: modelVersionId={}, scope={}",
                request.getModelVersionId(), request.getExplanationScope());

        // 1. Kiểm tra tính hợp lệ của Scope
        String scope = request.getExplanationScope() != null ? request.getExplanationScope().toUpperCase() : "";
        if (!VALID_SCOPES.contains(scope)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "explanationScope không hợp lệ: " + scope +
                    ". Các giá trị hợp lệ: " + VALID_SCOPES);
        }

        // 2. Kiểm tra ModelVersion & Phân quyền đọc
        ModelVersion modelVersion = modelVersionRepository.findById(request.getModelVersionId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên bản mô hình: " + request.getModelVersionId()));
        checkProjectReadAccess(modelVersion.getProject());

        // 3. Kiểm tra tính toàn vẹn phạm vi (Chặn lỗi truy vấn chéo version!)
        ModelElement targetElement = null;
        if (request.getElementId() != null) {
            targetElement = modelElementRepository.findById(request.getElementId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phần tử: " + request.getElementId()));
            if (!targetElement.getModelVersion().getId().equals(modelVersion.getId())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Phần tử kiến trúc không thuộc về ModelVersion này");
            }
        }

        ModelRelationship targetRelationship = null;
        if (request.getRelationshipId() != null) {
            targetRelationship = modelRelationshipRepository.findById(request.getRelationshipId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy quan hệ: " + request.getRelationshipId()));
            if (!targetRelationship.getModelVersion().getId().equals(modelVersion.getId())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Quan hệ kiến trúc không thuộc về ModelVersion này");
            }
        }

        RuntimeSession targetSession = null;
        if (request.getRuntimeSessionId() != null) {
            targetSession = runtimeSessionRepository.findById(request.getRuntimeSessionId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên thực nghiệm: " + request.getRuntimeSessionId()));
            if (!targetSession.getProject().getId().equals(modelVersion.getProject().getId())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Phiên thực nghiệm không thuộc về dự án này");
            }
        }

        if ("RULE_FINDING".equals(scope)) {
            return groundedFindingExplanation.explain(request, modelVersion, targetElement, targetRelationship);
        }
        // 4. Kiểm tra Cache trong DB (nếu không forceRefresh và không có câu hỏi riêng)
        boolean hasCustomQuestion = request.getUserQuestion() != null && !request.getUserQuestion().isBlank();
        if (!Boolean.TRUE.equals(request.getForceRefresh()) && !hasCustomQuestion) {
            Optional<AiExplanation> cached = findCachedExplanation(modelVersion.getId(), scope, request);
            final ModelElement cachedTargetElement = targetElement;
            boolean missingNewContext = cached.isPresent() && targetElement != null && "ELEMENT".equals(scope) &&
                (cached.get().getCitedEvidenceIds() == null || cached.get().getCitedEvidenceIds().isEmpty()) &&
                evidenceRepository.findElementContext(modelVersion.getId(), targetElement.getId()).stream()
                    .anyMatch(e -> com.mavis.analyzer.diagram.service.ElementEvidenceScope.includes(e, cachedTargetElement));
            if (cached.isPresent() && !missingNewContext) {
                log.info("Trả về kết quả giải thích AI từ cache cho modelVersionId={}, scope={}", modelVersion.getId(), scope);
                return mapToResponseDTO(cached.get(), true, "CACHE", isVietnamese(request));
            }
        }

        // 5. Thu thập ngữ cảnh thật & Tập hợp allowedEvidenceIds của ModelVersion
        List<Evidence> versionEvidences = evidenceRepository.findByModelVersionId(modelVersion.getId());
        Set<UUID> allowedEvidenceIds = versionEvidences.stream()
                .map(Evidence::getId)
                .collect(Collectors.toSet());
        Map<UUID, Evidence> evidenceMap = versionEvidences.stream()
                .collect(Collectors.toMap(Evidence::getId, e -> e, (a, b) -> a));

        // Lọc evidences liên quan trực tiếp đến ngữ cảnh được yêu cầu
        List<Evidence> relevantEvidences = filterRelevantEvidences(scope, targetElement, targetRelationship, targetSession, versionEvidences);
        allowedEvidenceIds.retainAll(relevantEvidences.stream().map(Evidence::getId).collect(Collectors.toSet()));

        allowedEvidenceIds = relevantEvidences.stream().map(Evidence::getId).collect(Collectors.toSet());
        // 6. Khử sạch bí mật mã nguồn (SecretRedactor) trên các đoạn trích & câu hỏi người dùng
        String sanitizedQuestion = SecretRedactor.redactString(request.getUserQuestion());
        List<EvidenceSummaryDTO> sanitizedEvidenceSummaries = relevantEvidences.stream()
                .map(e -> EvidenceSummaryDTO.builder()
                        .id(e.getId())
                        .elementId(e.getElement() == null ? null : e.getElement().getId())
                        .relationshipId(e.getRelationship() == null ? null : e.getRelationship().getId())
                        .sourceType(e.getSourceType())
                        .locator(SecretRedactor.redactString(e.getLocator()))
                        .excerpt(SecretRedactor.redactString(e.getExcerpt()))
                        .provenance(e.getProvenance() != null ? SecretRedactor.redactJson(e.getProvenance()) : null)
                        .build())
                .toList();

        // 7. Gọi LLM hoặc chuyển sang Deterministic Grounded Synthesis (D2)
        Optional<String> maybeApiKey = apiKeyProvider.resolveApiKey();
        ExplanationGenerationResult genResult = null;

        if (maybeApiKey.isPresent()) {
            try {
                genResult = callLiveLlm(maybeApiKey.get(), scope, targetElement, targetRelationship, targetSession,
                        sanitizedEvidenceSummaries, sanitizedQuestion, isVietnamese(request));
            } catch (Exception e) {
                log.warn("Gọi LLM API thất bại (Lỗi: {}). Tự động kích hoạt Deterministic Grounded Synthesis.", e.getMessage());
            }
        }

        if (genResult == null) {
            genResult = synthesizeDeterministicExplanation(scope, targetElement, targetRelationship, targetSession,
                    modelVersion, relevantEvidences, sanitizedQuestion, isVietnamese(request));
        }

        // 8. HẬU KIỂM CHỐNG ẢO GIÁC (Citation Allowlist Validation - D2)
        List<UUID> validatedCitedIds = genResult.rawCitedEvidenceIds.stream()
                .filter(relevantEvidences.stream().map(Evidence::getId).collect(Collectors.toSet())::contains)
                .distinct()
                .collect(Collectors.toList());

        // 9. Lưu vào cơ sở dữ liệu (secretRedacted = true)
        User currentUser = null;
        try {
            UUID currentUserId = SecurityUtils.getCurrentUserId();
            if (currentUserId != null) {
                currentUser = userRepository.findById(currentUserId).orElse(null);
            }
        } catch (Exception e) {
            log.debug("Không tìm thấy thông tin người dùng đang đăng nhập (hoặc test runner): {}", e.getMessage());
        }

        ArrayNode citedArray = objectMapper.createArrayNode();
        validatedCitedIds.forEach(id -> citedArray.add(id.toString()));

        String redactedText = SecretRedactor.redactString(genResult.explanationText);

        AiExplanation entity = AiExplanation.builder()
                .modelVersion(modelVersion)
                .element(targetElement)
                .relationship(targetRelationship)
                .runtimeSession(targetSession)
                .requestedBy(currentUser)
                .explanationScope(scope)
                .explanationText(redactedText)
                .citedEvidenceIds(citedArray)
                .secretRedacted(true)
                .aiModelName(genResult.aiModelName)
                .build();

        entity = aiExplanationRepository.save(entity);
        log.info("Lưu thành công lời giải thích AI ID: {}, providerMode: {}, trích dẫn: {} bằng chứng",
                entity.getId(), genResult.providerMode, validatedCitedIds.size());

        AiExplanationResponseDTO responseDto = mapToResponseDTO(entity, false, genResult.providerMode, isVietnamese(request));
        responseDto.setUserQuestion(sanitizedQuestion);
        return responseDto;
    }

    @Override
    @Transactional(readOnly = true)
    public List<AiExplanationResponseDTO> getExplanationsByModelVersion(UUID modelVersionId) {
        ModelVersion modelVersion = modelVersionRepository.findById(modelVersionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên bản mô hình: " + modelVersionId));
        checkProjectReadAccess(modelVersion.getProject());

        List<AiExplanation> list = aiExplanationRepository.findByModelVersionIdOrderByCreatedAtDesc(modelVersionId);
        return list.stream()
                .map(e -> mapToResponseDTO(e, false, "STORED"))
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public AiExplanationResponseDTO getExplanationById(UUID explanationId) {
        AiExplanation explanation = aiExplanationRepository.findWithDetailsById(explanationId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy bản ghi giải thích AI với ID: " + explanationId));
        checkProjectReadAccess(explanation.getModelVersion().getProject());

        return mapToResponseDTO(explanation, false, "STORED");
    }

    private Optional<AiExplanation> findCachedExplanation(UUID modelVersionId, String scope, AiExplainRequestDTO request) {
        if (request.getElementId() != null) {
            return aiExplanationRepository.findFirstByModelVersionIdAndExplanationScopeAndElementIdOrderByCreatedAtDesc(
                    modelVersionId, scope, request.getElementId());
        }
        if (request.getRelationshipId() != null) {
            return aiExplanationRepository.findFirstByModelVersionIdAndExplanationScopeAndRelationshipIdOrderByCreatedAtDesc(
                    modelVersionId, scope, request.getRelationshipId());
        }
        if (request.getRuntimeSessionId() != null) {
            return aiExplanationRepository.findFirstByModelVersionIdAndExplanationScopeAndRuntimeSessionIdOrderByCreatedAtDesc(
                    modelVersionId, scope, request.getRuntimeSessionId());
        }
        return aiExplanationRepository.findFirstByModelVersionIdAndExplanationScopeOrderByCreatedAtDesc(modelVersionId, scope);
    }

    private List<Evidence> filterRelevantEvidences(String scope, ModelElement element, ModelRelationship relationship,
                                                  RuntimeSession session, List<Evidence> allEvidences) {
        if ("ELEMENT".equals(scope) || "CHANGE_IMPACT".equals(scope)) {
            if (element != null) {
                return allEvidences.stream()
                        .filter(e -> com.mavis.analyzer.diagram.service.ElementEvidenceScope.includes(e, element))
                        .toList();
            }
        } else if ("RELATIONSHIP".equals(scope)) {
            if (relationship != null) {
                return allEvidences.stream()
                        .filter(e -> e.getRelationship() != null && e.getRelationship().getId().equals(relationship.getId()))
                        .toList();
            }
        } else if ("RUNTIME_TRACE".equals(scope)) {
            return allEvidences.stream()
                    .filter(e -> e.getSourceType()!=null && e.getSourceType().startsWith("RUNTIME") && session != null && e.getRuntimeSession() != null && e.getRuntimeSession().getId().equals(session.getId()))
                    .toList();
        }

        // Với RULE_FINDING hoặc DIAGRAM_VIEW: trả về top bằng chứng liên quan
        return allEvidences.stream().limit(15).toList();
    }

    private ExplanationGenerationResult callLiveLlm(String apiKey, String scope, ModelElement element,
                                                    ModelRelationship relationship, RuntimeSession session,
                                                    List<EvidenceSummaryDTO> evidences, String userQuestion,
                                                    boolean isVi) throws Exception {

        String systemPrompt = "You are the MAVIS AI Software Architecture Expert. "
                + "Your responsibility is to explain software architecture structure, service responsibilities, dependency relationships, or runtime telemetry traces. "
                + "CORE RULE: You MUST base all claims strictly on the provided evidence list. Relationship evidence establishes only the identified incoming/outgoing connection, not the element's internal behavior. Keep direct element facts separate from related relationship context. "
                + (isVi
                    ? "Write explanationText in natural, professional VIETNAMESE (Tiếng Việt) for Software Engineering students and lecturers. Keep technical identifiers, service names, class names, endpoints, and standard IT terms (Service, Component, Controller, Repository, Endpoint, HTTP, REST, Docker Compose, Database, Queue, Trace, Span) in English. Do NOT use any medical terminology. "
                    : "")
                + "Return ONLY a valid JSON object with two fields: "
                + "{\"explanationText\": \"...detailed explanation in clear Software Engineering English...\", \"citedEvidenceIds\": [\"uuid-1\", \"uuid-2\"]}";

        ObjectNode promptJson = objectMapper.createObjectNode();
        promptJson.put("scope", scope);
        if (element != null) {
            promptJson.putObject("element")
                    .put("name", element.getName())
                    .put("type", element.getElementType())
                    .put("stack", element.getLanguageStack());
        }
        if (relationship != null) {
            promptJson.putObject("relationship")
                    .put("source", relationship.getSourceElement().getName())
                    .put("target", relationship.getTargetElement().getName())
                    .put("type", relationship.getRelationType())
                    .put("layer", relationship.getOriginLayer());
        }
        if (session != null) {
            promptJson.putObject("runtimeSession")
                    .put("scenarioName", session.getScenarioName())
                    .put("scenarioStatus", session.getScenarioStatus())
                    .put("traceStatus", session.getTraceStatus());
        }
        if (userQuestion != null && !userQuestion.isBlank()) {
            promptJson.put("userQuestion", userQuestion);
        }

        ArrayNode evArray = promptJson.putArray("evidences");
        for (EvidenceSummaryDTO ev : evidences) {
            evArray.addObject()
                    .put("id", ev.getId().toString())
                    .put("elementId", ev.getElementId() == null ? null : ev.getElementId().toString())
                    .put("relationshipId", ev.getRelationshipId() == null ? null : ev.getRelationshipId().toString())
                    .put("sourceType", ev.getSourceType())
                    .put("locator", ev.getLocator())
                    .put("excerpt", ev.getExcerpt());
        }

        boolean hasCustomUrl = customEndpointUrl != null && !customEndpointUrl.isBlank();
        boolean useOpenAi = !hasCustomUrl && apiKey != null && apiKey.startsWith("sk-");

        String jsonText;
        String modelLabel;

        if (useOpenAi) {
            ObjectNode openAiReq = objectMapper.createObjectNode();
            openAiReq.put("model", "gpt-5-mini");
            openAiReq.put("reasoning_effort", "minimal");
            openAiReq.putObject("response_format").put("type", "json_object");
            ArrayNode messages = openAiReq.putArray("messages");
            messages.addObject().put("role", "system").put("content", systemPrompt);
            messages.addObject().put("role", "user").put("content", "Architectural Grounding Context:\n" + promptJson.toPrettyString());

            HttpRequest httpRequest = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.openai.com/v1/chat/completions"))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + apiKey)
                    .timeout(Duration.ofSeconds(18))
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(openAiReq)))
                    .build();

            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new RuntimeException("OpenAI HTTP error status: " + response.statusCode());
            }
            JsonNode responseNode = objectMapper.readTree(response.body());
            if (aiUsageRecorder != null) aiUsageRecorder.recordResponse("openai", "gpt-5-mini", responseNode);
            JsonNode contentNode = responseNode.path("choices").path(0).path("message").path("content");
            if (contentNode.isMissingNode() || contentNode.asText().isBlank()) {
                throw new RuntimeException("OpenAI response missing message content");
            }
            jsonText = contentNode.asText().trim();
            modelLabel = "gpt-5-mini";
        } else {
            String targetUrl = hasCustomUrl ? customEndpointUrl : DEFAULT_GEMINI_URL + apiKey;
            String fullUserPrompt = systemPrompt + "\n\nArchitectural Grounding Context:\n" + promptJson.toPrettyString();

            ObjectNode geminiRequest = objectMapper.createObjectNode();
            ArrayNode contents = geminiRequest.putArray("contents");
            ObjectNode contentPart = contents.addObject();
            ArrayNode parts = contentPart.putArray("parts");
            parts.addObject().put("text", fullUserPrompt);

            ObjectNode genConfig = geminiRequest.putObject("generationConfig");
            genConfig.put("temperature", 0.2);
            genConfig.put("responseMimeType", "application/json");

            HttpRequest httpRequest = HttpRequest.newBuilder()
                    .uri(URI.create(targetUrl))
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(12))
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(geminiRequest)))
                    .build();

            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new RuntimeException("Gemini HTTP error status: " + response.statusCode());
            }

            JsonNode responseNode = objectMapper.readTree(response.body());
            if (aiUsageRecorder != null && !hasCustomUrl) aiUsageRecorder.recordResponse("gemini", "gemini-2.5-flash", responseNode);
            JsonNode textCandidate = responseNode.path("candidates").path(0).path("content").path("parts").path(0).path("text");
            if (textCandidate.isMissingNode() || textCandidate.asText().isBlank()) {
                throw new RuntimeException("Gemini response missing text candidate");
            }
            jsonText = textCandidate.asText().trim();
            modelLabel = "gemini-2.5-flash";
        }

        JsonNode parsedPayload = objectMapper.readTree(jsonText);

        String explanationText = parsedPayload.path("explanationText").asText("Architectural analysis completed.");
        List<UUID> citedIds = new ArrayList<>();
        JsonNode idsNode = parsedPayload.path("citedEvidenceIds");
        if (idsNode.isArray()) {
            for (JsonNode idNode : idsNode) {
                try {
                    citedIds.add(UUID.fromString(idNode.asText()));
                } catch (Exception ignored) {}
            }
        }

        return new ExplanationGenerationResult(explanationText, citedIds, modelLabel, "LIVE_LLM_PROVIDER");
    }

    private ExplanationGenerationResult synthesizeDeterministicExplanation(String scope, ModelElement element,
                                                                          ModelRelationship relationship,
                                                                          RuntimeSession session,
                                                                          ModelVersion modelVersion,
                                                                          List<Evidence> relevantEvidences,
                                                                          String userQuestion,
                                                                          boolean isVi) {

        StringBuilder sb = new StringBuilder();
        List<UUID> citedIds = new ArrayList<>();

        if (isVi) {
            sb.append("### Giải thích Kiến trúc Dựa trên Bằng chứng (Grounded Synthesis)\n\n");

            if ("ELEMENT".equals(scope) && element != null) {
                sb.append("Phần tử **").append(element.getName()).append("** là một Component kiến trúc được phân loại là `")
                        .append(element.getElementType()).append("`");
                if (element.getLanguageStack() != null) {
                    sb.append(" phát triển trên nền tảng `").append(element.getLanguageStack()).append("`");
                }
                sb.append(".\n\n");
                sb.append("- **Trạng thái mô hình**: Đã lập chỉ mục với trạng thái xác minh `").append(element.getStatus()).append("`.\n");
                sb.append(relevantEvidences.isEmpty()
                    ? "- **Cơ sở đối chiếu**: Chưa có bằng chứng mã nguồn nào được lưu cho phần tử này hoặc các kết nối liên quan; nội dung sau đây chỉ dựa trên ngữ cảnh mô hình.\n"
                    : "- **Cơ sở đối chiếu**: Các bằng chứng về phần tử và mối quan hệ liên quan được trích dẫn bên dưới. Bằng chứng mối quan hệ chỉ xác nhận kết nối, không chứng minh hành vi nội bộ chưa được quan sát.\n");
            } else if ("RELATIONSHIP".equals(scope) && relationship != null) {
                sb.append("Mối quan hệ phụ thuộc giữa **").append(relationship.getSourceElement().getName())
                        .append("** và **").append(relationship.getTargetElement().getName())
                        .append("** được phân loại là `").append(relationship.getRelationType()).append("`");
                sb.append(" ghi nhận tại tầng `").append(relationship.getOriginLayer()).append("`.\n\n");
                sb.append("- **Chiều tương tác**: ").append(relationship.getDirection() != null ? relationship.getDirection() : "DIRECTED").append(".\n");
                sb.append("- **Ý nghĩa kiến trúc**: Component nguồn thiết lập phụ thuộc có hướng tới đích để thực hiện các tương tác luồng công việc phân tán.\n");
            } else if ("RUNTIME_TRACE".equals(scope)) {
                sb.append("Phiên kiểm thử Runtime động trong môi trường Docker Sandbox");
                if (session != null) {
                    sb.append(" (Kịch bản: `").append(session.getScenarioName() != null ? session.getScenarioName() : "Default").append("`)");
                    sb.append(" ghi nhận trạng thái: **").append(session.getScenarioStatus() != null ? session.getScenarioStatus() : "COMPLETED").append("**.\n\n");
                    sb.append("- **Trạng thái Trace**: `").append(session.getTraceStatus() != null ? session.getTraceStatus() : "AVAILABLE").append("`.\n");
                    sb.append("- **Độ tin cậy quan sát**: Dữ liệu OpenTelemetry trace span chứng thực các lệnh gọi HTTP/gRPC lúc chạy giữa các Container đang hoạt động.\n");
                } else {
                    sb.append(" ghi nhận dữ liệu trace tương tác lúc chạy giữa các Microservice.\n\n");
                }
            } else if ("CHANGE_IMPACT".equals(scope) && element != null) {
                sb.append("Phân tích tác động thay đổi đối với phần tử **").append(element.getName()).append("**:\n\n");
                sb.append("- Việc sửa đổi giao diện hoặc hợp đồng (contract) của `").append(element.getName()).append("` sẽ lan truyền tác động tới các phần tử tầng trên (upstream) trực tiếp phụ thuộc vào nó.\n");
                sb.append("- Cần thực hiện kiểm thử hồi quy trên các cạnh giao tiếp lân cận để ngăn ngừa việc phá vỡ hợp đồng kết nối.\n");
            } else {
                sb.append("Phiên bản mô hình kiến trúc (Bản sửa đổi ").append(modelVersion.getRevision()).append(") ");
                sb.append("ánh xạ các phụ thuộc cấu trúc tĩnh và trace telemetry lúc chạy để đảm bảo khả năng truy xuất nguồn gốc của hệ thống.\n\n");
            }

            if (userQuestion != null && !userQuestion.isBlank()) {
                sb.append("\n**Trả lời câu hỏi trọng tâm**: Đối với câu hỏi \"_").append(userQuestion).append("_\", ");
                sb.append("phân tích được đối chiếu dựa trên các bằng chứng mã nguồn đã xác minh bên dưới.\n");
            }

            if (!relevantEvidences.isEmpty()) {
                sb.append("\n**Bằng chứng kiến trúc được trích dẫn:**\n");
                for (int i = 0; i < Math.min(relevantEvidences.size(), 5); i++) {
                    Evidence ev = relevantEvidences.get(i);
                    citedIds.add(ev.getId());
                    sb.append("- [`").append(ev.getSourceType()).append("`]: ");
                    if (ev.getLocator() != null && !ev.getLocator().isBlank()) {
                        sb.append("Tại `").append(SecretRedactor.redactString(ev.getLocator())).append("`");
                    }
                    if (ev.getExcerpt() != null && !ev.getExcerpt().isBlank()) {
                        sb.append(" — _\"").append(SecretRedactor.redactString(ev.getExcerpt())).append("\"_");
                    }
                    sb.append("\n");
                }
            }

            return new ExplanationGenerationResult(
                    sb.toString(),
                    citedIds,
                    "deterministic-evidence-grounded-synthesizer",
                    "DETERMINISTIC_EVIDENCE_SYNTHESIS"
            );
        }

        sb.append("### Evidence-Grounded Architectural Explanation (Grounded Synthesis)\n\n");

        if ("ELEMENT".equals(scope) && element != null) {
            sb.append("Element **").append(element.getName()).append("** is an architectural component classified as `")
                    .append(element.getElementType()).append("`");
            if (element.getLanguageStack() != null) {
                sb.append(" built on `").append(element.getLanguageStack()).append("`");
            }
            sb.append(".\n\n");
            sb.append("- **Model Status**: Indexed with verification state `").append(element.getStatus()).append("`.\n");
            sb.append(relevantEvidences.isEmpty()
                ? "- **Grounding Basis**: No saved evidence is available for this element or its incident relationships; the following is model context only.\n"
                : "- **Grounding Basis**: Saved element and/or incident relationship evidence is cited below. Relationship evidence supports connectivity, not unobserved internal behavior.\n");
        } else if ("RELATIONSHIP".equals(scope) && relationship != null) {
            sb.append("Dependency relationship between **").append(relationship.getSourceElement().getName())
                    .append("** and **").append(relationship.getTargetElement().getName())
                    .append("** is classified as `").append(relationship.getRelationType()).append("`");
            sb.append(" observed at layer `").append(relationship.getOriginLayer()).append("`.\n\n");
            sb.append("- **Interaction Direction**: ").append(relationship.getDirection() != null ? relationship.getDirection() : "DIRECTED").append(".\n");
            sb.append("- **Architectural Significance**: The source component establishes a directed dependency on the target to fulfill distributed workflow interactions.\n");
        } else if ("RUNTIME_TRACE".equals(scope)) {
            sb.append("Dynamic verification session in the Docker Sandbox environment");
            if (session != null) {
                sb.append(" (Scenario: `").append(session.getScenarioName() != null ? session.getScenarioName() : "Default").append("`)");
                sb.append(" recorded status: **").append(session.getScenarioStatus() != null ? session.getScenarioStatus() : "COMPLETED").append("**.\n\n");
                sb.append("- **Trace Status**: `").append(session.getTraceStatus() != null ? session.getTraceStatus() : "AVAILABLE").append("`.\n");
                sb.append("- **Observability Fidelity**: OpenTelemetry trace spans corroborate runtime HTTP/gRPC invocations across running containers.\n");
            } else {
                sb.append(" recorded runtime interaction traces across microservices.\n\n");
            }
        } else if ("CHANGE_IMPACT".equals(scope) && element != null) {
            sb.append("Change impact analysis for element **").append(element.getName()).append("**:\n\n");
            sb.append("- Modifying interfaces or contracts of `").append(element.getName()).append("` propagates impact to directly dependent upstream callers.\n");
            sb.append("- Regression testing should cover adjacent communication edges to prevent contract breakage.\n");
        } else {
            sb.append("Architectural model version (Revision ").append(modelVersion.getRevision()).append(") ");
            sb.append("maps static structural dependencies and runtime telemetry traces to preserve system traceability.\n\n");
        }

        if (userQuestion != null && !userQuestion.isBlank()) {
            sb.append("\n**Response to User Inquiry**: Regarding \"_").append(userQuestion).append("_\", ");
            sb.append("the assessment is grounded in the verified source evidence cited below.\n");
        }

        if (!relevantEvidences.isEmpty()) {
            sb.append("\n**Cited Architectural Evidence:**\n");
            for (int i = 0; i < Math.min(relevantEvidences.size(), 5); i++) {
                Evidence ev = relevantEvidences.get(i);
                citedIds.add(ev.getId());
                sb.append("- [`").append(ev.getSourceType()).append("`]: ");
                if (ev.getLocator() != null && !ev.getLocator().isBlank()) {
                    sb.append("At `").append(SecretRedactor.redactString(ev.getLocator())).append("`");
                }
                if (ev.getExcerpt() != null && !ev.getExcerpt().isBlank()) {
                    sb.append(" — _\"").append(SecretRedactor.redactString(ev.getExcerpt())).append("\"_");
                }
                sb.append("\n");
            }
        }

        return new ExplanationGenerationResult(
                sb.toString(),
                citedIds,
                "deterministic-evidence-grounded-synthesizer",
                "DETERMINISTIC_EVIDENCE_SYNTHESIS"
        );
    }

    private AiExplanationResponseDTO mapToResponseDTO(AiExplanation entity, boolean cached, String providerMode) {
        return mapToResponseDTO(entity, cached, providerMode, false);
    }

    private AiExplanationResponseDTO mapToResponseDTO(AiExplanation entity, boolean cached, String providerMode, boolean isVi) {
        List<UUID> citedIds = new ArrayList<>();
        if (entity.getCitedEvidenceIds() != null && entity.getCitedEvidenceIds().isArray()) {
            for (JsonNode n : entity.getCitedEvidenceIds()) {
                try {
                    citedIds.add(UUID.fromString(n.asText()));
                } catch (Exception ignored) {}
            }
        }

        List<EvidenceSummaryDTO> evidenceSummaries = Collections.emptyList();
        if (!citedIds.isEmpty()) {
            List<Evidence> evidences = evidenceRepository.findAllById(citedIds);
            evidenceSummaries = evidences.stream()
                    .filter(v -> v.getModelVersion() == null || v.getModelVersion().getId().equals(entity.getModelVersion().getId()))
                    .map(v -> EvidenceSummaryDTO.builder()
                            .id(v.getId())
                            .elementId(v.getElement() == null ? null : v.getElement().getId())
                            .relationshipId(v.getRelationship() == null ? null : v.getRelationship().getId())
                            .sourceType(v.getSourceType())
                            .locator(SecretRedactor.redactString(v.getLocator()))
                            .excerpt(SecretRedactor.redactString(v.getExcerpt()))
                            .provenance(v.getProvenance() != null ? SecretRedactor.redactJson(v.getProvenance()) : null)
                            .build())
                    .collect(Collectors.toList());
        }

        return AiExplanationResponseDTO.builder()
                .id(entity.getId())
                .modelVersionId(entity.getModelVersion().getId())
                .explanationScope(entity.getExplanationScope())
                .elementId(entity.getElement() != null ? entity.getElement().getId() : null)
                .elementName(entity.getElement() != null ? entity.getElement().getName() : null)
                .relationshipId(entity.getRelationship() != null ? entity.getRelationship().getId() : null)
                .runtimeSessionId(entity.getRuntimeSession() != null ? entity.getRuntimeSession().getId() : null)
                .contractVersion(entity.getGroundingContext()==null ? "legacy" : "3e/2")
                .groundingContext(entity.getGroundingContext())
                .structuredContent(entity.getGroundingContext()==null ? null : entity.getGroundingContext().path("structuredContent"))
                .findingId(entity.getGroundingContext()==null ? null : UUID.fromString(entity.getGroundingContext().path("findingId").asText()))
                .evaluationRunId(entity.getGroundingContext()==null ? null : UUID.fromString(entity.getGroundingContext().path("evaluationRunId").asText()))
                .ruleSetVersion(entity.getGroundingContext()==null ? null : entity.getGroundingContext().path("ruleSetVersion").asText())
                .explanationText(entity.getExplanationText())
                .citedEvidenceIds(citedIds)
                .citedEvidences(evidenceSummaries)
                .secretRedacted(entity.getSecretRedacted())
                .aiModelName(entity.getAiModelName())
                .cached(cached)
                .providerMode(providerMode)
                .epistemicBadge(isVi ? (citedIds.isEmpty() ? "Tổng hợp từ Mô hình Kiến trúc (Chưa có Bằng chứng Trực tiếp)" : "Tổng hợp từ Bằng chứng Mã nguồn (Đã Xác minh)") : (citedIds.isEmpty() ? "AI-Assisted Interpretation (Model Context Only — No Saved Evidence Cited)" : "AI-Assisted Explanation (Grounded in Saved Model Evidence)"))
                .createdAt(entity.getCreatedAt())
                .build();
    }

    private void checkProjectReadAccess(Project project) {
        if (accessPolicyService != null) {
            accessPolicyService.requireProjectReadAccess(project);
        } else {
            UUID currentUserId = SecurityUtils.getCurrentUserId();
            if (project.getOwner() != null && !project.getOwner().getId().equals(currentUserId)) {
                throw new BusinessException(ErrorCode.FORBIDDEN, "Bạn không có quyền truy cập mô hình của dự án này");
            }
        }
    }

    private static class ExplanationGenerationResult {
        final String explanationText;
        final List<UUID> rawCitedEvidenceIds;
        final String aiModelName;
        final String providerMode;

        ExplanationGenerationResult(String explanationText, List<UUID> rawCitedEvidenceIds,
                                    String aiModelName, String providerMode) {
            this.explanationText = explanationText;
            this.rawCitedEvidenceIds = rawCitedEvidenceIds;
            this.aiModelName = aiModelName;
            this.providerMode = providerMode;
        }
    }
}
