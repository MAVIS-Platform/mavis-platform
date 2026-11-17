package com.mavis.platform.admin.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Schema(description = "Thống kê tổng quan hệ thống trên Dashboard Admin")
public class AdminDashboardStatsDTO {

    private long totalUsers;
    private long runningRuntimeSessions;
    private String healthStatus;
    private String liveHealthStatus;
    private long activeLecturers;
    private long activeStudents;
    private long pendingVerificationUsers;
    private long lockedUsers;
    private long totalGuidedLabs;
    private long totalWorkspaces;
    private long totalProjects;
    private long totalSnapshots;
    private long totalJobs;
    private long totalModelVersions;
    private long totalRuntimeSessions;
    private long totalSubmissions;
}
