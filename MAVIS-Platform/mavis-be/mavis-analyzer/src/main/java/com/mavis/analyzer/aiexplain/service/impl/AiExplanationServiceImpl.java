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
            if (cached.isPresent()) {
                log.info("Trả về kết quả giải thích AI từ cache cho modelVersionId={}, scope={}", modelVersion.getId(), scope);
                return mapToResponseDTO(cached.get(), true, "CACHE");
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

        allowedEvidenceIds = relevantEvidences.stream().map(Evidence::getId).collect(Collectors.toSet());
        // 6. Khử sạch bí mật mã nguồn (SecretRedactor) trên các đoạn trích & câu hỏi người dùng
        String sanitizedQuestion = SecretRedactor.redactString(request.getUserQuestion());
        List<EvidenceSummaryDTO> sanitizedEvidenceSummaries = relevantEvidences.stream()
                .map(e -> EvidenceSummaryDTO.builder()
                        .id(e.getId())
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
                        sanitizedEvidenceSummaries, sanitizedQuestion);
            } catch (Exception e) {
                log.warn("Gọi LLM API thất bại (Lỗi: {}). Tự động kích hoạt Deterministic Grounded Synthesis.", e.getMessage());
            }
        }

        if (genResult == null) {
            genResult = synthesizeDeterministicExplanation(scope, targetElement, targetRelationship, targetSession,
                    modelVersion, relevantEvidences, sanitizedQuestion);
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

        AiExplanation entity = AiExplanation.builder()
                .modelVersion(modelVersion)
                .element(targetElement)
                .relationship(targetRelationship)
                .runtimeSession(targetSession)
                .requestedBy(currentUser)
                .explanationScope(scope)
                .explanationText(genResult.explanationText)
                .citedEvidenceIds(citedArray)
                .secretRedacted(true)
                .aiModelName(genResult.aiModelName)
                .build();

        entity = aiExplanationRepository.save(entity);
        log.info("Lưu thành công lời giải thích AI ID: {}, providerMode: {}, trích dẫn: {} bằng chứng",
                entity.getId(), genResult.providerMode, validatedCitedIds.size());

        return mapToResponseDTO(entity, false, genResult.providerMode);
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
                        .filter(e -> e.getElement() != null && e.getElement().getId().equals(element.getId()))
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
                                                    List<EvidenceSummaryDTO> evidences, String userQuestion) throws Exception {

        String targetUrl = (customEndpointUrl != null && !customEndpointUrl.isBlank())
                ? customEndpointUrl
                : DEFAULT_GEMINI_URL + apiKey;

        String systemPrompt = "Bạn là Chuyên gia Kiến trúc Phần mềm MAVIS AI. "
                + "Nhiệm vụ của bạn là giải thích cấu trúc kiến trúc phần mềm, vai trò của các dịch vụ, quan hệ phụ thuộc hoặc vết thực nghiệm runtime. "
                + "QUY TẮC CỐT LÕI: Bạn BẮT BUỘC chỉ được đưa ra nhận định dựa trên danh sách bằng chứng được cung cấp. "
                + "Bắt buộc trả về kết quả dưới định dạng JSON duy nhất gồm 2 trường: "
                + "{\"explanationText\": \"...nội dung giải thích chi tiết bằng tiếng Việt...\", \"citedEvidenceIds\": [\"uuid-1\", \"uuid-2\"]}";

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
                    .put("sourceType", ev.getSourceType())
                    .put("locator", ev.getLocator())
                    .put("excerpt", ev.getExcerpt());
        }

        String fullUserPrompt = systemPrompt + "\n\nNgữ cảnh xác thực kiến trúc:\n" + promptJson.toPrettyString();

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
        JsonNode textCandidate = responseNode.path("candidates").path(0).path("content").path("parts").path(0).path("text");
        if (textCandidate.isMissingNode() || textCandidate.asText().isBlank()) {
            throw new RuntimeException("Gemini response missing text candidate");
        }

        String jsonText = textCandidate.asText().trim();
        JsonNode parsedPayload = objectMapper.readTree(jsonText);

        String explanationText = parsedPayload.path("explanationText").asText("Đã phân tích kiến trúc thành công.");
        List<UUID> citedIds = new ArrayList<>();
        JsonNode idsNode = parsedPayload.path("citedEvidenceIds");
        if (idsNode.isArray()) {
            for (JsonNode idNode : idsNode) {
                try {
                    citedIds.add(UUID.fromString(idNode.asText()));
                } catch (Exception ignored) {}
            }
        }

        return new ExplanationGenerationResult(explanationText, citedIds, "gemini-2.5-flash", "LIVE_LLM_PROVIDER");
    }

    private ExplanationGenerationResult synthesizeDeterministicExplanation(String scope, ModelElement element,
                                                                          ModelRelationship relationship,
                                                                          RuntimeSession session,
                                                                          ModelVersion modelVersion,
                                                                          List<Evidence> relevantEvidences,
                                                                          String userQuestion) {

        StringBuilder sb = new StringBuilder();
        List<UUID> citedIds = new ArrayList<>();

        sb.append("### Giải Thích Kiến Trúc Bằng Chứng Thực Nghiệm (Grounded Synthesis)\n\n");

        if ("ELEMENT".equals(scope) && element != null) {
            sb.append("Phần tử **").append(element.getName()).append("** là một thành phần cốt lõi thuộc phân loại `")
                    .append(element.getElementType()).append("`");
            if (element.getLanguageStack() != null) {
                sb.append(" trên nền tảng công nghệ `").append(element.getLanguageStack()).append("`");
            }
            sb.append(".\n\n");
            sb.append("- **Trạng thái mô hình**: Phần tử đã được lập chỉ mục ở trạng thái `").append(element.getStatus()).append("`.\n");
            sb.append("- **Cơ sở xác thực**: Cấu trúc thành phần được nhận diện trực tiếp qua các bằng chứng phân tích mã nguồn và cấu hình container.\n");
        } else if ("RELATIONSHIP".equals(scope) && relationship != null) {
            sb.append("Quan hệ phụ thuộc giữa **").append(relationship.getSourceElement().getName())
                    .append("** và **").append(relationship.getTargetElement().getName())
                    .append("** được xác nhận là `").append(relationship.getRelationType()).append("`");
            sb.append(" thuộc tầng quan sát `").append(relationship.getOriginLayer()).append("`.\n\n");
            sb.append("- **Chiều tương tác**: ").append(relationship.getDirection() != null ? relationship.getDirection() : "DIRECTED").append(".\n");
            sb.append("- **Ý nghĩa kiến trúc**: Dịch vụ nguồn thực hiện kết nối phụ thuộc tới đích, đảm bảo luồng nghiệp vụ phân tán trong hệ thống.\n");
        } else if ("RUNTIME_TRACE".equals(scope)) {
            sb.append("Phiên thực nghiệm kiểm thử động trong môi trường Docker Sandbox Sandbox");
            if (session != null) {
                sb.append(" (Kịch bản: `").append(session.getScenarioName() != null ? session.getScenarioName() : "Mặc định").append("`)");
                sb.append(" ghi nhận kết quả: **").append(session.getScenarioStatus() != null ? session.getScenarioStatus() : "HOÀN TẤT").append("**.\n\n");
                sb.append("- **Trạng thái Trace**: `").append(session.getTraceStatus() != null ? session.getTraceStatus() : "AVAILABLE").append("`.\n");
                sb.append("- **Chất lượng quan sát**: Dữ liệu dấu vết OpenTelemetry chứng minh các luồng gọi HTTP/gRPC thực tế giữa các container đang chạy.\n");
            } else {
                sb.append(" đã ghi nhận các luồng tương tác thời gian thực giữa các vi dịch vụ.\n\n");
            }
        } else if ("CHANGE_IMPACT".equals(scope) && element != null) {
            sb.append("Phân tích tác động biến đổi cho phần tử **").append(element.getName()).append("**:\n\n");
            sb.append("- Nếu thay đổi interface hoặc logic của `").append(element.getName()).append("`, các dịch vụ phụ thuộc trực tiếp sẽ chịu tác động lan truyền.\n");
            sb.append("- Cần thực hiện kiểm thử hồi quy trên các cạnh kết nối liên quan để tránh gãy vỡ hợp đồng giao tiếp.\n");
        } else {
            sb.append("Toàn bộ phiên bản mô hình kiến trúc (Revision ").append(modelVersion.getRevision()).append(") ");
            sb.append("được ánh xạ đầy đủ giữa sơ đồ tĩnh và vết thực nghiệm động, bảo toàn tính toàn vẹn của hệ thống.\n\n");
        }

        if (userQuestion != null && !userQuestion.isBlank()) {
            sb.append("\n**Trả lời câu hỏi người dùng**: Đối với vấn đề \"_").append(userQuestion).append("_\", ");
            sb.append("hệ thống xác nhận căn cứ trên các bằng chứng mã nguồn đã kiểm chứng dưới đây.\n");
        }

        if (!relevantEvidences.isEmpty()) {
            sb.append("\n**Bằng chứng xác thực kiến trúc trích dẫn:**\n");
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

    private AiExplanationResponseDTO mapToResponseDTO(AiExplanation entity, boolean cached, String providerMode) {
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
                    .map(EvidenceSummaryDTO::fromEntity)
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
                .epistemicBadge("AI-Assisted Explanation (Grounded in Saved Model Evidence)")
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
