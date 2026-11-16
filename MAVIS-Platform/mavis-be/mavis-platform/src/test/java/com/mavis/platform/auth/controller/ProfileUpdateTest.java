package com.mavis.platform.auth.controller;

import com.mavis.common.entity.*;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.http.MediaType;
import org.junit.jupiter.api.Test;
import java.util.UUID;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ProfileUpdateTest {
    private final AccessPolicyService policy=mock(AccessPolicyService.class);
    private final UserRepository users=mock(UserRepository.class);
    private final PasswordEncoder passwords=mock(PasswordEncoder.class);
    private final CurrentUserController controller=new CurrentUserController(policy,users,passwords);
    private User active(){var u=User.builder().id(UUID.randomUUID()).fullName("Before").email("test@example.invalid").passwordHash("old-hash").role(Role.builder().code("STUDENT").build()).build();when(policy.requireCurrentActiveUser()).thenReturn(u);return u;}
    @Test void nameOnlyDoesNotTouchPasswordOrRole(){var u=active();var result=controller.update(new CurrentUserController.UpdateProfileRequest(" After ",null,null));assertEquals("After",result.getData().fullName());assertEquals("old-hash",u.getPasswordHash());verifyNoInteractions(passwords);verify(users).save(u);}
    @Test void passwordRequiresCurrentSecret(){var u=active();when(passwords.matches("current","old-hash")).thenReturn(true);when(passwords.encode("new-password")).thenReturn("new-hash");controller.update(new CurrentUserController.UpdateProfileRequest("After","current","new-password"));assertEquals("new-hash",u.getPasswordHash());}
    @Test void wrongPasswordChangesNothing(){var u=active();assertThrows(BusinessException.class,()->controller.update(new CurrentUserController.UpdateProfileRequest("After","wrong","new-password")));assertEquals("Before",u.getFullName());assertEquals("old-hash",u.getPasswordHash());verifyNoInteractions(users);}
    @Test void inactiveCannotUpdate(){doThrow(new BusinessException(ErrorCode.FORBIDDEN)).when(policy).requireCurrentActiveUser();assertThrows(BusinessException.class,()->controller.update(new CurrentUserController.UpdateProfileRequest("After",null,null)));verifyNoInteractions(users,passwords);}
    @Test void patchAndPutValidateInputAndDoNotExposeHash() throws Exception {active();var mvc=MockMvcBuilders.standaloneSetup(controller).build();mvc.perform(patch("/api/v1/auth/me").contentType(MediaType.APPLICATION_JSON).content("{\"fullName\":\"  \"}")).andExpect(status().isBadRequest());mvc.perform(put("/api/v1/auth/me").contentType(MediaType.APPLICATION_JSON).content("{\"fullName\":\"After\",\"newPassword\":\"short\"}")).andExpect(status().isBadRequest());mvc.perform(patch("/api/v1/auth/me").contentType(MediaType.APPLICATION_JSON).content("{\"fullName\":\"After\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.data.fullName").value("After")).andExpect(jsonPath("$.data.passwordHash").doesNotExist());}
}
