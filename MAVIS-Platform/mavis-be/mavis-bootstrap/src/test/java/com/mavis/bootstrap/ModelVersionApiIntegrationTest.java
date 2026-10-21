package com.mavis.bootstrap;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.model.dto.ModelRevisionRequestDTO;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ModelVersionApiIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private SourceSnapshotRepository sourceSnapshotRepository;

    @Autowired
    private ModelVersionRepository modelVersionRepository;

    @Autowired
    private ModelElementRepository modelElementRepository;

    @Autowired
    private ModelRelationshipRepository modelRelationshipRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    @DisplayName("Full API Integration Test: Get Models -> Create Revision 2 (notification-service) -> Compare O(N)")
    void testModelVersionLifecycleAndDiffApi() throws Exception {
        // --- GIAI ĐOẠN SETUP DỮ LIỆU THẬT ---
        Role studentRole = roleRepository.findByCode("STUDENT")
                .orElseGet(() -> roleRepository.save(Role.builder().code("STUDENT").name("Student").build()));

        User user = userRepository.save(User.builder()
                .email("student_" + UUID.randomUUID().toString().substring(0, 8) + "@mavis.edu.vn")
                .passwordHash("hashed_secret")
                .fullName("Nguyen Van Test")
                .role(studentRole)
                .build());

        Project project = projectRepository.save(Project.builder()
                .name("fruit-market-microservices-" + UUID.randomUUID().toString().substring(0, 8))
                .owner(user)
                .projectType("STUDENT_WORKING")
                .build());

        SourceSnapshot snapshot = sourceSnapshotRepository.save(SourceSnapshot.builder()
                .project(project)
                .sourceType("ZIP_UPLOAD")
                .artifactHash("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
                .storagePath("/storage/test/fruit.zip")
                .build());

        ModelVersion rev1 = modelVersionRepository.save(ModelVersion.builder()
                .project(project)
                .sourceSnapshot(snapshot)
                .revision(1)
                .schemaVersion("1.0")
                .origin("GENERATED")
                .isLatestValid(true)
                .createdBy(user)
                .build());

        ModelElement orderContainer = modelElementRepository.save(ModelElement.builder()
                .modelVersion(rev1)
                .name("fruit-order-service")
                .elementType("SERVICE_CONTAINER")
                .languageStack("JAVA")
                .status("DRAFT")
                .build());

        ModelElement inventoryContainer = modelElementRepository.save(ModelElement.builder()
                .modelVersion(rev1)
                .name("fruit-inventory-service")
                .elementType("SERVICE_CONTAINER")
                .languageStack("JAVA")
                .status("DRAFT")
                .build());

        ModelRelationship httpRel = modelRelationshipRepository.save(ModelRelationship.builder()
                .modelVersion(rev1)
                .sourceElement(orderContainer)
                .targetElement(inventoryContainer)
                .relationType("SERVICE_HTTP_CALL")
                .originLayer("STATIC")
                .direction("DIRECTED")
                .build());

        System.out.println("================================================================================");
        System.out.println(">>> [BƯỚC 1]: GỌI API GET /api/v1/analyzer/projects/" + project.getId() + "/models");
        System.out.println("================================================================================");

        // --- BƯỚC 1: GET /api/v1/analyzer/projects/{projectId}/models ---
        MvcResult getModelsResult = mockMvc.perform(get("/api/v1/analyzer/projects/{projectId}/models", project.getId())
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data[0].revision").value(1))
                .andExpect(jsonPath("$.data[0].origin").value("GENERATED"))
                .andReturn();

        String getModelsJson = getModelsResult.getResponse().getContentAsString();
        JsonNode getModelsNode = objectMapper.readTree(getModelsJson);
        System.out.println("RESPONSE (Bước 1):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(getModelsNode));

        UUID baseModelVersionId = UUID.fromString(getModelsNode.get("data").get(0).get("id").asText());

        System.out.println("\n================================================================================");
        System.out.println(">>> [BƯỚC 2]: GỌI API POST /api/v1/analyzer/models/" + baseModelVersionId + "/revisions");
        System.out.println("    Truyền thêm phần tử mới 'notification-service' và xác nhận 'fruit-order-service'");
        System.out.println("================================================================================");

        // --- BƯỚC 2: POST /api/v1/analyzer/models/{baseModelVersionId}/revisions ---
        ModelRevisionRequestDTO revisionRequest = ModelRevisionRequestDTO.builder()
                .createdById(user.getId())
                .revisionNote("Sinh viên bổ sung notification-service và xác nhận đơn hàng")
                .modifiedElements(List.of(
                        ModelRevisionRequestDTO.ElementModificationDTO.builder()
                                .id(orderContainer.getId())
                                .name("fruit-order-service")
                                .status("STUDENT_CONFIRMED")
                                .build()
                ))
                .addedElements(List.of(
                        ModelRevisionRequestDTO.ElementCreateDTO.builder()
                                .name("notification-service")
                                .elementType("SERVICE_CONTAINER")
                                .languageStack("JAVA")
                                .status("STUDENT_CONFIRMED")
                                .build()
                ))
                .addedRelationships(List.of(
                        ModelRevisionRequestDTO.RelationshipCreateDTO.builder()
                                .sourceElementName("fruit-order-service")
                                .targetElementName("notification-service")
                                .relationType("SERVICE_HTTP_CALL")
                                .build()
                ))
                .build();

        String reqJson = objectMapper.writeValueAsString(revisionRequest);
        System.out.println("REQUEST PAYLOAD (Bước 2):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(revisionRequest));

        MvcResult createRevResult = mockMvc.perform(post("/api/v1/analyzer/models/{baseModelVersionId}/revisions", baseModelVersionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reqJson))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.revision").value(2))
                .andExpect(jsonPath("$.data.origin").value("USER_CONFIRMED"))
                .andExpect(jsonPath("$.data.isLatestValid").value(true))
                .andReturn();

        String createRevJson = createRevResult.getResponse().getContentAsString();
        JsonNode createRevNode = objectMapper.readTree(createRevJson);
        System.out.println("\nRESPONSE (Bước 2):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(createRevNode));

        UUID targetModelVersionId = UUID.fromString(createRevNode.get("data").get("id").asText());

        System.out.println("\n================================================================================");
        System.out.println(">>> [BƯỚC 3]: GỌI API GET /api/v1/analyzer/models/compare");
        System.out.println("    baseVersionId=" + baseModelVersionId + " & targetVersionId=" + targetModelVersionId);
        System.out.println("================================================================================");

        // --- BƯỚC 3: GET /api/v1/analyzer/models/compare ---
        MvcResult compareResult = mockMvc.perform(get("/api/v1/analyzer/models/compare")
                        .param("baseVersionId", baseModelVersionId.toString())
                        .param("targetVersionId", targetModelVersionId.toString())
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.baseRevision").value(1))
                .andExpect(jsonPath("$.data.targetRevision").value(2))
                .andExpect(jsonPath("$.data.addedElements[0].name").value("notification-service"))
                .andExpect(jsonPath("$.data.modifiedElements[0].baseElement.name").value("fruit-order-service"))
                .andExpect(jsonPath("$.data.summary.totalAdded").value(2)) // 1 added element + 1 added relationship
                .andExpect(jsonPath("$.data.summary.totalModified").value(1))
                .andReturn();

        String compareJson = compareResult.getResponse().getContentAsString();
        JsonNode compareNode = objectMapper.readTree(compareJson);
        System.out.println("RESPONSE (Bước 3 - O(N) Diff Result):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(compareNode));
        System.out.println("================================================================================");
    }
}
