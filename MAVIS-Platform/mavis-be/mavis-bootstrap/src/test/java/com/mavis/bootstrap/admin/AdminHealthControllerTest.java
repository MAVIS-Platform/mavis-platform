package com.mavis.bootstrap.admin;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import javax.sql.DataSource;
import java.sql.Connection;
import java.nio.file.Path;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
class AdminHealthControllerTest {
 @TempDir Path folder;
 AccessPolicyService policy; DataSource db; Connection connection; AdminHealthController controller;
 @BeforeEach void setup() throws Exception {
  policy=mock(AccessPolicyService.class);db=mock(DataSource.class);connection=mock(Connection.class);
  when(db.getConnection()).thenReturn(connection);when(connection.isValid(2)).thenReturn(true);
  controller=new AdminHealthController(policy,db){@Override protected int workerStatus(){return 200;}};
  ReflectionTestUtils.setField(controller,"workerEnabled",true);ReflectionTestUtils.setField(controller,"storagePath",folder.toString());
 }
 @Test void rejectsNonAdminBeforeAnyProbes() throws Exception {
  doThrow(new AccessDeniedException("denied")).when(policy).requireSystemAdmin();
  MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build().perform(get("/api/v1/admin/health")).andExpect(status().isForbidden());
  verifyNoInteractions(db);
 }
 @Test void reportsActualChecksAndCachesOnlyAfterAuthorization() throws Exception {
  Map<?,?> result=(Map<?,?>)controller.health().getData();assertThat(result.get("status")).isEqualTo("UP");
  assertThat((List<?>)result.get("checks")).hasSize(4);
  controller.health();verify(db,times(1)).getConnection();verify(policy,times(2)).requireSystemAdmin();
 }
 @Test void failedDatabaseDegradesWithoutLeakingException() throws Exception {
  when(db.getConnection()).thenThrow(new java.sql.SQLException("jdbc:secret-password"));
  Map<?,?> result=(Map<?,?>)controller.health().getData();assertThat(result.get("status")).isEqualTo("DEGRADED");assertThat(result.toString()).doesNotContain("secret-password");
 }
 @Test void workerFailureIsNotReportedHealthy() throws Exception {
  controller=new AdminHealthController(policy,db){@Override protected int workerStatus(){return 503;}};
  ReflectionTestUtils.setField(controller,"workerEnabled",true);ReflectionTestUtils.setField(controller,"storagePath",folder.toString());
  assertThat(((Map<?,?>)controller.health().getData()).get("status")).isEqualTo("DEGRADED");
 }
 @Test void unmeasuredStorageAndDisabledWorkerAreUnknownNotHealthy() {
  ReflectionTestUtils.setField(controller,"workerEnabled",false);ReflectionTestUtils.setField(controller,"storagePath",folder.resolve("missing").toString());
  assertThat(((Map<?,?>)controller.health().getData()).get("status")).isEqualTo("UNKNOWN");
 }
}
