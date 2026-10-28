package com.mavis.bootstrap.activity;
import com.mavis.common.entity.*;
import com.mavis.common.repository.JobRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.exception.BusinessException;
import org.junit.jupiter.api.*;
import org.springframework.data.domain.*;
import org.springframework.security.access.AccessDeniedException;
import java.util.*;
import java.time.OffsetDateTime;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
class ProjectActivityControllerTest {
 AccessPolicyService policy=mock(AccessPolicyService.class);JobRepository jobs=mock(JobRepository.class);
 ProjectActivityController controller=new ProjectActivityController(policy,jobs);
 UUID owner=UUID.randomUUID();
 @BeforeEach void setup(){when(policy.requireCurrentActiveUser()).thenReturn(User.builder().id(owner).build());}
 @Test void ownerIdentityAlwaysComesFromSession(){when(jobs.findActivityForOwner(eq(owner),any())).thenReturn(Page.empty());controller.analysis(2,10);verify(jobs).findActivityForOwner(owner,PageRequest.of(2,10));}
 @Test void forbiddenUserNeverLoadsAnyLogs(){doThrow(new AccessDeniedException("blocked")).when(policy).requireCurrentActiveUser();assertThatThrownBy(()->controller.analysis(0,10)).isInstanceOf(AccessDeniedException.class);verifyNoInteractions(jobs);}
 @Test void invalidPaginationIsRejected(){assertThatThrownBy(()->controller.analysis(-1,10)).isInstanceOf(BusinessException.class);assertThatThrownBy(()->controller.analysis(0,51)).isInstanceOf(BusinessException.class);verifyNoInteractions(jobs);}
 @Test void returnsActualProjectAndJobTimes(){
  Project project=Project.builder().id(UUID.randomUUID()).name("Example").build();SourceSnapshot snapshot=SourceSnapshot.builder().id(UUID.randomUUID()).build();OffsetDateTime start=OffsetDateTime.parse("2026-10-28T10:00:00Z");
  Job job=Job.builder().id(UUID.randomUUID()).project(project).sourceSnapshot(snapshot).status("FAILED").startedAt(start).build();
  when(jobs.findActivityForOwner(eq(owner),any())).thenReturn(new PageImpl<>(List.of(job)));
  Map<?,?> data=(Map<?,?>)controller.analysis(0,10).getData();ProjectActivityController.Item item=(ProjectActivityController.Item)((List<?>)data.get("items")).get(0);
  assertThat(item.projectName()).isEqualTo("Example");assertThat(item.job().getStartedAt()).isEqualTo(start);assertThat(item.job().getCompletedAt()).isNull();
 }
}
