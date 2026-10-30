package com.mavis.analyzer.runtime.service;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.common.config.PlatformRuntimeSettings;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.exception.*;
import com.mavis.analyzer.runtime.dto.*;
import com.mavis.analyzer.runtime.util.SecretRedactor;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
@Service @RequiredArgsConstructor
public class RuntimePlanningService {
 private final ProjectRepository projects;
 private final SourceSnapshotRepository sources;
 private final ModelVersionRepository models;
 private final RuntimeConfigurationRepository configurations;
 private final RuntimeScenarioRepository scenarios;
 private final AccessPolicyService policy;
 private final PlatformRuntimeSettings settings;
 private final RuntimeSessionService runtime;
 private final ObjectMapper json;
 private final RuntimeSessionEnvironmentService environments;
 public record ConfigurationRequest(@NotNull UUID snapshotId,@NotNull UUID modelId,@NotBlank String profileId,@NotNull JsonNode profile,@Min(0) int expectedRevision){}
 public record ScenarioRequest(@NotBlank @Size(max=100) String name,@NotEmpty @Size(max=30) List<@NotBlank @Size(max=10000) String> steps,@Min(0) int expectedRevision){}
 public record StartRequest(@NotNull UUID snapshotId,@NotNull UUID scenarioId,@Min(1) int configurationRevision,@Min(1) int scenarioRevision,@AssertTrue boolean approved,@com.fasterxml.jackson.annotation.JsonProperty(access=com.fasterxml.jackson.annotation.JsonProperty.Access.WRITE_ONLY) Map<String,String> environment){ @Override public String toString(){return "RuntimeStartRequest[snapshotId="+snapshotId+",scenarioId="+scenarioId+",environment=[protected]]";} }
 public record ConfigurationView(UUID projectId,UUID snapshotId,UUID modelId,String profileId,JsonNode profile,int revision,boolean configured,boolean supported,boolean ready,List<String> prerequisites,boolean protectedInputsReady){}
 public record ScenarioView(UUID id,UUID projectId,String name,List<String> steps,int revision){}
 private Project project(UUID id,boolean write){var p=projects.findById(id).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));if(write)policy.requireProjectWriteAccess(p);else policy.requireProjectReadAccess(p);return p;}
 private void lock(UUID id){var p=projects.findLockedById(id).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));policy.requireProjectWriteAccess(p);}
 @Transactional(readOnly=true)
 public ConfigurationView configuration(UUID id){project(id,false);var c=configurations.findById(id).orElse(null);var snapshot=c!=null?c.getSourceSnapshotId():sources.findFirstByProjectIdOrderByCreatedAtDesc(id).map(SourceSnapshot::getId).orElse(null);var warnings=new ArrayList<String>();boolean supported=false;
  if(snapshot!=null){var pre=runtime.runComposePreflight(snapshot);supported=pre.isCompatible();warnings.addAll(pre.getSecurityWarnings());}else warnings.add("No source snapshot exists");
  if(c==null)warnings.add("Save a pinned source, model and operator-provisioned execution profile before starting");
  boolean enabled=settings.enabled("otel-collector")&&(c==null||settings.profile(c.getProfileId()).enabled());if(!enabled)warnings.add("Runtime integration or execution profile is disabled");
  return new ConfigurationView(id,snapshot,c==null?null:c.getModelVersionId(),c==null?"SPRING_BOOT_DOTNET_COMPOSE_V1":c.getProfileId(),c==null?json.createObjectNode():c.getProfile().deepCopy(),c==null?0:c.getRevision(),c!=null,supported,c!=null&&supported&&enabled,warnings,environments.isConfigured());
 }
 @Transactional
 public ConfigurationView saveConfiguration(UUID id,ConfigurationRequest r){lock(id);var c=configurations.findById(id).orElseGet(RuntimeConfiguration::new);if(c.getRevision()!=r.expectedRevision())throw new BusinessException(ErrorCode.CONFLICT);
  var source=sources.findById(r.snapshotId()).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));var model=models.findById(r.modelId()).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));
  if(!source.getProject().getId().equals(id)||!model.getProject().getId().equals(id)||model.getSourceSnapshot()==null||!model.getSourceSnapshot().getId().equals(source.getId()))throw new BusinessException(ErrorCode.BAD_REQUEST,"Source/model scope mismatch");
  settings.requireProfile(r.profileId());validateProfile(r.profile());
  c.setProjectId(id);c.setSourceSnapshotId(r.snapshotId());c.setModelVersionId(r.modelId());c.setProfileId(r.profileId());c.setProfile(r.profile().deepCopy());c.setRevision(c.getRevision()+1);configurations.saveAndFlush(c);return configuration(id);
 }
 @Transactional(readOnly=true)
 public List<ScenarioView> scenarios(UUID id){project(id,false);return scenarios.findByProjectIdOrderByNameAsc(id).stream().map(this::view).toList();}
 private ScenarioView view(RuntimeScenario s){var steps=new ArrayList<String>();s.getSteps().forEach(n->steps.add(n.toString()));return new ScenarioView(s.getId(),s.getProjectId(),s.getName(),steps,s.getRevision());}
 @Transactional
 public ScenarioView saveScenario(UUID projectId,UUID scenarioId,ScenarioRequest r){lock(projectId);var s=scenarioId==null?new RuntimeScenario():scenarios.findById(scenarioId).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));
  if(scenarioId!=null&&!s.getProjectId().equals(projectId))throw new BusinessException(ErrorCode.FORBIDDEN);
  if(s.getRevision()!=r.expectedRevision())throw new BusinessException(ErrorCode.CONFLICT);
  var steps=parseSteps(r.steps());s.setProjectId(projectId);s.setName(r.name().trim());s.setSteps(steps);s.setRevision(s.getRevision()+1);return view(scenarios.saveAndFlush(s));
 }
 @Transactional
 public RuntimeSessionResponseDTO start(UUID id,StartRequest r){lock(id);if(!r.approved())throw new BusinessException(ErrorCode.BAD_REQUEST,"Explicit approval required");
  var c=configurations.findById(id).orElseThrow(()->new BusinessException(ErrorCode.BAD_REQUEST,"Save runtime configuration first"));var s=scenarios.findById(r.scenarioId()).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));
  if(!id.equals(s.getProjectId())||!r.snapshotId().equals(c.getSourceSnapshotId()))throw new BusinessException(ErrorCode.BAD_REQUEST,"Pinned planning scope mismatch");
  if(c.getRevision()!=r.configurationRevision()||s.getRevision()!=r.scenarioRevision())throw new BusinessException(ErrorCode.CONFLICT);
  var pre=runtime.runComposePreflight(c.getSourceSnapshotId());if(!pre.isCompatible())throw new BusinessException(ErrorCode.BAD_REQUEST,"Compose preflight rejected");
  var apps=c.getProfile().path("applications");for(var step:s.getSteps())if(!apps.has(step.path("service").asText())||!pre.getDetectedServices().contains(step.path("service").asText()))throw new BusinessException(ErrorCode.BAD_REQUEST,"Scenario service is not in the pinned Compose/profile");
  var config=json.createObjectNode();config.set("profile",c.getProfile().deepCopy());var scenario=config.putObject("scenario");scenario.set("steps",s.getSteps().deepCopy());scenario.put("timeoutSeconds",settings.requireProfile(c.getProfileId()).timeoutSeconds());
  var planning=config.putObject("planning");planning.put("scenarioId",s.getId().toString());planning.put("scenarioRevision",s.getRevision());planning.put("configurationRevision",c.getRevision());
  var created=runtime.createRuntimeSession(RuntimeSessionCreateRequest.builder().projectId(id).sourceSnapshotId(c.getSourceSnapshotId()).modelVersionId(c.getModelVersionId()).profileName(c.getProfileId()).scenarioName(s.getName()).scenarioConfig(config).build());
  environments.store(created.getId(),r.environment());
  return runtime.approveAndStartSession(created.getId());
 }
 private void validateProfile(JsonNode p){if(!p.isObject()||p.toString().length()>50000||!p.equals(SecretRedactor.redactJson(p)))throw new BusinessException(ErrorCode.BAD_REQUEST,"Profile must be a bounded object without literal secrets");
  if(!p.path("scenarioRunnerImage").asText().matches("([A-Za-z0-9./:_-]+@)?sha256:[0-9a-f]{64}")||!p.path("collectorImage").asText().matches("[A-Za-z0-9./:_-]+@sha256:[0-9a-f]{64}")||!p.path("instrumentationVolume").asText().matches("[A-Za-z0-9][A-Za-z0-9_.-]{0,63}")||!p.path("approvedForLocalPoc").asBoolean(false)||!p.path("applications").isObject()||p.path("applications").isEmpty()||p.path("applications").size()>10)throw new BusinessException(ErrorCode.BAD_REQUEST,"An approved, digest-pinned operator profile is required");
  for(var it=p.path("applications").fields();it.hasNext();){var app=it.next();int port=app.getValue().path("containerPort").asInt();if(!app.getKey().matches("[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}")||port<1||port>65535||!Set.of("java","dotnet8-linux-x64-glibc").contains(app.getValue().path("runtime").asText())||!app.getValue().path("readinessPath").asText("/health").startsWith("/"))throw new BusinessException(ErrorCode.BAD_REQUEST,"Unsupported application profile");}
 }
 private ArrayNode parseSteps(List<String> rows){var result=json.createArrayNode();var ids=new HashSet<String>();for(String row:rows){JsonNode n;try{n=json.readTree(row);}catch(Exception e){throw new BusinessException(ErrorCode.BAD_REQUEST,"Each scenario step must be a JSON object");}
   if(n==null||!n.isObject()||!ids.add(n.path("id").asText())||n.path("id").asText().isBlank()||!n.path("service").asText().matches("[A-Za-z0-9][A-Za-z0-9_-]{0,62}")||!Set.of("GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS").contains(n.path("method").asText())||!n.path("path").asText().startsWith("/")||n.path("path").asText().startsWith("//")||n.path("expectedStatus").asInt()<100||n.path("expectedStatus").asInt()>599||!n.equals(SecretRedactor.redactJson(n)))throw new BusinessException(ErrorCode.BAD_REQUEST,"Invalid or secret-bearing scenario step");
   if(n.has("secretHeaders")){if(!n.get("secretHeaders").isObject())throw new BusinessException(ErrorCode.BAD_REQUEST);for(var it=n.get("secretHeaders").elements();it.hasNext();)if(!it.next().asText().matches("[A-Z_][A-Z0-9_]{0,99}"))throw new BusinessException(ErrorCode.BAD_REQUEST,"Secret headers must refer to environment names");}
   if(n.hasNonNull("jsonBody")){try{var body=json.readTree(n.get("jsonBody").asText());if(body==null||!body.equals(SecretRedactor.redactJson(body)))throw new IllegalArgumentException();}catch(Exception ex){throw new BusinessException(ErrorCode.BAD_REQUEST,"JSON body must not contain literal secrets");}}
   result.add(n);
  }return result;
 }
}
