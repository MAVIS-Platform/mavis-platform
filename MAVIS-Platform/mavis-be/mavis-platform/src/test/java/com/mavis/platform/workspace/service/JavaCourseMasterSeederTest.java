package com.mavis.platform.workspace.service;

import com.mavis.common.entity.Role;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.repository.RoleRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.platform.workspace.curriculum.JavaCourseraCatalog;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JavaCourseMasterSeederTest {

    @Test
    void provisionsThreeRoleAccountsWorkspacePasskeysAndCuratedCourse() {
        RoleRepository roles = mock(RoleRepository.class);
        UserRepository users = mock(UserRepository.class);
        WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
        PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        CourseLabSeederService seeder = mock(CourseLabSeederService.class);

        Role lecturerRole = Role.builder().id(UUID.randomUUID()).code("LECTURER").name("Lecturer").build();
        Role studentRole = Role.builder().id(UUID.randomUUID()).code("STUDENT").name("Student").build();
        Role adminRole = Role.builder().id(UUID.randomUUID()).code("SYSTEM_ADMIN").name("Admin").build();

        when(roles.findByCode("LECTURER")).thenReturn(Optional.of(lecturerRole));
        when(roles.findByCode("STUDENT")).thenReturn(Optional.of(studentRole));
        when(roles.findByCode("SYSTEM_ADMIN")).thenReturn(Optional.of(adminRole));
        when(passwordEncoder.encode(anyString())).thenAnswer(inv -> "$2a$10$encoded_" + inv.getArgument(0));
        when(users.findByEmail(anyString())).thenReturn(Optional.empty());
        when(users.saveAndFlush(any(User.class))).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            if (u.getId() == null) {
                u.setId(UUID.randomUUID());
            }
            return u;
        });

        when(workspaces.findByCode(JavaCourseraCatalog.COURSE_CODE)).thenReturn(Optional.empty());
        when(workspaces.saveAndFlush(any(Workspace.class))).thenAnswer(inv -> {
            Workspace w = inv.getArgument(0);
            if (w.getId() == null) {
                w.setId(UUID.randomUUID());
            }
            return w;
        });
        when(workspaces.findById(any(UUID.class))).thenAnswer(inv -> Optional.of(Workspace.builder()
                .id(inv.getArgument(0))
                .code(JavaCourseraCatalog.COURSE_CODE)
                .name(JavaCourseraCatalog.COURSE_TITLE)
                .courseMode(true)
                .status("ACTIVE")
                .build()));
        when(jdbc.queryForList(contains("FROM course_passkeys WHERE digest"), eq(UUID.class), any()))
                .thenReturn(List.of());

        JavaCourseMasterSeeder master = new JavaCourseMasterSeeder(
                roles, users, workspaces, passwordEncoder, jdbc, seeder);

        Workspace provisioned = master.bootstrapJavaCourseraWorkspace();

        assertThat(provisioned).isNotNull();
        assertThat(provisioned.getCode()).isEqualTo(JavaCourseraCatalog.COURSE_CODE);
        verify(users, atLeast(3)).saveAndFlush(any(User.class));
        verify(passwordEncoder, atLeast(2)).encode(JavaCourseMasterSeeder.DEFAULT_PASSWORD);
        verify(passwordEncoder).encode(JavaCourseMasterSeeder.ADMIN_PASSWORD);
        verify(jdbc, atLeast(2)).update(contains("INSERT INTO course_passkeys"), any(), any(), any(), any(), any(), any(), any(), any());
        verify(seeder).seedCurated(any(UUID.class), eq(CourseLabSeederService.PRESET_JAVA_COURSERA));
    }
}
