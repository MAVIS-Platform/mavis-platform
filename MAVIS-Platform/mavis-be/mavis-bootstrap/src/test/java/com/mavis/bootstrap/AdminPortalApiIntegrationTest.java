package com.mavis.bootstrap;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.Role;
import com.mavis.common.entity.User;
import com.mavis.common.repository.RoleRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.platform.admin.dto.UserRoleUpdateRequest;
import com.mavis.platform.admin.dto.UserStatusUpdateRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AdminPortalApiIntegrationTest extends ApiIntegrationContext {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    @DisplayName("FULL ADMIN PORTAL & AUDIT LOG API TEST: User Status Change -> Role Change -> Dashboard Stats -> Audit Logs")
    void testAdminPortalLifecycleApi() throws Exception {
        // --- 1. SETUP DỮ LIỆU BAN ĐẦU ---
        Role adminRole = roleRepository.findByCode("SYSTEM_ADMIN")
                .orElseGet(() -> roleRepository.save(Role.builder().code("SYSTEM_ADMIN").name("System Administrator").build()));

        Role studentRole = roleRepository.findByCode("STUDENT")
                .orElseGet(() -> roleRepository.save(Role.builder().code("STUDENT").name("Student").build()));

        Role lecturerRole = roleRepository.findByCode("LECTURER")
                .orElseGet(() -> roleRepository.save(Role.builder().code("LECTURER").name("Lecturer").build()));

        User adminUser = userRepository.save(User.builder()
                .email("admin_operator_" + UUID.randomUUID().toString().substring(0, 8) + "@mavis.edu.vn")
                .passwordHash("hashed_admin_pwd")
                .fullName("Quan Tri Vien He Thong")
                .role(adminRole)
                .status("ACTIVE")
                .build());

        User targetStudent = userRepository.save(User.builder()
                .email("student_target_" + UUID.randomUUID().toString().substring(0, 8) + "@mavis.edu.vn")
                .passwordHash("hashed_student_pwd")
                .fullName("Pham Thi Sinh Vien")
                .role(studentRole)
                .status("ACTIVE")
                .build());

        System.out.println("================================================================================");
        System.out.println(">>> [BƯỚC 1]: GỌI API GET /api/v1/admin/users");
        System.out.println("    Lấy danh sách người dùng toàn hệ thống (EntityGraph tối ưu)");
        System.out.println("================================================================================");

        // --- BƯỚC 1: GET /api/v1/admin/users ---
        MvcResult usersResult = mockMvc.perform(get("/api/v1/admin/users")
                        .header("Authorization", testAuthorization(adminUser.getEmail()))
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray())
                .andReturn();

        String usersJson = usersResult.getResponse().getContentAsString();
        JsonNode usersRes = objectMapper.readTree(usersJson);
        System.out.println("RESPONSE (Bước 1 - Danh sách người dùng):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(usersRes));

        assertThat(usersRes.get("data").size()).isGreaterThanOrEqualTo(2);

        System.out.println("\n================================================================================");
        System.out.println(">>> [BƯỚC 2]: GỌI API PATCH /api/v1/admin/users/" + targetStudent.getId() + "/status");
        System.out.println("    Khóa tài khoản sinh viên (ACTIVE -> LOCKED) & Ghi AuditLog");
        System.out.println("================================================================================");

        // --- BƯỚC 2: PATCH Status ---
        UserStatusUpdateRequest lockReq = UserStatusUpdateRequest.builder()
                .newStatus("LOCKED")
                .build();

        MvcResult lockResult = mockMvc.perform(patch("/api/v1/admin/users/{userId}/status", targetStudent.getId())
                        .header("Authorization", testAuthorization(adminUser.getEmail()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(lockReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(targetStudent.getId().toString()))
                .andExpect(jsonPath("$.data.status").value("LOCKED"))
                .andReturn();

        String lockJson = lockResult.getResponse().getContentAsString();
        JsonNode lockRes = objectMapper.readTree(lockJson);
        System.out.println("RESPONSE (Bước 2 - Khóa tài khoản):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(lockRes));

        System.out.println("\n================================================================================");
        System.out.println(">>> [BƯỚC 3]: GỌI API PATCH /api/v1/admin/users/" + targetStudent.getId() + "/role");
        System.out.println("    Nâng quyền người dùng (STUDENT -> LECTURER) & Ghi AuditLog");
        System.out.println("================================================================================");

        // --- BƯỚC 3: PATCH Role ---
        UserRoleUpdateRequest roleReq = UserRoleUpdateRequest.builder()
                .newRoleCode("LECTURER")
                .build();

        MvcResult roleResult = mockMvc.perform(patch("/api/v1/admin/users/{userId}/role", targetStudent.getId())
                        .header("Authorization", testAuthorization(adminUser.getEmail()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(roleReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(targetStudent.getId().toString()))
                .andExpect(jsonPath("$.data.roleCode").value("LECTURER"))
                .andReturn();

        String roleJson = roleResult.getResponse().getContentAsString();
        JsonNode roleRes = objectMapper.readTree(roleJson);
        System.out.println("RESPONSE (Bước 3 - Đổi vai trò người dùng):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(roleRes));

        System.out.println("\n================================================================================");
        System.out.println(">>> [BƯỚC 4]: GỌI API GET /api/v1/admin/dashboard-stats");
        System.out.println("    Thống kê các chỉ số tổng quan hệ thống trên Dashboard");
        System.out.println("================================================================================");

        // --- BƯỚC 4: GET /dashboard-stats ---
        MvcResult statsResult = mockMvc.perform(get("/api/v1/admin/dashboard-stats")
                        .header("Authorization", testAuthorization(adminUser.getEmail()))
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.totalUsers").isNumber())
                .andExpect(jsonPath("$.data.totalWorkspaces").isNumber())
                .andReturn();

        String statsJson = statsResult.getResponse().getContentAsString();
        JsonNode statsRes = objectMapper.readTree(statsJson);
        System.out.println("RESPONSE (Bước 4 - Thống kê Dashboard):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(statsRes));

        assertThat(statsRes.get("data").get("totalUsers").asLong()).isGreaterThanOrEqualTo(2);

        System.out.println("\n================================================================================");
        System.out.println(">>> [BƯỚC 5]: GỌI API GET /api/v1/admin/audit-logs");
        System.out.println("    Truy vết nhật ký kiểm toán hệ thống (Audit Logs)");
        System.out.println("================================================================================");

        // --- BƯỚC 5: GET /audit-logs ---
        MvcResult auditResult = mockMvc.perform(get("/api/v1/admin/audit-logs")
                        .header("Authorization", testAuthorization(adminUser.getEmail()))
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray())
                .andReturn();

        String auditJson = auditResult.getResponse().getContentAsString();
        JsonNode auditRes = objectMapper.readTree(auditJson);
        System.out.println("RESPONSE (Bước 5 - Nhật ký kiểm toán):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(auditRes));

        assertThat(auditRes.get("data").size()).isGreaterThanOrEqualTo(2);

        System.out.println("================================================================================");
        System.out.println(">>> TOÀN BỘ CÁC BƯỚC KIỂM THỬ API TASK 6.3 HOÀN TẤT THÀNH CÔNG 100%!");
        System.out.println("================================================================================");
    }
}
