package com.mavis.platform.auth.controller;
import com.mavis.common.entity.*;
import com.mavis.common.exception.*;
import com.mavis.common.security.AccessPolicyService;
import org.junit.jupiter.api.Test;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class CurrentUserControllerTest {
    @Test void currentUserIsLoadedThroughActiveUserPolicyAndContainsNoToken() {
        var policy=mock(AccessPolicyService.class);var user=User.builder().id(UUID.randomUUID()).email("test@example.invalid").fullName("Test").role(Role.builder().code("STUDENT").build()).build();
        when(policy.requireCurrentActiveUser()).thenReturn(user);var view=new CurrentUserController(policy,mock(com.mavis.common.repository.UserRepository.class),mock(org.springframework.security.crypto.password.PasswordEncoder.class)).me().getData();
        assertEquals(user.getId(),view.id());assertEquals("STUDENT",view.role());assertEquals(4,view.getClass().getRecordComponents().length);
    }
    @Test void inactiveOrUnauthenticatedUserIsRejected() {
        var policy=mock(AccessPolicyService.class);doThrow(new BusinessException(ErrorCode.UNAUTHORIZED)).when(policy).requireCurrentActiveUser();
        assertThrows(BusinessException.class,()->new CurrentUserController(policy,mock(com.mavis.common.repository.UserRepository.class),mock(org.springframework.security.crypto.password.PasswordEncoder.class)).me());
    }
}
