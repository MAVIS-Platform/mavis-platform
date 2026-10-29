package com.mavis.analyzer.model.service;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.*;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.exception.BusinessException;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.assertj.core.api.Assertions.*;
class ContextReviewServiceTest {
 final ModelVersionRepository models=mock(ModelVersionRepository.class);final ProjectRepository projects=mock(ProjectRepository.class);final ModelElementRepository elements=mock(ModelElementRepository.class);final ModelRelationshipRepository links=mock(ModelRelationshipRepository.class);final EvidenceRepository evidence=mock(EvidenceRepository.class);final AccessPolicyService access=mock(AccessPolicyService.class);final ModelVersionService revisions=mock(ModelVersionService.class);final ObjectMapper json=new ObjectMapper();
 final ContextReviewService service=new ContextReviewService(models,projects,elements,links,evidence,access,revisions,json);
 final UUID actor=UUID.randomUUID();final Project project=Project.builder().id(UUID.randomUUID()).build();final ModelVersion model=ModelVersion.builder().id(UUID.randomUUID()).project(project).revision(1).build();
 final ModelElement target=ModelElement.builder().id(UUID.randomUUID()).modelVersion(model).name("API").elementType("SERVICE_CONTAINER").properties(json.createObjectNode().put("logicalKey","api")).build();
 @BeforeEach void setup(){SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(actor.toString(),null,List.of()));when(models.findById(model.getId())).thenReturn(Optional.of(model));when(projects.findLockedById(project.getId())).thenReturn(Optional.of(project));when(models.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(project.getId())).thenReturn(Optional.of(model));when(elements.findByModelVersionId(model.getId())).thenReturn(List.of(target));}
 @AfterEach void clear(){SecurityContextHolder.clearContext();}
 ContextReviewService.Request request(String action){return new ContextReviewService.Request(1,action,"c1","Customer","PERSON","api","INBOUND","User assertion: interacts with the API",null,List.of());}
 ObjectNode candidate(String state){return json.createObjectNode().put("id","c1").put("state",state).put("kind","PERSON").put("name","Customer").put("targetKey","api").put("direction","INBOUND").put("basis","User assertion");}
 void stored(String state){var review=json.createObjectNode();review.putArray("entries").add(candidate(state));((ObjectNode)target.getProperties()).set("contextReview",review);}
 ModelVersionService.RevisionRequest captured(){var captor=ArgumentCaptor.forClass(ModelVersionService.RevisionRequest.class);verify(revisions).revise(eq(model.getId()),captor.capture());return captor.getValue();}
 @Test void proposalStoresMetadataOnly(){service.review(model.getId(),request("PROPOSE"));var r=captured();assertThat(r.relationships()).isEmpty();assertThat(r.elements()).allMatch(e->"UPDATE".equals(e.operation()));var props=r.elements().get(0).properties();assertThat(props.path("contextReview").path("entries").get(0).path("state").asText()).isEqualTo("PROPOSED");assertThat(props.path("contextReview").path("audit").get(0).path("actorId").asText()).isEqualTo(actor.toString());}
 @Test void confirmedAssertionIsAtomicAndNeverRuntimeVerified(){stored("PROPOSED");service.review(model.getId(),new ContextReviewService.Request(1,"CONFIRM","c1",null,null,null,null,null,"Customer is a user outside our system boundary",null));var r=captured();assertThat(r.elements()).hasSize(2);var person=r.elements().stream().filter(e->"ADD".equals(e.operation())).findFirst().orElseThrow();assertThat(person.kind()).isEqualTo("PERSON");assertThat(person.properties().path("contextFactOrigin").asText()).isEqualTo("USER_CONFIRMED");assertThat(person.properties().has("verifiedRuntime")).isFalse();assertThat(r.relationships()).hasSize(1);assertThat(r.relationships().get(0).toRef()).isEqualTo(target.getId().toString());}
 @Test void boundaryExplanationRequired(){stored("PROPOSED");assertThatThrownBy(()->service.review(model.getId(),request("CONFIRM"))).isInstanceOf(BusinessException.class);verifyNoInteractions(revisions);}
 @Test void duplicateConfirmationRejected(){stored("CONFIRMED");assertThatThrownBy(()->service.review(model.getId(),request("CONFIRM"))).isInstanceOf(BusinessException.class);verifyNoInteractions(revisions);}
 @Test void sourceRoleIsOnlyAProposedCandidate(){var ev=Evidence.builder().id(UUID.randomUUID()).sourceType("STATIC_CODE").element(target).locator("SecurityConfig.java:12").excerpt("@PreAuthorize(\"hasRole('ADMIN')\")").build();when(evidence.findByModelVersionId(model.getId())).thenReturn(List.of(ev));service.review(model.getId(),request("SUGGEST"));var r=captured();assertThat(r.relationships()).isEmpty();var entry=r.elements().get(0).properties().path("contextReview").path("entries").get(0);assertThat(entry.path("name").asText()).isEqualTo("Role: ADMIN");assertThat(entry.path("state").asText()).isEqualTo("PROPOSED");assertThat(entry.path("evidenceIds").get(0).asText()).isEqualTo(ev.getId().toString());}
 @Test void foreignEvidenceRejected(){var r=request("PROPOSE");assertThatThrownBy(()->service.review(model.getId(),new ContextReviewService.Request(1,r.action(),null,r.name(),r.kind(),r.targetKey(),r.direction(),r.basis(),null,List.of(UUID.randomUUID())))).isInstanceOf(BusinessException.class);verifyNoInteractions(revisions);}
 @Test void staleRevisionRejected(){assertThatThrownBy(()->service.review(model.getId(),new ContextReviewService.Request(2,"SUGGEST",null,null,null,null,null,null,null,null))).isInstanceOf(BusinessException.class);verifyNoInteractions(revisions);}
 @Test void rejectKeepsOnlyReviewMetadata(){stored("PROPOSED");service.review(model.getId(),request("REJECT"));var r=captured();assertThat(r.relationships()).isEmpty();assertThat(r.elements().get(0).properties().path("contextReview").path("entries").get(0).path("state").asText()).isEqualTo("REJECTED");assertThat(target.getProperties().path("contextReview").path("entries").get(0).path("state").asText()).isEqualTo("PROPOSED");}
 @Test void permissionCheckedBeforeMutation(){doThrow(new BusinessException(com.mavis.common.exception.ErrorCode.FORBIDDEN,"Denied")).when(access).requireProjectWriteAccess(project);assertThatThrownBy(()->service.review(model.getId(),request("PROPOSE"))).isInstanceOf(BusinessException.class);verifyNoInteractions(revisions);}
 @Test void runtimeLogsCannotProposeHumanRoles(){var ev=Evidence.builder().id(UUID.randomUUID()).sourceType("RUNTIME_TRACE").element(target).locator("trace:test").excerpt("hasRole('ADMIN')").build();when(evidence.findByModelVersionId(model.getId())).thenReturn(List.of(ev));service.review(model.getId(),request("SUGGEST"));assertThat(captured().elements().get(0).properties().path("contextReview").path("entries").isEmpty()).isTrue();}
 @Test void extractedDependencyTopologyCannotBeSilentlyChanged(){stored("PROPOSED");var entry=(ObjectNode)target.getProperties().path("contextReview").path("entries").get(0);entry.put("kind","EXTERNAL_SYSTEM").put("existingElementKey","external:source");assertThatThrownBy(()->service.review(model.getId(),new ContextReviewService.Request(1,"EDIT","c1","External","EXTERNAL_SYSTEM","api","OUTBOUND","User wants another direction",null,List.of()))).isInstanceOf(BusinessException.class).hasMessageContaining("recorded topology");verifyNoInteractions(revisions);}

 @Test void previewReadsSourceWithoutWritingRevision(){
  var ev=Evidence.builder().id(UUID.randomUUID()).sourceType("STATIC_CODE").element(target).locator("Api.java:4").excerpt("@RolesAllowed({\"ADMIN\", \"STAFF\"})").build();when(evidence.findByModelVersionId(model.getId())).thenReturn(List.of(ev));
  var preview=service.candidates(model.getId());assertThat((List<?>)preview.get("entries")).hasSize(2);verify(access).requireProjectReadAccess(project);verifyNoInteractions(revisions);
 }
 @Test void rejectedSourceRoleIsNotProposedAgain(){
  var ev=Evidence.builder().id(UUID.randomUUID()).sourceType("STATIC_CODE").element(target).locator("Api.java:4").excerpt("@PreAuthorize(\"hasRole('ADMIN')\")").build();when(evidence.findByModelVersionId(model.getId())).thenReturn(List.of(ev));
  var preview=(List<ObjectNode>)service.candidates(model.getId()).get("entries");var entry=preview.get(0);service.review(model.getId(),new ContextReviewService.Request(1,"REJECT",entry.path("id").asText(),null,null,null,null,null,null,null));
  var review=captured().elements().get(0).properties().path("contextReview");((ObjectNode)target.getProperties()).set("contextReview",review);
  assertThat((List<?>)service.candidates(model.getId()).get("entries")).isEmpty();
 }
 @Test void commentsAndRuntimeDoNotCreateSourcePrincipals(){
  assertThat(SecurityRoleSource.roles(SecurityRoleSource.withoutComments("// @PreAuthorize(\"hasRole('ADMIN')\")\n/* @RolesAllowed(\"STAFF\") */"))).isEmpty();
  assertThat(SecurityRoleSource.roles("class AdminController {} String role=\"ADMIN\";")).isEmpty();
  assertThat(SecurityRoleSource.roles("@Secured({\"ROLE_ADMIN\", \"ROLE_STAFF\"})")).containsExactly("ROLE_ADMIN","ROLE_STAFF");
 }

 @Test void previewPermissionFailureDoesNotReadSource(){doThrow(new BusinessException(com.mavis.common.exception.ErrorCode.FORBIDDEN,"Denied")).when(access).requireProjectReadAccess(project);assertThatThrownBy(()->service.candidates(model.getId())).isInstanceOf(BusinessException.class);verifyNoInteractions(evidence,revisions);}
 @Test void dynamicRolesDoNotBecomeLiteralActors(){assertThat(SecurityRoleSource.roles("@PreAuthorize(\"hasRole('ROLE_' + #tenant)\")")).isEmpty();assertThat(SecurityRoleSource.roles(".hasAnyRole(\"ADMIN\", \"STAFF\")")).containsExactly("ADMIN","STAFF");}
 @Test void previewConfirmationRequiresExplicitReviewAndValidatesReferences(){
  var ev=Evidence.builder().id(UUID.randomUUID()).sourceType("STATIC_CODE").element(target).locator("Api.java:4").excerpt("@RolesAllowed(\"ADMIN\")").build();when(evidence.findByModelVersionId(model.getId())).thenReturn(List.of(ev));
  var entry=((List<ObjectNode>)service.candidates(model.getId()).get("entries")).get(0);service.review(model.getId(),new ContextReviewService.Request(1,"CONFIRM",entry.path("id").asText(),null,null,null,null,null,"Confirmed administrator role outside the application boundary",null));
  var added=captured().elements().stream().filter(e->"ADD".equals(e.operation())).findFirst().orElseThrow();assertThat(added.properties().path("contextFactOrigin").asText()).isEqualTo("USER_CONFIRMED");assertThat(added.properties().path("confirmedBy").asText()).isEqualTo(actor.toString());
 }

 @Test void unchangedRejectedSourceStaysSuppressedAcrossFreshAnalysis(){
  var ev=Evidence.builder().id(UUID.randomUUID()).sourceType("STATIC_CODE").element(target).locator("Api.java:4").excerpt("@RolesAllowed(\"ADMIN\")").build();when(evidence.findByModelVersionId(model.getId())).thenReturn(List.of(ev));
  var entry=((List<ObjectNode>)service.candidates(model.getId()).get("entries")).get(0).deepCopy();entry.put("state","REJECTED");when(elements.findContextSourceDecisions(project.getId(),1)).thenReturn(Collections.singletonList(new Object[]{entry.path("sourceRoleKey").asText(),"REJECTED"}));
  assertThat((List<?>)service.candidates(model.getId()).get("entries")).isEmpty();
  ev.setExcerpt("@RolesAllowed(\"STAFF\")");assertThat((List<?>)service.candidates(model.getId()).get("entries")).hasSize(1);
 }

 @Test void quotedExamplesAreNotAccessRules(){assertThat(SecurityRoleSource.roles("String example=\".hasRole('ADMIN')\";")).isEmpty();assertThat(SecurityRoleSource.roles("String example=\"@PreAuthorize(hasRole('ADMIN'))\";")).isEmpty();}
}
