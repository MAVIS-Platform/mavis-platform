package com.mavis.analyzer.runtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.mavis.analyzer.model.dto.ModelVersionResponseDTO;
import com.mavis.analyzer.runtime.dto.*;
import com.mavis.analyzer.runtime.generator.ComposeOverrideGenerator;
import com.mavis.analyzer.runtime.security.RunnerServiceAuthGuard;
import com.mavis.analyzer.runtime.service.impl.*;
import com.mavis.analyzer.runtime.validator.ComposePreflightValidator;
import com.mavis.common.config.PlatformRuntimeSettings;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class RuntimeEndToEndIntegrationTest {

    @Mock
    private RuntimeSessionRepository runtimeSessionRepository;
    @Mock
    private ProjectRepository projectRepository;
    @Mock
    private SourceSnapshotRepository sourceSnapshotRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private ModelVersionRepository modelVersionRepository;
    @Mock
    private ModelElementRepository modelElementRepository;
    @Mock
    private ModelRelationshipRepository modelRelationshipRepository;
    @Mock
    private DiagramVersionRepository diagramVersionRepository;
    @Mock
    private EvidenceRepository evidenceRepository;
    @Mock
    private AccessPolicyService accessPolicyService;
    @Mock
    private RunnerServiceAuthGuard runnerServiceAuthGuard;

    @Spy
    private ComposePreflightValidator composePreflightValidator = new ComposePreflightValidator();
    @Spy
    private ComposeOverrideGenerator composeOverrideGenerator = new ComposeOverrideGenerator();
    @Spy
    private PlatformRuntimeSettings settings = new PlatformRuntimeSettings();
    @Spy
    private ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    private RuntimeSessionServiceImpl runtimeSessionService;
    private RunnerReceiptIngestServiceImpl runnerReceiptIngestService;
    private OtelTraceCorrelationServiceImpl otelTraceCorrelationService;

    @TempDir
    Path tempDir;

    private Project project;
    private SourceSnapshot snapshot;
    private ModelVersion baseModel;
    private ModelElement gatewayElement;
    private ModelElement ordersElement;
    private RuntimeSession session;
    private UUID projectId;
    private UUID snapshotId;
    private UUID modelVersionId;
    private UUID gatewayElementId;
    private UUID ordersElementId;
    private UUID sessionId;
    private List<DiagramVersion> savedDiagrams;

    @BeforeEach
    void setUp() throws IOException {
        projectId = UUID.randomUUID();
        snapshotId = UUID.randomUUID();
        modelVersionId = UUID.randomUUID();
        gatewayElementId = UUID.randomUUID();
        ordersElementId = UUID.randomUUID();
        sessionId = UUID.randomUUID();
        savedDiagrams = new ArrayList<>();

        Path composeFile = tempDir.resolve("docker-compose.yml");
        String composeContent = """
                version: '3.8'
                services:
                  gateway:
                    image: mavis/gateway:1.0.0
                    ports:
                      - "8080:8080"
                  orders:
                    image: mavis/orders:1.0.0
                    ports:
                      - "8081:8081"
                """;
        Files.writeString(composeFile, composeContent);

        project = Project.builder().id(projectId).name("Ecommerce System").build();
        snapshot = SourceSnapshot.builder()
                .id(snapshotId)
                .project(project)
                .artifactHash("hash-123")
                .storagePath(composeFile.toString())
                .build();

        baseModel = ModelVersion.builder()
                .id(modelVersionId)
                .project(project)
                .sourceSnapshot(snapshot)
                .revision(1)
                .origin("STATIC")
                .isLatestValid(true)
                .build();

        gatewayElement = ModelElement.builder()
                .id(gatewayElementId)
                .modelVersion(baseModel)
                .name("gateway")
                .elementType("SERVICE_CONTAINER")
                .languageStack("java")
                .build();

        ordersElement = ModelElement.builder()
                .id(ordersElementId)
                .modelVersion(baseModel)
                .name("orders")
                .elementType("SERVICE_CONTAINER")
                .languageStack("dotnet")
                .build();

        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(projectRepository.findByIdForUpdate(projectId)).thenReturn(Optional.of(project));
        when(sourceSnapshotRepository.findById(snapshotId)).thenReturn(Optional.of(snapshot));
        when(modelVersionRepository.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(projectId))
                .thenReturn(Optional.of(baseModel));
        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(baseModel));
        when(modelVersionRepository.findMaxRevisionByProjectId(projectId)).thenReturn(1);

        when(modelElementRepository.findByModelVersionId(modelVersionId))
                .thenReturn(List.of(gatewayElement, ordersElement));
        when(modelElementRepository.saveAll(anyList())).thenAnswer(inv -> {
            List<ModelElement> list = inv.getArgument(0);
            for (ModelElement el : list) {
                if (el.getId() == null) el.setId(UUID.randomUUID());
            }
            return list;
        });

        when(modelRelationshipRepository.findByModelVersionId(modelVersionId))
                .thenReturn(Collections.emptyList());
        when(modelRelationshipRepository.saveAll(anyList())).thenAnswer(inv -> {
            List<ModelRelationship> list = inv.getArgument(0);
            for (ModelRelationship rel : list) {
                if (rel.getId() == null) rel.setId(UUID.randomUUID());
            }
            return list;
        });

        when(evidenceRepository.findByModelVersionId(modelVersionId))
                .thenReturn(Collections.emptyList());
        when(evidenceRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));

        when(runtimeSessionRepository.save(any(RuntimeSession.class))).thenAnswer(invocation -> {
            session = invocation.getArgument(0);
            if (session.getId() == null) {
                session.setId(sessionId);
            }
            return session;
        });
        when(runtimeSessionRepository.findById(any(UUID.class))).thenAnswer(inv -> Optional.ofNullable(session));
        when(runtimeSessionRepository.findLockedById(any(UUID.class))).thenAnswer(inv -> Optional.ofNullable(session));

        when(diagramVersionRepository.save(any(DiagramVersion.class))).thenAnswer(inv -> {
            DiagramVersion dv = inv.getArgument(0);
            if (dv.getId() == null) dv.setId(UUID.randomUUID());
            savedDiagrams.add(dv);
            return dv;
        });

        runtimeSessionService = new RuntimeSessionServiceImpl(
                runtimeSessionRepository,
                projectRepository,
                sourceSnapshotRepository,
                userRepository,
                composePreflightValidator,
                composeOverrideGenerator,
                modelVersionRepository,
                modelElementRepository,
                accessPolicyService,
                runnerServiceAuthGuard,
                objectMapper,
                settings
        );
        ReflectionTestUtils.setField(runtimeSessionService, "runnerStateRoot", tempDir.toString());

        runnerReceiptIngestService = new RunnerReceiptIngestServiceImpl(
                runtimeSessionRepository,
                projectRepository,
                modelVersionRepository,
                modelElementRepository,
                modelRelationshipRepository,
                evidenceRepository,
                diagramVersionRepository,
                runnerServiceAuthGuard,
                objectMapper
        );
        ReflectionTestUtils.setField(runnerReceiptIngestService, "runnerStateRoot", tempDir.toString());
        ReflectionTestUtils.setField(runnerReceiptIngestService, "allowUnverifiedPocPromotion", true);

        otelTraceCorrelationService = new OtelTraceCorrelationServiceImpl(
                runtimeSessionRepository,
                modelVersionRepository,
                modelElementRepository,
                modelRelationshipRepository,
                evidenceRepository,
                diagramVersionRepository,
                objectMapper,
                accessPolicyService
        );
    }

    @Test
    @DisplayName("End-to-End Runtime Pipeline: Auto-fill session -> Export definition -> Approve -> Ingest Receipt -> Verify Sequence Diagram")
    void testEndToEndRuntimePipeline() {
        // Step 1: Create session with default profile and steps
        RuntimeSessionCreateRequest createReq = RuntimeSessionCreateRequest.builder()
                .projectId(projectId)
                .sourceSnapshotId(snapshotId)
                .scenarioName("E2E Automated Flow")
                .profileName("SPRING_BOOT_DOTNET_COMPOSE_V1")
                .build();

        RuntimeSessionResponseDTO createdSessionDTO = runtimeSessionService.createRuntimeSession(createReq);
        assertThat(createdSessionDTO).isNotNull();
        assertThat(createdSessionDTO.getId()).isNotNull();
        assertThat(session.getProfileVersionId()).isNotBlank();
        assertThat(session.getScenarioVersionId()).isNotBlank();
        assertThat(session.getScenarioConfig()).isNotNull();
        assertThat(session.getScenarioConfig().has("profile")).isTrue();
        assertThat(session.getScenarioConfig().has("scenario")).isTrue();

        // Step 2: Export Run Definition
        RunnerDefinitionExportDTO exportDTO = runtimeSessionService.exportRunDefinition(session.getId());
        assertThat(exportDTO).isNotNull();
        assertThat(exportDTO.getResourceProject()).isNotBlank();
        assertThat(exportDTO.getModelVersionId()).isEqualTo(modelVersionId.toString());
        assertThat(exportDTO.getProfile()).isNotNull();
        assertThat(exportDTO.getScenario()).isNotNull();
        assertThat(exportDTO.getComposeYaml()).isNotBlank();

        // Step 3: Approve and start session
        RuntimeSessionResponseDTO approvedDTO = runtimeSessionService.approveAndStartSession(session.getId());
        assertThat(approvedDTO.getScenarioStatus()).isEqualTo("APPROVED");
        assertThat(approvedDTO.getExecutionStatus()).isEqualTo("READY_FOR_DISPATCH");

        // Step 4: Simulate Runner execution and receipt delivery
        RunnerCorrelatedSpanDTO spanGateway = RunnerCorrelatedSpanDTO.builder()
                .traceId("4bf92f3577b34da6a3ce929d0e0e4736")
                .spanId("00f067aa0ba902b7")
                .runtimeService("gateway")
                .modelServiceId(gatewayElementId.toString())
                .httpMethod("GET")
                .httpStatusCode(200)
                .route("/health")
                .durationNanoseconds("45000000")
                .build();

        RunnerCorrelatedSpanDTO spanOrders = RunnerCorrelatedSpanDTO.builder()
                .traceId("4bf92f3577b34da6a3ce929d0e0e4736")
                .spanId("5fb397be34d23b0f")
                .parentSpanId("00f067aa0ba902b7")
                .runtimeService("orders")
                .modelServiceId(ordersElementId.toString())
                .httpMethod("POST")
                .httpStatusCode(201)
                .route("/orders")
                .durationNanoseconds("120000000")
                .build();

        RunnerTraceCorrelationDTO trace = RunnerTraceCorrelationDTO.builder()
                .sessionId(session.getId().toString())
                .modelVersionId(modelVersionId.toString())
                .spans(List.of(spanGateway, spanOrders))
                .causalEdges(List.of(new RunnerCausalEdgeDTO("4bf92f3577b34da6a3ce929d0e0e4736", "00f067aa0ba902b7", "5fb397be34d23b0f")))
                .warnings(Collections.emptyList())
                .build();

        RunnerOutcomeDTO outcome = RunnerOutcomeDTO.builder()
                .executionStatus("Completed")
                .scenarioStatus("Passed")
                .evidenceStatus("Available")
                .cleanupStatus("Confirmed")
                .traceQuality("CompleteForCapturedData")
                .mappingStatus("Mapped")
                .trace(trace)
                .build();

        RunnerReceiptIngestRequestDTO receiptRequest = RunnerReceiptIngestRequestDTO.builder()
                .sessionId(session.getId().toString())
                .sourceSnapshotId(snapshotId.toString())
                .modelVersionId(modelVersionId.toString())
                .profileVersionId(session.getProfileVersionId())
                .runConfigurationVersionId(session.getRunConfigurationVersionId())
                .scenarioVersionId(session.getScenarioVersionId())
                .resourceProject(session.getResourceProject())
                .sandboxEnforcementConfirmed(true)
                .imageSourceCorrespondence("Verified")
                .profileAcceptance("Accepted")
                .outcome(outcome)
                .build();

        when(modelVersionRepository.save(any(ModelVersion.class))).thenAnswer(inv -> {
            ModelVersion mv = inv.getArgument(0);
            if (mv.getId() == null) mv.setId(UUID.randomUUID());
            return mv;
        });

        ModelVersionResponseDTO enrichedModel = runnerReceiptIngestService.ingestRunnerReceipt(session.getId(), receiptRequest);
        assertThat(enrichedModel).isNotNull();
        assertThat(enrichedModel.getOrigin()).isEqualTo("RUNTIME_ENRICHED");
        assertThat(enrichedModel.getRevision()).isEqualTo(2);

        // Step 5: Verify Sequence Diagram has NO empty strings
        ModelVersion enrichedMv = ModelVersion.builder()
                .id(enrichedModel.getId())
                .project(project)
                .runtimeSession(session)
                .revision(2)
                .origin("RUNTIME_ENRICHED")
                .build();

        when(modelVersionRepository.findFirstByRuntimeSessionIdOrderByRevisionDesc(session.getId()))
                .thenReturn(Optional.of(enrichedMv));
        when(diagramVersionRepository.findByModelVersionIdAndNotation(enrichedModel.getId(), "UML_SEQUENCE"))
                .thenReturn(savedDiagrams);

        SequenceDiagramResponseDTO sequenceDiagram = otelTraceCorrelationService.getSequenceDiagramBySession(session.getId());
        assertThat(sequenceDiagram).isNotNull();
        assertThat(sequenceDiagram.getNotation()).isEqualTo("UML_SEQUENCE");
        assertThat(sequenceDiagram.getSteps()).isNotEmpty();

        for (SequenceStepDTO step : sequenceDiagram.getSteps()) {
            assertThat(step.getMessageId()).isNotBlank();
            assertThat(step.getCallerService()).isNotBlank();
            assertThat(step.getCalleeService()).isNotBlank();
            if (step.getHttpMethod() != null) {
                assertThat(step.getHttpMethod()).isNotBlank();
                assertThat(step.getHttpMethod()).doesNotContain(" ");
            }
            if (step.getOperation() != null) {
                assertThat(step.getOperation()).isNotBlank();
            }
            if (step.getHttpStatusCode() != null) {
                assertThat(step.getHttpStatusCode()).isBetween(100, 599);
            }
            assertThat(step.getMessageId()).isNotEqualTo("");
            assertThat(step.getCallerService()).isNotEqualTo("");
            assertThat(step.getCalleeService()).isNotEqualTo("");
        }
    }
}
