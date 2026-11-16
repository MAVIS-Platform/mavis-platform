package com.mavis.platform.admin.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.platform.admin.dto.*;
import com.mavis.platform.admin.service.AdminPortalService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AdminPortalControllerTest {

    private MockMvc mockMvc;

    @Mock
    private AdminPortalService adminPortalService;

    @InjectMocks
    private AdminPortalController adminPortalController;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(adminPortalController).build();
    }

    @Test
    @DisplayName("GET /api/v1/admin/users: Lấy danh sách người dùng")
    void testGetAllUsers() throws Exception {
        AdminUserResponseDTO u = AdminUserResponseDTO.builder()
                .id(UUID.randomUUID())
                .email("admin@mavis.edu.vn")
                .roleCode("ADMIN")
                .status("ACTIVE")
                .build();

        when(adminPortalService.getAllUsers()).thenReturn(List.of(u));

        mockMvc.perform(get("/api/v1/admin/users")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data[0].email").value("admin@mavis.edu.vn"));
    }

    @Test
    @DisplayName("PATCH /api/v1/admin/users/{userId}/status: Khóa tài khoản")
    void testChangeUserStatus() throws Exception {
        UUID userId = UUID.randomUUID();
        UserStatusUpdateRequest req = UserStatusUpdateRequest.builder()
                .newStatus("LOCKED")
                .build();

        AdminUserResponseDTO res = AdminUserResponseDTO.builder()
                .id(userId)
                .status("LOCKED")
                .build();

        when(adminPortalService.changeUserStatus(eq(userId), eq("LOCKED"))).thenReturn(res);

        mockMvc.perform(patch("/api/v1/admin/users/{userId}/status", userId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.status").value("LOCKED"));
    }

    @Test
    @DisplayName("PATCH /api/v1/admin/users/{userId}/role: Đổi vai trò")
    void testChangeUserRole() throws Exception {
        UUID userId = UUID.randomUUID();
        UserRoleUpdateRequest req = UserRoleUpdateRequest.builder()
                .newRoleCode("LECTURER")
                .build();

        AdminUserResponseDTO res = AdminUserResponseDTO.builder()
                .id(userId)
                .roleCode("LECTURER")
                .build();

        when(adminPortalService.changeUserRole(eq(userId), eq("LECTURER"))).thenReturn(res);

        mockMvc.perform(patch("/api/v1/admin/users/{userId}/role", userId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.roleCode").value("LECTURER"));
    }

    @Test
    @DisplayName("GET /api/v1/admin/dashboard-stats: Thống kê Dashboard")
    void testGetDashboardStats() throws Exception {
        AdminDashboardStatsDTO stats = AdminDashboardStatsDTO.builder()
                .totalUsers(150L)
                .totalProjects(40L)
                .totalSubmissions(20L)
                .build();

        when(adminPortalService.getDashboardStats()).thenReturn(stats);

        mockMvc.perform(get("/api/v1/admin/dashboard-stats")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.totalUsers").value(150))
                .andExpect(jsonPath("$.data.totalProjects").value(40));
    }

    @Test
    @DisplayName("GET /api/v1/admin/audit-logs: Lấy nhật ký kiểm toán")
    void testGetRecentAuditLogs() throws Exception {
        AuditLogResponseDTO logDTO = AuditLogResponseDTO.builder()
                .id(UUID.randomUUID())
                .action("CHANGE_USER_STATUS")
                .targetType("USER")
                .build();

        when(adminPortalService.getRecentAuditLogs()).thenReturn(List.of(logDTO));

        mockMvc.perform(get("/api/v1/admin/audit-logs")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data[0].action").value("CHANGE_USER_STATUS"));
    }
}
