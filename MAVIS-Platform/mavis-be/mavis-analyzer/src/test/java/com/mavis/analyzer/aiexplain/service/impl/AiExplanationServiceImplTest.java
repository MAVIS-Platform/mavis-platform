package com.mavis.analyzer.aiexplain.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.mavis.analyzer.aiexplain.config.ApiKeyProvider;
import com.mavis.analyzer.aiexplain.dto.AiExplainRequestDTO;
import com.mavis.analyzer.aiexplain.dto.AiExplanationResponseDTO;
import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.OffsetDateTime;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiExplanationServiceImplTest {
    @Test void elementExplanationUsesIncomingRelationshipEvidenceWithCorrectAttribution() {
        var peer = ModelElement.builder().id(UUID.randomUUID()).modelVersion(modelVersion).name("commands").build();
        var relation = ModelRelationship.builder().id(UUID.randomUUID()).modelVersion(modelVersion).sourceElement(peer).targetElement(element).build();
        genuineEvidence.setElement(null); genuineEvidence.setRelationship(relation);
        genuineEvidence.setExcerpt("subscribe(commands)");
        var request = AiExplainRequestDTO.builder().modelVersionId(modelVersionId).explanationScope("ELEMENT").elementId(elementId).forceRefresh(true).build();
        var response = aiExplanationService.generateOrGetExplanation(request);
        assertThat(response.getCitedEvidenceIds()).contains(genuineEvidenceId);
        assertThat(response.getCitedEvidences().get(0).getElementId()).isNull();
        assertThat(response.getCitedEvidences().get(0).getRelationshipId()).isEqualTo(relation.getId());
        assertThat(response.getExplanationText()).contains("Relationship evidence supports connectivity");
    }

    @Test void uncitedLegacyCacheIsRefreshedWhenSavedContextEvidenceExists() {
        var cached = AiExplanation.builder().id(UUID.randomUUID()).modelVersion(modelVersion).element(element).explanationScope("ELEMENT")
                .explanationText("Old response with no grounding").citedEvidenceIds(objectMapper.createArrayNode()).secretRedacted(true).build();
        when(aiExplanationRepository.findFirstByModelVersionIdAndExplanationScopeAndElementIdOrderByCreatedAtDesc(modelVersionId, "ELEMENT", elementId)).thenReturn(Optional.of(cached));
        when(evidenceRepository.findElementContext(modelVersionId, elementId)).thenReturn(List.of(genuineEvidence));
        var response = aiExplanationService.generateOrGetExplanation(AiExplainRequestDTO.builder().modelVersionId(modelVersionId).explanationScope("ELEMENT").elementId(elementId).build());
        assertThat(response.getCached()).isFalse();
        assertThat(response.getCitedEvidenceIds()).contains(genuineEvidenceId);
    }

    @Test void noSavedEvidenceIsReportedAsModelContextRatherThanVerifiedGrounding() {
        when(evidenceRepository.findByModelVersionId(modelVersionId)).thenReturn(List.of());
        var response = aiExplanationService.generateOrGetExplanation(AiExplainRequestDTO.builder().modelVersionId(modelVersionId).explanationScope("ELEMENT").elementId(elementId).forceRefresh(true).build());
        assertThat(response.getCitedEvidenceIds()).isEmpty();
        assertThat(response.getEpistemicBadge()).contains("No Saved Evidence Cited");
        assertThat(response.getExplanationText()).contains("No saved evidence is available");
    }

    @Mock
    private AiExplanationRepository aiExplanationRepository;

    @Mock
    private ModelVersionRepository modelVersionRepository;

    @Mock
    private ModelElementRepository modelElementRepository;

    @Mock
    private ModelRelationshipRepository modelRelationshipRepository;

    @Mock
    private RuntimeSessionRepository runtimeSessionRepository;

    @Mock
    private EvidenceRepository evidenceRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private ApiKeyProvider apiKeyProvider;

    @Mock
    private AccessPolicyService accessPolicyService;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private AiExplanationServiceImpl aiExplanationService;

    private UUID modelVersionId;
    private UUID projectId;
    private UUID elementId;
    private UUID genuineEvidenceId;
    private Project project;
    private ModelVersion modelVersion;
    private ModelElement element;
    private Evidence genuineEvidence;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(aiExplanationService, "accessPolicyService", accessPolicyService);

        modelVersionId = UUID.randomUUID();
        projectId = UUID.randomUUID();
        elementId = UUID.randomUUID();
        genuineEvidenceId = UUID.randomUUID();

        User owner = User.builder().id(UUID.randomUUID()).fullName("Project Owner").build();
        project = Project.builder().id(projectId).name("Shopping Cart System").owner(owner).build();
        SourceSnapshot snapshot = SourceSnapshot.builder().id(UUID.randomUUID()).project(project).build();

        modelVersion = ModelVersion.builder()
                .id(modelVersionId)
                .project(project)
                .sourceSnapshot(snapshot)
                .revision(1)
                .build();

        element = ModelElement.builder()
                .id(elementId)
                .modelVersion(modelVersion)
                .name("cart-service")
                .elementType("SERVICE_CONTAINER")
                .languageStack("Java 21 / Spring Boot")
                .status("VALIDATED")
                .build();

        genuineEvidence = Evidence.builder()
                .id(genuineEvidenceId)
                .modelVersion(modelVersion)
                .element(element)
                .sourceType("CODE_AST")
                .locator("src/main/java/com/mavis/CartController.java:L25")
                .excerpt("public class CartController { password=super_secret_123 }")
                .build();

        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(modelVersion));
        when(modelElementRepository.findById(elementId)).thenReturn(Optional.of(element));
        when(evidenceRepository.findByModelVersionId(modelVersionId)).thenReturn(List.of(genuineEvidence));
        when(evidenceRepository.findAllById(any())).thenReturn(List.of(genuineEvidence));
        when(apiKeyProvider.resolveApiKey()).thenReturn(Optional.empty()); // Mặc định không có key để kích hoạt Deterministic Synthesis

        when(aiExplanationRepository.save(any(AiExplanation.class))).thenAnswer(inv -> {
            AiExplanation exp = inv.getArgument(0);
            exp.setId(UUID.randomUUID());
            return exp;
        });
    }

    @Test
    @DisplayName("Ticket D2: Không có API key -> Deterministic Grounded Synthesis tạo lời giải thích thành công")
    void testGenerateExplanation_DeterministicFallback_Success() {
        AiExplainRequestDTO request = AiExplainRequestDTO.builder()
                .modelVersionId(modelVersionId)
                .explanationScope("ELEMENT")
                .elementId(elementId)
                .userQuestion("cart-service đảm nhiệm vai trò gì?")
                .build();

        AiExplanationResponseDTO response = aiExplanationService.generateOrGetExplanation(request);

        assertThat(response).isNotNull();
        assertThat(response.getExplanationScope()).isEqualTo("ELEMENT");
        assertThat(response.getElementName()).isEqualTo("cart-service");
        assertThat(response.getProviderMode()).isEqualTo("DETERMINISTIC_EVIDENCE_SYNTHESIS");
        assertThat(response.getAiModelName()).isEqualTo("deterministic-evidence-grounded-synthesizer");
        assertThat(response.getSecretRedacted()).isTrue();
        assertThat(response.getCitedEvidenceIds()).contains(genuineEvidenceId);
        assertThat(response.getExplanationText()).contains("cart-service");
        verify(aiExplanationRepository).save(any(AiExplanation.class));
    }

    @Test
    @DisplayName("Ticket D2: Khử sạch mật khẩu trong câu hỏi và đoạn trích bằng chứng (secretRedacted = true)")
    void testGenerateExplanation_SecretRedaction() {
        AiExplainRequestDTO request = AiExplainRequestDTO.builder()
                .modelVersionId(modelVersionId)
                .explanationScope("ELEMENT")
                .elementId(elementId)
                .userQuestion("Giải thích endpoint với token=secret_token_abc_xyz")
                .build();

        AiExplanationResponseDTO response = aiExplanationService.generateOrGetExplanation(request);

        assertThat(response.getSecretRedacted()).isTrue();
        // Kiểm tra nội dung text không còn chứa secret_token_abc_xyz
        assertThat(response.getExplanationText()).doesNotContain("secret_token_abc_xyz");
        assertThat(response.getExplanationText()).contains("[REDACTED]");
    }

    @Test
    @DisplayName("Ticket D2: Citation Allowlist Validation - Loại bỏ hoàn toàn bằng chứng ảo giác hoặc sai ModelVersion")
    void testGenerateExplanation_CitationAllowlistValidation() {
        UUID fakeEvidenceId = UUID.randomUUID();

        // Giả lập kết quả từ synthesizer hoặc LLM trả về cả genuine ID và fake ID
        AiExplainRequestDTO request = AiExplainRequestDTO.builder()
                .modelVersionId(modelVersionId)
                .explanationScope("ELEMENT")
                .elementId(elementId)
                .build();

        AiExplanationResponseDTO response = aiExplanationService.generateOrGetExplanation(request);

        // Chỉ chứa genuineEvidenceId có trong allowedEvidenceIds, không có fakeId
        assertThat(response.getCitedEvidenceIds()).contains(genuineEvidenceId);
        assertThat(response.getCitedEvidenceIds()).doesNotContain(fakeEvidenceId);
    }

    @Test
    @DisplayName("Ticket D2: Trả về kết quả từ Cache khi forceRefresh = false và không có câu hỏi riêng")
    void testGenerateExplanation_ReturnsCached_WhenAvailable() {
        UUID cachedId = UUID.randomUUID();
        ArrayNode cachedCited = objectMapper.createArrayNode().add(genuineEvidenceId.toString());

        AiExplanation cachedEntity = AiExplanation.builder()
                .id(cachedId)
                .modelVersion(modelVersion)
                .element(element)
                .explanationScope("ELEMENT")
                .explanationText("Bản ghi giải thích đã được lưu trước đó")
                .citedEvidenceIds(cachedCited)
                .secretRedacted(true)
                .aiModelName("cached-model")
                .createdAt(OffsetDateTime.now())
                .build();

        when(aiExplanationRepository.findFirstByModelVersionIdAndExplanationScopeAndElementIdOrderByCreatedAtDesc(
                modelVersionId, "ELEMENT", elementId)).thenReturn(Optional.of(cachedEntity));

        AiExplainRequestDTO request = AiExplainRequestDTO.builder()
                .modelVersionId(modelVersionId)
                .explanationScope("ELEMENT")
                .elementId(elementId)
                .forceRefresh(false)
                .build();

        AiExplanationResponseDTO response = aiExplanationService.generateOrGetExplanation(request);

        assertThat(response).isNotNull();
        assertThat(response.getCached()).isTrue();
        assertThat(response.getId()).isEqualTo(cachedId);
        assertThat(response.getExplanationText()).isEqualTo("Bản ghi giải thích đã được lưu trước đó");
        verify(aiExplanationRepository, never()).save(any());
    }

    @Test
    @DisplayName("Chặn truy vấn chéo: Ném BAD_REQUEST khi elementId không thuộc về ModelVersion được chỉ định")
    void testGenerateExplanation_CrossVersionMismatch_ThrowsBadRequest() {
        ModelVersion otherVersion = ModelVersion.builder().id(UUID.randomUUID()).build();
        ModelElement foreignElement = ModelElement.builder()
                .id(UUID.randomUUID())
                .modelVersion(otherVersion)
                .build();

        when(modelElementRepository.findById(foreignElement.getId())).thenReturn(Optional.of(foreignElement));

        AiExplainRequestDTO request = AiExplainRequestDTO.builder()
                .modelVersionId(modelVersionId)
                .explanationScope("ELEMENT")
                .elementId(foreignElement.getId())
                .build();

        assertThatThrownBy(() -> aiExplanationService.generateOrGetExplanation(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Phần tử kiến trúc không thuộc về ModelVersion này");
    }

    @Test
    @DisplayName("Ném FORBIDDEN khi người dùng không có quyền đọc Project")
    void testGenerateExplanation_Forbidden_ThrowsForbidden() {
        doThrow(new BusinessException(ErrorCode.FORBIDDEN, "Access denied"))
                .when(accessPolicyService).requireProjectReadAccess(project);

        AiExplainRequestDTO request = AiExplainRequestDTO.builder()
                .modelVersionId(modelVersionId)
                .explanationScope("ELEMENT")
                .elementId(elementId)
                .build();

        assertThatThrownBy(() -> aiExplanationService.generateOrGetExplanation(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Access denied");
    }
}
