package com.mavis.analyzer.runtime.service;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.common.config.PlatformRuntimeSettings;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.exception.*;
import com.mavis.analyzer.aiexplain.config.ApiKeyProvider;
import com.mavis.analyzer.aiexplain.service.AiUsageRecorder;
import com.mavis.analyzer.runtime.dto.*;
import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO.DetectedEndpointDTO;
import com.mavis.analyzer.runtime.util.SecretRedactor;
import com.mavis.analyzer.runtime.validator.ComposePreflightValidator;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service @RequiredArgsConstructor @Slf4j
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

 @Autowired(required = false)
 private ComposePreflightValidator composeValidator;
 @Autowired(required = false)
 private ModelElementRepository modelElements;
 @Autowired(required = false)
 private ModelRelationshipRepository modelRelationships;
 @Autowired(required = false)
 private ApiKeyProvider apiKeyProvider;
 @Autowired(required = false)
 private AiUsageRecorder aiUsageRecorder;
 @Autowired(required = false)
 private SandboxImageBuilderService imageBuilder;
 @Autowired(required = false)
 private RuntimeSessionRepository runtimeSessions;

 @Value("${mavis.ai.endpoint-url:}")
 private String customAiEndpointUrl;
 @Value("${mavis.ai.scenario-openai-model:gpt-5.4}")
 private String scenarioOpenAiModel = "gpt-5.4";
 @Value("${mavis.ai.scenario-gemini-model:gemini-2.5-pro}")
 private String scenarioGeminiModel = "gemini-2.5-pro";

 @Value("${mavis.runner.collector-image:}")
 private String runnerCollectorImage;
 @Value("${mavis.runner.scenario-runner-image:}")
 private String runnerScenarioImage;
 private static final List<String> RESERVED_ENV_PREFIXES = List.of("OTEL_","JAVA_","JDK_","DOTNET_","CORECLR_","LD_","MAVIS_");
 private final java.security.SecureRandom secureRandom = new java.security.SecureRandom();

 private static final String DEFAULT_GEMINI_URL =
   "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=";
 private static final Pattern PATH_PARAM_PATTERN = Pattern.compile("\\{([^}/]+)\\}");

 private final HttpClient httpClient = HttpClient.newBuilder()
   .connectTimeout(Duration.ofSeconds(8))
   .build();

 public record ConfigurationRequest(@NotNull UUID snapshotId,@NotNull UUID modelId,@NotBlank String profileId,@NotNull JsonNode profile,@Min(0) int expectedRevision){}
 public record ScenarioRequest(@NotBlank @Size(max=100) String name,@NotEmpty @Size(max=30) List<@NotBlank @Size(max=10000) String> steps,@Min(0) int expectedRevision){}
 public record InfrastructureActionRequest(String action,String service,Integer replicas) {}
 public record StartRequest(@NotNull UUID snapshotId,@NotNull UUID scenarioId,@Min(1) int configurationRevision,@Min(1) int scenarioRevision,@AssertTrue boolean approved,@com.fasterxml.jackson.annotation.JsonProperty(access=com.fasterxml.jackson.annotation.JsonProperty.Access.WRITE_ONLY) Map<String,String> environment,List<InfrastructureActionRequest> infrastructureActions,boolean interactiveStudio,UUID assignmentId){
  public StartRequest(UUID snapshotId,UUID scenarioId,int configurationRevision,int scenarioRevision,boolean approved,Map<String,String> environment,List<InfrastructureActionRequest> actions,boolean interactiveStudio){this(snapshotId,scenarioId,configurationRevision,scenarioRevision,approved,environment,actions,interactiveStudio,null);}
  public StartRequest(UUID snapshotId,UUID scenarioId,int configurationRevision,int scenarioRevision,boolean approved,Map<String,String> environment,List<InfrastructureActionRequest> actions){this(snapshotId,scenarioId,configurationRevision,scenarioRevision,approved,environment,actions,false,null);}
  public StartRequest(UUID snapshotId,UUID scenarioId,int configurationRevision,int scenarioRevision,boolean approved,Map<String,String> environment){this(snapshotId,scenarioId,configurationRevision,scenarioRevision,approved,environment,List.of());}
  @Override public String toString(){return "RuntimeStartRequest[snapshotId="+snapshotId+",scenarioId="+scenarioId+",environment=[protected],infrastructureActions="+(infrastructureActions==null?0:infrastructureActions.size())+"]";}
 }
 public record ConfigurationView(UUID projectId,UUID snapshotId,UUID modelId,String profileId,JsonNode profile,int revision,boolean configured,boolean supported,boolean ready,List<String> prerequisites,List<String> warnings,boolean protectedInputsReady){}
 public record ScenarioView(UUID id,UUID projectId,String name,List<String> steps,int revision){}
 public record GenerateScenarioRequest(UUID snapshotId,UUID modelId,@Size(max=500) String goal,UUID repairSessionId){
  public GenerateScenarioRequest(UUID snapshotId,UUID modelId,String goal){this(snapshotId,modelId,goal,null);}
 }
 public record GeneratedStepDraft(String id,String service,String method,String path,int expectedStatus,String rationale,String source,Map<String,String> environmentVariables,List<Map<String,String>> envHeaders,String bodyReference,Boolean allowClientError,Map<String,String> headers,Map<String,String> extract,String journeyPhase){
  public GeneratedStepDraft(String id,String service,String method,String path,int expectedStatus,String rationale,String source,Map<String,String> environmentVariables,List<Map<String,String>> envHeaders,String bodyReference,Boolean allowClientError){this(id,service,method,path,expectedStatus,rationale,source,environmentVariables,envHeaders,bodyReference,allowClientError,null,null,null);}
  public GeneratedStepDraft(String id,String service,String method,String path,int expectedStatus,String rationale,String source,Map<String,String> environmentVariables,List<Map<String,String>> envHeaders,String bodyReference){this(id,service,method,path,expectedStatus,rationale,source,environmentVariables,envHeaders,bodyReference,Boolean.TRUE,null,null,null);}
 }
 public record GeneratedScenarioDraftView(UUID projectId,UUID snapshotId,UUID modelId,String suggestedName,String generatorMode,String aiModelName,String summary,List<GeneratedStepDraft> steps,Map<String,String> sampleInputs,List<String> inheritedEnvKeys,List<String> runnableServices){
  public GeneratedScenarioDraftView(UUID projectId,UUID snapshotId,UUID modelId,String suggestedName,String generatorMode,String aiModelName,String summary,List<GeneratedStepDraft> steps,Map<String,String> sampleInputs,List<String> inheritedEnvKeys){this(projectId,snapshotId,modelId,suggestedName,generatorMode,aiModelName,summary,steps,sampleInputs,inheritedEnvKeys,List.of());}
 }
 public record BuildImagesRequest(UUID snapshotId,List<String> services){}
 public record BuildImagesView(UUID projectId,UUID snapshotId,Map<String,String> builtImages,List<String> errors){}

 private Project project(UUID id,boolean write){var p=projects.findById(id).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));if(write)policy.requireProjectWriteAccess(p);else policy.requireProjectReadAccess(p);return p;}
 private Project lock(UUID id){var p=projects.findLockedById(id).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));policy.requireProjectWriteAccess(p);return p;}

 @Transactional(readOnly=true)
 public ConfigurationView configuration(UUID id){var runtimeProject=project(id,false);var c=configurations.findById(id).orElse(null);var snapshot=c!=null?c.getSourceSnapshotId():sources.findFirstByProjectIdOrderByCreatedAtDesc(id).map(SourceSnapshot::getId).orElse(null);var warnings=new ArrayList<String>();boolean supported=false;
  PreflightCheckResponseDTO pre=null;
  if(snapshot!=null){pre=runtime.runComposePreflight(snapshot);supported=pre.isCompatible();warnings.addAll(pre.getSecurityWarnings());}else warnings.add("No source snapshot exists");
  boolean enabled=settings.enabled("otel-collector")&&(c==null||settings.profile(c.getProfileId()).enabled());if(!enabled)warnings.add("Runtime integration or execution profile is disabled");
  ObjectNode profileNode=c!=null&&c.getProfile()!=null&&c.getProfile().isObject()?(ObjectNode)c.getProfile().deepCopy():json.createObjectNode();
  if(isGuidedStudentProject(runtimeProject)) {
   profileNode.remove("studioTopology");
   profileNode.put("studioTopologyInherited",true);
  }
  Set<String> configuredSecrets=new TreeSet<>(runtime.getConfiguredSecretKeys(id));
  if(profileNode.hasNonNull("sealedInputs")){
   Map<String,String> unsealed=environments.unsealProjectInputs(id,profileNode.get("sealedInputs").asText(""));
   if(unsealed!=null)configuredSecrets.addAll(unsealed.keySet());
   profileNode.remove("sealedInputs");
  }
  if(!configuredSecrets.isEmpty()){
   ArrayNode csArr=profileNode.putArray("configuredSecretKeys");
   configuredSecrets.forEach(csArr::add);
  }
  if(pre!=null){
   profileNode.set("detectedServices",json.valueToTree(pre.getDetectedServices()));
   profileNode.set("composeServices",json.valueToTree(pre.getComposeServices()));
   profileNode.set("servicePorts",json.valueToTree(pre.getServicePorts()));
   profileNode.set("serviceStacks",json.valueToTree(pre.getServiceStacks()));
   profileNode.set("detectedEndpoints",json.valueToTree(pre.getDetectedEndpoints()));
   profileNode.set("databaseChecks",json.valueToTree(pre.getDatabaseChecks()));
   profileNode.set("requiredEnvVars",json.valueToTree(pre.getRequiredEnvVars()));
   profileNode.set("runnerIssues",json.valueToTree(pre.getRunnerIssues()));
   profileNode.set("infrastructureServices",json.valueToTree(pre.getInfrastructureServices()));
   profileNode.set("serviceHealthPaths",json.valueToTree(pre.getServiceHealthPaths()));
   profileNode.set("serviceHealthConfidence",json.valueToTree(pre.getServiceHealthConfidence()));
   profileNode.set("serviceHealthReasons",json.valueToTree(pre.getServiceHealthReasons()));
   if(pre.getSandboxComposeYaml()!=null)profileNode.put("sandboxComposeYaml",pre.getSandboxComposeYaml());
   profileNode.set("sandboxComposeChanges",json.valueToTree(pre.getSandboxComposeChanges()));
   profileNode.set("unresolvableRunnerIssues",json.valueToTree(pre.getUnresolvableRunnerIssues()));
   profileNode.set("recommendedServiceMappings",json.valueToTree(pre.getRecommendedServiceMappings()));
   profileNode.set("modelServiceNames",json.valueToTree(pre.getModelServiceNames()));
   profileNode.put("localImageBuildAvailable",pre.isLocalImageBuildAvailable());
   if(pre.getServiceImageOverrides()!=null&&!pre.getServiceImageOverrides().isEmpty()){
    ObjectNode overrides=profileNode.has("serviceImageOverrides")&&profileNode.get("serviceImageOverrides").isObject()?(ObjectNode)profileNode.get("serviceImageOverrides"):profileNode.putObject("serviceImageOverrides");
    pre.getServiceImageOverrides().forEach((k,v)->{if(!overrides.hasNonNull(k)||overrides.get(k).asText("").isBlank())overrides.put(k,v);});
   }
  }
  boolean imagesReady=runnerImagesConfigured()||profileHasPinnedRunnerImages(profileNode);
  if(!imagesReady)warnings.add("Sandbox runner images are not configured (MAVIS_RUNNER_COLLECTOR_IMAGE, MAVIS_RUNNER_SCENARIO_RUNNER_IMAGE); runs cannot start until an operator sets them");
  if(!environments.isConfigured())warnings.add("MAVIS_RUNTIME_ENVIRONMENT_KEY is not configured; changed environment values, generated sandbox secrets and request bodies cannot be delivered to the runner");
  return new ConfigurationView(id,snapshot,c==null?null:c.getModelVersionId(),c==null?"SPRING_BOOT_DOTNET_COMPOSE_V1":c.getProfileId(),profileNode,c==null?0:c.getRevision(),c!=null,supported,c!=null&&supported&&enabled&&imagesReady,warnings,warnings,true);
 }

 @Transactional
 public BuildImagesView buildSandboxImages(UUID id,BuildImagesRequest r){
  lock(id);
  if(imageBuilder==null)throw new BusinessException(ErrorCode.FORBIDDEN,"Local sandbox image building service is unavailable");
  var c=configurations.findById(id).orElse(null);
  UUID snapshotId=(r!=null&&r.snapshotId()!=null)?r.snapshotId():(c!=null?c.getSourceSnapshotId():sources.findFirstByProjectIdOrderByCreatedAtDesc(id).map(SourceSnapshot::getId).orElse(null));
  if(snapshotId==null)throw new BusinessException(ErrorCode.BAD_REQUEST,"No source snapshot available");
  var source=sources.findById(snapshotId).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));
  if(!source.getProject().getId().equals(id))throw new BusinessException(ErrorCode.BAD_REQUEST,"Snapshot scope mismatch");
  var res=imageBuilder.buildSnapshotImages(id,java.nio.file.Paths.get(source.getStoragePath()),r!=null?r.services():null);
  if(!res.builtImages().isEmpty()){
   if(c==null){
    var model=models.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(id).orElse(null);
    if(model!=null&&"RUNTIME_ENRICHED".equalsIgnoreCase(model.getOrigin())&&model.getBaseModelVersion()!=null)model=model.getBaseModelVersion();
    if(model==null||model.getSourceSnapshot()==null||!snapshotId.equals(model.getSourceSnapshot().getId())){
     var all=models.findByProjectIdOrderByRevisionDesc(id);
     if(all!=null)model=all.stream().map(m->"RUNTIME_ENRICHED".equalsIgnoreCase(m.getOrigin())&&m.getBaseModelVersion()!=null?m.getBaseModelVersion():m).filter(m->m.getSourceSnapshot()!=null&&snapshotId.equals(m.getSourceSnapshot().getId())).findFirst().orElse(null);
    }
    if(model!=null&&model.getSourceSnapshot()!=null&&snapshotId.equals(model.getSourceSnapshot().getId())){
     c=new RuntimeConfiguration();
     c.setProjectId(id);
     c.setSourceSnapshotId(snapshotId);
     c.setModelVersionId(model.getId());
     c.setProfileId("SPRING_BOOT_DOTNET_COMPOSE_V1");
     c.setProfile(json.createObjectNode());
    }
   }
   if(c!=null&&c.getProfile()!=null&&c.getProfile().isObject()){
    ObjectNode p=(ObjectNode)c.getProfile().deepCopy();
    p.remove("applications");
    ObjectNode overrides=p.has("serviceImageOverrides")&&p.get("serviceImageOverrides").isObject()?(ObjectNode)p.get("serviceImageOverrides"):p.putObject("serviceImageOverrides");
    res.builtImages().forEach(overrides::put);
    String existingSealed=p.hasNonNull("sealedInputs")?p.get("sealedInputs").asText(null):null;
    JsonNode normalized=normalizeStep1Profile(id,snapshotId,c.getProfileId()!=null?c.getProfileId():"SPRING_BOOT_DOTNET_COMPOSE_V1",p,existingSealed);
    c.setSourceSnapshotId(snapshotId);
    c.setProfile(normalized.deepCopy());
    c.setRevision(c.getRevision()+1);
    configurations.saveAndFlush(c);
   }
  }
  return new BuildImagesView(id,snapshotId,res.builtImages(),res.errors());
 }

 @Transactional
 public ConfigurationView saveConfiguration(UUID id,ConfigurationRequest r){lock(id);var c=configurations.findById(id).orElseGet(RuntimeConfiguration::new);if(c.getRevision()!=r.expectedRevision())throw new BusinessException(ErrorCode.CONFLICT);
  var source=sources.findById(r.snapshotId()).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));var model=models.findById(r.modelId()).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));
  if("RUNTIME_ENRICHED".equalsIgnoreCase(model.getOrigin())&&model.getBaseModelVersion()!=null)model=model.getBaseModelVersion();
  if(!source.getProject().getId().equals(id)||!model.getProject().getId().equals(id)||model.getSourceSnapshot()==null||!model.getSourceSnapshot().getId().equals(source.getId()))throw new BusinessException(ErrorCode.BAD_REQUEST,"Source/model scope mismatch");
  settings.requireProfile(r.profileId());
  String existingSealed=c.getProfile()!=null&&c.getProfile().hasNonNull("sealedInputs")?c.getProfile().get("sealedInputs").asText(null):null;
  JsonNode normalizedProfile=normalizeStep1Profile(id,r.snapshotId(),r.profileId(),r.profile(),existingSealed);
  validateProfile(normalizedProfile);
  var owner=source.getProject();
  if(normalizedProfile instanceof ObjectNode profile){
   JsonNode previous=java.util.Objects.equals(c.getSourceSnapshotId(),r.snapshotId()) && c.getProfile()!=null
       ? c.getProfile().get("studioTopology") : null;
   if(!profile.has("studioTopology") && previous!=null) profile.set("studioTopology",previous);
   if(profile.has("studioTopology") && !java.util.Objects.equals(previous,profile.get("studioTopology")) &&
       owner.getWorkspace()!=null) policy.requireWorkspaceLecturer(owner.getWorkspace().getId());
  }
  if(normalizedProfile.hasNonNull("studioTopology")){
   Set<String> topologyServices=new java.util.HashSet<>();
   normalizedProfile.path("applications").fieldNames().forEachRemaining(topologyServices::add);
   PreparedStudioTopology.read(normalizedProfile,topologyServices,json);
  }
  c.setProjectId(id);c.setSourceSnapshotId(r.snapshotId());c.setModelVersionId(model.getId());c.setProfileId(r.profileId());c.setProfile(normalizedProfile.deepCopy());c.setRevision(c.getRevision()+1);configurations.saveAndFlush(c);return configuration(id);
 }

 private JsonNode normalizeStep1Profile(UUID projectId,UUID snapshotId,String profileId,JsonNode rawProfile){
  return normalizeStep1Profile(projectId,snapshotId,profileId,rawProfile,null);
 }

 private JsonNode normalizeStep1Profile(UUID projectId,UUID snapshotId,String profileId,JsonNode rawProfile,String existingSealed){
  if(rawProfile==null||!rawProfile.isObject())return rawProfile;
  boolean isStep1Form=rawProfile.has("serviceMappings")||rawProfile.has("environmentVariables")||rawProfile.has("secretReferences")||rawProfile.has("secretValues")||rawProfile.has("serviceRoles")||rawProfile.has("serviceImageOverrides");
  if(!isStep1Form)return rawProfile;
  ObjectNode p=(ObjectNode)rawProfile.deepCopy();
  for(String transientField:List.of("detectedServices","composeServices","servicePorts","serviceStacks","detectedEndpoints","databaseChecks","requiredEnvVars","runnerIssues","infrastructureServices","serviceHealthPaths","serviceHealthConfidence","serviceHealthReasons","sandboxComposeYaml","sandboxComposeChanges","unresolvableRunnerIssues","recommendedServiceMappings","modelServiceNames","localImageBuildAvailable","configuredSecretKeys")){
   p.remove(transientField);
  }
  Map<String,String> secretsToStore=new LinkedHashMap<>();
  if(existingSealed!=null&&!existingSealed.isBlank()){
   Map<String,String> unsealed=environments.unsealProjectInputs(projectId,existingSealed);
   if(unsealed!=null)secretsToStore.putAll(unsealed);
  }
  Set<String> secretRefs=new LinkedHashSet<>();
  if(p.has("secretReferences")&&p.get("secretReferences").isArray()){
   for(JsonNode item:p.get("secretReferences")){
    String k=item.asText("").trim();
    if(!k.isEmpty())secretRefs.add(k);
   }
  }
  if(p.has("secretValues")&&p.get("secretValues").isObject()){
   p.get("secretValues").fields().forEachRemaining(e->{
    String k=e.getKey().trim();
    String v=e.getValue().asText("");
    if(!k.isEmpty()){
     secretRefs.add(k);
     if(!v.isBlank()&&!"********".equals(v))secretsToStore.put(k,v);
    }
   });
   p.remove("secretValues");
  }
  Map<String,String> cleanEnv=new LinkedHashMap<>();
  if(p.has("environmentVariables")&&p.get("environmentVariables").isObject()){
   p.get("environmentVariables").fields().forEachRemaining(e->{
    String k=e.getKey().trim();
    String v=e.getValue().asText("");
    if(k.isEmpty())return;
    if(SecretRedactor.isSensitiveKey(k)||!v.equals(SecretRedactor.redactString(v))){
     secretRefs.add(k);
     if(!v.isBlank()&&!"********".equals(v))secretsToStore.put(k,v);
    }else{
     cleanEnv.put(k,v);
    }
   });
   p.set("environmentVariables",json.valueToTree(cleanEnv));
  }
  if(!secretsToStore.isEmpty()){
   runtime.storeProjectSecrets(projectId,secretsToStore);
   String sealed=environments.sealProjectInputs(projectId,secretsToStore);
   if(sealed!=null&&!sealed.isBlank())p.put("sealedInputs",sealed);
   secretRefs.addAll(secretsToStore.keySet());
  }else if(existingSealed!=null&&!existingSealed.isBlank()){
   p.put("sealedInputs",existingSealed);
  }
  secretRefs.addAll(runtime.getConfiguredSecretKeys(projectId));
  p.set("secretReferences",json.valueToTree(secretRefs));
  // Images come only from operator configuration; when missing, validateProfile fails with a clear message instead of using a fake digest.
  if(!p.hasNonNull("collectorImage")&&runnerCollectorImage!=null&&!runnerCollectorImage.isBlank())p.put("collectorImage",runnerCollectorImage.trim());
  if(!p.hasNonNull("scenarioRunnerImage")&&runnerScenarioImage!=null&&!runnerScenarioImage.isBlank())p.put("scenarioRunnerImage",runnerScenarioImage.trim());
  if(!p.hasNonNull("instrumentationVolume"))p.put("instrumentationVolume","mavis-agents-v1");
  if(!p.hasNonNull("approvedForLocalPoc"))p.put("approvedForLocalPoc",true);
  if(!p.hasNonNull("memoryMiB"))p.put("memoryMiB",512);

  Map<String,String> roleOverrides=new LinkedHashMap<>();
  if(p.has("serviceRoles")&&p.get("serviceRoles").isObject()){
   p.get("serviceRoles").fields().forEachRemaining(e->roleOverrides.put(e.getKey(),e.getValue().asText("")));
  }
  Map<String,String> imageOverrides=new LinkedHashMap<>();
  if(p.has("serviceImageOverrides")&&p.get("serviceImageOverrides").isObject()){
   p.get("serviceImageOverrides").fields().forEachRemaining(e->{
    String img=e.getValue().asText("").trim();
    if(!img.isEmpty())imageOverrides.put(e.getKey(),img);
   });
  }

  PreflightCheckResponseDTO pre=null;
  try{pre=runtime.runComposePreflight(snapshotId);}catch(Exception ignored){}
  if(pre!=null&&pre.getServiceImageOverrides()!=null&&!pre.getServiceImageOverrides().isEmpty()){
   pre.getServiceImageOverrides().forEach(imageOverrides::putIfAbsent);
   ObjectNode overridesNode=p.has("serviceImageOverrides")&&p.get("serviceImageOverrides").isObject()?(ObjectNode)p.get("serviceImageOverrides"):p.putObject("serviceImageOverrides");
   imageOverrides.forEach((k,v)->{if(!overridesNode.hasNonNull(k)||overridesNode.get(k).asText("").isBlank())overridesNode.put(k,v);});
  }
  if(pre!=null&&pre.getSandboxComposeYaml()!=null&&!pre.getSandboxComposeYaml().isBlank()){
   String candidateYaml=pre.getSandboxComposeYaml();
   List<String> unresolved=pre.getUnresolvableRunnerIssues()!=null?pre.getUnresolvableRunnerIssues():List.of();
   if(!imageOverrides.isEmpty()&&composeValidator!=null){
    var rem=composeValidator.remediateCompose(candidateYaml,imageOverrides);
    if(!rem.yaml().isBlank()){
     candidateYaml=rem.yaml();
     unresolved=rem.unresolvableIssues();
    }
   }
   if(unresolved.isEmpty()&&candidateYaml.equals(SecretRedactor.redactString(candidateYaml))){
    p.put("sandboxCompose",candidateYaml);
   }
  }

  if(p.has("applications")&&p.get("applications").isObject()){
   ObjectNode existingApps=(ObjectNode)p.get("applications");
   List<String> existingKeys=new ArrayList<>();
   existingApps.fieldNames().forEachRemaining(existingKeys::add);
   for(String k:existingKeys){
    if(ComposePreflightValidator.isInfrastructureService(k,"")||"INFRA".equalsIgnoreCase(roleOverrides.get(k))){
     existingApps.remove(k);
    }else if(existingApps.get(k) instanceof ObjectNode an&&!an.has("allowClientErrorReadiness")){
     an.put("allowClientErrorReadiness",true);
    }
   }
  }
  if(!p.has("applications")||!p.get("applications").isObject()||p.get("applications").isEmpty()){
   ObjectNode apps=p.putObject("applications");
   Set<String> svcNames=new LinkedHashSet<>();
   // P1.7: Prefer composeServices over model-enriched detectedServices so non-Compose services never enter applications.
   List<String> composeServices=pre!=null&&pre.getComposeServices()!=null&&!pre.getComposeServices().isEmpty()
     ?pre.getComposeServices()
     :(pre!=null&&pre.getDetectedServices()!=null?pre.getDetectedServices():List.of());
   svcNames.addAll(composeServices);
   if(composeServices.isEmpty()&&p.has("serviceMappings")&&p.get("serviceMappings").isObject()){
    p.get("serviceMappings").fieldNames().forEachRemaining(svcNames::add);
   }
   // P1.6: Databases, brokers and proxies run from Compose unless explicitly overridden as APP in serviceRoles.
   if(pre!=null&&pre.getInfrastructureServices()!=null){
    for(String infraSvc:pre.getInfrastructureServices()){
     if(!"APP".equalsIgnoreCase(roleOverrides.get(infraSvc))||ComposePreflightValidator.isInfrastructureService(infraSvc,""))svcNames.remove(infraSvc);
    }
   }
   svcNames.removeIf(svc->ComposePreflightValidator.isInfrastructureService(svc,""));
   roleOverrides.forEach((svc,role)->{
    if("INFRA".equalsIgnoreCase(role))svcNames.remove(svc);
   });
   if(svcNames.isEmpty())svcNames.add("gateway");
   Map<String,String> healthPaths=pre!=null&&pre.getServiceHealthPaths()!=null?pre.getServiceHealthPaths():Map.of();
   int count=0;
   for(String sName:svcNames){
    if(count>=10)break;
    String safeKey=sName.replaceAll("[^a-zA-Z0-9_-]","-");
    if(safeKey.isEmpty()||!Character.isLetterOrDigit(safeKey.charAt(0)))safeKey="svc-"+safeKey;
    if(safeKey.length()>62)safeKey=safeKey.substring(0,62);
    ObjectNode appNode=apps.putObject(safeKey);
    int port=pre!=null&&pre.getServicePorts()!=null&&pre.getServicePorts().containsKey(sName)?pre.getServicePorts().get(sName):8080;
    String stack=pre!=null&&pre.getServiceStacks()!=null?pre.getServiceStacks().getOrDefault(sName,"java"):"java";
    appNode.put("runtime",mapStackToRuntime(stack));
    appNode.put("containerPort",(port>=1&&port<=65535)?port:8080);
    appNode.put("readinessPath",healthPaths.getOrDefault(sName,"/health"));
    appNode.put("allowClientErrorReadiness",true);
    count++;
   }
  }
  Map<String,String> mappings=new LinkedHashMap<>();
  if(p.has("serviceMappings")&&p.get("serviceMappings").isObject()){
   p.get("serviceMappings").fields().forEachRemaining(e->mappings.put(e.getKey(),e.getValue().asText("")));
  }
  if(pre!=null){
   Map<String,String> recommended=pre.getRecommendedServiceMappings()!=null?pre.getRecommendedServiceMappings():Map.of();
   Map<String,String> modelNames=pre.getModelServiceNames()!=null?pre.getModelServiceNames():Map.of();
   recommended.forEach((svc,recUuid)->{
    String cur=mappings.get(svc);
    if(cur==null||cur.isBlank()||(isUuidString(cur)&&!modelNames.isEmpty()&&!modelNames.containsKey(cur))||(!isUuidString(cur)&&cur.equalsIgnoreCase(svc)))mappings.put(svc,recUuid);
   });
   if(!modelNames.isEmpty()){
    for(Map.Entry<String,String> e:new ArrayList<>(mappings.entrySet())){
     String cur=e.getValue();
     if(cur!=null&&!cur.isBlank()&&!isUuidString(cur)){
      for(Map.Entry<String,String> mn:modelNames.entrySet()){
       if(cur.equalsIgnoreCase(mn.getValue())){mappings.put(e.getKey(),mn.getKey());break;}
      }
     }
    }
   }
   if(!mappings.isEmpty())p.set("serviceMappings",json.valueToTree(mappings));
  }
  runtime.updateProjectRuntimeConfig(projectId,RuntimeProjectConfigRequestDTO.builder()
   .profileId(profileId)
   .confirmedServiceMappings(mappings)
   .environmentVariables(cleanEnv)
   .secretReferences(new ArrayList<>(secretRefs))
   .build());
  return p;
 }

 private static String mapStackToRuntime(String stack){
  if(stack==null||stack.isBlank()||"java".equalsIgnoreCase(stack))return "java";
  if("dotnet".equalsIgnoreCase(stack))return "dotnet8-linux-x64-glibc";
  return "passthrough";
 }

 private static boolean isUuidString(String value){
  if(value==null||value.length()!=36)return false;
  try{UUID.fromString(value);return true;}catch(IllegalArgumentException ex){return false;}
 }

 public GeneratedScenarioDraftView generateScenario(UUID id,GenerateScenarioRequest r){
  project(id,false);
  var cfg=configurations.findById(id).orElse(null);
  UUID snapshotId=(r!=null&&r.snapshotId()!=null)?r.snapshotId():(cfg!=null?cfg.getSourceSnapshotId():sources.findFirstByProjectIdOrderByCreatedAtDesc(id).map(SourceSnapshot::getId).orElse(null));
  UUID modelId=(r!=null&&r.modelId()!=null)?r.modelId():(cfg!=null?cfg.getModelVersionId():models.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(id).map(ModelVersion::getId).orElse(null));
  if(snapshotId==null)throw new BusinessException(ErrorCode.BAD_REQUEST,"No source snapshot available for scenario generation");
  var source=sources.findById(snapshotId).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));
  if(!source.getProject().getId().equals(id))throw new BusinessException(ErrorCode.BAD_REQUEST,"Snapshot scope mismatch");
  ModelVersion model=null;
  if(modelId!=null){
   model=models.findById(modelId).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));
   if("RUNTIME_ENRICHED".equalsIgnoreCase(model.getOrigin())&&model.getBaseModelVersion()!=null){model=model.getBaseModelVersion();modelId=model.getId();}
   if(!model.getProject().getId().equals(id))throw new BusinessException(ErrorCode.BAD_REQUEST,"Model scope mismatch");
  }

  PreflightCheckResponseDTO pre=runtime.runComposePreflight(snapshotId);
  JsonNode savedProfile=cfg!=null?cfg.getProfile():null;
  Map<String,String> roleOverrides=new LinkedHashMap<>();
  if(savedProfile!=null&&savedProfile.path("serviceRoles").isObject()){
   savedProfile.path("serviceRoles").fields().forEachRemaining(e->roleOverrides.put(e.getKey(),e.getValue().asText("")));
  }
  Set<String> infraSet=new LinkedHashSet<>();
  if(pre!=null&&pre.getInfrastructureServices()!=null){
   for(String inf:pre.getInfrastructureServices()){
    if(!"APP".equalsIgnoreCase(roleOverrides.get(inf))||ComposePreflightValidator.isInfrastructureService(inf,""))infraSet.add(inf);
   }
  }
  roleOverrides.forEach((svc,role)->{if("INFRA".equalsIgnoreCase(role)||ComposePreflightValidator.isInfrastructureService(svc,""))infraSet.add(svc);});

  Set<String> allowedServices=new LinkedHashSet<>();
  if(pre!=null&&pre.getComposeServices()!=null&&!pre.getComposeServices().isEmpty()){
   allowedServices.addAll(pre.getComposeServices());
  }else if(pre!=null&&pre.getDetectedServices()!=null){
   allowedServices.addAll(pre.getDetectedServices());
  }
  allowedServices.removeAll(infraSet);
  allowedServices.removeIf(svc->ComposePreflightValidator.isInfrastructureService(svc,""));
  if(savedProfile!=null&&savedProfile.path("applications").isObject()){
   Set<String> profileApps=new LinkedHashSet<>();
   savedProfile.path("applications").fieldNames().forEachRemaining(profileApps::add);
   profileApps.removeAll(infraSet);
   profileApps.removeIf(svc->ComposePreflightValidator.isInfrastructureService(svc,""));
   if(!profileApps.isEmpty()){
    if(allowedServices.isEmpty())allowedServices.addAll(profileApps);
    else allowedServices.retainAll(profileApps);
   }
  }

  List<DetectedEndpointDTO> rawEndpoints=new ArrayList<>();
  if(pre!=null&&pre.getDetectedEndpoints()!=null)rawEndpoints.addAll(pre.getDetectedEndpoints());
  Map<UUID,ModelElement> modelElById=new HashMap<>();
  if(model!=null&&modelElements!=null){
   for(ModelElement el:modelElements.findByModelVersionId(model.getId())){
    if(el.getId()!=null)modelElById.put(el.getId(),el);
    if(allowedServices.isEmpty()&&"SERVICE_CONTAINER".equals(el.getElementType())&&el.getName()!=null&&!el.getName().isBlank()&&!infraSet.contains(el.getName())){
     allowedServices.add(el.getName());
    }
   }
  }

  List<String> relationshipSummaries=new ArrayList<>();
  Set<String> connectedServices=new LinkedHashSet<>();
  Set<String> upstreamServices=new LinkedHashSet<>();
  Map<String,Set<String>> c4OutboundByService=new LinkedHashMap<>();
  for(String svc:allowedServices){
   String low=svc.toLowerCase(Locale.ROOT);
   if(low.contains("gateway")||low.contains("bff")||low.equals("edge")||low.startsWith("edge-"))upstreamServices.add(svc);
  }
  if(model!=null&&modelRelationships!=null){
   List<ModelRelationship> rels=modelRelationships.findRawByModelVersionId(model.getId());
   if(rels==null||rels.isEmpty())rels=modelRelationships.findByModelVersionId(model.getId());
   for(ModelRelationship rel:rels){
    UUID sId=rel.getSourceElement()!=null?rel.getSourceElement().getId():null;
    UUID tId=rel.getTargetElement()!=null?rel.getTargetElement().getId():null;
    ModelElement srcEl=sId!=null&&modelElById.containsKey(sId)?modelElById.get(sId):rel.getSourceElement();
    ModelElement tgtEl=tId!=null&&modelElById.containsKey(tId)?modelElById.get(tId):rel.getTargetElement();
    String sName=srcEl!=null&&srcEl.getName()!=null?srcEl.getName():"";
    String tName=tgtEl!=null&&tgtEl.getName()!=null?tgtEl.getName():"";
    if(!sName.isBlank()&&!tName.isBlank()){
     String resolvedSrc=resolveServiceToAllowed(sName,sId,allowedServices,savedProfile,pre);
     String resolvedTgt=resolveServiceToAllowed(tName,tId,allowedServices,savedProfile,pre);
     if(resolvedSrc!=null){
      connectedServices.add(resolvedSrc);
      if("GATEWAY_ROUTE".equalsIgnoreCase(rel.getRelationType())||"SERVICE_HTTP_CALL".equalsIgnoreCase(rel.getRelationType())){
       upstreamServices.add(resolvedSrc);
       if(resolvedTgt!=null&&!resolvedSrc.equals(resolvedTgt)){
        c4OutboundByService.computeIfAbsent(resolvedSrc,k->new LinkedHashSet<>()).add(resolvedTgt);
       }
      }
     }
     if(resolvedTgt!=null)connectedServices.add(resolvedTgt);
     String propHint="";
     if(rel.getProperties()!=null&&rel.getProperties().isObject()){
      String hm=rel.getProperties().path("httpMethod").asText("");
      String hp=rel.getProperties().path("httpPath").asText("");
      if(!hm.isBlank()||!hp.isBlank())propHint=" ["+hm+" "+hp+"]";
     }
     relationshipSummaries.add((resolvedSrc!=null?resolvedSrc:sName)+" -> "+(resolvedTgt!=null?resolvedTgt:tName)+" ("+rel.getRelationType()+propHint+")");
    }
   }
  }
  String fallbackService=allowedServices.stream().findFirst().orElse("gateway");

  // Filter & order candidate endpoints deterministically with top-down journey, causal CRUD & multi-service priority
  List<DetectedEndpointDTO> candidates=new ArrayList<>();
  Set<String> seenKeys=new HashSet<>();
  for(DetectedEndpointDTO ep:rawEndpoints){
   if(ep==null||ep.getPath()==null||!ep.getPath().startsWith("/")||ep.getPath().startsWith("//")||ep.getPath().contains("\\"))continue;
   if(ep.getService()!=null&&infraSet.contains(ep.getService()))continue;
   String resolvedSvc=resolveServiceToAllowed(ep.getService(),null,allowedServices,savedProfile,pre);
   String svc=resolvedSvc!=null?resolvedSvc:fallbackService;
   String verb=ep.getMethod()!=null?ep.getMethod().toUpperCase(Locale.ROOT):"GET";
   if(!Set.of("GET","POST","PUT","PATCH","DELETE").contains(verb))continue;
   String key=svc+":"+verb+":"+ep.getPath();
   if(seenKeys.add(key)){
    Set<String> targets=new LinkedHashSet<>();
    if(ep.getDownstreamTargets()!=null){
     for(String t:ep.getDownstreamTargets()){
      String rt=resolveServiceToAllowed(t,null,allowedServices,savedProfile,pre);
      if(rt!=null&&!rt.equals(svc))targets.add(rt);
     }
    }
    if(c4OutboundByService.containsKey(svc))targets.addAll(c4OutboundByService.get(svc));
    int fanOut=ep.getFanOutScore()!=null?ep.getFanOutScore():(1+targets.size()*2+(upstreamServices.contains(svc)?2:0));
    candidates.add(DetectedEndpointDTO.builder()
      .service(svc)
      .method(verb)
      .path(ep.getPath())
      .source(ep.getSource())
      .expectedStatus(ep.getExpectedStatus())
      .requestBodyType(ep.getRequestBodyType())
      .responseBodyType(ep.getResponseBodyType())
      .sampleJsonBody(ep.getSampleJsonBody())
      .requiresAuth(ep.getRequiresAuth())
      .requiredRoles(ep.getRequiredRoles())
      .responseFields(ep.getResponseFields())
      .validationHints(ep.getValidationHints())
      .downstreamTargets(targets.isEmpty()?null:new ArrayList<>(targets))
      .fanOutScore(fanOut)
      .journeyRole(ep.getJourneyRole())
      .build());
   }
  }

  List<String> serviceOrder=new ArrayList<>(allowedServices);
  Set<String> crudResourceRoots=new HashSet<>();
  for(DetectedEndpointDTO ep:candidates){
   if(!isHealthProbePath(ep.getPath())&&Set.of("GET","PUT","PATCH","DELETE").contains(ep.getMethod())){
    crudResourceRoots.add(ep.getService()+":"+resourceRoot(ep.getPath()));
   }
  }
  Comparator<DetectedEndpointDTO> causalComparator=(a,b)->{
   int tierA=upstreamServices.contains(a.getService())?0:(connectedServices.contains(a.getService())?1:2);
   int tierB=upstreamServices.contains(b.getService())?0:(connectedServices.contains(b.getService())?1:2);
   if(tierA!=tierB)return Integer.compare(tierA,tierB);
   int svcIdxA=serviceOrder.indexOf(a.getService());
   int svcIdxB=serviceOrder.indexOf(b.getService());
   if(svcIdxA!=svcIdxB)return Integer.compare(svcIdxA<0?999:svcIdxA,svcIdxB<0?999:svcIdxB);
   int phaseA=causalEndpointPhase(a,crudResourceRoots);
   int phaseB=causalEndpointPhase(b,crudResourceRoots);
   if(phaseA!=phaseB)return Integer.compare(phaseA,phaseB);
   int paramCountA=countPathParams(a.getPath());
   int paramCountB=countPathParams(b.getPath());
   if(paramCountA!=paramCountB)return Integer.compare(paramCountA,paramCountB);
   int fanA=a.getFanOutScore()!=null?a.getFanOutScore():0;
   int fanB=b.getFanOutScore()!=null?b.getFanOutScore():0;
   if(fanA!=fanB)return Integer.compare(fanB,fanA);
   if("POST".equals(a.getMethod())&&"POST".equals(b.getMethod())){
    int fkA=countForeignKeyFields(a.getSampleJsonBody());
    int fkB=countForeignKeyFields(b.getSampleJsonBody());
    if(fkA!=fkB)return Integer.compare(fkA,fkB);
   }
   return (a.getService()+a.getPath()+a.getMethod()).compareTo(b.getService()+b.getPath()+b.getMethod());
  };
  candidates.sort(causalComparator);

  // Inherited Step 1 environment keys
  Map<String,String> step1EnvMap=runtime.getProjectExecutionEnvironment(id);
  Set<String> inheritedKeys=new LinkedHashSet<>(step1EnvMap!=null?step1EnvMap.keySet():Set.of());
  if(savedProfile!=null){
   JsonNode envNode=savedProfile.path("environmentVariables");
   if(envNode.isObject())envNode.fieldNames().forEachRemaining(inheritedKeys::add);
   JsonNode secNode=savedProfile.path("secretReferences");
   if(secNode.isArray())secNode.forEach(n->{if(!n.asText("").isBlank())inheritedKeys.add(n.asText().trim());});
  }

  Map<String,String> sampleInputs=new LinkedHashMap<>();
  Map<String,String> healthPaths=(pre!=null&&pre.getServiceHealthPaths()!=null)?pre.getServiceHealthPaths():Map.of();
  String sandboxBearer=resolveOrMintPreviewBearerToken(id,savedProfile,pre,candidates);
  String repairFeedback=buildRepairFeedbackSummary(id,r!=null?r.repairSessionId():null,allowedServices);
  String goal=r!=null&&r.goal()!=null?SecretRedactor.redactString(r.goal().trim()):"";
  List<DetectedEndpointDTO> goalCandidates=filterCandidatesForGoal(candidates,goal);
  List<GeneratedStepDraft> staticSteps=buildDeterministicSteps(goalCandidates,allowedServices,upstreamServices,connectedServices,healthPaths,causalComparator,sampleInputs,sandboxBearer,goal);
  List<String> runnableList=new ArrayList<>(allowedServices);

  Optional<String> maybeKey=apiKeyProvider!=null?apiKeyProvider.resolveApiKey():Optional.empty();
  if(maybeKey.isPresent()&&!goalCandidates.isEmpty()){
   try{
    GeneratedScenarioDraftView aiDraft=callAiScenarioGenerator(
      id,snapshotId,modelId,maybeKey.get(),goal,repairFeedback,sandboxBearer,allowedServices,savedProfile,pre,goalCandidates,relationshipSummaries,new ArrayList<>(inheritedKeys),runnableList);
    if(aiDraft!=null&&!aiDraft.steps().isEmpty()){
     return aiDraft;
    }
   }catch(Exception ex){
    log.warn("AI scenario generation fell back to deterministic system synthesis: {}",ex.getMessage());
   }
  }

  long coveredServices=staticSteps.stream().map(GeneratedStepDraft::service).distinct().count();
  String summary=staticSteps.isEmpty()
    ?"No declared HTTP endpoints were automatically detected in source; you can add HTTP steps manually below."
    :"Automatically synthesized "+staticSteps.size()+" causal test steps covering "+coveredServices+" of "+Math.max(1,allowedServices.size())+" runnable services discovered in Step 1. Review and confirm below before running.";
  return new GeneratedScenarioDraftView(
    id,snapshotId,modelId,
    suggestScenarioNameForGoal(goal),
    "SYSTEM_STATIC",
    "topdown-journey-v3",
    summary,
    staticSteps,
    sampleInputs,
    new ArrayList<>(inheritedKeys),
    runnableList
  );
 }

 private List<GeneratedStepDraft> buildDeterministicSteps(
   List<DetectedEndpointDTO> sortedCandidates,
   Set<String> allowedServices,
   Set<String> upstreamServices,
   Set<String> connectedServices,
   Map<String,String> serviceHealthPaths,
   Comparator<DetectedEndpointDTO> causalComparator,
   Map<String,String> sampleInputs,
   String sandboxBearer,
   String goal){
  List<DetectedEndpointDTO> business=sortedCandidates.stream().filter(ep->!isHealthProbePath(ep.getPath())).toList();
  List<DetectedEndpointDTO> healthOnly=sortedCandidates.stream().filter(ep->isHealthProbePath(ep.getPath())).toList();

  List<DetectedEndpointDTO> selected=new ArrayList<>();
  Set<DetectedEndpointDTO> pickedSet=new LinkedHashSet<>();
  Set<String> seenMethodPaths=new HashSet<>();
  boolean isFocusedGoal=goal!=null&&!goal.isBlank()&&goal.toLowerCase(Locale.ROOT).contains("focus");
  boolean wantCompensating=goal!=null&&goal.toLowerCase(Locale.ROOT).contains("compensating");
  Set<String> businessDomainServices=new HashSet<>();
  for(DetectedEndpointDTO ep:business){
   businessDomainServices.add(ep.getService());
   businessDomainServices.add(resolveEndpointDomainService(ep,allowedServices));
  }
  boolean hasHttpLessRunnableService=!isFocusedGoal&&allowedServices.stream()
    .anyMatch(svc->!isDiscoveryRegistryService(svc)&&!businessDomainServices.contains(svc));
  long runnableDomainCount=allowedServices.stream().filter(svc->!isDiscoveryRegistryService(svc)).count();
  int totalCap=runnableDomainCount>4?Math.min(20,(int)(runnableDomainCount*2+2)):10;
  int businessCap=hasHttpLessRunnableService?(totalCap-1):totalCap;
  int perSvcWriteCap=isFocusedGoal?4:2;
  int perSvcPass1Cap=isFocusedGoal?7:3;
  // Pass 1a: ensure transactional write endpoints (POST/PUT/PATCH) are represented per domain service before GETs fill the cap
  Map<String,Integer> perServiceCount=new HashMap<>();
  for(DetectedEndpointDTO ep:business){
   if(pickedSet.size()>=businessCap)break;
   if(isAuxiliaryEndpointPath(ep.getPath())||!Set.of("POST","PUT","PATCH").contains(ep.getMethod()))continue;
   if(ep.getPath()!=null&&(ep.getPath().contains("/batch")||(!wantCompensating&&(ep.getPath().endsWith("/deduct")||ep.getPath().endsWith("/restore")))))continue;
   String routeKey= ("PATCH".equals(ep.getMethod())?"PUT":ep.getMethod())+":"+ep.getPath();
   if(seenMethodPaths.contains(routeKey))continue;
   String domainSvc=resolveEndpointDomainService(ep,allowedServices);
   int cnt=perServiceCount.getOrDefault(domainSvc,0);
   if(cnt<perSvcWriteCap){
    pickedSet.add(ep);
    seenMethodPaths.add(routeKey);
    seenMethodPaths.add(ep.getMethod()+":"+ep.getPath());
    perServiceCount.put(domainSvc,cnt+1);
   }
  }
  // Pass 1b: ensure primary causal business endpoints (including GET verification) per domain service
  for(DetectedEndpointDTO ep:business){
   if(pickedSet.size()>=businessCap)break;
   if(isAuxiliaryEndpointPath(ep.getPath())||"DELETE".equals(ep.getMethod()))continue;
   if(ep.getPath()!=null&&(ep.getPath().contains("/batch")||(!wantCompensating&&(ep.getPath().endsWith("/deduct")||ep.getPath().endsWith("/restore")))))continue;
   String routeKey=("PATCH".equals(ep.getMethod())?"PUT":ep.getMethod())+":"+ep.getPath();
   if(seenMethodPaths.contains(routeKey))continue;
   String domainSvc=resolveEndpointDomainService(ep,allowedServices);
   int cnt=perServiceCount.getOrDefault(domainSvc,0);
   if(cnt<perSvcPass1Cap){
    pickedSet.add(ep);
    seenMethodPaths.add(routeKey);
    seenMethodPaths.add(ep.getMethod()+":"+ep.getPath());
    perServiceCount.put(domainSvc,cnt+1);
   }
  }
  // Pass 2: allow additional primary endpoints per service before falling back to auxiliary/DELETE endpoints
  for(DetectedEndpointDTO ep:business){
   if(pickedSet.size()>=businessCap)break;
   if(isAuxiliaryEndpointPath(ep.getPath()))continue;
   if(ep.getPath()!=null&&!wantCompensating&&(ep.getPath().endsWith("/deduct")||ep.getPath().endsWith("/restore")))continue;
   String routeKey=("PATCH".equals(ep.getMethod())?"PUT":ep.getMethod())+":"+ep.getPath();
   if(seenMethodPaths.contains(routeKey))continue;
   String domainSvc=resolveEndpointDomainService(ep,allowedServices);
   int cnt=perServiceCount.getOrDefault(domainSvc,0);
   if(cnt<(isFocusedGoal?10:4)&&pickedSet.add(ep)){
    seenMethodPaths.add(routeKey);
    seenMethodPaths.add(ep.getMethod()+":"+ep.getPath());
    perServiceCount.put(domainSvc,cnt+1);
   }
  }
  for(DetectedEndpointDTO ep:business){
   if(pickedSet.size()>=businessCap)break;
   if(ep.getPath()!=null&&!wantCompensating&&(ep.getPath().endsWith("/deduct")||ep.getPath().endsWith("/restore")))continue;
   String routeKey=("PATCH".equals(ep.getMethod())?"PUT":ep.getMethod())+":"+ep.getPath();
   if(seenMethodPaths.contains(routeKey))continue;
   String domainSvc=resolveEndpointDomainService(ep,allowedServices);
   if(perServiceCount.getOrDefault(domainSvc,0)==0||!isAuxiliaryEndpointPath(ep.getPath())){
    if(pickedSet.add(ep)){
     seenMethodPaths.add(routeKey);
     seenMethodPaths.add(ep.getMethod()+":"+ep.getPath());
     perServiceCount.put(domainSvc,perServiceCount.getOrDefault(domainSvc,0)+1);
    }
   }
  }
  // Pass 3: for any runnable service with 0 business endpoints (when not running a focused domain goal), include 1 health/readiness probe
  Set<String> coveredServices=new HashSet<>();
  pickedSet.forEach(ep->{
   coveredServices.add(ep.getService());
   coveredServices.add(resolveEndpointDomainService(ep,allowedServices));
   if(ep.getDownstreamTargets()!=null)coveredServices.addAll(ep.getDownstreamTargets());
  });
  if(!isFocusedGoal){
   for(DetectedEndpointDTO hp:healthOnly){
    if(pickedSet.size()>=totalCap)break;
    if(!coveredServices.isEmpty()&&isDiscoveryRegistryService(hp.getService()))continue;
    if(coveredServices.add(hp.getService())){
     pickedSet.add(hp);
    }
   }
   for(String svc:allowedServices){
    if(pickedSet.size()>=totalCap)break;
    if(!coveredServices.isEmpty()&&isDiscoveryRegistryService(svc))continue;
    String probePath=serviceHealthPaths!=null?serviceHealthPaths.get(svc):null;
    if(probePath!=null&&probePath.startsWith("/")&&coveredServices.add(svc)){
     pickedSet.add(DetectedEndpointDTO.builder()
       .service(svc)
       .method("GET")
       .path(probePath)
       .expectedStatus(200)
       .source("Step 1 Readiness Probe")
       .build());
    }
   }
  }
  selected.addAll(pickedSet);
  selected.sort(causalComparator);

  Map<String,String> extractedByResource=new LinkedHashMap<>();
  boolean hasExtractedAuthToken=false;
  List<GeneratedStepDraft> steps=new ArrayList<>();
  int idx=1;
  for(DetectedEndpointDTO ep:selected){
   String serviceKey=safeServiceEnvPrefix(ep.getService());
   String resRoot=resourceEntityToken(ep.getPath());
   Map<String,String> stepExtract=new LinkedHashMap<>();
   String rawPhase=ep.getJourneyRole()!=null?ep.getJourneyRole():inferJourneyPhase(ep);
   String phase=inferClusteredJourneyPhase(ep,rawPhase);

   // Tier A Auth extraction when auth endpoint declares a token field in responseFields
   if("AUTH_ENTRY".equals(rawPhase)&&ep.getResponseFields()!=null){
    String tokPtr=findMatchingPointer(ep.getResponseFields(),List.of("accesstoken","access_token","token","jwt","idtoken"));
    if(tokPtr!=null){
     stepExtract.put("AUTH_TOKEN",tokPtr);
     hasExtractedAuthToken=true;
    }
   }

   Map<String,String> stepVars=new LinkedHashMap<>();
   StringBuffer rewrittenPath=new StringBuffer();
   Matcher m=PATH_PARAM_PATTERN.matcher(ep.getPath());
   while(m.find()){
    String param=m.group(1);
    String chainedVar=resolveChainedVariableForParam(param,resRoot,extractedByResource);
    if(chainedVar!=null){
     m.appendReplacement(rewrittenPath,"{{"+chainedVar+"}}");
    }else{
     String alias="V"+stepVars.size();
     String envName=(serviceKey+"_"+param.replaceAll("[^A-Za-z0-9]","_").toUpperCase(Locale.ROOT));
     if(envName.length()>60)envName=envName.substring(0,60);
     stepVars.put(alias,envName);
     sampleInputs.putIfAbsent(envName,inferSampleParamValue(param));
     m.appendReplacement(rewrittenPath,"{{"+alias+"}}");
    }
   }
   m.appendTail(rewrittenPath);
   String fullRewrittenPath=rewrittenPath.toString();
   int qIdx=fullRewrittenPath.indexOf('?');
   if(qIdx>=0&&!extractedByResource.isEmpty()){
    String basePart=fullRewrittenPath.substring(0,qIdx);
    String[] qPairs=fullRewrittenPath.substring(qIdx+1).split("&");
    boolean qChanged=false;
    for(int qi=0;qi<qPairs.length;qi++){
     int eq=qPairs[qi].indexOf('=');
     if(eq>0){
      String qKey=qPairs[qi].substring(0,eq);
      String qVal=qPairs[qi].substring(eq+1);
      if(!qVal.contains("{{")){
       String chainedQ=resolveChainedVariableForParam(qKey,resRoot,extractedByResource);
       if(chainedQ!=null){
        qPairs[qi]=qKey+"={{"+chainedQ+"}}";
        qChanged=true;
       }
      }
     }
    }
    if(qChanged)fullRewrittenPath=basePart+"?"+String.join("&",qPairs);
   }

   // Seed/Workflow POST extraction when responseFields confirms an id/code pointer
   if("POST".equals(ep.getMethod())&&!"AUTH_ENTRY".equals(rawPhase)&&ep.getResponseFields()!=null&&!resRoot.isEmpty()){
    String idPtr=findMatchingPointer(ep.getResponseFields(),List.of("id",resRoot.toLowerCase(Locale.ROOT)+"id","code","sku","orderid","productid"));
    if(idPtr!=null){
     String varName=toScenarioEnvKey(resRoot+"_ID");
     stepExtract.put(varName,idPtr);
     extractedByResource.putIfAbsent(resRoot,varName);
    }
    String codePtr=findMatchingPointer(ep.getResponseFields(),List.of(resRoot.toLowerCase(Locale.ROOT)+"code","code","sku"));
    if(codePtr!=null){
     String codeVar=toScenarioEnvKey(resRoot+"_CODE");
     stepExtract.putIfAbsent(codeVar,codePtr);
     extractedByResource.putIfAbsent(resRoot+"_CODE",codeVar);
    }
   }

   String bodyRef=null;
   if(Set.of("POST","PUT","PATCH").contains(ep.getMethod())){
    bodyRef=serviceKey+"_BODY_"+idx;
    String candidateBody=isValidJsonObject(ep.getSampleJsonBody())
      ?SecretRedactor.redactString(ep.getSampleJsonBody())
      :inferSampleJsonBody(ep.getPath());
    candidateBody=injectChainedVariablesIntoBody(candidateBody,extractedByResource);
    sampleInputs.putIfAbsent(bodyRef,candidateBody);
   }

   Map<String,String> stepHeaders=null;
   List<Map<String,String>> stepEnvHeaders=null;
   boolean requiresAdmin=requiresElevatedOrInternalRole(ep.getPath(),ep);
   if((Boolean.TRUE.equals(ep.getRequiresAuth())||requiresAdmin)&&!"AUTH_ENTRY".equals(rawPhase)){
    if(hasExtractedAuthToken&&!requiresAdmin){
     stepHeaders=Map.of("Authorization","Bearer {{AUTH_TOKEN}}");
    }else if(sandboxBearer!=null){
     String authRef=serviceKey+"_AUTHORIZATION";
     stepEnvHeaders=List.of(Map.of("name","Authorization","reference",authRef));
     sampleInputs.putIfAbsent(authRef,sandboxBearer);
    }
   }

   int expectedStatus=(ep.getExpectedStatus()!=null&&ep.getExpectedStatus()>=100&&ep.getExpectedStatus()<=599)
     ?ep.getExpectedStatus()
     :200;

   String rationale;
   if(upstreamServices.contains(ep.getService())){
    rationale="Entry/upstream call "+ep.getMethod()+" "+ep.getPath()+" on "+ep.getService()+" to fan out cross-service OpenTelemetry traces.";
   }else if(connectedServices.contains(ep.getService())){
    rationale="Verify "+ep.getMethod()+" "+ep.getPath()+" on "+ep.getService()+" to capture cross-service OpenTelemetry traces.";
   }else{
    rationale="Verify "+ep.getMethod()+" "+ep.getPath()+" on "+ep.getService()+" (detected from "+(ep.getSource()!=null?ep.getSource():"source snapshot")+").";
   }

   steps.add(new GeneratedStepDraft(
     "step-"+idx,
     ep.getService(),
     ep.getMethod(),
     fullRewrittenPath,
     expectedStatus,
     rationale,
     ep.getSource()!=null?ep.getSource():"Step 1 Preflight",
     stepVars.isEmpty()?null:stepVars,
     stepEnvHeaders,
     bodyRef,
     Boolean.TRUE,
     stepHeaders,
     stepExtract.isEmpty()?null:stepExtract,
     phase
   ));
   idx++;
  }
  return steps;
 }

 private GeneratedScenarioDraftView callAiScenarioGenerator(
   UUID projectId,
   UUID snapshotId,
   UUID modelId,
   String apiKey,
   String goal,
   String repairFeedback,
   String sandboxBearer,
   Set<String> allowedServices,
   JsonNode savedProfile,
   PreflightCheckResponseDTO pre,
   List<DetectedEndpointDTO> candidates,
   List<String> relationships,
   List<String> inheritedKeys,
   List<String> runnableList) throws Exception {

  Map<String,DetectedEndpointDTO> endpointLookup=new LinkedHashMap<>();
  for(DetectedEndpointDTO ep:candidates){
   endpointLookup.putIfAbsent(ep.getService()+":"+ep.getMethod()+":"+ep.getPath(),ep);
   endpointLookup.putIfAbsent(canonicalRouteKey(ep.getService(),ep.getMethod(),ep.getPath()),ep);
  }

  int aiStepCap=Math.min(24,Math.max(12,(int)(allowedServices.stream().filter(s->!isDiscoveryRegistryService(s)).count()*3)));
  StringBuilder prompt=new StringBuilder();
  prompt.append("You are an elite Principal Distributed Systems Architect and Verification Planner for MAVIS.\n");
  prompt.append("Design a TOP-DOWN, STATEFUL, END-TO-END Business Journey scenario (target 8 to ").append(aiStepCap).append(" steps, scaling with the project's services so no workflow or service is truncated) using ONLY the allowed services and discovered endpoints below.\n");
  prompt.append("CRITICAL DESIGN RULES:\n");
  prompt.append("1. DO NOT generate isolated, naive per-table CRUD loops (avoid calling DELETE on seeded entities right after creating them unless testing a compensation/cancellation workflow).\n");
  prompt.append("2. Group consecutive steps into cohesive FUNCTIONAL FEATURE CLUSTERS based on the project's actual domain and controllers, following a Top-Down Business Journey:\n");
  prompt.append("   - Cluster 0 (AUTH_ENTRY): If auth/register/login/profile endpoints exist and downstream routes require auth, group them into an Auth & Identity cluster first and extract AUTH_TOKEN.\n");
  prompt.append("   - Cluster 1 (PREREQUISITE_SEED): Group prerequisite master-data creation & lookup APIs by business domain (e.g. Catalog & Inventory, Organization & Department, Account Setup) via POST and extract created IDs/codes using `extract`.\n");
  prompt.append("   - Cluster 2 (CROSS_SERVICE_WORKFLOW): Group high-fan-out Gateway/Orchestrator transactional APIs by business capability (e.g. Order & Coupon Checkout, Payment & Billing, Booking/Transfer) referencing extracted `{{VAR}}` values in `path` or `sampleJsonBody` to trigger cross-service OpenTelemetry spans.\n");
  prompt.append("   - Cluster 3 (STATE_VERIFICATION): Verify side effects and state transitions across downstream services using GET with `{{VAR}}`.\n");
  prompt.append("   - Set `journeyPhase` on each step to `<PHASE_CODE>: <Domain Feature Cluster Name>` (e.g. `AUTH_ENTRY: Auth & User Identity`, `PREREQUISITE_SEED: Catalog & Inventory`, `CROSS_SERVICE_WORKFLOW: Order & Coupon Checkout`, `STATE_VERIFICATION: Order & Payment Verification`). Steps belonging to the same functional feature cluster MUST share the exact same `<Domain Feature Cluster Name>`.\n");
  prompt.append("3. Stateful Variable Chaining: When a POST step returns JSON fields (see `responseFields`), you may attach `\"extract\": {\"ORDER_ID\": \"/id\"}` (variable names MUST match `[A-Z][A-Z0-9_]*`, pointers MUST start with `/`), and reference `{{ORDER_ID}}` in subsequent steps' `path`, `sampleJsonBody`, or `headers`.\n");
  prompt.append("4. Respect `validationHints` and `dtoSample` so every POST/PUT/PATCH body passes Bean Validation (@NotBlank, @Email, @Positive, etc.) on the first try.\n");
  prompt.append("5. NEVER invent a POST/PUT/PATCH verb for a path that is only listed as GET in Discovered endpoints (some write routes require multipart/form-data file uploads and are excluded; use the listed GET route or a listed POST route instead).\n");
  prompt.append("6. Before calling cart/order creation (e.g. POST /api/order/cart/add), include a catalog read step (e.g. GET /api/catalog/products) if available. Avoid redundant direct external calls to internal service-to-service endpoints (such as /inventory/deduct or /inventory/restore) when top-level business workflows (/checkout or /cancel) already invoke them internally.\n");
  prompt.append("Allowed services: ").append(String.join(", ",allowedServices)).append("\n");
  if(!relationships.isEmpty()){
   prompt.append("Architecture C4 relationships (target these cross-service paths):\n");
   relationships.stream().limit(25).forEach(r->prompt.append("- ").append(SecretRedactor.redactString(r)).append("\n"));
  }
  if(repairFeedback!=null&&!repairFeedback.isBlank()){
   prompt.append("Previous Run Diagnostic Feedback (SELF-HEAL these failures and cover unverified services):\n").append(repairFeedback).append("\n");
  }
  prompt.append("Discovered endpoints (ordered by top-down topology & fan-out):\n");
  List<DetectedEndpointDTO> promptCandidates=new ArrayList<>(candidates);
  promptCandidates.sort((a,b)->{
   int rA=aiPromptRolePriority(a),rB=aiPromptRolePriority(b);
   if(rA!=rB)return Integer.compare(rA,rB);
   int fA=a.getFanOutScore()!=null?a.getFanOutScore():0;
   int fB=b.getFanOutScore()!=null?b.getFanOutScore():0;
   return Integer.compare(fB,fA);
  });
  promptCandidates.stream().limit(70).forEach(ep->{
   prompt.append("- service=").append(ep.getService())
     .append(", method=").append(ep.getMethod())
     .append(", path=").append(ep.getPath());
   if(ep.getJourneyRole()!=null)prompt.append(", role=").append(ep.getJourneyRole());
   if(ep.getFanOutScore()!=null)prompt.append(", fanOut=").append(ep.getFanOutScore());
   if(ep.getDownstreamTargets()!=null&&!ep.getDownstreamTargets().isEmpty())prompt.append(", calls=").append(String.join("|",ep.getDownstreamTargets()));
   if(Boolean.TRUE.equals(ep.getRequiresAuth()))prompt.append(", requiresAuth=true");
   if(ep.getRequiredRoles()!=null&&!ep.getRequiredRoles().isEmpty())prompt.append(", roles=").append(String.join("|",ep.getRequiredRoles()));
   if(ep.getExpectedStatus()!=null)prompt.append(", expectedStatus=").append(ep.getExpectedStatus());
   if(ep.getRequestBodyType()!=null)prompt.append(", bodyDto=").append(ep.getRequestBodyType());
   if(ep.getSampleJsonBody()!=null)prompt.append(", dtoSample=").append(SecretRedactor.redactString(ep.getSampleJsonBody()));
   if(ep.getValidationHints()!=null&&!ep.getValidationHints().isEmpty())prompt.append(", validationHints=").append(SecretRedactor.redactString(ep.getValidationHints().toString()));
   if(ep.getResponseFields()!=null&&!ep.getResponseFields().isEmpty())prompt.append(", responseFields=").append(String.join("|",ep.getResponseFields()));
   prompt.append(", source=").append(ep.getSource()!=null?ep.getSource():"snapshot").append("\n");
  });
  if(!goal.isBlank()){
   prompt.append("User goal: ").append(goal).append("\n");
  }
  prompt.append("""
    Return strict JSON ONLY (no markdown fences) matching this structure:
    {
      "suggestedName": "Scenario title",
      "summary": "Brief explanation of the top-down business journey and cross-service trace coverage",
      "steps": [
        {
          "service": "must be one of Allowed services",
          "method": "GET|POST|PUT|PATCH|DELETE",
          "path": "/concrete/path/or/chained/{{ENTITY_ID}}",
          "expectedStatus": 200,
          "journeyPhase": "AUTH_ENTRY: Auth & User Identity",
          "rationale": "1-line architectural reason explaining why this step is called in this cluster and what data it produces/consumes",
          "sampleJsonBody": "{\\"optional\\":\\"sample\\"}",
          "headers": {"Authorization": "Bearer {{AUTH_TOKEN}}"},
          "extract": {"ENTITY_ID": "/id"}
        }
      ]
    }
    Use {{VAR}} ONLY for variables extracted by an earlier step's `extract` map; for numeric {id} path parameters use 1 (or extracted {{ENTITY_ID}}), and use SKU-LAPTOP-01 ONLY for {sku}/{productCode} parameters. Do NOT repeat identical (service, method, path) steps.
    """);

  boolean hasCustomUrl=customAiEndpointUrl!=null&&!customAiEndpointUrl.isBlank();
  boolean useOpenAi=apiKey!=null&&apiKey.startsWith("sk-");
  String redactedPrompt=SecretRedactor.redactString(prompt.toString());
  String rawText=null;
  String aiModelName=null;
  if(useOpenAi){
   boolean deepSeek=apiKey.matches("^sk-[0-9a-f]{32}$");
   String primaryModel=(scenarioOpenAiModel!=null&&!scenarioOpenAiModel.isBlank())?scenarioOpenAiModel.trim():"gpt-5.4";
   if(deepSeek&&"gpt-5.4".equals(primaryModel))primaryModel="deepseek-flash";
   List<String> modelChain=(deepSeek||primaryModel.equals("gpt-5-mini"))?List.of(primaryModel):List.of(primaryModel,"gpt-5-mini");
   Exception lastErr=null;
   for(String candidateModel:modelChain){
    try{
     ObjectNode openAiReq=json.createObjectNode();
     openAiReq.put("model",candidateModel);
     if(!deepSeek)openAiReq.put("reasoning_effort",candidateModel.startsWith("gpt-5.4")?"medium":"minimal");
     openAiReq.putObject("response_format").put("type","json_object");
     ArrayNode messages=openAiReq.putArray("messages");
     messages.addObject().put("role","user").put("content",redactedPrompt);
     String endpoint=hasCustomUrl?customAiEndpointUrl:(deepSeek?"https://api.deepseek.com/v1/chat/completions":"https://api.openai.com/v1/chat/completions");
     HttpRequest httpReq=HttpRequest.newBuilder()
       .uri(URI.create(endpoint))
       .timeout(Duration.ofSeconds(25))
       .header("Content-Type","application/json")
       .header("Authorization","Bearer "+apiKey)
       .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(openAiReq)))
       .build();
     HttpResponse<String> resp=httpClient.send(httpReq,HttpResponse.BodyHandlers.ofString());
     if(resp.statusCode()<200||resp.statusCode()>=300){
      throw new IllegalStateException("LLM status "+resp.statusCode());
     }
     JsonNode root=json.readTree(resp.body());
     if(aiUsageRecorder!=null&&!hasCustomUrl){
      aiUsageRecorder.recordResponse("openai",candidateModel,root);
     }
     rawText=root.path("choices").path(0).path("message").path("content").asText("");
     aiModelName=candidateModel;
     break;
    }catch(Exception ex){
     lastErr=ex;
     if(hasCustomUrl)break;
    }
   }
   if(rawText==null)throw lastErr!=null?lastErr:new IllegalStateException("OpenAI scenario generation failed");
  }else{
   String primaryModel=(scenarioGeminiModel!=null&&!scenarioGeminiModel.isBlank())?scenarioGeminiModel.trim():"gemini-2.5-pro";
   List<String> modelChain=primaryModel.equals("gemini-2.5-flash")?List.of("gemini-2.5-flash"):List.of(primaryModel,"gemini-2.5-flash");
   Exception lastErr=null;
   for(String candidateModel:modelChain){
    try{
     ObjectNode reqBody=json.createObjectNode();
     ArrayNode contents=reqBody.putArray("contents");
     ObjectNode contentNode=contents.addObject();
     ArrayNode parts=contentNode.putArray("parts");
     parts.addObject().put("text",redactedPrompt);
     ObjectNode genCfg=reqBody.putObject("generationConfig");
     genCfg.put("temperature",0.2);
     genCfg.put("responseMimeType","application/json");
     if(candidateModel.contains("pro")){
      genCfg.putObject("thinkingConfig").put("thinkingBudget",2048);
     }
     String endpoint=hasCustomUrl?customAiEndpointUrl:("https://generativelanguage.googleapis.com/v1beta/models/"+candidateModel+":generateContent?key="+apiKey);
     HttpRequest httpReq=HttpRequest.newBuilder()
       .uri(URI.create(endpoint))
       .timeout(Duration.ofSeconds(22))
       .header("Content-Type","application/json")
       .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(reqBody)))
       .build();
     HttpResponse<String> resp=httpClient.send(httpReq,HttpResponse.BodyHandlers.ofString());
     if(resp.statusCode()<200||resp.statusCode()>=300){
      throw new IllegalStateException("LLM status "+resp.statusCode());
     }
     JsonNode root=json.readTree(resp.body());
     if(aiUsageRecorder!=null&&!hasCustomUrl){
      aiUsageRecorder.recordResponse("gemini",candidateModel,root);
     }
     rawText=root.path("candidates").path(0).path("content").path("parts").path(0).path("text").asText("");
     aiModelName=candidateModel;
     break;
    }catch(Exception ex){
     lastErr=ex;
     if(hasCustomUrl)break;
    }
   }
   if(rawText==null)throw lastErr!=null?lastErr:new IllegalStateException("Gemini scenario generation failed");
  }
  String cleaned=rawText.replaceAll("(?s)^```(?:json)?\\s*","").replaceAll("(?s)\\s*```$","").trim();
  JsonNode parsed=json.readTree(cleaned);
  if(parsed==null||!parsed.isObject())return null;

  Map<String,String> sampleInputs=new LinkedHashMap<>();
  List<GeneratedStepDraft> validSteps=new ArrayList<>();
  Set<String> availableExtractedVars=new LinkedHashSet<>();
  Map<String,String> extractedByResource=new LinkedHashMap<>();
  Set<String> seenStepRoutes=new HashSet<>();
  List<JsonNode> rawSteps=new ArrayList<>();
  parsed.path("steps").forEach(rawSteps::add);
  if(goal==null||!goal.toLowerCase(Locale.ROOT).contains("only")){
   if(goal==null||goal.isBlank()){
    boolean hasLogin=rawSteps.stream().anyMatch(n->"POST".equalsIgnoreCase(n.path("method").asText(""))
      &&(n.path("path").asText("").toLowerCase(Locale.ROOT).endsWith("/login")||n.path("path").asText("").toLowerCase(Locale.ROOT).endsWith("/signin")));
    boolean hasRegister=rawSteps.stream().anyMatch(n->"POST".equalsIgnoreCase(n.path("method").asText(""))
      &&(n.path("path").asText("").toLowerCase(Locale.ROOT).endsWith("/register")||n.path("path").asText("").toLowerCase(Locale.ROOT).endsWith("/signup")));
    if(hasLogin&&!hasRegister&&rawSteps.size()<aiStepCap){
     DetectedEndpointDTO regEp=promptCandidates.stream()
       .filter(ep->"POST".equalsIgnoreCase(ep.getMethod())&&ep.getPath()!=null
         &&(ep.getPath().toLowerCase(Locale.ROOT).endsWith("/register")||ep.getPath().toLowerCase(Locale.ROOT).endsWith("/signup"))
         &&allowedServices.contains(ep.getService()))
       .findFirst().orElse(null);
     if(regEp!=null){
      ObjectNode regNode=json.createObjectNode();
      regNode.put("service",regEp.getService());
      regNode.put("method","POST");
      regNode.put("path",regEp.getPath());
      regNode.put("expectedStatus",regEp.getExpectedStatus()!=null?regEp.getExpectedStatus():201);
      regNode.put("journeyPhase","AUTH_ENTRY: Auth & User Identity");
      regNode.put("rationale","Register sandbox user account before login so authentication succeeds on a clean database.");
      rawSteps.add(0,regNode);
     }
    }
   }
   boolean hasOrderOrCheckoutWrite=rawSteps.stream().anyMatch(n->"POST".equalsIgnoreCase(n.path("method").asText(""))
     &&(n.path("path").asText("").toLowerCase(Locale.ROOT).endsWith("/checkout")||n.path("path").asText("").toLowerCase(Locale.ROOT).endsWith("/orders")));
   if(!hasOrderOrCheckoutWrite&&rawSteps.size()<aiStepCap){
    DetectedEndpointDTO checkoutEp=promptCandidates.stream()
      .filter(ep->"POST".equalsIgnoreCase(ep.getMethod())&&ep.getPath()!=null&&ep.getPath().toLowerCase(Locale.ROOT).endsWith("/checkout")&&allowedServices.contains(ep.getService()))
      .findFirst().orElse(null);
    if(checkoutEp!=null){
     ObjectNode injected=json.createObjectNode();
     injected.put("service",checkoutEp.getService());
     injected.put("method","POST");
     injected.put("path",checkoutEp.getPath());
     injected.put("expectedStatus",checkoutEp.getExpectedStatus()!=null?checkoutEp.getExpectedStatus():201);
     injected.put("journeyPhase","CROSS_SERVICE_WORKFLOW: Order & Coupon Checkout");
     injected.put("rationale","Place an order via checkout to trigger cross-service inventory deduction and notification events.");
     int insertAt=rawSteps.size();
     while(insertAt>0&&"GET".equalsIgnoreCase(rawSteps.get(insertAt-1).path("method").asText("")))insertAt--;
     rawSteps.add(insertAt,injected);
    }
   }
   if(goal==null||goal.isBlank()){
    Set<String> aiCovered=new HashSet<>();
    for(JsonNode n:rawSteps){
     String s=resolveServiceToAllowed(n.path("service").asText("").trim(),null,allowedServices,savedProfile,pre,false);
     String v=n.path("method").asText("GET").trim().toUpperCase(Locale.ROOT);
     String p=n.path("path").asText("").trim();
     if(s!=null){
      aiCovered.add(s);
      DetectedEndpointDTO mEp=matchCandidateEndpoint(s,v,p,endpointLookup,candidates);
      if(mEp!=null){
       aiCovered.add(resolveEndpointDomainService(mEp,allowedServices));
       if(mEp.getDownstreamTargets()!=null)aiCovered.addAll(mEp.getDownstreamTargets());
      }else{
       aiCovered.add(resolveEndpointDomainService(DetectedEndpointDTO.builder().service(s).method(v).path(p).build(),allowedServices));
      }
     }
    }
    for(String reqSvc:allowedServices){
     if(rawSteps.size()>=aiStepCap)break;
     if(isDiscoveryRegistryService(reqSvc)||aiCovered.contains(reqSvc))continue;
     DetectedEndpointDTO fillEp=promptCandidates.stream()
       .filter(ep->!isHealthProbePath(ep.getPath())&&(reqSvc.equals(ep.getService())||reqSvc.equals(resolveEndpointDomainService(ep,allowedServices))
         ||(ep.getDownstreamTargets()!=null&&ep.getDownstreamTargets().contains(reqSvc))))
       .findFirst().orElse(null);
     if(fillEp!=null){
      ObjectNode fillNode=json.createObjectNode();
      fillNode.put("service",fillEp.getService());
      fillNode.put("method",fillEp.getMethod());
      fillNode.put("path",fillEp.getPath());
      fillNode.put("expectedStatus",fillEp.getExpectedStatus()!=null?fillEp.getExpectedStatus():200);
      fillNode.put("rationale","Ensure end-to-end trace coverage reaches "+reqSvc+".");
      rawSteps.add(fillNode);
      aiCovered.add(reqSvc);
     }
    }
   }
  }
  String primaryGateway=allowedServices.stream()
    .filter(s->{String l=s.toLowerCase(Locale.ROOT);return l.contains("gateway")||l.contains("bff")||l.equals("edge")||l.startsWith("edge-");})
    .findFirst().orElse(null);
  Map<String,String> canonicalLabelByPhase=new HashMap<>();
  int idx=1;
  for(JsonNode item:rawSteps){
   if(idx>aiStepCap)break;
   String rawSvc=item.path("service").asText("").trim();
   String svc=resolveServiceToAllowed(rawSvc,null,allowedServices,savedProfile,pre,false);
   String verb=item.path("method").asText("GET").trim().toUpperCase(Locale.ROOT);
   String rawPath=item.path("path").asText("").trim();
   int status=item.path("expectedStatus").asInt(200);
   if(svc==null||!allowedServices.contains(svc))continue;
   if(!Set.of("GET","POST","PUT","PATCH","DELETE").contains(verb))continue;
   if(!rawPath.startsWith("/")||rawPath.startsWith("//")||rawPath.contains("\\")||rawPath.contains("\n")||rawPath.contains("\r"))continue;
   if(status<100||status>599)status=200;
   if(primaryGateway!=null&&!primaryGateway.equals(svc)&&matchCandidateEndpoint(primaryGateway,verb,rawPath,endpointLookup,candidates)!=null){
    svc=primaryGateway;
   }

   DetectedEndpointDTO matchedEp=matchCandidateEndpoint(svc,verb,rawPath,endpointLookup,candidates);
   if(matchedEp==null&&rawPath.matches("^/api/[A-Za-z0-9_.-]+/api/.*")){
    String dedupedPath=rawPath.replaceFirst("^/api/[A-Za-z0-9_.-]+(?=/api/)","");
    DetectedEndpointDTO dedupedMatch=matchCandidateEndpoint(svc,verb,dedupedPath,endpointLookup,candidates);
    if(dedupedMatch!=null){
     rawPath=dedupedPath;
     matchedEp=dedupedMatch;
    }
   }
   if(matchedEp==null&&Set.of("POST","PUT","PATCH").contains(verb)){
    String cleanPrefix=rawPath.endsWith("/")?rawPath.substring(0,rawPath.length()-1):rawPath;
    for(DetectedEndpointDTO cand:candidates){
     if(svc.equalsIgnoreCase(cand.getService())&&verb.equalsIgnoreCase(cand.getMethod())
       &&cand.getPath()!=null&&cand.getPath().startsWith(cleanPrefix+"/")
       &&!cand.getPath().substring(cleanPrefix.length()+1).contains("/")){
      rawPath=cand.getPath();
      matchedEp=cand;
      break;
     }
    }
   }
   boolean snappedWriteToGet=false;
   if(matchedEp==null&&Set.of("POST","PUT","PATCH").contains(verb)){
    DetectedEndpointDTO getCand=matchCandidateEndpoint(svc,"GET",rawPath,endpointLookup,candidates);
    if(getCand!=null){
     verb="GET";
     rawPath=getCand.getPath();
     matchedEp=getCand;
     status=getCand.getExpectedStatus()!=null?getCand.getExpectedStatus():200;
     snappedWriteToGet=true;
    }
   }

   String resRoot=resourceEntityToken(matchedEp!=null&&matchedEp.getPath()!=null?matchedEp.getPath():rawPath);
   if(matchedEp!=null&&matchedEp.getPath()!=null){
    String[] epSegs=matchedEp.getPath().split("\\?",2)[0].split("/");
    String[] rawParts=rawPath.split("\\?",2);
    String[] reqSegs=rawParts[0].split("/");
    if(epSegs.length==reqSegs.length){
     boolean modifiedSeg=false;
     for(int si=0;si<epSegs.length;si++){
      String es=epSegs[si],rs=reqSegs[si];
      if(es.startsWith("{")&&es.endsWith("}")){
       String epParam=es.substring(1,es.length()-1);
       String chained=resolveChainedVariableForParam(epParam,resRoot,extractedByResource);
       boolean rsIsUnboundOrMisplacedSku=("SKU-LAPTOP-01".equalsIgnoreCase(rs)&&!epParam.toLowerCase(Locale.ROOT).contains("sku")&&!epParam.toLowerCase(Locale.ROOT).contains("code"))
         ||(epParam.toLowerCase(Locale.ROOT).endsWith("code")&&rs.contains("_ID}}"));
       if(chained!=null&&availableExtractedVars.contains(chained)&&(rs.startsWith("{")||rsIsUnboundOrMisplacedSku)){
        reqSegs[si]="{{"+chained+"}}";
        modifiedSeg=true;
       }else if(rsIsUnboundOrMisplacedSku){
        reqSegs[si]="{"+epParam+"}";
        modifiedSeg=true;
       }
      }
     }
     if(modifiedSeg){
      rawPath=String.join("/",reqSegs)+(rawParts.length>1?"?"+rawParts[1]:"");
     }
    }
   }

   String serviceKey=safeServiceEnvPrefix(svc);
   Map<String,String> stepVars=new LinkedHashMap<>();
   // Preserve {{VAR}} in rawPath only when VAR is already in availableExtractedVars; convert unbound {{VAR}} or single {param} to {{V0}}
   Matcher rawVarMatcher=SCENARIO_VAR_PATTERN.matcher(rawPath);
   StringBuilder normalizedRawPath=new StringBuilder();
   while(rawVarMatcher.find()){
    String vName=rawVarMatcher.group(1);
    String repl=availableExtractedVars.contains(vName)?"__MAVIS_VAR_"+vName+"__":"{"+vName+"}";
    rawVarMatcher.appendReplacement(normalizedRawPath,Matcher.quoteReplacement(repl));
   }
   rawVarMatcher.appendTail(normalizedRawPath);
   String pathSingleBracesOnly=normalizedRawPath.toString();
   StringBuffer rewrittenSingle=new StringBuffer();
   Matcher m=PATH_PARAM_PATTERN.matcher(pathSingleBracesOnly);
   while(m.find()){
    String param=m.group(1);
    String chainedVar=resolveChainedVariableForParam(param,resRoot,extractedByResource);
    if(chainedVar!=null&&availableExtractedVars.contains(chainedVar)){
     m.appendReplacement(rewrittenSingle,"__MAVIS_VAR_"+chainedVar+"__");
    }else{
     String alias="V"+stepVars.size();
     String envName=(serviceKey+"_"+param.replaceAll("[^A-Za-z0-9]","_").toUpperCase(Locale.ROOT));
     if(envName.length()>60)envName=envName.substring(0,60);
     stepVars.put(alias,envName);
     sampleInputs.putIfAbsent(envName,inferSampleParamValue(param,rawPath));
     m.appendReplacement(rewrittenSingle,"{{"+alias+"}}");
    }
   }
   m.appendTail(rewrittenSingle);
   String finalPath=rewrittenSingle.toString().replaceAll("__MAVIS_VAR_([a-zA-Z][a-zA-Z0-9_]*)__","{{$1}}");
   if(!seenStepRoutes.add(svc+":"+verb+":"+finalPath))continue;

   String bodyRef=null;
   if(Set.of("POST","PUT","PATCH").contains(verb)){
    bodyRef=serviceKey+"_BODY_"+idx;
    String aiSampleBody=SecretRedactor.redactString(item.path("sampleJsonBody").asText(""))
      .replaceAll("(\"\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2})(?:\\.\\d+)?Z\"","$1\"");
    Matcher bodyVarMatcher=SCENARIO_VAR_PATTERN.matcher(aiSampleBody);
    StringBuilder cleanedBody=new StringBuilder();
    while(bodyVarMatcher.find()){
     String bv=bodyVarMatcher.group(1);
     String bRepl=availableExtractedVars.contains(bv)?"{{"+bv+"}}":inferSampleParamValue(bv);
     bodyVarMatcher.appendReplacement(cleanedBody,Matcher.quoteReplacement(bRepl));
    }
    bodyVarMatcher.appendTail(cleanedBody);
    aiSampleBody=cleanedBody.toString();
    boolean hasDtoSample=(matchedEp!=null&&isValidJsonObject(matchedEp.getSampleJsonBody()));
    String fallbackBody=hasDtoSample
      ?SecretRedactor.redactString(matchedEp.getSampleJsonBody())
      :inferSampleJsonBody(rawPath);
    String finalBody=isValidJsonObject(aiSampleBody)
      ?(hasDtoSample?reconcileAiBodyWithDtoSample(aiSampleBody,fallbackBody):aiSampleBody)
      :fallbackBody;
    finalBody=injectChainedVariablesIntoBody(finalBody,extractedByResource);
    sampleInputs.putIfAbsent(bodyRef,finalBody);
   }

   Map<String,String> stepHeaders=new LinkedHashMap<>();
   boolean aiRequestedAuthHeader=false;
   boolean requiresAdmin=requiresElevatedOrInternalRole(rawPath,matchedEp);
   if(item.path("headers").isObject()){
    for(Iterator<Map.Entry<String,JsonNode>> it=item.path("headers").fields();it.hasNext();){
     Map.Entry<String,JsonNode> e=it.next();
     String hk=e.getKey().trim();
     String rawHv=e.getValue().asText("").trim();
     if("Authorization".equalsIgnoreCase(hk)){
      aiRequestedAuthHeader=true;
      if(sandboxBearer!=null&&(requiresAdmin||!availableExtractedVars.contains("AUTH_TOKEN")))continue;
     }
     boolean hasUnboundVar=false;
     Matcher hm=SCENARIO_VAR_PATTERN.matcher(rawHv);
     while(hm.find()){
      if(!availableExtractedVars.contains(hm.group(1))){hasUnboundVar=true;break;}
     }
     if(hasUnboundVar)continue;
     String hv=SecretRedactor.redactString(rawHv);
     if(hk.matches("[A-Za-z][A-Za-z0-9-]{0,63}")&&!Set.of("host","traceparent","tracestate").contains(hk.toLowerCase(Locale.ROOT))&&!hv.isEmpty()&&!hv.contains("\r")&&!hv.contains("\n")){
      stepHeaders.put(hk,hv);
     }
    }
   }
   List<Map<String,String>> stepEnvHeaders=null;
   DetectedEndpointDTO phaseEp=matchedEp!=null?matchedEp:DetectedEndpointDTO.builder().service(svc).method(verb).path(rawPath).build();
   String basePhase=matchedEp!=null&&matchedEp.getJourneyRole()!=null?matchedEp.getJourneyRole():inferJourneyPhase(phaseEp);
   String rawAiPhase=item.path("journeyPhase").asText("").trim();
   String aiCustomLabel="";
   if(!rawAiPhase.isEmpty()){
    String aiCode=rawAiPhase.contains(":")?rawAiPhase.substring(0,rawAiPhase.indexOf(':')).trim().toUpperCase(Locale.ROOT):rawAiPhase.toUpperCase(Locale.ROOT);
    if(rawAiPhase.contains(":"))aiCustomLabel=rawAiPhase.substring(rawAiPhase.indexOf(':')+1).trim();
    if(Set.of("AUTH_ENTRY","PREREQUISITE_SEED","CROSS_SERVICE_WORKFLOW","STATE_VERIFICATION","CLEANUP_COMPENSATION","HEALTH_FALLBACK").contains(aiCode)){
     basePhase=aiCode;
    }
   }
   String phase=inferClusteredJourneyPhase(phaseEp,basePhase);
   if(!phase.contains(":")&&!aiCustomLabel.isEmpty()){
    canonicalLabelByPhase.putIfAbsent(basePhase,aiCustomLabel);
    phase=basePhase+": "+canonicalLabelByPhase.get(basePhase);
   }
   boolean isAuthPhase=phase!=null&&(phase.equalsIgnoreCase("AUTH_ENTRY")||phase.toUpperCase(Locale.ROOT).startsWith("AUTH_ENTRY:")||phase.toUpperCase(Locale.ROOT).startsWith("AUTH_IDENTITY"));
   boolean needsAuth=((matchedEp!=null&&Boolean.TRUE.equals(matchedEp.getRequiresAuth()))||requiresAdmin||aiRequestedAuthHeader)&&!isAuthPhase;
   if(needsAuth&&!stepHeaders.containsKey("Authorization")){
    if(availableExtractedVars.contains("AUTH_TOKEN")&&!requiresAdmin){
     stepHeaders.put("Authorization","Bearer {{AUTH_TOKEN}}");
    }else if(sandboxBearer!=null){
     String authRef=serviceKey+"_AUTHORIZATION";
     stepEnvHeaders=List.of(Map.of("name","Authorization","reference",authRef));
     sampleInputs.putIfAbsent(authRef,sandboxBearer);
    }
   }

   Map<String,String> stepExtract=new LinkedHashMap<>();
   final DetectedEndpointDTO matchedForExtract=matchedEp;
   final String finalVerbForExtract=verb;
   if(item.path("extract").isObject()){
    item.path("extract").fields().forEachRemaining(e->{
     String ek=toScenarioEnvKey(e.getKey().trim());
     String ptr=e.getValue().asText("").trim();
     if(ptr.startsWith("$."))ptr="/"+ptr.substring(2).replace('.','/');
     else if(!ptr.isEmpty()&&!ptr.startsWith("/"))ptr="/"+ptr.replace('.','/');
     if("/status".equalsIgnoreCase(ptr)||"/message".equalsIgnoreCase(ptr)||ek.endsWith("_STATUS")){
      if(ek.contains("TOKEN")&&matchedForExtract!=null&&matchedForExtract.getResponseFields()!=null){
       String tokPtr=findMatchingPointer(matchedForExtract.getResponseFields(),List.of("accessToken","token","jwt","idToken"));
       if(tokPtr!=null)ptr=tokPtr;
       else return;
      }else{
       return;
      }
     }else if(matchedForExtract!=null&&matchedForExtract.getResponseFields()!=null&&!matchedForExtract.getResponseFields().isEmpty()
       &&!ptr.contains("|")&&!matchedForExtract.getResponseFields().contains(ptr)){
      String leaf=ptr.contains("/")?ptr.substring(ptr.lastIndexOf('/')+1):ptr;
      String snappedPtr=findMatchingPointer(matchedForExtract.getResponseFields(),List.of(leaf,"id","orderCode","code","accessToken","token"));
      if(snappedPtr!=null)ptr=snappedPtr;
     }
     if("GET".equals(finalVerbForExtract)&&ptr.startsWith("/data/")&&!ptr.contains("|")){
      ptr=ptr+"|/"+ptr.substring(6);
     }
     if(!ek.isEmpty()&&ptr.startsWith("/")&&ptr.length()<=512){
      stepExtract.put(ek,ptr);
      availableExtractedVars.add(ek);
      if(!resRoot.isEmpty()&&!isAuthPhase){
       if(ek.endsWith("_CODE")||ek.endsWith("_SKU"))extractedByResource.putIfAbsent(resRoot+"_CODE",ek);
       else extractedByResource.putIfAbsent(resRoot,ek);
      }
     }
    });
   }
   if("POST".equals(verb)&&isAuthPhase&&matchedEp!=null&&matchedEp.getResponseFields()!=null&&stepExtract.isEmpty()&&rawPath.toLowerCase(Locale.ROOT).contains("login")){
    String tokPtr=findMatchingPointer(matchedEp.getResponseFields(),List.of("accessToken","token","jwt","idToken"));
    if(tokPtr!=null){
     stepExtract.put("AUTH_TOKEN",tokPtr);
     availableExtractedVars.add("AUTH_TOKEN");
    }
   }
   if(("POST".equals(verb)||snappedWriteToGet)&&!isAuthPhase&&matchedEp!=null&&matchedEp.getResponseFields()!=null&&!resRoot.isEmpty()){
    if(stepExtract.isEmpty()){
     String idPtr=findMatchingPointer(matchedEp.getResponseFields(),List.of("id",resRoot.toLowerCase(Locale.ROOT)+"id","code","sku","orderid","productid"));
     if(idPtr!=null){
      if("GET".equals(verb)&&idPtr.startsWith("/data/")&&!idPtr.contains("|"))idPtr=idPtr+"|/"+idPtr.substring(6);
      String varName=toScenarioEnvKey(resRoot+"_ID");
      stepExtract.put(varName,idPtr);
      availableExtractedVars.add(varName);
      extractedByResource.putIfAbsent(resRoot,varName);
     }
    }
    String codePtr=findMatchingPointer(matchedEp.getResponseFields(),List.of(resRoot.toLowerCase(Locale.ROOT)+"code","code","sku"));
    if(codePtr!=null){
     if("GET".equals(verb)&&codePtr.startsWith("/data/")&&!codePtr.contains("|"))codePtr=codePtr+"|/"+codePtr.substring(6);
     String codeVar=toScenarioEnvKey(resRoot+"_CODE");
     stepExtract.putIfAbsent(codeVar,codePtr);
     availableExtractedVars.add(codeVar);
     extractedByResource.putIfAbsent(resRoot+"_CODE",codeVar);
    }
   }

   String rationale=SecretRedactor.redactString(item.path("rationale").asText("Verify API workflow proposed by AI + Static Analysis."));
   validSteps.add(new GeneratedStepDraft(
     "step-"+idx,
     svc,
     verb,
     finalPath,
     status,
     rationale,
     "AI + Static Analysis",
     stepVars.isEmpty()?null:stepVars,
     stepEnvHeaders,
     bodyRef,
     Boolean.TRUE,
     stepHeaders.isEmpty()?null:stepHeaders,
     stepExtract.isEmpty()?null:stepExtract,
     phase
   ));
   idx++;
  }
  if(validSteps.isEmpty())return null;
  String suggestedName=SecretRedactor.redactString(parsed.path("suggestedName").asText("AI Architecture Verification Scenario")).trim();
  if(suggestedName.isEmpty())suggestedName="AI Architecture Verification Scenario";
  String summary=SecretRedactor.redactString(parsed.path("summary").asText("Scenario synthesized by System + AI from Step 1 endpoints and architecture relationships.")).trim();
  return new GeneratedScenarioDraftView(
    projectId,snapshotId,modelId,
    suggestedName.length()>100?suggestedName.substring(0,100):suggestedName,
    "AI_ASSISTED",
    aiModelName,
    summary,
    validSteps,
    sampleInputs,
    inheritedKeys,
    runnableList
  );
 }

 private static int aiPromptRolePriority(DetectedEndpointDTO ep){
  if(ep==null||isHealthProbePath(ep.getPath()))return 6;
  String low=ep.getPath()!=null?ep.getPath().toLowerCase(Locale.ROOT):"/";
  if(isAuxiliaryEndpointPath(low)||low.contains("/batch")||low.endsWith("/deduct")||low.endsWith("/restore"))return 5;
  String role=ep.getJourneyRole()!=null?ep.getJourneyRole():"";
  if("AUTH_ENTRY".equals(role))return 0;
  if("PREREQUISITE_SEED".equals(role))return 1;
  if("CROSS_SERVICE_WORKFLOW".equals(role))return 2;
  if("STATE_VERIFICATION".equals(role))return 3;
  if("CLEANUP_COMPENSATION".equals(role))return 4;
  return 3;
 }

 private String reconcileAiBodyWithDtoSample(String aiBodyStr,String dtoSampleStr){
  if(!isValidJsonObject(dtoSampleStr))return aiBodyStr;
  if(!isValidJsonObject(aiBodyStr))return dtoSampleStr;
  try{
   JsonNode dtoNode=json.readTree(dtoSampleStr);
   JsonNode aiNode=json.readTree(aiBodyStr);
   if(!(dtoNode instanceof ObjectNode merged)||!(aiNode instanceof ObjectNode aiObj))return dtoSampleStr;
   aiObj.fields().forEachRemaining(e->{
    String k=e.getKey();
    JsonNode aiVal=e.getValue();
    if(aiVal==null||aiVal.isNull())return;
    if(!merged.has(k)){
     String lowK=k.toLowerCase(Locale.ROOT);
     if(lowK.equals("shippingaddressid")&&merged.has("shippingAddress"))return;
     if(lowK.startsWith("parent")&&lowK.endsWith("id"))return;
     merged.set(k,aiVal);
     return;
    }
    JsonNode baseVal=merged.get(k);
    if(baseVal.isObject()||baseVal.isArray())return;
    if(baseVal.isNumber()&&!aiVal.isNumber()&&!(aiVal.isTextual()&&aiVal.asText("").contains("{{")))return;
    if(baseVal.isBoolean()&&!aiVal.isBoolean())return;
    if("paymentMethod".equalsIgnoreCase(k)&&"ONLINE".equalsIgnoreCase(aiVal.asText("")))return;
    String lowK=k.toLowerCase(Locale.ROOT);
    if((lowK.contains("expir")||lowK.contains("end"))&&aiVal.isTextual()&&aiVal.asText("").startsWith("2026-01"))return;
    if((lowK.contains("provincecode")||lowK.contains("districtcode")||lowK.contains("wardcode"))&&aiVal.isTextual()&&aiVal.asText("").length()>10)return;
    merged.set(k,aiVal);
   });
   return json.writeValueAsString(merged);
  }catch(Exception ex){
   return dtoSampleStr;
  }
 }

 private static boolean isHealthProbePath(String path){
  if(path==null)return false;
  String low=path.toLowerCase(Locale.ROOT);
  return low.equals("/health")||low.equals("/healthz")||low.equals("/ready")||low.equals("/readyz")
    ||low.equals("/live")||low.equals("/livez")||low.startsWith("/actuator/health")||low.startsWith("/actuator/info");
 }

 private static String resourceRoot(String path){
  if(path==null||path.isBlank())return "/";
  String cleaned=path.replaceAll("\\?.*$","").replaceAll("(?:/\\{[^}/]+\\})+$","");
  return cleaned.isEmpty()?"/":cleaned.toLowerCase(Locale.ROOT);
 }

 private static String resourceEntityToken(String path){
  String root=resourceRoot(path);
  String[] segs=root.split("/");
  for(int i=segs.length-1;i>=0;i--){
   String rawSeg=segs[i];
   if(rawSeg.contains("{")||rawSeg.contains("}"))continue;
   String s=rawSeg.replaceAll("[^a-z0-9]","");
   if(s.isEmpty()||s.startsWith("with")||Set.of("api","v1","v2","v3","public","internal","rest","search","query","checkout","cancel","approve","reject","pay","charge","process","confirm","submit","status","health","actuator","batch","batchinfo","info","preview","deduct","restore","complete","default","me").contains(s))continue;
   if(s.endsWith("ies")&&s.length()>4)s=s.substring(0,s.length()-3)+"y";
   else if(s.endsWith("ses")&&s.length()>4)s=s.substring(0,s.length()-2);
   else if(s.endsWith("s")&&!s.endsWith("ss")&&s.length()>3)s=s.substring(0,s.length()-1);
   return s.toUpperCase(Locale.ROOT);
  }
  return "";
 }

 private static String findMatchingPointer(List<String> pointers,List<String> preferredNames){
  if(pointers==null||pointers.isEmpty())return null;
  for(String pref:preferredNames){
   for(String p:pointers){
    if(p==null)continue;
    String leaf=p.contains("/")?p.substring(p.lastIndexOf('/')+1):p;
    if(leaf.equalsIgnoreCase(pref))return p.startsWith("/")?p:"/"+p;
   }
  }
  return null;
 }

 private static String resolveChainedVariableForParam(String param,String resourceToken,Map<String,String> extractedByResource){
  if(extractedByResource==null||extractedByResource.isEmpty()||param==null)return null;
  String cleanParam=param.replaceAll("[^A-Za-z0-9]","").toLowerCase(Locale.ROOT);
  boolean wantsCode=cleanParam.endsWith("code")||cleanParam.endsWith("sku");
  if(wantsCode&&!resourceToken.isEmpty()&&extractedByResource.containsKey(resourceToken+"_CODE")){
   return extractedByResource.get(resourceToken+"_CODE");
  }
  if((cleanParam.equals("id")||cleanParam.equals("code")||cleanParam.equals("sku"))&&!resourceToken.isEmpty()&&extractedByResource.containsKey(resourceToken)){
   String candidate=extractedByResource.get(resourceToken);
   if(!wantsCode||candidate.endsWith("_CODE")||candidate.endsWith("_SKU"))return candidate;
  }
  for(Map.Entry<String,String> e:extractedByResource.entrySet()){
   String tok=e.getKey().toLowerCase(Locale.ROOT);
   String val=e.getValue();
   if(wantsCode){
    if(cleanParam.equals(tok.replace("_",""))||((cleanParam.equals(tok+"code")||cleanParam.equals(tok+"sku"))&&(val.endsWith("_CODE")||val.endsWith("_SKU")))){
     return val;
    }
   }else if(cleanParam.equals(tok+"id")||cleanParam.equals(tok+"code")||cleanParam.equals(tok+"sku")){
    return val;
   }
  }
  return null;
 }

 private String injectChainedVariablesIntoBody(String jsonBodyStr,Map<String,String> extractedByResource){
  if(extractedByResource==null||extractedByResource.isEmpty()||!isValidJsonObject(jsonBodyStr))return jsonBodyStr;
  try{
   JsonNode root=json.readTree(jsonBodyStr);
   if(!(root instanceof ObjectNode obj))return jsonBodyStr;
   boolean changed=false;
   List<String> fields=new ArrayList<>();
   obj.fieldNames().forEachRemaining(fields::add);
   for(String f:fields){
    JsonNode curVal=obj.get(f);
    if(curVal!=null&&curVal.isTextual()&&curVal.asText("").contains("{{"))continue;
    String low=f.replaceAll("[^A-Za-z0-9]","").toLowerCase(Locale.ROOT);
    for(Map.Entry<String,String> e:extractedByResource.entrySet()){
     String tok=e.getKey().toLowerCase(Locale.ROOT);
     String val=e.getValue();
     boolean wantsCode=low.endsWith("code")||low.endsWith("sku");
     boolean matchesId=!wantsCode&&(low.equals(tok+"id")||(tok.length()>=4&&low.endsWith(tok+"id")&&!low.startsWith("parent")));
     if(wantsCode?((low.equals(tok.replace("_",""))||low.equals(tok+"code")||low.equals(tok+"sku"))&&(val.endsWith("_CODE")||val.endsWith("_SKU"))):matchesId){
      obj.put(f,"{{"+val+"}}");
      changed=true;
      break;
     }
    }
   }
   return changed?json.writeValueAsString(obj):jsonBodyStr;
  }catch(Exception ex){
   return jsonBodyStr;
  }
 }

 private static String inferJourneyPhase(DetectedEndpointDTO ep){
  if(ep==null||isHealthProbePath(ep.getPath()))return "HEALTH_FALLBACK";
  String verb=ep.getMethod()!=null?ep.getMethod().toUpperCase(Locale.ROOT):"GET";
  String low=ep.getPath()!=null?ep.getPath().toLowerCase(Locale.ROOT):"/";
  if("POST".equals(verb)&&(low.contains("/auth/")||low.endsWith("/login")||low.endsWith("/signin")||low.endsWith("/register")||low.endsWith("/signup")||low.endsWith("/token")))return "AUTH_ENTRY";
  if("DELETE".equals(verb))return "CLEANUP_COMPENSATION";
  if("GET".equals(verb))return "STATE_VERIFICATION";
  if(ep.getDownstreamTargets()!=null&&!ep.getDownstreamTargets().isEmpty())return "CROSS_SERVICE_WORKFLOW";
  if("POST".equals(verb)&&!PATH_PARAM_PATTERN.matcher(low).find())return "PREREQUISITE_SEED";
  return "CROSS_SERVICE_WORKFLOW";
 }

 private static String resolveEndpointDomainService(DetectedEndpointDTO ep,Set<String> allowedServices){
  if(ep.getDownstreamTargets()!=null&&!ep.getDownstreamTargets().isEmpty())return ep.getDownstreamTargets().get(0);
  if(ep.getPath()!=null&&allowedServices!=null){
   String[] segs=ep.getPath().toLowerCase(Locale.ROOT).split("/");
   for(String seg:segs){
    if(seg.isEmpty()||seg.equals("api")||seg.matches("v\\d+"))continue;
    for(String svc:allowedServices){
     String lowSvc=svc.toLowerCase(Locale.ROOT);
     if(lowSvc.equals(seg)||lowSvc.startsWith(seg+"-")||lowSvc.endsWith("-"+seg)){
      return svc;
     }
    }
    break;
   }
  }
  return ep.getService();
 }

 private static String inferClusteredJourneyPhase(DetectedEndpointDTO ep,String basePhase){
  if(ep==null||basePhase==null||basePhase.contains(":"))return basePhase;
  if("HEALTH_FALLBACK".equals(basePhase))return "HEALTH_FALLBACK: Service Readiness";
  String low=ep.getPath()!=null?ep.getPath().toLowerCase(Locale.ROOT):"/";
  if("AUTH_ENTRY".equals(basePhase)||low.contains("/identity/")||low.contains("/auth/")||low.contains("/users")||low.contains("/addresses")){
   return basePhase+": Auth & User Identity";
  }
  if(low.contains("/catalog/")||low.contains("/categories")||low.contains("/products")||low.contains("/inventory")||low.contains("/reviews")){
   return basePhase+": Catalog & Inventory";
  }
  if(low.contains("/payment")){
   return basePhase+": Order & Payment Verification";
  }
  if(low.contains("/order")||low.contains("/cart")||low.contains("/checkout")||low.contains("/coupons")){
   return basePhase+": Order & Coupon Checkout";
  }
  if(low.contains("/owner")||low.contains("/pet")||low.contains("/visit")||low.contains("/vet")){
   return basePhase+": Customer & Pet Visits";
  }
  if(low.contains("/organization")||low.contains("/department")||low.contains("/employee")){
   return basePhase+": Organization & Workforce";
  }
  return basePhase;
 }

 private static List<DetectedEndpointDTO> filterCandidatesForGoal(List<DetectedEndpointDTO> candidates,String goal){
  if(candidates==null||candidates.isEmpty()||goal==null||goal.isBlank())return candidates;
  String lowGoal=goal.toLowerCase(Locale.ROOT);
  List<DetectedEndpointDTO> filtered=new ArrayList<>();
  if(lowGoal.contains("auth")&&lowGoal.contains("identity")&&!lowGoal.contains("catalog")&&!lowGoal.contains("order")){
   for(DetectedEndpointDTO ep:candidates){
    String p=ep.getPath()!=null?ep.getPath().toLowerCase(Locale.ROOT):"";
    String s=ep.getService()!=null?ep.getService().toLowerCase(Locale.ROOT):"";
    if(p.contains("/identity/")||p.contains("/auth/")||p.contains("/users")||p.contains("/addresses")||s.contains("identity")||s.contains("auth")){
     filtered.add(ep);
    }
   }
  }else if(lowGoal.contains("catalog")&&lowGoal.contains("inventory")&&!lowGoal.contains("order")){
   for(DetectedEndpointDTO ep:candidates){
    String p=ep.getPath()!=null?ep.getPath().toLowerCase(Locale.ROOT):"";
    String s=ep.getService()!=null?ep.getService().toLowerCase(Locale.ROOT):"";
    if(p.contains("/catalog/")||p.contains("/categories")||p.contains("/products")||p.contains("/inventory")||p.contains("/reviews")||s.contains("catalog")){
     filtered.add(ep);
    }
   }
  }else if((lowGoal.contains("order")||lowGoal.contains("cart")||lowGoal.contains("checkout"))&&!lowGoal.contains("catalog")){
   for(DetectedEndpointDTO ep:candidates){
    String p=ep.getPath()!=null?ep.getPath().toLowerCase(Locale.ROOT):"";
    String s=ep.getService()!=null?ep.getService().toLowerCase(Locale.ROOT):"";
    if(p.endsWith("/register")||p.endsWith("/login")||p.contains("/order/")||p.contains("/orders")||p.contains("/cart")||p.contains("/checkout")||p.contains("/coupons")||p.contains("/payment")||s.contains("order")){
     filtered.add(ep);
    }
   }
  }else if(lowGoal.contains("compensating")||lowGoal.contains("cancellation")||lowGoal.contains("edge-case")){
   for(DetectedEndpointDTO ep:candidates){
    String p=ep.getPath()!=null?ep.getPath().toLowerCase(Locale.ROOT):"";
    String v=ep.getMethod()!=null?ep.getMethod().toUpperCase(Locale.ROOT):"";
    if(p.endsWith("/login")||p.contains("/admin/")||p.contains("/cancel")||p.contains("/status")||p.contains("/deduct")||p.contains("/restore")||p.contains("/validate")||"PUT".equals(v)||"PATCH".equals(v)||"DELETE".equals(v)){
     filtered.add(ep);
    }
   }
  }else if(lowGoal.contains("read-only")||lowGoal.contains("smoke")){
   for(DetectedEndpointDTO ep:candidates){
    if("GET".equalsIgnoreCase(ep.getMethod()))filtered.add(ep);
   }
  }
  if(filtered.isEmpty()){
   Set<String> tokens=new LinkedHashSet<>();
   for(String tok:lowGoal.split("[^a-z0-9-]+")){
    if(tok.length()>=3&&!Set.of("focus","flow","test","verify","service","endpoints","primary","workflow","and","the","for","with","all").contains(tok)){
     tokens.add(tok);
     if(tok.endsWith("-service")&&tok.length()>8)tokens.add(tok.substring(0,tok.length()-8));
    }
   }
   if(!tokens.isEmpty()){
    List<DetectedEndpointDTO> domainMatched=new ArrayList<>();
    for(DetectedEndpointDTO ep:candidates){
     String p=ep.getPath()!=null?ep.getPath().toLowerCase(Locale.ROOT):"";
     String s=ep.getService()!=null?ep.getService().toLowerCase(Locale.ROOT):"";
     String d=ep.getDownstreamTargets()!=null?String.join(" ",ep.getDownstreamTargets()).toLowerCase(Locale.ROOT):"";
     if(tokens.stream().anyMatch(t->s.contains(t)||p.contains("/"+t)||d.contains(t))){
      domainMatched.add(ep);
     }
    }
    if(!domainMatched.isEmpty()){
     boolean needsAuth=domainMatched.stream().anyMatch(ep->Boolean.TRUE.equals(ep.getRequiresAuth()));
     if(needsAuth){
      for(DetectedEndpointDTO ep:candidates){
       String p=ep.getPath()!=null?ep.getPath().toLowerCase(Locale.ROOT):"";
       if("POST".equalsIgnoreCase(ep.getMethod())&&(p.endsWith("/register")||p.endsWith("/login")||p.endsWith("/signin"))&&!domainMatched.contains(ep)){
        filtered.add(ep);
       }
      }
     }
     filtered.addAll(domainMatched);
    }
   }
  }
  return filtered.isEmpty()?candidates:filtered;
 }

 private static String suggestScenarioNameForGoal(String goal){
  if(goal==null||goal.isBlank())return "End-to-End Business Journey Verification";
  String lowGoal=goal.toLowerCase(Locale.ROOT);
  if(lowGoal.contains("auth")&&lowGoal.contains("identity")&&!lowGoal.contains("catalog")&&!lowGoal.contains("order")){
   return "Auth & User Identity Verification Scenario";
  }
  if(lowGoal.contains("catalog")&&lowGoal.contains("inventory")&&!lowGoal.contains("order")){
   return "Catalog & Inventory Verification Scenario";
  }
  if((lowGoal.contains("order")||lowGoal.contains("cart")||lowGoal.contains("checkout"))&&!lowGoal.contains("catalog")){
   return "Order, Cart, Coupon Checkout & Payment Scenario";
  }
  if(lowGoal.contains("compensating")||lowGoal.contains("cancellation")||lowGoal.contains("edge-case")){
   return "Admin & Compensating Workflow Scenario";
  }
  if(lowGoal.contains("read-only")||lowGoal.contains("smoke")){
   return "Read-Only Smoke & Health Verification Scenario";
  }
  return "Custom Goal Architecture Verification Scenario";
 }

 private String buildRepairFeedbackSummary(UUID projectId,UUID repairSessionId,Set<String> allowedServices){
  if(runtimeSessions==null)return "";
  try{
   RuntimeSession target=null;
   if(repairSessionId!=null){
    target=runtimeSessions.findById(repairSessionId).filter(s->s.getProject()!=null&&projectId.equals(s.getProject().getId())).orElse(null);
   }else{
    List<RuntimeSession> recent=runtimeSessions.findByProjectIdOrderByCreatedAtDesc(projectId);
    if(recent!=null){
     target=recent.stream().filter(s->s.getRunnerReceiptJson()!=null&&("FAILED".equalsIgnoreCase(s.getScenarioStatus())||"PARTIAL".equalsIgnoreCase(s.getTraceQuality()))).findFirst().orElse(null);
    }
   }
   if(target==null||target.getRunnerReceiptJson()==null)return "";
   StringBuilder sb=new StringBuilder();
   sb.append("- Session ").append(target.getId()).append(" status=").append(target.getScenarioStatus()).append(", traceQuality=").append(target.getTraceQuality()).append("\n");
   Map<String,String> stepDescById=new HashMap<>();
   if(target.getScenarioConfig()!=null){
    JsonNode cfgSteps=target.getScenarioConfig().path("scenario").path("steps");
    if(cfgSteps.isArray()){
     for(JsonNode cs:cfgSteps){
      String sid=cs.path("id").asText("");
      if(!sid.isBlank())stepDescById.put(sid,cs.path("method").asText("GET")+" "+cs.path("service").asText("")+" "+cs.path("path").asText(""));
     }
    }
   }
   JsonNode stepsNode=target.getRunnerReceiptJson().path("scenario").path("steps");
   if(!stepsNode.isArray())stepsNode=target.getRunnerReceiptJson().path("steps");
   if(stepsNode.isArray()){
    for(JsonNode st:stepsNode){
     String sid=st.path("stepId").asText(st.path("id").asText("?"));
     String routeInfo=stepDescById.containsKey(sid)?" ("+stepDescById.get(sid)+")":"";
     sb.append("  * step ").append(sid).append(routeInfo)
       .append(": outcome=").append(st.path("status").asText("?"))
       .append(", httpStatus=").append(st.path("statusCode").asText("null")).append("\n");
    }
   }
   if(target.getEnrichedModelVersionId()!=null&&modelElements!=null){
    Set<String> unverified=new LinkedHashSet<>();
    for(ModelElement el:modelElements.findByModelVersionId(target.getEnrichedModelVersionId())){
     if("SERVICE_CONTAINER".equalsIgnoreCase(el.getElementType())&&el.getProperties()!=null&&!el.getProperties().path("runtimeObserved").asBoolean(false)){
      String resolved=resolveServiceToAllowed(el.getName(),el.getId(),allowedServices,null,null);
      if(resolved!=null)unverified.add(resolved);
     }
    }
    if(!unverified.isEmpty()){
     sb.append("  * Services with 0 OpenTelemetry spans in that run (prioritize calling or fanning out to these): ").append(String.join(", ",unverified)).append("\n");
    }
   }
   return sb.toString();
  }catch(Exception ex){
   return "";
  }
 }

 private String resolveOrMintPreviewBearerToken(UUID projectId,JsonNode savedProfile,PreflightCheckResponseDTO pre,List<DetectedEndpointDTO> candidates){
  Set<String> roles=new LinkedHashSet<>(List.of("USER","ADMIN"));
  if(candidates!=null){
   for(DetectedEndpointDTO ep:candidates){
    if(ep.getRequiredRoles()!=null)roles.addAll(ep.getRequiredRoles());
   }
  }
  Map<String,String> defaults=collectProjectInputDefaults(projectId,savedProfile,pre);
  return mintSandboxBearerToken(defaults,roles);
 }

 String mintSandboxBearerToken(Map<String,String> envMap,Collection<String> requiredRoles){
  try{
   Set<String> roles=new LinkedHashSet<>(List.of("USER","ADMIN","CUSTOMER"));
   if(requiredRoles!=null){
    for(String r:requiredRoles){if(r!=null&&!r.isBlank())roles.add(r.trim().toUpperCase(Locale.ROOT));}
   }
   List<String> roleWithPrefix=new ArrayList<>();
   for(String r:roles){
    roleWithPrefix.add(r);
    if(!r.startsWith("ROLE_"))roleWithPrefix.add("ROLE_"+r);
   }
   long now=System.currentTimeMillis()/1000L;
   String subjectEmail=(envMap!=null&&envMap.get("__MAVIS_SANDBOX_SUBJECT_EMAIL")!=null&&!envMap.get("__MAVIS_SANDBOX_SUBJECT_EMAIL").isBlank())
     ?envMap.get("__MAVIS_SANDBOX_SUBJECT_EMAIL").trim()
     :"alice@example.org";
   ObjectNode payload=json.createObjectNode();
   payload.put("sub",subjectEmail);
   payload.put("userId",1);
   payload.put("id",1);
   payload.put("username","alice");
   payload.put("preferred_username","alice");
   payload.put("fullName","Alice Sandbox");
   payload.put("email",subjectEmail);
   payload.put("role",roles.contains("ADMIN")?"ADMIN":roles.iterator().next());
   payload.put("scope","read write admin openid profile");
   payload.put("iss","mavis-sandbox");
   payload.put("aud","mavis-sandbox");
   payload.put("iat",now-60);
   payload.put("exp",now+86400);
   ArrayNode rolesArr=payload.putArray("roles");
   roles.forEach(rolesArr::add);
   ArrayNode authArr=payload.putArray("authorities");
   roleWithPrefix.forEach(authArr::add);

   String rsaPrivPem=null;
   String jwtSecret=null;
   if(envMap!=null){
    for(Map.Entry<String,String> e:envMap.entrySet()){
     String k=e.getKey()==null?"":e.getKey().toUpperCase(Locale.ROOT);
     String v=e.getValue();
     if(v==null||v.isBlank())continue;
     if(k.contains("PRIVATE_KEY")&&v.contains("BEGIN PRIVATE KEY")){rsaPrivPem=v;break;}
     if(jwtSecret==null&&(k.contains("JWT")||k.contains("HMAC")||k.contains("TOKEN_SECRET")||k.contains("SIGNING_KEY")||k.equals("SECRET_KEY"))){
      jwtSecret=v;
     }
    }
   }
   Base64.Encoder b64Url=Base64.getUrlEncoder().withoutPadding();
   if(rsaPrivPem!=null){
    String headerJson="{\"alg\":\"RS256\",\"typ\":\"JWT\"}";
    String signingInput=b64Url.encodeToString(headerJson.getBytes(java.nio.charset.StandardCharsets.UTF_8))+"."+b64Url.encodeToString(json.writeValueAsBytes(payload));
    byte[] der=Base64.getMimeDecoder().decode(rsaPrivPem.replaceAll("-----[A-Z ]+-----",""));
    var kf=java.security.KeyFactory.getInstance("RSA");
    var privKey=kf.generatePrivate(new java.security.spec.PKCS8EncodedKeySpec(der));
    var sig=java.security.Signature.getInstance("SHA256withRSA");
    sig.initSign(privKey);
    sig.update(signingInput.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    return "Bearer "+signingInput+"."+b64Url.encodeToString(sig.sign());
   }
   byte[] keyBytes;
   if(jwtSecret!=null){
    byte[] raw=jwtSecret.trim().getBytes(java.nio.charset.StandardCharsets.UTF_8);
    try{
     byte[] dec=Base64.getDecoder().decode(jwtSecret.trim());
     if(dec.length>=32)raw=dec;
    }catch(IllegalArgumentException ignored){}
    keyBytes=raw.length>=32?raw:java.util.Arrays.copyOf(raw,32);
   }else{
    keyBytes="mavis-default-sandbox-hs256-signing-secret-key-2026-verified".getBytes(java.nio.charset.StandardCharsets.UTF_8);
   }
   String headerJson="{\"alg\":\"HS256\",\"typ\":\"JWT\"}";
   String signingInput=b64Url.encodeToString(headerJson.getBytes(java.nio.charset.StandardCharsets.UTF_8))+"."+b64Url.encodeToString(json.writeValueAsBytes(payload));
   javax.crypto.Mac mac=javax.crypto.Mac.getInstance("HmacSHA256");
   mac.init(new javax.crypto.spec.SecretKeySpec(keyBytes,"HmacSHA256"));
   byte[] signature=mac.doFinal(signingInput.getBytes(java.nio.charset.StandardCharsets.UTF_8));
   return "Bearer "+signingInput+"."+b64Url.encodeToString(signature);
  }catch(Exception ex){
   return "Bearer sandbox-verification-token";
  }
 }

 private static boolean requiresElevatedOrInternalRole(String path,DetectedEndpointDTO ep){
  String low=path==null?"":path.toLowerCase(Locale.ROOT);
  if(low.contains("/admin/")||low.contains("/internal")||low.endsWith("/batch-info")
    ||low.endsWith("/deduct")||low.endsWith("/deduct-batch")||low.endsWith("/restore")){
   return true;
  }
  return ep!=null&&ep.getRequiredRoles()!=null&&ep.getRequiredRoles().stream()
    .anyMatch(r->r!=null&&(r.toUpperCase(Locale.ROOT).contains("ADMIN")
      ||r.toUpperCase(Locale.ROOT).contains("STAFF")
      ||r.toUpperCase(Locale.ROOT).contains("SYSTEM")));
 }

 private static boolean isAuxiliaryEndpointPath(String path){
  if(path==null)return false;
  String low=path.toLowerCase(Locale.ROOT);
  return low.contains("/ai/")||low.contains("/genai/")||low.endsWith("/chat")||low.endsWith("/chatclient")
    ||low.equals("/fallback")||low.endsWith("/fallback")||low.contains("/generate-")||low.contains("/suggest-")
    ||low.endsWith("/inactive")||low.endsWith("/invoice-pdf")||low.endsWith("/forgot-password")
    ||low.endsWith("/reset-password")||low.endsWith("/logout")||low.endsWith("/verify-email")
    ||low.endsWith("/google")||low.contains("/oauth")||low.endsWith("/refresh")
    ||low.endsWith("/export-excel")||low.endsWith("/vnpay-return")
    ||low.endsWith("/batch-info")||low.endsWith("/deduct-batch")
    ||low.endsWith("/internal")||low.endsWith("/complete")||low.endsWith("/return-request");
 }

 private static boolean isDiscoveryRegistryService(String service){
  if(service==null)return false;
  String low=service.toLowerCase(Locale.ROOT);
  return low.equals("service-discovery")||low.equals("discovery-service")||low.equals("eureka-server")||low.equals("eureka")||low.equals("config-server");
 }

 private static int countPathParams(String path){
  if(path==null||path.isEmpty())return 0;
  int count=0;
  Matcher m=PATH_PARAM_PATTERN.matcher(path);
  while(m.find())count++;
  return count;
 }

 private static int countForeignKeyFields(String sampleJsonBody){
  if(sampleJsonBody==null||sampleJsonBody.isBlank())return 0;
  String topLevel=sampleJsonBody;
  while(topLevel.contains("[")){
   String next=topLevel.replaceAll("\\[[^\\[\\]]*\\]","");
   if(next.equals(topLevel))break;
   topLevel=next;
  }
  int count=0;
  Matcher m=Pattern.compile("\"([a-zA-Z0-9_]+(?:Id|Code|Sku))\"\\s*:",Pattern.CASE_INSENSITIVE).matcher(topLevel);
  while(m.find()){
   String k=m.group(1).toLowerCase(Locale.ROOT);
   if(!k.equals("id")&&!k.equals("code")&&!k.equals("sku"))count++;
  }
  return count;
 }

 private static int causalEndpointPhase(DetectedEndpointDTO ep,Set<String> crudResourceRoots){
  if(isHealthProbePath(ep.getPath()))return 5;
  String verb=ep.getMethod();
  String low=ep.getPath().toLowerCase(Locale.ROOT);
  if(isAuxiliaryEndpointPath(low))return 4;
  if("POST".equals(verb)&&(low.endsWith("/register")||low.endsWith("/signup")))return -1;
  if("POST".equals(verb)&&(low.contains("/auth/")||low.endsWith("/login")||low.endsWith("/signin")||low.endsWith("/token"))){
   return 0;
  }
  if("POST".equals(verb)){
   String noQuery=low.split("\\?",2)[0];
   String lastSeg=noQuery.contains("/")?noQuery.substring(noQuery.lastIndexOf('/')+1):noQuery;
   boolean actionVerb=Set.of("checkout","cancel","approve","reject","pay","charge","process","confirm","submit","search","query","validate","verify","export","import","close","reopen").contains(lastSeg);
   boolean hasSubResourcePlural=PATH_PARAM_PATTERN.matcher(ep.getPath()).find()&&lastSeg.endsWith("s")&&!lastSeg.endsWith("ss")&&lastSeg.length()>3;
   if(!actionVerb&&!lastSeg.endsWith("}")&&(crudResourceRoots.contains(ep.getService()+":"+resourceRoot(ep.getPath()))||hasSubResourcePlural)){
    return 1;
   }
  }
  if("GET".equals(verb))return 2;
  if("DELETE".equals(verb))return 4;
  return 3;
 }

 private static String resolveServiceToAllowed(String candidate,UUID elementId,Set<String> allowedServices,JsonNode profile,PreflightCheckResponseDTO pre){
  return resolveServiceToAllowed(candidate,elementId,allowedServices,profile,pre,true);
 }

 private static String resolveServiceToAllowed(String candidate,UUID elementId,Set<String> allowedServices,JsonNode profile,PreflightCheckResponseDTO pre,boolean allowFuzzyMatch){
  if(allowedServices==null||allowedServices.isEmpty())return null;
  if(candidate!=null&&allowedServices.contains(candidate))return candidate;
  if(candidate!=null){
   for(String a:allowedServices){if(a.equalsIgnoreCase(candidate))return a;}
  }
  Map<String,String> mappings=new LinkedHashMap<>();
  if(pre!=null&&pre.getRecommendedServiceMappings()!=null)mappings.putAll(pre.getRecommendedServiceMappings());
  if(profile!=null&&profile.path("serviceMappings").isObject()){
   profile.path("serviceMappings").fields().forEachRemaining(e->mappings.put(e.getKey(),e.getValue().asText("")));
  }
  Map<String,String> modelNames=pre!=null&&pre.getModelServiceNames()!=null?pre.getModelServiceNames():Map.of();
  String targetUuid=elementId!=null?elementId.toString():null;
  if(targetUuid==null&&candidate!=null&&!candidate.isBlank()){
   for(Map.Entry<String,String> mn:modelNames.entrySet()){
    if(mn.getValue().equalsIgnoreCase(candidate)||ComposePreflightValidator.cleanServiceCandidate(mn.getValue()).equalsIgnoreCase(candidate)){
     targetUuid=mn.getKey();
     break;
    }
   }
  }
  for(Map.Entry<String,String> m:mappings.entrySet()){
   if(!allowedServices.contains(m.getKey()))continue;
   if((targetUuid!=null&&targetUuid.equalsIgnoreCase(m.getValue()))
     ||(candidate!=null&&!candidate.isBlank()&&candidate.equalsIgnoreCase(m.getValue()))){
    return m.getKey();
   }
  }
  if(allowFuzzyMatch&&candidate!=null&&!candidate.isBlank()){
   return ComposePreflightValidator.matchDetectedService(candidate,new ArrayList<>(allowedServices));
  }
  return null;
 }

 private String inferSampleParamValue(String param){
  return inferSampleParamValue(param,"");
 }

 private String inferSampleParamValue(String param,String pathContext){
  String lower=param==null?"":param.toLowerCase(Locale.ROOT);
  String lowCtx=pathContext==null?"":pathContext.toLowerCase(Locale.ROOT);
  if(lower.contains("uuid")||lower.contains("guid"))return "00000000-0000-0000-0000-000000000001";
  if(lower.contains("coupon")||lowCtx.contains("coupon")||lower.contains("voucher")||lowCtx.contains("voucher")||lower.contains("promo")||lowCtx.contains("promo")){
   return lower.contains("code")?"SAVE10":"1";
  }
  if(lower.contains("code")||lower.contains("sku"))return "SKU-LAPTOP-01";
  if(lower.contains("slug")||lower.contains("name"))return "sample-item-1";
  return "1";
 }

 private String inferSampleJsonBody(String path){
  String lower=path==null?"":path.toLowerCase(Locale.ROOT);
  if(lower.contains("login")||lower.contains("signin"))return "{\"username\":\"alice\",\"email\":\"alice@example.org\",\"password\":\"SandboxPass123!\"}";
  if(lower.contains("register")||lower.contains("signup"))return "{\"name\":\"Alice\",\"username\":\"alice\",\"email\":\"alice@example.org\",\"password\":\"SandboxPass123!\"}";
  if(lower.contains("employee"))return "{\"name\":\"Nguyen Van A\",\"age\":28,\"position\":\"Developer\",\"departmentId\":1,\"organizationId\":1}";
  if(lower.contains("department"))return "{\"name\":\"Engineering\",\"organizationId\":1}";
  if(lower.contains("organization"))return "{\"name\":\"MAVIS Corp\",\"address\":\"Hanoi\"}";
  if(lower.contains("status"))return "{\"status\":\"COMPLETED\"}";
  if(lower.contains("/cart"))return "{\"productId\":1,\"variantId\":1,\"quantity\":1}";
  if(lower.contains("order")||lower.contains("checkout"))return "{\"customerEmail\":\"alice@mavis.io\",\"productCode\":\"SKU-LAPTOP-01\",\"itemId\":\"item-1\",\"quantity\":1}";
  if(lower.contains("payment")||lower.contains("charge"))return "{\"orderId\":1,\"amount\":1299.00,\"paymentMethod\":\"CREDIT_CARD\"}";
  if(lower.contains("categor"))return "{\"name\":\"Tinh dau thien nhien\",\"description\":\"Danh muc tinh dau cao cap\",\"sortOrder\":1,\"isActive\":true}";
  if(lower.contains("coupon"))return "{\"code\":\"WELCOME10\",\"discountValue\":10,\"minOrderAmount\":100000}";
  if(lower.contains("review"))return "{\"productId\":1,\"orderId\":1,\"rating\":5,\"comment\":\"San pham chat luong tot\"}";
  if(lower.contains("address"))return "{\"recipientName\":\"Nguyen Van A\",\"receiverName\":\"Nguyen Van A\",\"recipientPhone\":\"0901234567\",\"phone\":\"0901234567\",\"provinceCode\":\"79\",\"provinceName\":\"TP.HCM\",\"province\":\"TP.HCM\",\"districtName\":\"Quan 1\",\"district\":\"Quan 1\",\"wardName\":\"Ben Nghe\",\"ward\":\"Ben Nghe\",\"streetAddress\":\"123 Le Loi\",\"isDefault\":true}";
  if(lower.contains("product")||lower.contains("catalog")||lower.contains("inventory")||lower.contains("item"))return "{\"code\":\"SKU-MOUSE-02\",\"name\":\"Wireless Mouse\",\"price\":49.00,\"stock\":20,\"quantity\":1,\"categoryId\":1}";
  if(lower.contains("user")||lower.contains("account")||lower.contains("customer"))return "{\"name\":\"Test User\",\"email\":\"user@example.org\"}";
  return "{\"name\":\"sample-entity\",\"organizationId\":1,\"departmentId\":1}";
 }

 private boolean isValidJsonObject(String text){
  if(text==null||text.isBlank())return false;
  try{
   JsonNode node=json.readTree(text);
   return node!=null&&node.isObject();
  }catch(Exception e){
   return false;
  }
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

 private BusinessException preflightFailed(String message) {
  return new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,"PREFLIGHT_FAILED",message);
 }

 @Transactional
 public RuntimeSessionResponseDTO start(UUID id,StartRequest r){var guidedProject=lock(id);if(!r.approved())throw new BusinessException(ErrorCode.BAD_REQUEST,"Explicit approval required");
  var c=configurations.findById(id).orElseThrow(()->new BusinessException(ErrorCode.BAD_REQUEST,"Save runtime configuration first"));var s=scenarios.findById(r.scenarioId()).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));
  if(!id.equals(s.getProjectId())||!r.snapshotId().equals(c.getSourceSnapshotId()))throw new BusinessException(ErrorCode.BAD_REQUEST,"Pinned planning scope mismatch");
  if(c.getRevision()!=r.configurationRevision()||s.getRevision()!=r.scenarioRevision())throw new BusinessException(ErrorCode.CONFLICT);
  ArrayNode actionNodes=json.createArrayNode();
  if(r.infrastructureActions()!=null) {
   if(r.interactiveStudio()&&!r.infrastructureActions().isEmpty())
    throw new BusinessException(ErrorCode.BAD_REQUEST,"Interactive Studio accepts actions after session startup.");
   for(InfrastructureActionRequest action:r.infrastructureActions()){
    String type=action==null||action.action()==null?"":action.action().trim().toUpperCase(Locale.ROOT);
    String service=action==null||action.service()==null?"":action.service().trim();
    if(!Set.of("STOP","START","SCALE").contains(type)||service.isBlank())
     throw new BusinessException(ErrorCode.BAD_REQUEST,"Infrastructure action must target a pinned application service");
    if("SCALE".equals(type)&&(action.replicas()==null||action.replicas()<1||action.replicas()>8))
     throw new BusinessException(ErrorCode.BAD_REQUEST,"REPLICA_BOUNDS_EXCEEDED");
    ObjectNode node=actionNodes.addObject().put("action",type).put("service",service);
    if(action.replicas()!=null)node.put("replicas",action.replicas());
   }
  }
  var pre=runtime.runComposePreflight(c.getSourceSnapshotId());
  if(!pre.isCompatible())throw preflightFailed("The source Compose was rejected.");
  ObjectNode profileCopy=c.getProfile().deepCopy();
  String effectiveCompose=profileCopy.path("sandboxCompose").asText("");
  if(effectiveCompose.isBlank()) {
   boolean unresolved=pre.getUnresolvableRunnerIssues()!=null&&!pre.getUnresolvableRunnerIssues().isEmpty();
   if(unresolved)throw preflightFailed("The source Compose has unresolved Runner requirements.");
   effectiveCompose=pre.getSandboxComposeYaml();
   if((effectiveCompose==null||effectiveCompose.isBlank())&&pre.getRunnerIssues()!=null&&!pre.getRunnerIssues().isEmpty())
    throw preflightFailed("The source Compose is incompatible with the Runner.");
  }
  if(effectiveCompose!=null&&!effectiveCompose.isBlank()) {
   if(composeValidator!=null) {
    var effective=composeValidator.validate(effectiveCompose,Map.of());
    if(!effective.isCompatible()||(effective.getRunnerIssues()!=null&&!effective.getRunnerIssues().isEmpty()))
     throw preflightFailed("The prepared Compose is incompatible with the Runner.");
   }
   profileCopy.put("sandboxCompose",effectiveCompose);
  } else {
   profileCopy.remove("sandboxCompose");
  }
  var apps=profileCopy.path("applications");
  if(apps instanceof ObjectNode appsObj){
   List<String> rawAppKeys=new ArrayList<>();
   appsObj.fieldNames().forEachRemaining(rawAppKeys::add);
   for(String k:rawAppKeys){
    if(ComposePreflightValidator.isInfrastructureService(k,"")&&appsObj.size()>1){
     appsObj.remove(k);
    }else if(appsObj.get(k) instanceof ObjectNode an&&!an.has("allowClientErrorReadiness")){
     an.put("allowClientErrorReadiness",true);
    }
   }
  }
  Set<String> appKeys=new LinkedHashSet<>();
  if(apps.isObject())apps.fieldNames().forEachRemaining(appKeys::add);
  Set<String> knownComposeOrDetected=new LinkedHashSet<>();
  if(pre.getComposeServices()!=null)knownComposeOrDetected.addAll(pre.getComposeServices());
  if(pre.getDetectedServices()!=null)knownComposeOrDetected.addAll(pre.getDetectedServices());
  ArrayNode normalizedSteps=s.getSteps().deepCopy();
  for(JsonNode step:normalizedSteps){
   String rawSvc=step.path("service").asText("");
   String resolvedSvc=appKeys.contains(rawSvc)?rawSvc:resolveServiceToAllowed(rawSvc,null,appKeys,c.getProfile(),pre,true);
   if(resolvedSvc==null&&appKeys.size()==1&&!rawSvc.isBlank()&&(pre.getInfrastructureServices()==null||!pre.getInfrastructureServices().contains(rawSvc))){
    String onlyApp=appKeys.iterator().next();
    if(pre.getModelServiceNames()!=null&&pre.getModelServiceNames().values().stream().anyMatch(mn->mn.equalsIgnoreCase(rawSvc))){
     resolvedSvc=onlyApp;
    }
   }
   if(resolvedSvc==null||!apps.has(resolvedSvc)||(!knownComposeOrDetected.isEmpty()&&!knownComposeOrDetected.contains(resolvedSvc))){
    throw new BusinessException(ErrorCode.BAD_REQUEST,"Scenario service is not in the pinned Compose/profile");
   }
   if(!resolvedSvc.equals(rawSvc)&&step instanceof ObjectNode stepObj){
    stepObj.put("service",resolvedSvc);
   }
  }
  normalizeAndBindScenarioVariables(normalizedSteps,pre);
  // Values the containers need beyond Compose: edited env, relocated compose secrets, user secrets and per-service sandbox secrets.
  var execEnv=buildExecutionEnvironment(id,c.getProfile(),pre,apps);
  Map<String,String> step1Defaults=collectProjectInputDefaults(id,c.getProfile(),pre);
  Map<String,String> protectedEnv=new LinkedHashMap<>(execEnv.protectedEnvironment());
  if(r.environment()!=null){
   r.environment().forEach((k,v)->{
    if(k!=null&&k.matches("[A-Z][A-Z0-9_]{0,63}")&&v!=null&&v.length()<=16000&&v.indexOf('\0')<0){
     protectedEnv.put(k,v);
    }
   });
  }
  ensureScenarioStepReferences(normalizedSteps,pre,step1Defaults,protectedEnv);
  Map<String,String> boundedProtectedEnv=capProtectedEnvironment(protectedEnv,execEnv.bindings(),normalizedSteps);

  var config=json.createObjectNode();
  profileCopy.remove("sealedInputs");
  if(!profileCopy.hasNonNull("memoryMiB"))profileCopy.put("memoryMiB",512);
  if(!profileCopy.hasNonNull("collectorImage")&&runnerCollectorImage!=null&&!runnerCollectorImage.isBlank())profileCopy.put("collectorImage",runnerCollectorImage.trim());
  if(!profileCopy.hasNonNull("scenarioRunnerImage")&&runnerScenarioImage!=null&&!runnerScenarioImage.isBlank())profileCopy.put("scenarioRunnerImage",runnerScenarioImage.trim());
  if(profileCopy.has("approvedForLocalPoc")&&!profileHasPinnedRunnerImages(profileCopy)){
   throw new BusinessException(ErrorCode.BAD_REQUEST,"Sandbox runner images are not configured. An operator must set MAVIS_RUNNER_COLLECTOR_IMAGE and MAVIS_RUNNER_SCENARIO_RUNNER_IMAGE to digest-pinned images");
  }
  if(!execEnv.bindings().isEmpty())profileCopy.set("environmentBindings",execEnv.bindings());
  config.set("profile",profileCopy);
  var scenario=config.putObject("scenario");scenario.set("steps",normalizedSteps);scenario.put("timeoutSeconds",settings.requireProfile(c.getProfileId()).timeoutSeconds());
   config.put("interactiveStudio",r.interactiveStudio());
   for(JsonNode action:actionNodes){
    if(!appKeys.contains(action.path("service").asText()))
     throw new BusinessException(ErrorCode.BAD_REQUEST,"Infrastructure action must target a pinned application service");
   }
   config.set("infrastructureActions",actionNodes);
  var planning=config.putObject("planning");planning.put("scenarioId",s.getId().toString());planning.put("scenarioRevision",s.getRevision());planning.put("configurationRevision",c.getRevision());
  Map<String,String> confirmedMappings=resolveConfirmedServiceMappings(c.getModelVersionId(),c.getProfile(),pre,apps);
  if (!r.interactiveStudio()) {
   profileCopy.remove("studioTopology");
  } else {
   boolean guidedStudentStudio=isGuidedStudentProject(guidedProject);
   if(guidedStudentStudio) {
    profileCopy.remove("studioTopology");
    var assignment=guidedProject.getAssignment();
    var frozen=assignment==null?null:assignment.getStudioTopologySnapshot();
    if(frozen==null || !frozen.isObject()) {
     throw new BusinessException(ErrorCode.BAD_REQUEST,"Lab Studio topology is not frozen; ask the lecturer to freeze it before students start Studio");
    }
    profileCopy.set("studioTopology",frozen.deepCopy());
   }
   Set<String> studioServices=new java.util.HashSet<>(confirmedMappings.keySet());
   studioServices.removeIf(service -> !apps.has(service));
   var preparedTopology=PreparedStudioTopology.read(profileCopy,studioServices,json);
   if(guidedStudentStudio && preparedTopology==null) {
    throw new BusinessException(ErrorCode.BAD_REQUEST,"Lab Studio topology is missing or invalid for the confirmed services");
   }
   if(preparedTopology!=null)profileCopy.set("studioTopology",preparedTopology);
  }
  var createBuilder=RuntimeSessionCreateRequest.builder()
   .projectId(id)
   .sourceSnapshotId(c.getSourceSnapshotId())
   .modelVersionId(c.getModelVersionId())
   .profileName(c.getProfileId())
   .scenarioName(s.getName())
   .assignmentId(r.assignmentId())
   .scenarioConfig(config);
  if(!confirmedMappings.isEmpty())createBuilder.confirmedServiceMappings(confirmedMappings);
  var created=runtime.createRuntimeSession(createBuilder.build());

  // Fails (and rolls back the session) when MAVIS_RUNTIME_ENVIRONMENT_KEY is missing instead of silently dropping inputs.
  if(!boundedProtectedEnv.isEmpty())environments.store(created.getId(),boundedProtectedEnv);
  return runtime.approveAndStartSession(created.getId());
 }

 private static boolean isGuidedStudentProject(Project project) {
  return project.getWorkspace()!=null && project.getWorkspace().isCourseMode()
      && "STUDENT_WORKING".equals(project.getProjectType());
 }

 private static final Pattern SINGLE_BRACE_PATH_PARAM=Pattern.compile("(?<!\\{)\\{([^{}/]+)}(?!})");
 private static final Pattern SCENARIO_VAR_PATTERN=Pattern.compile("\\{\\{([a-zA-Z][a-zA-Z0-9_]*)}}");

 private static String toScenarioEnvKey(String raw){
  String s=(raw==null?"VAR":raw).replaceAll("([a-z0-9])([A-Z])","$1_$2").replaceAll("[^A-Za-z0-9_]","_").toUpperCase(Locale.ROOT).replaceAll("_+","_").replaceAll("^_|_$","");
  if(s.isEmpty()||!Character.isLetter(s.charAt(0)))s="V_"+s;
  return s.length()>64?s.substring(0,64):s;
 }

 private static void collectUnboundScenarioVars(String text,Set<String> available,Map<String,String> rewrites){
  if(text==null||text.isEmpty())return;
  Matcher m=SCENARIO_VAR_PATTERN.matcher(text);
  while(m.find()){
   String varName=m.group(1);
   if(!available.contains(varName)&&!rewrites.containsKey(varName)){
    rewrites.put(varName,toScenarioEnvKey(varName));
   }
  }
 }

 private static void applyScenarioVarRewrites(ObjectNode step,String fromVar,String toVar){
  if(fromVar==null||toVar==null||fromVar.equals(toVar))return;
  String from="{{"+fromVar+"}}",to="{{"+toVar+"}}";
  if(step.path("path").isTextual())step.put("path",step.get("path").asText().replace(from,to));
  if(step.hasNonNull("jsonBody")&&step.get("jsonBody").isTextual())step.put("jsonBody",step.get("jsonBody").asText().replace(from,to));
  if(step.path("headers").isObject()){
   ObjectNode hdrs=(ObjectNode)step.get("headers");
   List<String> hNames=new ArrayList<>();
   hdrs.fieldNames().forEachRemaining(hNames::add);
   for(String hn:hNames){
    if(hdrs.path(hn).isTextual())hdrs.put(hn,hdrs.get(hn).asText().replace(from,to));
   }
  }
 }

 private void normalizeAndBindScenarioVariables(ArrayNode steps,PreflightCheckResponseDTO pre){
  if(steps==null)return;
  List<DetectedEndpointDTO> detList=(pre!=null&&pre.getDetectedEndpoints()!=null)?pre.getDetectedEndpoints():List.of();
  Map<String,DetectedEndpointDTO> detLookup=new LinkedHashMap<>();
  for(DetectedEndpointDTO ep:detList){
   if(ep==null)continue;
   detLookup.putIfAbsent(ep.getService()+":"+ep.getMethod()+":"+ep.getPath(),ep);
   detLookup.putIfAbsent(canonicalRouteKey(ep.getService(),ep.getMethod(),ep.getPath()),ep);
  }
  Set<String> seenAuthRoutes=new HashSet<>();
  for(int i=0;i<steps.size();i++){
   JsonNode n=steps.get(i);
   String m=n.path("method").asText("").toUpperCase(Locale.ROOT);
   String p=n.path("path").asText("").toLowerCase(Locale.ROOT);
   if("POST".equals(m)&&(p.endsWith("/register")||p.endsWith("/login")||p.endsWith("/signin")||p.endsWith("/signup"))
     &&!seenAuthRoutes.add(n.path("service").asText("")+":"+m+":"+p)&&steps.size()>1){
    steps.remove(i--);
   }
  }
  Set<String> available=new HashSet<>();
  Map<String,String> aliasByOrig=new LinkedHashMap<>();
  int safeAliasSeq=0;
  for(JsonNode node:steps){
   if(!(node instanceof ObjectNode step))continue;
   String stepSvc=step.path("service").asText("");
   String stepVerb=step.path("method").asText("GET").toUpperCase(Locale.ROOT);
   String stepPath=step.path("path").asText("");
   if(!detList.isEmpty()&&Set.of("POST","PUT","PATCH").contains(stepVerb)
     &&matchCandidateEndpoint(stepSvc,stepVerb,stepPath,detLookup,detList)==null){
    DetectedEndpointDTO getCand=matchCandidateEndpoint(stepSvc,"GET",stepPath,detLookup,detList);
    if(getCand!=null){
     stepVerb="GET";
     step.put("method","GET");
     step.put("expectedStatus",getCand.getExpectedStatus()!=null?getCand.getExpectedStatus():200);
     step.remove("bodyReference");
     step.remove("jsonBody");
    }
   }
   DetectedEndpointDTO matchedEpForStep=matchCandidateEndpoint(stepSvc,stepVerb,stepPath,detLookup,detList);
   if("POST".equalsIgnoreCase(stepVerb)&&stepPath.toLowerCase(Locale.ROOT).endsWith("/coupons")){
    ObjectNode ext=step.path("extract").isObject()?(ObjectNode)step.get("extract"):step.putObject("extract");
    String couponIdPtr=(matchedEpForStep!=null&&matchedEpForStep.getResponseFields()!=null)
      ?findMatchingPointer(matchedEpForStep.getResponseFields(),List.of("id","couponId"))
      :null;
    if(!ext.has("COUPON_ID"))ext.put("COUPON_ID",couponIdPtr!=null?couponIdPtr:"/id");
   }
   if(step.path("path").isTextual()){
    String rawPath=step.get("path").asText();
    if(rawPath.toLowerCase(Locale.ROOT).contains("coupon")&&rawPath.endsWith("/SKU-LAPTOP-01")){
     rawPath=rawPath.substring(0,rawPath.length()-"/SKU-LAPTOP-01".length())+(available.contains("COUPON_ID")?"/{{COUPON_ID}}":"/1");
    }
    Matcher single=SINGLE_BRACE_PATH_PARAM.matcher(rawPath);
    StringBuilder sb=new StringBuilder();
    while(single.find()){
     single.appendReplacement(sb,Matcher.quoteReplacement(inferSampleParamValue(single.group(1),rawPath)));
    }
    single.appendTail(sb);
    step.put("path",sb.toString());
   }
   for(Map.Entry<String,String> prior:aliasByOrig.entrySet()){
    if(!available.contains(prior.getKey()))applyScenarioVarRewrites(step,prior.getKey(),prior.getValue());
   }
   if(step.path("environmentVariables").isObject()){
    step.path("environmentVariables").fieldNames().forEachRemaining(available::add);
   }
   Map<String,String> rewrites=new LinkedHashMap<>();
   collectUnboundScenarioVars(step.path("path").asText(""),available,rewrites);
   if(step.hasNonNull("jsonBody")&&step.get("jsonBody").isTextual()){
    collectUnboundScenarioVars(step.get("jsonBody").asText(),available,rewrites);
   }
   if(step.path("headers").isObject()){
    step.path("headers").fields().forEachRemaining(e->collectUnboundScenarioVars(e.getValue().asText(""),available,rewrites));
   }
   if(!rewrites.isEmpty()){
    ObjectNode envVars=(step.has("environmentVariables")&&step.get("environmentVariables").isObject())
      ?(ObjectNode)step.get("environmentVariables")
      :step.putObject("environmentVariables");
    for(Map.Entry<String,String> rw:rewrites.entrySet()){
     String orig=rw.getKey();
     String envKey=rw.getValue();
     String aliasKey=envKey;
     if(SecretRedactor.isSensitiveKey(orig)||SecretRedactor.isSensitiveKey(envKey)){
      do{
       aliasKey="V_REF_"+(safeAliasSeq++);
      }while(envVars.has(aliasKey)||available.contains(aliasKey));
     }
     if(envVars.size()<64&&!envVars.has(aliasKey)){
      envVars.put(aliasKey,envKey);
     }
     available.add(aliasKey);
     aliasByOrig.put(orig,aliasKey);
     applyScenarioVarRewrites(step,orig,aliasKey);
    }
   }
   if(step.path("extract").isObject()){
    ObjectNode ext=(ObjectNode)step.get("extract");
    List<String> extKeys=new ArrayList<>();
    ext.fieldNames().forEachRemaining(extKeys::add);
    for(String ek:extKeys){
     String ptr=ext.path(ek).asText("").trim();
     if(ptr.startsWith("$."))ptr="/"+ptr.substring(2).replace('.','/');
     else if(!ptr.isEmpty()&&!ptr.startsWith("/"))ptr="/"+ptr.replace('.','/');
     if(ek.contains("TOKEN")&&("/status".equalsIgnoreCase(ptr)||"/message".equalsIgnoreCase(ptr))){
      ptr="/data/accessToken|/accessToken|/token|/jwt";
     }else if(matchedEpForStep!=null&&matchedEpForStep.getResponseFields()!=null&&!matchedEpForStep.getResponseFields().isEmpty()
       &&!ptr.contains("|")&&!matchedEpForStep.getResponseFields().contains(ptr)){
      String leaf=ptr.contains("/")?ptr.substring(ptr.lastIndexOf('/')+1):ptr;
      String snapped=findMatchingPointer(matchedEpForStep.getResponseFields(),List.of(leaf,"id","orderCode","code","accessToken","token"));
      if(snapped!=null)ptr=snapped;
     }
     if("GET".equalsIgnoreCase(stepVerb)&&ptr.startsWith("/data/")&&!ptr.contains("|")){
      ptr=ptr+"|/"+ptr.substring(6);
     }
     if(!ptr.isEmpty())ext.put(ek,ptr);
     if(!ek.isBlank())available.add(ek);
    }
   }
  }
 }

 private Map<String,String> collectProjectInputDefaults(UUID projectId,JsonNode profile,PreflightCheckResponseDTO pre){
  Map<String,String> defaults=new LinkedHashMap<>();
  if(pre!=null&&pre.getRequiredEnvVars()!=null){
   for(var v:pre.getRequiredEnvVars()){
    if(v!=null&&v.getName()!=null&&v.getDefaultValue()!=null&&!v.getDefaultValue().isBlank()){
     defaults.put(v.getName(),v.getDefaultValue());
    }
   }
  }
  if(profile!=null&&profile.path("environmentVariables").isObject()){
   profile.path("environmentVariables").fields().forEachRemaining(e->{
    String val=e.getValue().asText("");
    if(!val.isBlank())defaults.put(e.getKey(),val);
   });
  }
  if(profile!=null&&profile.hasNonNull("sealedInputs")){
   Map<String,String> unsealed=environments.unsealProjectInputs(projectId,profile.get("sealedInputs").asText(""));
   if(unsealed!=null)unsealed.forEach((k,v)->{if(v!=null&&!v.isBlank())defaults.put(k,v);});
  }
  Map<String,String> step1=runtime.getProjectExecutionEnvironment(projectId);
  if(step1!=null)step1.forEach((k,v)->{if(v!=null&&!v.isBlank())defaults.put(k,v);});
  return defaults;
 }

 private static Map<String,String> capProtectedEnvironment(Map<String,String> protectedEnv,ObjectNode bindings,ArrayNode steps){
  Map<String,String> capped;
  if(protectedEnv.size()<=64){
   capped=protectedEnv;
  }else{
   Set<String> required=new LinkedHashSet<>();
   if(steps!=null){
    for(JsonNode step:steps){
     if(step==null||!step.isObject())continue;
     if(step.hasNonNull("bodyReference"))required.add(step.get("bodyReference").asText(""));
     if(step.path("environmentVariables").isObject())step.path("environmentVariables").elements().forEachRemaining(v->required.add(v.asText("")));
     if(step.path("envHeaders").isArray())step.path("envHeaders").forEach(h->required.add(h.path("reference").asText("")));
     if(step.path("secretHeaders").isObject())step.path("secretHeaders").elements().forEachRemaining(v->required.add(v.asText("")));
    }
   }
   if(bindings!=null&&bindings.isObject()){
    bindings.elements().forEachRemaining(arr->{
     if(arr.isArray())arr.forEach(b->{String ref=b.path("reference").asText("");if(!ref.isBlank())required.add(ref);});
    });
   }
   capped=new LinkedHashMap<>();
   for(String k:required){
    if(capped.size()>=64)break;
    if(protectedEnv.containsKey(k)&&k.matches("[A-Z][A-Z0-9_]{0,63}"))capped.put(k,protectedEnv.get(k));
   }
   for(Map.Entry<String,String> e:protectedEnv.entrySet()){
    if(capped.size()>=64)break;
    if(e.getKey()!=null&&e.getKey().matches("[A-Z][A-Z0-9_]{0,63}"))capped.putIfAbsent(e.getKey(),e.getValue());
   }
  }
  if(bindings!=null&&bindings.isObject()){
   List<String> emptyServices=new ArrayList<>();
   bindings.fields().forEachRemaining(svcEntry->{
    if(svcEntry.getValue() instanceof ArrayNode arr){
     for(int i=arr.size()-1;i>=0;i--){
      String ref=arr.get(i).path("reference").asText("");
      if(ref.isBlank()||!capped.containsKey(ref))arr.remove(i);
     }
     if(arr.isEmpty())emptyServices.add(svcEntry.getKey());
    }
   });
   emptyServices.forEach(bindings::remove);
  }
  return capped;
 }

 private static String canonicalRouteKey(String service,String method,String path){
  String cleanPath=(path==null?"/":path).replaceAll("\\{\\{[^}]+}}|\\{[^}/]+}","{}");
  return (ComposePreflightValidator.cleanServiceCandidate(service)+":"+(method==null?"GET":method)+":"+cleanPath).toLowerCase(Locale.ROOT);
 }

 private static DetectedEndpointDTO matchCandidateEndpoint(String svc,String verb,String rawPath,Map<String,DetectedEndpointDTO> endpointLookup,List<DetectedEndpointDTO> candidates){
  if(svc==null||verb==null||rawPath==null)return null;
  DetectedEndpointDTO exact=endpointLookup.get(svc+":"+verb+":"+rawPath);
  if(exact!=null)return exact;
  DetectedEndpointDTO canonical=endpointLookup.get(canonicalRouteKey(svc,verb,rawPath));
  if(canonical!=null)return canonical;
  String reqNoQuery=rawPath.split("\\?",2)[0];
  String[] reqSegs=reqNoQuery.split("/");
  for(DetectedEndpointDTO ep:candidates){
   if(!svc.equalsIgnoreCase(ep.getService())||!verb.equalsIgnoreCase(ep.getMethod())||ep.getPath()==null)continue;
   String epNoQuery=ep.getPath().split("\\?",2)[0];
   String[] epSegs=epNoQuery.split("/");
   if(epSegs.length!=reqSegs.length)continue;
   boolean allMatch=true;
   for(int i=0;i<epSegs.length;i++){
    String es=epSegs[i],rs=reqSegs[i];
    if(es.startsWith("{")&&es.endsWith("}")){
     if(rs.isEmpty()){allMatch=false;break;}
    }else if(!es.equalsIgnoreCase(rs)){
     allMatch=false;break;
    }
   }
   if(allMatch)return ep;
  }
  return null;
 }

 private void ensureScenarioStepReferences(ArrayNode steps,PreflightCheckResponseDTO pre,Map<String,String> step1Defaults,Map<String,String> protectedEnv){
  if(steps==null||protectedEnv==null)return;
  Map<String,String> detectedBodyByRoute=new HashMap<>();
  Set<String> allRequiredRoles=new LinkedHashSet<>();
  if(pre!=null&&pre.getDetectedEndpoints()!=null){
   for(DetectedEndpointDTO ep:pre.getDetectedEndpoints()){
    if(ep!=null&&isValidJsonObject(ep.getSampleJsonBody())){
     detectedBodyByRoute.putIfAbsent((ep.getService()+":"+ep.getMethod()+":"+ep.getPath()).toLowerCase(Locale.ROOT),ep.getSampleJsonBody());
     detectedBodyByRoute.putIfAbsent(canonicalRouteKey(ep.getService(),ep.getMethod(),ep.getPath()),ep.getSampleJsonBody());
    }
    if(ep!=null&&ep.getRequiredRoles()!=null)allRequiredRoles.addAll(ep.getRequiredRoles());
   }
  }
  String registeredEmail=null;
  String registeredPassword=null;
  for(JsonNode step:steps){
   if(step==null||!step.isObject())continue;
   String p=step.path("path").asText("").toLowerCase(Locale.ROOT);
   String bodyRef=step.path("bodyReference").asText("");
   String rawBody=!bodyRef.isBlank()?protectedEnv.getOrDefault(bodyRef,step1Defaults!=null?step1Defaults.get(bodyRef):null):step.path("jsonBody").asText(null);
   if(isValidJsonObject(rawBody)&&(p.endsWith("/register")||p.endsWith("/signup")||p.endsWith("/login")||p.endsWith("/signin"))){
    try{
     JsonNode bNode=json.readTree(rawBody);
     if(p.endsWith("/register")||p.endsWith("/signup")){
      if(bNode.hasNonNull("email")&&!bNode.get("email").asText("").isBlank())registeredEmail=bNode.get("email").asText().trim();
      if(bNode.hasNonNull("password")&&!bNode.get("password").asText("").isBlank())registeredPassword=bNode.get("password").asText();
     }else if((p.endsWith("/login")||p.endsWith("/signin"))&&bNode instanceof ObjectNode loginObj){
      boolean changed=false;
      if(registeredEmail!=null&&loginObj.has("email")&&!registeredEmail.equals(loginObj.path("email").asText(""))){
       loginObj.put("email",registeredEmail);changed=true;
      }else if(registeredEmail==null&&loginObj.hasNonNull("email")&&!loginObj.get("email").asText("").isBlank()){
       registeredEmail=loginObj.get("email").asText().trim();
      }
      if(registeredPassword!=null&&loginObj.has("password")&&!registeredPassword.equals(loginObj.path("password").asText(""))){
       loginObj.put("password",registeredPassword);changed=true;
      }
      if(changed&&!bodyRef.isBlank())protectedEnv.put(bodyRef,json.writeValueAsString(loginObj));
     }
    }catch(Exception ignored){}
   }
  }
  Map<String,String> mintEnv=new LinkedHashMap<>(protectedEnv);
  if(registeredEmail!=null)mintEnv.put("__MAVIS_SANDBOX_SUBJECT_EMAIL",registeredEmail);
  String mintedBearer=mintSandboxBearerToken(mintEnv,allRequiredRoles);
  if(protectedEnv.containsKey("SANDBOX_BEARER_TOKEN")&&(step1Defaults==null||!step1Defaults.containsKey("SANDBOX_BEARER_TOKEN"))){
   protectedEnv.put("SANDBOX_BEARER_TOKEN",mintedBearer);
  }
  Set<String> availableVars=new HashSet<>();
  for(JsonNode step:steps){
   if(step==null||!step.isObject())continue;
   ObjectNode stepObj=(ObjectNode)step;
   String svc=step.path("service").asText("");
   String method=step.path("method").asText("GET");
   String path=step.path("path").asText("/");
   if(step.path("environmentVariables").isObject()){
    step.path("environmentVariables").fieldNames().forEachRemaining(availableVars::add);
   }
   if(step.hasNonNull("bodyReference")){
    String bodyRef=step.get("bodyReference").asText("");
    String existingBody=protectedEnv.get(bodyRef);
    boolean isGenericOrderFallback="{\"customerEmail\":\"alice@mavis.io\",\"productCode\":\"SKU-LAPTOP-01\",\"quantity\":1}".equals(existingBody)
      &&!path.toLowerCase(Locale.ROOT).contains("order")&&!path.toLowerCase(Locale.ROOT).contains("checkout");
    if(!bodyRef.isBlank()&&(!isValidJsonObject(existingBody)||isGenericOrderFallback)){
     String defBody=step1Defaults!=null?step1Defaults.get(bodyRef):null;
     String fallback=isValidJsonObject(defBody)?defBody:detectedBodyByRoute.get((svc+":"+method+":"+path).toLowerCase(Locale.ROOT));
     if(fallback==null)fallback=detectedBodyByRoute.get(canonicalRouteKey(svc,method,path));
     protectedEnv.put(bodyRef,isValidJsonObject(fallback)?fallback:inferSampleJsonBody(path));
    }
    // Dual-compatibility with pinned ScenarioRunnerImage: when body payload uses {{VAR}}, promote to inline jsonBody so Replace(body.RootElement) executes
    String resolvedBody=protectedEnv.get(bodyRef);
    if(isValidJsonObject(resolvedBody)&&resolvedBody.contains("SKU-LAPTOP-01")&&path.toLowerCase(Locale.ROOT).contains("address")){
     resolvedBody=resolvedBody.replace("\"provinceCode\":\"SKU-LAPTOP-01\"","\"provinceCode\":\"79\"");
     protectedEnv.put(bodyRef,resolvedBody);
    }
    if(resolvedBody!=null&&SCENARIO_VAR_PATTERN.matcher(resolvedBody).find()){
     try{
      JsonNode parsedBody=json.readTree(resolvedBody);
      if(parsedBody!=null&&parsedBody.isObject()&&parsedBody.equals(SecretRedactor.redactJson(parsedBody))){
       Map<String,String> bodyRewrites=new LinkedHashMap<>();
       collectUnboundScenarioVars(resolvedBody,availableVars,bodyRewrites);
       if(!bodyRewrites.isEmpty()){
        ObjectNode envVars=(stepObj.has("environmentVariables")&&stepObj.get("environmentVariables").isObject())
          ?(ObjectNode)stepObj.get("environmentVariables")
          :stepObj.putObject("environmentVariables");
        for(Map.Entry<String,String> rw:bodyRewrites.entrySet()){
         String orig=rw.getKey(),envKey=rw.getValue();
         if(envVars.size()<64&&!envVars.has(envKey))envVars.put(envKey,envKey);
         availableVars.add(envKey);
         if(!orig.equals(envKey))resolvedBody=resolvedBody.replace("{{"+orig+"}}","{{"+envKey+"}}");
        }
       }
       stepObj.put("jsonBody",resolvedBody);
       stepObj.remove("bodyReference");
      }
     }catch(Exception ignored){}
    }
   }
   if(step.path("environmentVariables").isObject()){
    for(Iterator<Map.Entry<String,JsonNode>> it=step.path("environmentVariables").fields();it.hasNext();){
     Map.Entry<String,JsonNode> e=it.next();
     String envRef=e.getValue().asText("");
     if(!envRef.isBlank()&&envRef.matches("[A-Z][A-Z0-9_]{0,63}")&&(protectedEnv.get(envRef)==null||protectedEnv.get(envRef).isBlank())){
      String defVal=step1Defaults!=null?step1Defaults.get(envRef):null;
      if(defVal!=null&&!defVal.isBlank()&&defVal.length()<=16000&&defVal.indexOf('\0')<0){
       protectedEnv.put(envRef,defVal);
      }else if(envRef.contains("TOKEN")||envRef.contains("AUTH")||envRef.contains("JWT")){
       protectedEnv.put(envRef,mintedBearer.replaceFirst("(?i)^Bearer\\s+",""));
      }else{
       protectedEnv.put(envRef,inferSampleParamValue(envRef));
      }
     }
    }
   }
   if(step.path("envHeaders").isArray()){
    for(JsonNode h:step.path("envHeaders")){
     String hName=h.path("name").asText("");
     String hRef=h.path("reference").asText("");
     if(!hRef.isBlank()&&hRef.matches("[A-Z][A-Z0-9_]{0,63}")){
      String cur=protectedEnv.get(hRef);
      boolean autoAuth="Authorization".equalsIgnoreCase(hName)&&(step1Defaults==null||!step1Defaults.containsKey(hRef))
        &&(cur==null||cur.isBlank()||"Bearer sandbox-verification-token".equals(cur)||"SANDBOX_BEARER_TOKEN".equals(hRef)||hRef.endsWith("_AUTHORIZATION"));
      if(autoAuth){
       protectedEnv.put(hRef,mintedBearer);
      }else if(cur==null||cur.isBlank()){
       String defVal=step1Defaults!=null?step1Defaults.get(hRef):null;
       if(defVal!=null&&!defVal.isBlank()&&defVal.length()<=16000&&defVal.indexOf('\0')<0){
        protectedEnv.put(hRef,defVal);
       }else{
        protectedEnv.put(hRef,"sandbox-verification-value");
       }
      }
     }
    }
   }
   if(step.path("secretHeaders").isObject()){
    step.path("secretHeaders").fields().forEachRemaining(e->{
     String sRef=e.getValue().asText("");
     if(!sRef.isBlank()&&sRef.matches("[A-Z][A-Z0-9_]{0,63}")&&(protectedEnv.get(sRef)==null||protectedEnv.get(sRef).isBlank())){
      String defVal=step1Defaults!=null?step1Defaults.get(sRef):null;
      if(defVal!=null&&!defVal.isBlank()&&defVal.length()<=16000&&defVal.indexOf('\0')<0){
       protectedEnv.put(sRef,defVal);
      }else if("Authorization".equalsIgnoreCase(e.getKey())){
       protectedEnv.put(sRef,mintSandboxBearerToken(protectedEnv,allRequiredRoles));
      }else{
       protectedEnv.put(sRef,"sandbox-verification-value");
      }
     }
    });
   }
   if(step.path("extract").isObject()){
    step.path("extract").fieldNames().forEachRemaining(availableVars::add);
   }
  }
 }

 private boolean runnerImagesConfigured(){
  return runnerCollectorImage!=null&&runnerCollectorImage.trim().matches("[A-Za-z0-9./:_-]+@sha256:[0-9a-f]{64}")
    &&runnerScenarioImage!=null&&runnerScenarioImage.trim().matches("([A-Za-z0-9./:_-]+@)?sha256:[0-9a-f]{64}");
 }

 private static boolean profileHasPinnedRunnerImages(JsonNode p){
  return p!=null&&p.path("collectorImage").isTextual()&&p.path("scenarioRunnerImage").isTextual()
    &&p.path("collectorImage").asText().matches("[A-Za-z0-9./:_-]+@sha256:[0-9a-f]{64}")
    &&p.path("scenarioRunnerImage").asText().matches("([A-Za-z0-9./:_-]+@)?sha256:[0-9a-f]{64}");
 }

 public record PreparedExecutionEnvironment(Map<String,String> protectedEnvironment,ObjectNode bindings){}

 /** Builds per-service environmentBindings and encrypted runtime env values for Studio Lab sessions. */
 public PreparedExecutionEnvironment prepareStudioExecutionEnvironment(
   UUID projectId,UUID snapshotId,JsonNode profile,JsonNode apps,ArrayNode steps,String effectiveComposeYaml){
  if(projectId==null||snapshotId==null||apps==null||!apps.isObject()){
   return new PreparedExecutionEnvironment(Map.of(),json.createObjectNode());
  }
  var pre=runtime.runComposePreflight(snapshotId);
  if(pre==null){
   return new PreparedExecutionEnvironment(Map.of(),json.createObjectNode());
  }
  var execEnv=buildExecutionEnvironment(projectId,profile,pre,apps);
  ObjectNode bindings=execEnv.bindings();
  String composeYaml=(effectiveComposeYaml!=null&&!effectiveComposeYaml.isBlank())
    ?effectiveComposeYaml
    :pre.getSandboxComposeYaml();
  if(composeYaml!=null&&!composeYaml.isBlank()&&composeValidator!=null){
   var effective=composeValidator.validate(composeYaml,Map.of());
   if(effective.getComposeServices()!=null&&!effective.getComposeServices().isEmpty()){
    Set<String> allowed=new LinkedHashSet<>(effective.getComposeServices());
    List<String> stale=new ArrayList<>();
    bindings.fieldNames().forEachRemaining(svc->{if(!allowed.contains(svc))stale.add(svc);});
    stale.forEach(bindings::remove);
   }
  }
  Set<String> referenced=new LinkedHashSet<>();
  bindings.elements().forEachRemaining(arr->{
   if(arr.isArray())arr.forEach(b->{String ref=b.path("reference").asText("");if(!ref.isBlank())referenced.add(ref);});
  });
  if(steps!=null){
   for(JsonNode step:steps){
    if(step==null||!step.isObject())continue;
    if(step.hasNonNull("bodyReference"))referenced.add(step.get("bodyReference").asText(""));
    if(step.path("environmentVariables").isObject())step.path("environmentVariables").elements().forEachRemaining(v->referenced.add(v.asText("")));
    if(step.path("envHeaders").isArray())step.path("envHeaders").forEach(h->referenced.add(h.path("reference").asText("")));
    if(step.path("secretHeaders").isObject())step.path("secretHeaders").elements().forEachRemaining(v->referenced.add(v.asText("")));
   }
  }
  Map<String,String> filteredEnv=new LinkedHashMap<>();
  execEnv.protectedEnvironment().forEach((k,v)->{if(referenced.contains(k))filteredEnv.put(k,v);});
  Map<String,String> bounded=capProtectedEnvironment(filteredEnv,bindings,steps);
  return new PreparedExecutionEnvironment(bounded,bindings);
 }

 public void storeSessionEnvironment(UUID sessionId,Map<String,String> values){
  if(sessionId!=null&&values!=null&&!values.isEmpty()){
   environments.store(sessionId,values);
  }
 }

 private record ExecutionEnvironment(Map<String,String> protectedEnvironment,ObjectNode bindings){}

 private ExecutionEnvironment buildExecutionEnvironment(UUID projectId,JsonNode profile,PreflightCheckResponseDTO pre,JsonNode apps){
  List<String> composeServices=(pre.getComposeServices()!=null&&!pre.getComposeServices().isEmpty())
    ?pre.getComposeServices()
    :(pre.getDetectedServices()==null?List.of():pre.getDetectedServices());
  List<String> appServices=new ArrayList<>();
  apps.fieldNames().forEachRemaining(svc->{if(composeServices.contains(svc))appServices.add(svc);});

  Map<String,PreflightCheckResponseDTO.RequiredEnvVarDTO> known=new LinkedHashMap<>();
  if(pre.getRequiredEnvVars()!=null)pre.getRequiredEnvVars().forEach(v->known.put(v.getName(),v));

  Map<String,String> protectedEnv=new LinkedHashMap<>();
  Map<String,Map<String,String>> serviceBindings=new LinkedHashMap<>();

  // 1. User-provided overrides & secrets
  Map<String,String> candidates=new LinkedHashMap<>();
  JsonNode persisted=profile==null?null:profile.path("environmentVariables");
  if(persisted!=null&&persisted.isObject())persisted.fields().forEachRemaining(e->candidates.put(e.getKey(),e.getValue().asText("")));
  if(profile!=null&&profile.hasNonNull("sealedInputs")){
   Map<String,String> unsealed=environments.unsealProjectInputs(projectId,profile.get("sealedInputs").asText(""));
   if(unsealed!=null)candidates.putAll(unsealed);
  }
  Map<String,String> step1=runtime.getProjectExecutionEnvironment(projectId);
  if(step1!=null)candidates.putAll(step1);

  Set<String> autoProvisionedDbServices=new HashSet<>();
  if(pre.getDatabaseChecks()!=null){
   for(var dc:pre.getDatabaseChecks()){
    if(dc!=null&&"AUTO_PROVISIONED_SANDBOX_DB".equals(dc.getStatus())&&dc.getService()!=null){
     autoProvisionedDbServices.add(dc.getService());
    }
   }
  }
  Set<String> userOverriddenKeys=new HashSet<>();
  candidates.forEach((k,v)->{
   if(k==null||!k.matches("[A-Z][A-Z0-9_]{0,63}")||v==null||v.isBlank()||v.length()>16000)return;
   var meta=known.get(k);
   // Unchanged defaults already live in Compose/source; only real overrides are injected.
   if(meta!=null&&meta.isDefaultPresent()&&v.equals(meta.getDefaultValue()))return;
   // Host-local loopback infra endpoints (e.g. REDIS=localhost, KAFKA=localhost:9092, EUREKA=http://localhost:8761) break multi-container Compose DNS.
   if(composeServices.size()>1&&isContainerInfraEndpointKey(k)&&pointsToLoopback(v))return;
   if(!isBindableEnvName(k)){
    userOverriddenKeys.add(k);
    protectedEnv.put(k,v);
    return;
   }
   boolean dbOverrideKey=isExternalDatasourceOverrideKey(k);
   List<String> boundTargets=new ArrayList<>();
   for(String target:owningServices(meta,composeServices,appServices)){
    if(dbOverrideKey&&autoProvisionedDbServices.contains(target))continue;
    boundTargets.add(target);
   }
   if(boundTargets.isEmpty())return;
   userOverriddenKeys.add(k);
   protectedEnv.put(k,v);
   for(String target:boundTargets){
    serviceBindings.computeIfAbsent(target,x->new LinkedHashMap<>()).put(k,k);
   }
  });

  // 2. Relocated literal secrets stripped from sandboxComposeYaml (zero data loss)
  if(pre.getRelocatedComposeSecrets()!=null&&!pre.getRelocatedComposeSecrets().isEmpty()){
   Map<String,Set<String>> distinctByKey=new HashMap<>();
   pre.getRelocatedComposeSecrets().forEach((svc,secMap)->{
    if(!composeServices.contains(svc)||secMap==null)return;
    secMap.forEach((k,v)->{
     if(!userOverriddenKeys.contains(k)&&isBindableEnvName(k)&&v!=null&&!v.isBlank()&&v.length()<=16000){
      distinctByKey.computeIfAbsent(k,x->new LinkedHashSet<>()).add(v);
     }
    });
   });
   pre.getRelocatedComposeSecrets().forEach((svc,secMap)->{
    if(!composeServices.contains(svc)||secMap==null)return;
    secMap.forEach((k,v)->{
     if(userOverriddenKeys.contains(k)||!isBindableEnvName(k)||v==null||v.isBlank()||v.length()>16000)return;
     boolean needsScope=distinctByKey.getOrDefault(k,Set.of()).size()>1||(protectedEnv.containsKey(k)&&!v.equals(protectedEnv.get(k)));
     String ref=needsScope?scopedEnvRef(svc,k):k;
     if(!isBindableEnvName(ref))return;
     protectedEnv.put(ref,v);
     serviceBindings.computeIfAbsent(svc,x->new LinkedHashMap<>()).put(k,ref);
    });
   });
  }

  // 3. Unified Actuator management port override (when management.server.port differed from server.port)
  if(pre.getUnifiedManagementPorts()!=null&&!pre.getUnifiedManagementPorts().isEmpty()&&!userOverriddenKeys.contains("MANAGEMENT_SERVER_PORT")){
   Set<Integer> distinctPorts=new LinkedHashSet<>();
   pre.getUnifiedManagementPorts().forEach((svc,port)->{if(composeServices.contains(svc)&&port!=null)distinctPorts.add(port);});
   pre.getUnifiedManagementPorts().forEach((svc,port)->{
    if(!composeServices.contains(svc)||port==null)return;
    if(serviceBindings.getOrDefault(svc,Map.of()).containsKey("MANAGEMENT_SERVER_PORT"))return;
    String val=String.valueOf(port);
    boolean needsScope=distinctPorts.size()>1||(protectedEnv.containsKey("MANAGEMENT_SERVER_PORT")&&!val.equals(protectedEnv.get("MANAGEMENT_SERVER_PORT")));
    String ref=needsScope?scopedEnvRef(svc,"MANAGEMENT_SERVER_PORT"):"MANAGEMENT_SERVER_PORT";
    protectedEnv.put(ref,val);
    serviceBindings.computeIfAbsent(svc,x->new LinkedHashMap<>()).put("MANAGEMENT_SERVER_PORT",ref);
   });
  }

  // 4. Auto-resolved DB credentials (scoped per service when multi-DB values differ) and shared generated sandbox secrets
  Map<String,String> credentials=new HashMap<>(pre.getSandboxDatabaseCredentials()==null?Map.of():pre.getSandboxDatabaseCredentials());
  Map<String,Map<String,String>> perServiceCreds=new LinkedHashMap<>();
  if(pre.getServiceDatabaseCredentials()!=null){
   pre.getServiceDatabaseCredentials().forEach((svc,m)->{if(m!=null)perServiceCreds.put(svc,new LinkedHashMap<>(m));});
  }
  Set<String> infra=new HashSet<>(pre.getInfrastructureServices()==null?List.of():pre.getInfrastructureServices());
  List<PreflightCheckResponseDTO.RequiredEnvVarDTO> orderedVars=new ArrayList<>(known.values());
  orderedVars.sort(Comparator.comparingInt(v->owningServices(v,composeServices,appServices).stream().anyMatch(infra::contains)?0:1));
  java.security.KeyPair[] rsaPair=new java.security.KeyPair[1];
  for(var v:orderedVars){
   String key=v.getName();
   if(userOverriddenKeys.contains(key)||!isBindableEnvName(key))continue;
   List<String> owners=owningServices(v,composeServices,appServices);
   List<String> orderedOwners=new ArrayList<>();
   owners.forEach(s->{if(infra.contains(s))orderedOwners.add(s);});
   owners.forEach(s->{if(!infra.contains(s))orderedOwners.add(s);});
   boolean secret="SECRET".equals(v.getCategory())||"DB_SECRET".equals(v.getCategory());
   String sharedGenerated=null;
   Map<String,String> resolvedPerSvc=new LinkedHashMap<>();
   for(String svc:orderedOwners){
    if(serviceBindings.getOrDefault(svc,Map.of()).containsKey(key))continue;
    String val=ComposePreflightValidator.databaseCredentialFor(key,svc,perServiceCreds,pre.getServiceDependencies(),credentials);
    if(val==null&&secret&&ComposePreflightValidator.isGeneratableSandboxSecret(key)){
     if(sharedGenerated==null)sharedGenerated=randomSecretFor(key,rsaPair);val=sharedGenerated;}else if(val==null&&secret&&"EXTERNAL".equals(v.getScope())&&v.getSource()!=null&&!"STATIC_MODEL".equals(v.getSource())){if(sharedGenerated==null)sharedGenerated="sandbox-dummy-api-key";
     val=sharedGenerated;
    }
    if(val!=null){
     resolvedPerSvc.put(svc,val);
     if(infra.contains(svc)){
      credentials.putIfAbsent(key,val);
      perServiceCreds.computeIfAbsent(svc,x->new LinkedHashMap<>()).putIfAbsent(key,val);
     }
    }
   }
   if(resolvedPerSvc.isEmpty())continue;
   Set<String> distinctVals=new LinkedHashSet<>(resolvedPerSvc.values());
   for(Map.Entry<String,String> entry:resolvedPerSvc.entrySet()){
    String svc=entry.getKey();
    String val=entry.getValue();
    boolean needsScope=distinctVals.size()>1||(protectedEnv.containsKey(key)&&!val.equals(protectedEnv.get(key)));
    String ref=needsScope?scopedEnvRef(svc,key):key;
    if(!isBindableEnvName(ref))continue;
    protectedEnv.put(ref,val);
    serviceBindings.computeIfAbsent(svc,x->new LinkedHashMap<>()).put(key,ref);
   }
  }

  // 5. Compose environment aliases (e.g. SPRING_DATASOURCE_PASSWORD: ${DB_PASSWORD})
  if(pre.getComposeEnvAliases()!=null){
   for(Map.Entry<String,Map<String,String>> svcAliases:pre.getComposeEnvAliases().entrySet()){
    String svc=svcAliases.getKey();
    if(!composeServices.contains(svc)||svcAliases.getValue()==null)continue;
    for(Map.Entry<String,String> alias:svcAliases.getValue().entrySet()){
     String containerKey=alias.getKey();
     String refKey=alias.getValue();
     if(!isBindableEnvName(containerKey))continue;
     String actualRef=serviceBindings.getOrDefault(svc,Map.of()).get(refKey);
     if(actualRef==null&&protectedEnv.containsKey(refKey)&&isBindableEnvName(refKey))actualRef=refKey;
     if(actualRef!=null){
      serviceBindings.computeIfAbsent(svc,x->new LinkedHashMap<>()).putIfAbsent(containerKey,actualRef);
     }
    }
   }
  }

  // 5b. Composite ${VAR} template expansion (e.g. jdbc:postgresql://orders-db:5432/${DB_NAME} or postgresql://${DB_USER}:${DB_PASSWORD}@db/app)
  if(pre.getComposeEnvTemplates()!=null&&!pre.getComposeEnvTemplates().isEmpty()){
   Pattern tplPat=Pattern.compile("\\$\\{([A-Z][A-Z0-9_]+)(?::-?([^}]*))?}");
   for(Map.Entry<String,Map<String,String>> svcTpl:pre.getComposeEnvTemplates().entrySet()){
    String svc=svcTpl.getKey();
    if(!composeServices.contains(svc)||svcTpl.getValue()==null)continue;
    for(Map.Entry<String,String> entry:svcTpl.getValue().entrySet()){
     String containerKey=entry.getKey();
     String tpl=entry.getValue();
     if(tpl==null||!isBindableEnvName(containerKey)||userOverriddenKeys.contains(containerKey))continue;
     if(serviceBindings.getOrDefault(svc,Map.of()).containsKey(containerKey))continue;
     Matcher m=tplPat.matcher(tpl);
     StringBuffer sb=new StringBuffer();
     while(m.find()){
      String varName=m.group(1);
      String inlineDef=m.group(2);
      String boundRef=serviceBindings.getOrDefault(svc,Map.of()).get(varName);
      String val=(boundRef!=null&&protectedEnv.containsKey(boundRef))?protectedEnv.get(boundRef):protectedEnv.get(varName);
      if(val==null||val.isBlank()){
       var meta=known.get(varName);
       if(meta!=null&&meta.getDefaultValue()!=null&&!meta.getDefaultValue().isBlank())val=meta.getDefaultValue();
      }
      if(val==null||val.isBlank()){
       val=ComposePreflightValidator.databaseCredentialFor(varName,svc,perServiceCreds,pre.getServiceDependencies(),credentials);
      }
      if((val==null||val.isBlank())&&inlineDef!=null&&!inlineDef.isBlank())val=inlineDef;
      if(val!=null&&!val.isBlank())m.appendReplacement(sb,Matcher.quoteReplacement(val));
     }
     m.appendTail(sb);
     String expanded=sb.toString();
     if(!expanded.contains("${")&&!expanded.isBlank()&&expanded.length()<=16000){
      boolean needsScope=protectedEnv.containsKey(containerKey)&&!expanded.equals(protectedEnv.get(containerKey));
      String ref=needsScope?scopedEnvRef(svc,containerKey):containerKey;
      if(isBindableEnvName(ref)){
       protectedEnv.put(ref,expanded);
       serviceBindings.computeIfAbsent(svc,x->new LinkedHashMap<>()).put(containerKey,ref);
      }
     }
    }
   }
  }

  ObjectNode out=json.createObjectNode();
  for(Map.Entry<String,Map<String,String>> svcEntry:serviceBindings.entrySet()){
   if(svcEntry.getValue().isEmpty())continue;
   ArrayNode list=out.putArray(svcEntry.getKey());
   for(Map.Entry<String,String> b:svcEntry.getValue().entrySet()){
    if(list.size()>=64)break;
    list.addObject().put("name",b.getKey()).put("reference",b.getValue());
   }
  }
  return new ExecutionEnvironment(protectedEnv,out);
 }

 private static List<String> owningServices(PreflightCheckResponseDTO.RequiredEnvVarDTO meta,List<String> composeServices,List<String> appServices){
  if(meta==null)return appServices;
  String key=meta.getName()==null?"":meta.getName().toUpperCase(Locale.ROOT);
  if(isSharedCrossServiceSecretKey(key)&&!appServices.isEmpty())return appServices;
  List<String> targets=new ArrayList<>();
  if(meta.getServices()!=null&&!meta.getServices().isEmpty()){
   for(String s:meta.getServices()){
    if(composeServices.contains(s)&&!targets.contains(s))targets.add(s);
   }
  }
  if(targets.isEmpty()&&meta.getService()!=null&&composeServices.contains(meta.getService())){
   targets.add(meta.getService());
  }
  return targets.isEmpty()?appServices:targets;
 }

 private static boolean isSharedCrossServiceSecretKey(String upperKey){
  if(upperKey==null||upperKey.isEmpty())return false;
  return upperKey.contains("INTERNAL_SECRET")
    ||upperKey.contains("JWT_SECRET")
    ||upperKey.contains("TOKEN_SECRET")
    ||upperKey.contains("SIGNING_KEY")
    ||upperKey.contains("HMAC_SECRET")
    ||upperKey.equals("SERVICE_SECRET")
    ||upperKey.equals("AUTH_SECRET");
 }

 private static boolean isBindableEnvName(String name){
  return name!=null&&name.matches("[A-Z][A-Z0-9_]{0,63}")&&!"PATH".equals(name)&&RESERVED_ENV_PREFIXES.stream().noneMatch(name::startsWith);
 }

 private static final Set<String> EXTERNAL_DATASOURCE_OVERRIDE_KEYS=Set.of(
   "SPRING_DATASOURCE_URL","SPRING_DATASOURCE_USERNAME","SPRING_DATASOURCE_PASSWORD",
   "DATABASE_URL","DB_CONNECTION_STRING","CONNECTIONSTRINGS__DEFAULTCONNECTION",
   "DB_HOST","DB_PORT","DB_NAME","DB_USER","DB_USERNAME","DB_PASSWORD",
   "SPRING_DATA_MONGODB_URI","MONGODB_URI");

 private static boolean isExternalDatasourceOverrideKey(String key){
  return key!=null&&EXTERNAL_DATASOURCE_OVERRIDE_KEYS.contains(key);
 }

 private static boolean isContainerInfraEndpointKey(String key){
  if(key==null)return false;
  return key.startsWith("EUREKA_CLIENT_")
    ||key.startsWith("MANAGEMENT_ZIPKIN_")
    ||key.startsWith("MANAGEMENT_OTLP_")
    ||key.startsWith("OTEL_EXPORTER_")
    ||key.contains("KAFKA_BOOTSTRAP")
    ||"KAFKA_BROKERS".equals(key)
    ||"KAFKA_HOST".equals(key)
    ||"SPRING_DATA_REDIS_HOST".equals(key)
    ||"SPRING_REDIS_HOST".equals(key)
    ||"REDIS_HOST".equals(key)
    ||"REDIS_URL".equals(key)
    ||"SPRING_RABBITMQ_HOST".equals(key)
    ||"RABBITMQ_HOST".equals(key)
    ||"RABBITMQ_URL".equals(key)
    ||"AMQP_URL".equals(key);
 }

 private static boolean pointsToLoopback(String value){
  if(value==null)return false;
  String low=value.trim().toLowerCase(Locale.ROOT);
  return "localhost".equals(low)
    ||"127.0.0.1".equals(low)
    ||low.startsWith("localhost:")
    ||low.startsWith("127.0.0.1:")
    ||low.contains("://localhost")
    ||low.contains("://127.0.0.1");
 }

 static String safeServiceEnvPrefix(String serviceName){
  String prefix=serviceName==null?"SVC":serviceName.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9_]","_").replaceAll("_+","_").replaceAll("^_|_$","");
  if(prefix.isEmpty()||!Character.isLetter(prefix.charAt(0)))prefix="SVC_"+prefix;
  return prefix.length()>32?prefix.substring(0,32):prefix;
 }

 static String scopedEnvRef(String serviceName,String envName){
  String prefix=serviceName==null?"SVC":serviceName.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9_]","_").replaceAll("_+","_").replaceAll("^_|_$","");
  if(prefix.isEmpty()||!Character.isLetter(prefix.charAt(0)))prefix="SVC_"+prefix;
  final String candidatePrefix=prefix+"_";
  if(RESERVED_ENV_PREFIXES.stream().anyMatch(candidatePrefix::startsWith))prefix="SVC_"+prefix;
  int maxPrefixLen=64-2-envName.length();
  if(maxPrefixLen<4)return envName;
  if(prefix.length()>maxPrefixLen)prefix=prefix.substring(0,maxPrefixLen);
  return prefix+"__"+envName;
 }

 private Map<String,String> resolveConfirmedServiceMappings(UUID modelVersionId,JsonNode profile,PreflightCheckResponseDTO pre,JsonNode apps){
  Map<String,String> raw=new LinkedHashMap<>();
  if(profile!=null&&profile.has("serviceMappings")&&profile.get("serviceMappings").isObject()){
   profile.get("serviceMappings").fields().forEachRemaining(e->raw.put(e.getKey(),e.getValue().asText("").trim()));
  }
  Map<String,String> recommended=pre!=null&&pre.getRecommendedServiceMappings()!=null?pre.getRecommendedServiceMappings():Map.of();
  Map<String,String> modelNames=new LinkedHashMap<>(pre!=null&&pre.getModelServiceNames()!=null?pre.getModelServiceNames():Map.of());
  if(modelNames.isEmpty()&&modelElements!=null&&modelVersionId!=null){
   List<ModelElement> els=modelElements.findByModelVersionId(modelVersionId);
   if(els!=null){
    for(ModelElement el:els){
     if("SERVICE_CONTAINER".equalsIgnoreCase(el.getElementType())&&el.getId()!=null&&el.getName()!=null){
      modelNames.put(el.getId().toString(),el.getName());
     }
    }
   }
  }
  Set<String> appKeys=new LinkedHashSet<>();
  if(apps!=null&&apps.isObject())apps.fieldNames().forEachRemaining(appKeys::add);
  for(String appKey:appKeys){
   raw.putIfAbsent(appKey,recommended.getOrDefault(appKey,""));
  }
  Map<String,String> resolved=new LinkedHashMap<>();
  boolean singleFallback=appKeys.size()==1&&modelNames.size()==1;
  String singleUuid=singleFallback?modelNames.keySet().iterator().next():null;
  for(Map.Entry<String,String> e:raw.entrySet()){
   String svc=e.getKey();
   if(!appKeys.isEmpty()&&!appKeys.contains(svc))continue;
   String val=e.getValue();
   if(isUuidString(val)){
    resolved.put(svc,val);
    continue;
   }
   String rec=recommended.get(svc);
   if((val.isEmpty()||val.equalsIgnoreCase(svc))&&isUuidString(rec)){
    resolved.put(svc,rec);
    continue;
   }
   String matchedUuid=matchModelUuid(val.isEmpty()?svc:val,modelNames);
   if(matchedUuid==null&&!val.isEmpty())matchedUuid=matchModelUuid(svc,modelNames);
   if(matchedUuid==null&&singleFallback)matchedUuid=singleUuid;
   if(matchedUuid!=null)resolved.put(svc,matchedUuid);
   else if(!val.isEmpty())resolved.put(svc,val);
  }
  return resolved;
 }

 private static String matchModelUuid(String candidate,Map<String,String> modelNames){
  if(candidate==null||candidate.isBlank()||modelNames.isEmpty())return null;
  for(Map.Entry<String,String> e:modelNames.entrySet()){
   if(e.getKey().equalsIgnoreCase(candidate)||e.getValue().equalsIgnoreCase(candidate)
     ||ComposePreflightValidator.cleanServiceCandidate(e.getValue()).equalsIgnoreCase(candidate)){
    return e.getKey();
   }
  }
  for(Map.Entry<String,String> e:modelNames.entrySet()){
   if(ComposePreflightValidator.matchDetectedService(e.getValue(),List.of(candidate))!=null)return e.getKey();
  }
  return null;
 }

 private String randomSecret(){byte[] bytes=new byte[32];secureRandom.nextBytes(bytes);return Base64.getEncoder().encodeToString(bytes);}

 /** Format follows the variable's job: HS512-safe JWT/HMAC keys, hex keys, and one shared RSA PEM pair for *_PRIVATE_KEY / *_PUBLIC_KEY. */
 String randomSecretFor(String key,java.security.KeyPair[] rsa){
  String u=key==null?"":key.toUpperCase(Locale.ROOT);
  boolean priv=u.contains("PRIVATE_KEY"),pub=u.contains("PUBLIC_KEY");
  if(priv||pub){
   try{
    if(rsa[0]==null){java.security.KeyPairGenerator g=java.security.KeyPairGenerator.getInstance("RSA");g.initialize(2048,secureRandom);rsa[0]=g.generateKeyPair();}
    String type=priv?"PRIVATE KEY":"PUBLIC KEY";
    byte[] der=priv?rsa[0].getPrivate().getEncoded():rsa[0].getPublic().getEncoded();
    return "-----BEGIN "+type+"-----\n"+Base64.getMimeEncoder(64,new byte[]{'\n'}).encodeToString(der)+"\n-----END "+type+"-----";
   }catch(java.security.GeneralSecurityException e){throw new IllegalStateException("RSA key generation unavailable",e);}
  }
  if(u.contains("HEX")){byte[] b=new byte[32];secureRandom.nextBytes(b);return HexFormat.of().formatHex(b);}
  if(u.contains("JWT")||u.contains("HMAC")||u.contains("SIGN")){byte[] b=new byte[64];secureRandom.nextBytes(b);return Base64.getEncoder().encodeToString(b);}
  return randomSecret();
 }

 private void validateProfile(JsonNode p){if(!p.isObject()||p.toString().length()>50000||!p.equals(SecretRedactor.redactJson(p)))throw new BusinessException(ErrorCode.BAD_REQUEST,"Profile must be a bounded object without literal secrets");
  if(p.hasNonNull("collectorImage")&&(!p.path("collectorImage").isTextual()||!p.path("collectorImage").asText().matches("[A-Za-z0-9./:_-]+@sha256:[0-9a-f]{64}")))throw new BusinessException(ErrorCode.BAD_REQUEST,"collectorImage must be digest-pinned");
  if(p.hasNonNull("scenarioRunnerImage")&&(!p.path("scenarioRunnerImage").isTextual()||!p.path("scenarioRunnerImage").asText().matches("([A-Za-z0-9./:_-]+@)?sha256:[0-9a-f]{64}")))throw new BusinessException(ErrorCode.BAD_REQUEST,"scenarioRunnerImage must be digest-pinned");
  if(!p.path("instrumentationVolume").asText().matches("[A-Za-z0-9][A-Za-z0-9_.-]{0,63}")||!p.path("approvedForLocalPoc").asBoolean(false)||!p.path("applications").isObject()||p.path("applications").isEmpty()||p.path("applications").size()>10)throw new BusinessException(ErrorCode.BAD_REQUEST,"An approved, digest-pinned operator profile is required");
  for(var it=p.path("applications").fields();it.hasNext();){var app=it.next();int port=app.getValue().path("containerPort").asInt();if(!app.getKey().matches("[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}")||port<1||port>65535||!Set.of("java","dotnet8-linux-x64-glibc","passthrough").contains(app.getValue().path("runtime").asText())||!app.getValue().path("readinessPath").asText("/health").startsWith("/"))throw new BusinessException(ErrorCode.BAD_REQUEST,"Unsupported application profile");}
 }
 private ArrayNode parseSteps(List<String> rows){var result=json.createArrayNode();var ids=new HashSet<String>();for(String row:rows){JsonNode n;try{n=json.readTree(row);}catch(Exception e){throw new BusinessException(ErrorCode.BAD_REQUEST,"Each scenario step must be a JSON object");}
   String stepPath=n!=null&&n.path("path").isTextual()?n.get("path").asText():"";
   if(n==null||!n.isObject()||!ids.add(n.path("id").asText())||n.path("id").asText().isBlank()||!n.path("service").asText().matches("[A-Za-z0-9][A-Za-z0-9_-]{0,62}")||!Set.of("GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS").contains(n.path("method").asText())||!stepPath.startsWith("/")||stepPath.startsWith("//")||stepPath.contains("\\")||stepPath.contains("\r")||stepPath.contains("\n")||stepPath.length()>8192||n.path("expectedStatus").asInt()<100||n.path("expectedStatus").asInt()>599||!n.equals(SecretRedactor.redactJson(n)))throw new BusinessException(ErrorCode.BAD_REQUEST,"Invalid or secret-bearing scenario step");
   if(n.hasNonNull("allowClientError")&&!n.get("allowClientError").isBoolean())throw new BusinessException(ErrorCode.BAD_REQUEST,"allowClientError must be boolean");
   if(n.hasNonNull("jsonBody")&&n.hasNonNull("bodyReference"))throw new BusinessException(ErrorCode.BAD_REQUEST,"Step cannot specify both jsonBody and bodyReference");
   if(n.hasNonNull("bodyReference")&&!n.get("bodyReference").asText().matches("[A-Z][A-Z0-9_]{0,63}"))throw new BusinessException(ErrorCode.BAD_REQUEST,"bodyReference must be a valid uppercase environment identifier");
   if(n.hasNonNull("environmentVariables")){
    if(!n.get("environmentVariables").isObject()||n.get("environmentVariables").size()>64)throw new BusinessException(ErrorCode.BAD_REQUEST,"Invalid environmentVariables binding");
    n.get("environmentVariables").fields().forEachRemaining(e->{
     if(!e.getKey().matches("[A-Z][A-Z0-9_]{0,63}")||!e.getValue().asText("").matches("[A-Z][A-Z0-9_]{0,63}"))throw new BusinessException(ErrorCode.BAD_REQUEST,"environmentVariables must map uppercase aliases to environment references");
    });
   }
   if(n.hasNonNull("envHeaders")){
    if(!n.get("envHeaders").isArray()||n.get("envHeaders").size()>64)throw new BusinessException(ErrorCode.BAD_REQUEST,"Invalid envHeaders list");
    for(JsonNode h:n.get("envHeaders")){
     String hName=h.path("name").asText("");
     String hRef=h.path("reference").asText("");
     if(!hName.matches("[A-Za-z][A-Za-z0-9-]{0,63}")||Set.of("host","traceparent","tracestate").contains(hName.toLowerCase(Locale.ROOT))||!hRef.matches("[A-Z][A-Z0-9_]{0,63}")){
      throw new BusinessException(ErrorCode.BAD_REQUEST,"Unsupported envHeaders name or reference");
     }
    }
   }
   if(n.has("secretHeaders")){if(!n.get("secretHeaders").isObject())throw new BusinessException(ErrorCode.BAD_REQUEST);for(var it=n.get("secretHeaders").elements();it.hasNext();)if(!it.next().asText().matches("[A-Z_][A-Z0-9_]{0,99}"))throw new BusinessException(ErrorCode.BAD_REQUEST,"Secret headers must refer to environment names");}
   if(n.hasNonNull("headers")){
    if(!n.get("headers").isObject()||n.get("headers").size()>64)throw new BusinessException(ErrorCode.BAD_REQUEST,"Invalid headers map");
    n.get("headers").fields().forEachRemaining(e->{
     String hk=e.getKey();
     String hv=e.getValue().asText("");
     if(!hk.matches("[A-Za-z][A-Za-z0-9-]{0,63}")||Set.of("host","traceparent","tracestate").contains(hk.toLowerCase(Locale.ROOT))||hv.contains("\r")||hv.contains("\n")){
      throw new BusinessException(ErrorCode.BAD_REQUEST,"Unsupported scenario header");
     }
    });
   }
   if(n.hasNonNull("extract")){
    if(!n.get("extract").isObject()||n.get("extract").size()>32)throw new BusinessException(ErrorCode.BAD_REQUEST,"Invalid extract map");
    ObjectNode ext=(ObjectNode)n.get("extract");
    List<String> extKeys=new ArrayList<>();
    ext.fieldNames().forEachRemaining(extKeys::add);
    for(String ek:extKeys){
     String ptr=ext.path(ek).asText("").trim();
     if(ptr.startsWith("$.")&&ptr.length()>2){
      ptr="/"+ptr.substring(2).replaceAll("\\[(\\d+)]","/$1").replace('.','/').replaceAll("/+","/");
      ext.put(ek,ptr);
     }
     if(!ek.matches("[a-zA-Z][a-zA-Z0-9_]{0,63}")||!ptr.startsWith("/")||ptr.length()>512){
      throw new BusinessException(ErrorCode.BAD_REQUEST,"Invalid extract variable or JSON pointer");
     }
    }
   }
   if(n.hasNonNull("jsonBody")){try{var body=json.readTree(n.get("jsonBody").asText());if(body==null||!body.equals(SecretRedactor.redactJson(body)))throw new IllegalArgumentException();}catch(Exception ex){throw new BusinessException(ErrorCode.BAD_REQUEST,"JSON body must not contain literal secrets");}}
   result.add(n);
  }return result;
 }
}
