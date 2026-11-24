package com.mavis.bootstrap.notifications;
import com.mavis.common.entity.User;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
class NotificationControllerTest {
 AccessPolicyService policy=mock(AccessPolicyService.class);JdbcTemplate jdbc=mock(JdbcTemplate.class);
 UUID user=UUID.randomUUID();NotificationController controller=new NotificationController(policy,jdbc);
 @BeforeEach void setup(){when(policy.requireCurrentActiveUser()).thenReturn(User.builder().id(user).build());when(jdbc.queryForObject(anyString(),eq(Long.class),any(Object[].class))).thenReturn(0L);}
 @Test void readCannotModifyAnotherUsersNotification() throws Exception {
  UUID id=UUID.randomUUID();when(jdbc.update(anyString(),any(Timestamp.class),eq(id),eq(user))).thenReturn(0);
  MockMvcBuilders.standaloneSetup(controller).build().perform(patch("/api/v1/notifications/"+id+"/read")).andExpect(status().isNotFound());
  verify(jdbc).update(eq("UPDATE user_notifications SET read_at=coalesce(read_at,?) WHERE id=? AND recipient_id=?"),any(Timestamp.class),eq(id),eq(user));
 }
 @Test void readIsIdempotentAndAlwaysBoundToAuthenticatedOwner(){UUID id=UUID.randomUUID();when(jdbc.update(anyString(),any(Timestamp.class),eq(id),eq(user))).thenReturn(1);when(jdbc.queryForObject(anyString(),eq(Timestamp.class),eq(id),eq(user))).thenReturn(Timestamp.from(Instant.parse("2026-01-01T00:00:00Z")));assertThat(controller.read(id).getCode()).isEqualTo(200);verify(jdbc).update(anyString(),any(Timestamp.class),eq(id),eq(user));}
 @Test void readAllUsesSnapshotCutoffAndOwner(){Instant cutoff=Instant.parse("2026-01-01T00:00:00Z");controller.readAll(new NotificationController.ReadAll(cutoff));verify(jdbc).update(anyString(),any(Timestamp.class),eq(user),eq(Timestamp.from(cutoff)));}
 @Test void blockedUserCannotReadOrWrite(){doThrow(new AccessDeniedException("blocked")).when(policy).requireCurrentActiveUser();assertThatThrownBy(()->controller.list(0,20,false,"")).isInstanceOf(AccessDeniedException.class);assertThatThrownBy(()->controller.read(UUID.randomUUID())).isInstanceOf(AccessDeniedException.class);verifyNoInteractions(jdbc);}
 @Test void listCountsAndRowsAreScopedToCurrentUser(){when(jdbc.queryForObject(anyString(),eq(Long.class),any(Object[].class))).thenReturn(0L);var response=controller.list(0,20,false,"");assertThat(response.getCode()).isEqualTo(200);verify(jdbc).queryForObject(startsWith("SELECT count(*) FROM user_notifications WHERE recipient_id=? AND read_at"),eq(Long.class),eq(user),any(Timestamp.class));}
 @Test void unknownCategoryRejectedBeforeQuery(){assertThatThrownBy(()->controller.list(0,20,false,"SECRETS")).isInstanceOf(ResponseStatusException.class);verifyNoInteractions(jdbc);}
 @Test void externalAndProtocolRelativeLinksNeverReachClient(){for(String path:Arrays.asList("https://evil.example","//evil.example","/\\evil.example","/unknown",null))assertThat(NotificationController.safePath(path)).isEqualTo("/notifications");assertThat(NotificationController.safePath("/submissions/123")).isEqualTo("/submissions/123");}
 @Test void oversizedOrNegativePagesNeverReachDatabase(){for(int[] bounds:new int[][]{{-1,20},{0,51},{0,0},{10001,20}})assertThatThrownBy(()->controller.list(bounds[0],bounds[1],false,"")).isInstanceOf(ResponseStatusException.class);verifyNoInteractions(jdbc);}
 @Test void readAllRejectsMissingOrInvalidCutoffWithSameErrorEnvelope() throws Exception {
  var mvc=MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build();
  for(String input:List.of("{}", "{", "{\"before\":\"not-an-instant\"}")) {
   mvc.perform(post("/api/v1/notifications/read-all").contentType("application/json").content(input))
     .andExpect(status().isBadRequest())
     .andExpect(jsonPath("$.code").value(400))
     .andExpect(jsonPath("$.message").value("Invalid notification request"));
  }
  verifyNoInteractions(jdbc);
 }
 @Test void listFilterBoundariesReturnHttp400BeforeQuery() throws Exception {
  var mvc=MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build();
  for(String query:List.of("?page=-1&size=20","?page=10001&size=20","?page=0&size=0","?page=0&size=51","?page=0&size=20&category=UNKNOWN")) {
   mvc.perform(get("/api/v1/notifications"+query))
     .andExpect(status().isBadRequest())
     .andExpect(jsonPath("$.code").value(400));
  }
  verifyNoInteractions(jdbc);
 }
 @Test void readAllNullPayloadRejectsWithHttp400() {
  assertThatThrownBy(()->controller.readAll(null)).isInstanceOf(ResponseStatusException.class);
  assertThatThrownBy(()->controller.readAll(new NotificationController.ReadAll(null))).isInstanceOf(ResponseStatusException.class);
  verifyNoInteractions(jdbc);
 }
 @Test void nonAdminUsersFilterOutSystemAndAdminNotifications() {
  var studentRole=com.mavis.common.entity.Role.builder().code("STUDENT").build();
  when(policy.requireCurrentActiveUser()).thenReturn(User.builder().id(user).role(studentRole).build());
  when(jdbc.queryForObject(anyString(),eq(Long.class),any(Object[].class))).thenReturn(0L);
  controller.list(0,20,false,"");
  verify(jdbc,times(2)).queryForObject(contains("AND category <> 'SYSTEM' AND target_path NOT LIKE '/administration%'"),eq(Long.class),eq(user),any(Timestamp.class));
  assertThat(NotificationController.safePath("/roadmap?workspace=123")).isEqualTo("/roadmap?workspace=123");
  assertThat(NotificationController.safePath("/courses")).isEqualTo("/courses");
 }
}
