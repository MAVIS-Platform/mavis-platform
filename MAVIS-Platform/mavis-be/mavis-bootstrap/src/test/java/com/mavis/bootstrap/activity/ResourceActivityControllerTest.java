package com.mavis.bootstrap.activity;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.entity.User;
import com.mavis.common.exception.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
class ResourceActivityControllerTest {
 @Test void anonymousAndInvalidPageDoNotQueryHistory(){var policy=mock(AccessPolicyService.class);var sql=mock(JdbcTemplate.class);var controller=new ResourceActivityController(policy,sql,new ObjectMapper());doThrow(new BusinessException(ErrorCode.UNAUTHORIZED)).when(policy).requireCurrentActiveUser();assertThrows(BusinessException.class,()->controller.feed(0,10));verifyNoInteractions(sql);reset(policy);when(policy.requireCurrentActiveUser()).thenReturn(User.builder().id(UUID.randomUUID()).build());assertThrows(BusinessException.class,()->controller.feed(-1,10));assertThrows(BusinessException.class,()->controller.feed(0,51));verifyNoInteractions(sql);}
}
