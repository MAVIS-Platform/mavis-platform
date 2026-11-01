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
 public record StartRequest(@NotNull UUID snapshotId,@NotNull UUID scenarioId,@Min(1) int configurationRevision,@Min(1) int scenarioRevision,@AssertTrue boolean approved,@com.fasterxml.jackson.annotation.JsonProperty(access=com.fasterxml.jackson.annotation.JsonProperty.Access.WRITE_ONLY) Map<String,String> environment){ @Override public String toString(){return "RuntimeStartRequest[snapshotId="+snapshotId+",scenarioId="+scenarioId+",environment=[protected]]";} }
 public record ConfigurationView(UUID projectId,UUID snapshotId,UUID modelId,String profileId,JsonNode profile,int revision,boolean configured,boolean supported,boolean ready,List<String> prerequisites,boolean protectedInputsReady){}
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
 private void lock(UUID id){var p=projects.findLockedById(id).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));policy.requireProjectWriteAccess(p);}

 @Transactional(readOnly=true)
 public ConfigurationView configuration(UUID id){project(id,false);var c=configurations.findById(id).orElse(null);var snapshot=c!=null?c.getSourceSnapshotId():sources.findFirstByProjectIdOrderByCreatedAtDesc(id).map(SourceSnapshot::getId).orElse(null);var warnings=new ArrayList<String>();boolean supported=false;
  PreflightCheckResponseDTO pre=null;
  if(snapshot!=null){pre=runtime.runComposePreflight(snapshot);supported=pre.isCompatible();warnings.addAll(pre.getSecurityWarnings());}else warnings.add("No source snapshot exists");
  boolean enabled=settings.enabled("otel-collector")&&(c==null||settings.profile(c.getProfileId()).enabled());if(!enabled)warnings.add("Runtime integration or execution profile is disabled");
  ObjectNode profileNode=c!=null&&c.getProfile()!=null&&c.getProfile().isObject()?(ObjectNode)c.getProfile().deepCopy():json.createObjectNode();
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
  }
  boolean imagesReady=runnerImagesConfigured()||profileHasPinnedRunnerImages(profileNode);
  if(!imagesReady)warnings.add("Sandbox runner images are not configured (MAVIS_RUNNER_COLLECTOR_IMAGE, MAVIS_RUNNER_SCENARIO_RUNNER_IMAGE); runs cannot start until an operator sets them");
  if(!environments.isConfigured())warnings.add("MAVIS_RUNTIME_ENVIRONMENT_KEY is not configured; changed environment values, generated sandbox secrets and request bodies cannot be delivered to the runner");
  return new ConfigurationView(id,snapshot,c==null?null:c.getModelVersionId(),c==null?"SPRING_BOOT_DOTNET_COMPOSE_V1":c.getProfileId(),profileNode,c==null?0:c.getRevision(),c!=null,supported,c!=null&&supported&&enabled&&imagesReady,warnings,true);
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
  if(c!=null&&snapshotId.equals(c.getSourceSnapshotId())&&!res.builtImages().isEmpty()&&c.getProfile()!=null&&c.getProfile().isObject()){
   ObjectNode p=(ObjectNode)c.getProfile().deepCopy();
   ObjectNode overrides=p.has("serviceImageOverrides")&&p.get("serviceImageOverrides").isObject()?(ObjectNode)p.get("serviceImageOverrides"):p.putObject("serviceImageOverrides");
   res.builtImages().forEach(overrides::put);
   String existingSealed=p.hasNonNull("sealedInputs")?p.get("sealedInputs").asText(null):null;
   JsonNode normalized=normalizeStep1Profile(id,snapshotId,c.getProfileId(),p,existingSealed);
   c.setProfile(normalized.deepCopy());
   c.setRevision(c.getRevision()+1);
   configurations.saveAndFlush(c);
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
     if(!"APP".equalsIgnoreCase(roleOverrides.get(infraSvc)))svcNames.remove(infraSvc);
    }
   }
   roleOverrides.forEach((svc,role)->{
    if("INFRA".equalsIgnoreCase(role))svcNames.remove(svc);
   });
   if(svcNames.isEmpty())svcNames.add("gateway");
   Map<String,String> healthPaths=pre!=null&&pre.getServiceHealthPaths()!=null?pre.getServiceHealthPaths():Map.of();
   Map<String,String> healthConfidence=pre!=null&&pre.getServiceHealthConfidence()!=null?pre.getServiceHealthConfidence():Map.of();
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
    if("ASSUMED".equalsIgnoreCase(healthConfidence.get(sName)))appNode.put("allowClientErrorReadiness",true);
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
    if(cur==null||cur.isBlank()||(!isUuidString(cur)&&cur.equalsIgnoreCase(svc)))mappings.put(svc,recUuid);
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

 @Transactional(readOnly=true)
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
    if(!"APP".equalsIgnoreCase(roleOverrides.get(inf)))infraSet.add(inf);
   }
  }
  roleOverrides.forEach((svc,role)->{if("INFRA".equalsIgnoreCase(role))infraSet.add(svc);});

  Set<String> allowedServices=new LinkedHashSet<>();
  if(pre!=null&&pre.getComposeServices()!=null&&!pre.getComposeServices().isEmpty()){
   allowedServices.addAll(pre.getComposeServices());
  }else if(pre!=null&&pre.getDetectedServices()!=null){
   allowedServices.addAll(pre.getDetectedServices());
  }
  allowedServices.removeAll(infraSet);
  if(savedProfile!=null&&savedProfile.path("applications").isObject()){
   Set<String> profileApps=new LinkedHashSet<>();
   savedProfile.path("applications").fieldNames().forEachRemaining(profileApps::add);
   profileApps.removeAll(infraSet);
   if(!profileApps.isEmpty()){
    if(allowedServices.isEmpty())allowedServices.addAll(profileApps);
    else allowedServices.retainAll(profileApps);
   }
  }

  List<DetectedEndpointDTO> rawEndpoints=new ArrayList<>();
  if(pre!=null&&pre.getDetectedEndpoints()!=null)rawEndpoints.addAll(pre.getDetectedEndpoints());
  if(model!=null&&modelElements!=null&&allowedServices.isEmpty()){
   for(ModelElement el:modelElements.findByModelVersionId(model.getId())){
    if("SERVICE_CONTAINER".equals(el.getElementType())&&el.getName()!=null&&!el.getName().isBlank()&&!infraSet.contains(el.getName())){
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
   for(ModelRelationship rel:modelRelationships.findByModelVersionId(model.getId())){
    String sName=rel.getSourceElement()!=null?rel.getSourceElement().getName():"";
    String tName=rel.getTargetElement()!=null?rel.getTargetElement().getName():"";
    UUID sId=rel.getSourceElement()!=null?rel.getSourceElement().getId():null;
    UUID tId=rel.getTargetElement()!=null?rel.getTargetElement().getId():null;
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
   int fanA=a.getFanOutScore()!=null?a.getFanOutScore():0;
   int fanB=b.getFanOutScore()!=null?b.getFanOutScore():0;
   if(fanA!=fanB)return Integer.compare(fanB,fanA);
   boolean paramA=PATH_PARAM_PATTERN.matcher(a.getPath()).find();
   boolean paramB=PATH_PARAM_PATTERN.matcher(b.getPath()).find();
   if(paramA!=paramB)return paramA?1:-1;
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
  List<GeneratedStepDraft> staticSteps=buildDeterministicSteps(candidates,allowedServices,upstreamServices,connectedServices,healthPaths,causalComparator,sampleInputs,sandboxBearer);
  List<String> runnableList=new ArrayList<>(allowedServices);

  String repairFeedback=buildRepairFeedbackSummary(id,r!=null?r.repairSessionId():null,allowedServices);
  String goal=r!=null&&r.goal()!=null?SecretRedactor.redactString(r.goal().trim()):"";
  Optional<String> maybeKey=apiKeyProvider!=null?apiKeyProvider.resolveApiKey():Optional.empty();
  if(maybeKey.isPresent()&&!candidates.isEmpty()){
   try{
    GeneratedScenarioDraftView aiDraft=callAiScenarioGenerator(
      id,snapshotId,modelId,maybeKey.get(),goal,repairFeedback,sandboxBearer,allowedServices,savedProfile,pre,candidates,relationshipSummaries,new ArrayList<>(inheritedKeys),runnableList);
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
    "Auto-generated Architecture Verification Scenario",
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
   String sandboxBearer){
  List<DetectedEndpointDTO> business=sortedCandidates.stream().filter(ep->!isHealthProbePath(ep.getPath())).toList();
  List<DetectedEndpointDTO> healthOnly=sortedCandidates.stream().filter(ep->isHealthProbePath(ep.getPath())).toList();

  List<DetectedEndpointDTO> selected=new ArrayList<>();
  Set<DetectedEndpointDTO> pickedSet=new LinkedHashSet<>();
  // Pass 1: ensure up to 2 causal business endpoints per runnable service so multi-service repos get full coverage
  Map<String,Integer> perServiceCount=new HashMap<>();
  for(DetectedEndpointDTO ep:business){
   if(pickedSet.size()>=10)break;
   int cnt=perServiceCount.getOrDefault(ep.getService(),0);
   if(cnt<2){
    pickedSet.add(ep);
    perServiceCount.put(ep.getService(),cnt+1);
   }
  }
  // Pass 2: fill remaining slots up to 10 in causal priority order
  for(DetectedEndpointDTO ep:business){
   if(pickedSet.size()>=10)break;
   pickedSet.add(ep);
  }
  // Pass 3: for any runnable service with 0 business endpoints, include 1 health/readiness probe
  Set<String> coveredServices=new HashSet<>();
  pickedSet.forEach(ep->coveredServices.add(ep.getService()));
  for(DetectedEndpointDTO hp:healthOnly){
   if(pickedSet.size()>=10)break;
   if(coveredServices.add(hp.getService())){
    pickedSet.add(hp);
   }
  }
  for(String svc:allowedServices){
   if(pickedSet.size()>=10)break;
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
   String phase=ep.getJourneyRole()!=null?ep.getJourneyRole():inferJourneyPhase(ep);

   // Tier A Auth extraction when auth endpoint declares a token field in responseFields
   if("AUTH_ENTRY".equals(phase)&&ep.getResponseFields()!=null){
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

   // Seed/Workflow POST extraction when responseFields confirms an id/code pointer
   if("POST".equals(ep.getMethod())&&!"AUTH_ENTRY".equals(phase)&&ep.getResponseFields()!=null&&!resRoot.isEmpty()){
    String idPtr=findMatchingPointer(ep.getResponseFields(),List.of("id",resRoot.toLowerCase(Locale.ROOT)+"id","code","sku","orderid","productid"));
    if(idPtr!=null){
     String varName=toScenarioEnvKey(resRoot+"_ID");
     stepExtract.put(varName,idPtr);
     extractedByResource.putIfAbsent(resRoot,varName);
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
   if(Boolean.TRUE.equals(ep.getRequiresAuth())&&!"AUTH_ENTRY".equals(phase)){
    if(hasExtractedAuthToken){
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
     rewrittenPath.toString(),
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

  StringBuilder prompt=new StringBuilder();
  prompt.append("You are an elite Principal Distributed Systems Architect and Verification Planner for MAVIS.\n");
  prompt.append("Design a TOP-DOWN, STATEFUL, END-TO-END Business Journey scenario (max 10 steps) using ONLY the allowed services and discovered endpoints below.\n");
  prompt.append("CRITICAL DESIGN RULES:\n");
  prompt.append("1. DO NOT generate isolated, naive per-table CRUD loops (avoid calling DELETE on seeded entities right after creating them unless testing a compensation/cancellation workflow).\n");
  prompt.append("2. Follow a Top-Down Business Journey across services:\n");
  prompt.append("   - Phase 0 (AUTH_ENTRY): If auth/register/login endpoints exist and downstream routes require auth, authenticate first and extract AUTH_TOKEN.\n");
  prompt.append("   - Phase 1 (PREREQUISITE_SEED): Seed prerequisite master data (e.g. organization/department/catalog/inventory/account) via POST and extract created IDs/codes using `extract`.\n");
  prompt.append("   - Phase 2 (CROSS_SERVICE_WORKFLOW): Invoke high-fan-out Gateway/Orchestrator business actions (e.g. checkout, order creation, payment, transfer, booking) referencing extracted `{{VAR}}` values in `path` or `sampleJsonBody` to trigger cross-service OpenTelemetry spans.\n");
  prompt.append("   - Phase 3 (STATE_VERIFICATION): Verify side effects and state transitions across downstream services using GET with `{{VAR}}`.\n");
  prompt.append("3. Stateful Variable Chaining: When a POST step returns JSON fields (see `responseFields`), you may attach `\"extract\": {\"ORDER_ID\": \"/id\"}` (variable names MUST match `[A-Z][A-Z0-9_]*`, pointers MUST start with `/`), and reference `{{ORDER_ID}}` in subsequent steps' `path`, `sampleJsonBody`, or `headers`.\n");
  prompt.append("4. Respect `validationHints` and `dtoSample` so every POST/PUT/PATCH body passes Bean Validation (@NotBlank, @Email, @Positive, etc.) on the first try.\n");
  prompt.append("Allowed services: ").append(String.join(", ",allowedServices)).append("\n");
  if(!relationships.isEmpty()){
   prompt.append("Architecture C4 relationships (target these cross-service paths):\n");
   relationships.stream().limit(25).forEach(r->prompt.append("- ").append(SecretRedactor.redactString(r)).append("\n"));
  }
  if(repairFeedback!=null&&!repairFeedback.isBlank()){
   prompt.append("Previous Run Diagnostic Feedback (SELF-HEAL these failures and cover unverified services):\n").append(repairFeedback).append("\n");
  }
  prompt.append("Discovered endpoints (ordered by top-down topology & fan-out):\n");
  candidates.stream().limit(40).forEach(ep->{
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
          "journeyPhase": "AUTH_ENTRY|PREREQUISITE_SEED|CROSS_SERVICE_WORKFLOW|STATE_VERIFICATION",
          "rationale": "1-line architectural reason for this step",
          "sampleJsonBody": "{\\"optional\\":\\"sample\\"}",
          "headers": {"Authorization": "Bearer {{AUTH_TOKEN}}"},
          "extract": {"ENTITY_ID": "/id"}
        }
      ]
    }
    Use {{VAR}} ONLY for variables extracted by an earlier step's `extract` map; replace any other path parameters like {id} directly with realistic sample values (e.g. 1, SKU-LAPTOP-01).
    """);

  boolean hasCustomUrl=customAiEndpointUrl!=null&&!customAiEndpointUrl.isBlank();
  boolean useOpenAi=apiKey!=null&&apiKey.startsWith("sk-");
  String redactedPrompt=SecretRedactor.redactString(prompt.toString());
  String rawText=null;
  String aiModelName=null;
  if(useOpenAi){
   String primaryModel=(scenarioOpenAiModel!=null&&!scenarioOpenAiModel.isBlank())?scenarioOpenAiModel.trim():"gpt-5.4";
   List<String> modelChain=primaryModel.equals("gpt-5-mini")?List.of("gpt-5-mini"):List.of(primaryModel,"gpt-5-mini");
   Exception lastErr=null;
   for(String candidateModel:modelChain){
    try{
     ObjectNode openAiReq=json.createObjectNode();
     openAiReq.put("model",candidateModel);
     openAiReq.put("reasoning_effort",candidateModel.startsWith("gpt-5.4")?"medium":"minimal");
     openAiReq.putObject("response_format").put("type","json_object");
     ArrayNode messages=openAiReq.putArray("messages");
     messages.addObject().put("role","user").put("content",redactedPrompt);
     String endpoint=hasCustomUrl?customAiEndpointUrl:"https://api.openai.com/v1/chat/completions";
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
  int idx=1;
  for(JsonNode item:parsed.path("steps")){
   if(idx>10)break;
   String rawSvc=item.path("service").asText("").trim();
   String svc=resolveServiceToAllowed(rawSvc,null,allowedServices,savedProfile,pre,false);
   String verb=item.path("method").asText("GET").trim().toUpperCase(Locale.ROOT);
   String rawPath=item.path("path").asText("").trim();
   int status=item.path("expectedStatus").asInt(200);
   if(svc==null||!allowedServices.contains(svc))continue;
   if(!Set.of("GET","POST","PUT","PATCH","DELETE").contains(verb))continue;
   if(!rawPath.startsWith("/")||rawPath.startsWith("//")||rawPath.contains("\\")||rawPath.contains("\n")||rawPath.contains("\r"))continue;
   if(status<100||status>599)status=200;

   DetectedEndpointDTO matchedEp=endpointLookup.get(svc+":"+verb+":"+rawPath);
   if(matchedEp==null)matchedEp=endpointLookup.get(canonicalRouteKey(svc,verb,rawPath));

   String serviceKey=safeServiceEnvPrefix(svc);
   Map<String,String> stepVars=new LinkedHashMap<>();
   // Preserve {{VAR}} in rawPath when VAR is already in availableExtractedVars; convert single {param} to {{V0}}
   String pathSingleBracesOnly=rawPath.replaceAll("\\{\\{([a-zA-Z][a-zA-Z0-9_]*)}}","__MAVIS_VAR_$1__");
   StringBuffer rewrittenSingle=new StringBuffer();
   Matcher m=PATH_PARAM_PATTERN.matcher(pathSingleBracesOnly);
   while(m.find()){
    String param=m.group(1);
    String alias="V"+stepVars.size();
    String envName=(serviceKey+"_"+param.replaceAll("[^A-Za-z0-9]","_").toUpperCase(Locale.ROOT));
    if(envName.length()>60)envName=envName.substring(0,60);
    stepVars.put(alias,envName);
    sampleInputs.putIfAbsent(envName,inferSampleParamValue(param));
    m.appendReplacement(rewrittenSingle,"{{"+alias+"}}");
   }
   m.appendTail(rewrittenSingle);
   String finalPath=rewrittenSingle.toString().replaceAll("__MAVIS_VAR_([a-zA-Z][a-zA-Z0-9_]*)__","{{$1}}");

   String bodyRef=null;
   if(Set.of("POST","PUT","PATCH").contains(verb)){
    bodyRef=serviceKey+"_BODY_"+idx;
    String aiSampleBody=SecretRedactor.redactString(item.path("sampleJsonBody").asText(""));
    String fallbackBody=(matchedEp!=null&&isValidJsonObject(matchedEp.getSampleJsonBody()))
      ?SecretRedactor.redactString(matchedEp.getSampleJsonBody())
      :inferSampleJsonBody(rawPath);
    sampleInputs.putIfAbsent(bodyRef,isValidJsonObject(aiSampleBody)?aiSampleBody:fallbackBody);
   }

   Map<String,String> stepHeaders=new LinkedHashMap<>();
   if(item.path("headers").isObject()){
    item.path("headers").fields().forEachRemaining(e->{
     String hk=e.getKey().trim();
     String hv=SecretRedactor.redactString(e.getValue().asText("").trim());
     if(hk.matches("[A-Za-z][A-Za-z0-9-]{0,63}")&&!Set.of("host","traceparent","tracestate").contains(hk.toLowerCase(Locale.ROOT))&&!hv.isEmpty()&&!hv.contains("\r")&&!hv.contains("\n")){
      stepHeaders.put(hk,hv);
     }
    });
   }
   List<Map<String,String>> stepEnvHeaders=null;
   String phase=item.path("journeyPhase").asText(matchedEp!=null&&matchedEp.getJourneyRole()!=null?matchedEp.getJourneyRole():inferJourneyPhase(matchedEp!=null?matchedEp:DetectedEndpointDTO.builder().service(svc).method(verb).path(rawPath).build()));
   if(matchedEp!=null&&Boolean.TRUE.equals(matchedEp.getRequiresAuth())&&!"AUTH_ENTRY".equals(phase)&&!stepHeaders.containsKey("Authorization")){
    if(availableExtractedVars.contains("AUTH_TOKEN")){
     stepHeaders.put("Authorization","Bearer {{AUTH_TOKEN}}");
    }else if(sandboxBearer!=null){
     String authRef=serviceKey+"_AUTHORIZATION";
     stepEnvHeaders=List.of(Map.of("name","Authorization","reference",authRef));
     sampleInputs.putIfAbsent(authRef,sandboxBearer);
    }
   }

   Map<String,String> stepExtract=new LinkedHashMap<>();
   if(item.path("extract").isObject()){
    item.path("extract").fields().forEachRemaining(e->{
     String ek=toScenarioEnvKey(e.getKey().trim());
     String ptr=e.getValue().asText("").trim();
     if(ptr.startsWith("$."))ptr="/"+ptr.substring(2).replace('.','/');
     else if(!ptr.isEmpty()&&!ptr.startsWith("/"))ptr="/"+ptr.replace('.','/');
     if(!ek.isEmpty()&&ptr.startsWith("/")&&ptr.length()<=512){
      stepExtract.put(ek,ptr);
      availableExtractedVars.add(ek);
     }
    });
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
   String s=segs[i].replaceAll("[^a-z0-9]","");
   if(s.isEmpty()||Set.of("api","v1","v2","v3","public","internal","rest","search","query","checkout","cancel","approve","reject","pay","charge","process","confirm","submit","status","health","actuator").contains(s))continue;
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
  if((cleanParam.equals("id")||cleanParam.equals("code")||cleanParam.equals("sku"))&&!resourceToken.isEmpty()&&extractedByResource.containsKey(resourceToken)){
   return extractedByResource.get(resourceToken);
  }
  for(Map.Entry<String,String> e:extractedByResource.entrySet()){
   String tok=e.getKey().toLowerCase(Locale.ROOT);
   if(cleanParam.equals(tok+"id")||cleanParam.equals(tok+"code")||cleanParam.equals(tok+"sku")){
    return e.getValue();
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
    String low=f.replaceAll("[^A-Za-z0-9]","").toLowerCase(Locale.ROOT);
    for(Map.Entry<String,String> e:extractedByResource.entrySet()){
     String tok=e.getKey().toLowerCase(Locale.ROOT);
     if(low.equals(tok+"id")||low.equals(tok+"code")||low.equals(tok+"sku")){
      obj.put(f,"{{"+e.getValue()+"}}");
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
   JsonNode stepsNode=target.getRunnerReceiptJson().path("scenario").path("steps");
   if(!stepsNode.isArray())stepsNode=target.getRunnerReceiptJson().path("steps");
   if(stepsNode.isArray()){
    for(JsonNode st:stepsNode){
     sb.append("  * step ").append(st.path("stepId").asText(st.path("id").asText("?")))
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
   Set<String> roles=new LinkedHashSet<>(List.of("USER","ADMIN"));
   if(requiredRoles!=null){
    for(String r:requiredRoles){if(r!=null&&!r.isBlank())roles.add(r.trim().toUpperCase(Locale.ROOT));}
   }
   List<String> roleWithPrefix=new ArrayList<>();
   for(String r:roles){
    roleWithPrefix.add(r);
    if(!r.startsWith("ROLE_"))roleWithPrefix.add("ROLE_"+r);
   }
   long now=System.currentTimeMillis()/1000L;
   ObjectNode payload=json.createObjectNode();
   payload.put("sub","1");
   payload.put("userId",1);
   payload.put("id",1);
   payload.put("username","alice");
   payload.put("preferred_username","alice");
   payload.put("email","alice@example.org");
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

 private static int causalEndpointPhase(DetectedEndpointDTO ep,Set<String> crudResourceRoots){
  if(isHealthProbePath(ep.getPath()))return 5;
  String verb=ep.getMethod();
  String low=ep.getPath().toLowerCase(Locale.ROOT);
  if("POST".equals(verb)&&(low.contains("/auth/")||low.endsWith("/login")||low.endsWith("/signin")||low.endsWith("/register")||low.endsWith("/signup")||low.endsWith("/token"))){
   return 0;
  }
  if("POST".equals(verb)&&!PATH_PARAM_PATTERN.matcher(ep.getPath()).find()){
   String lastSeg=low.contains("/")?low.substring(low.lastIndexOf('/')+1):low;
   boolean actionVerb=Set.of("checkout","cancel","approve","reject","pay","charge","process","confirm","submit","search","query","validate","verify","export","import","close","reopen").contains(lastSeg);
   if(!actionVerb&&crudResourceRoots.contains(ep.getService()+":"+resourceRoot(ep.getPath()))){
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
  String lower=param==null?"":param.toLowerCase(Locale.ROOT);
  if(lower.contains("uuid")||lower.contains("guid"))return "00000000-0000-0000-0000-000000000001";
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
  if(lower.contains("order")||lower.contains("checkout"))return "{\"customerEmail\":\"alice@mavis.io\",\"productCode\":\"SKU-LAPTOP-01\",\"itemId\":\"item-1\",\"quantity\":1}";
  if(lower.contains("payment")||lower.contains("charge"))return "{\"orderId\":1,\"amount\":1299.00,\"paymentMethod\":\"CREDIT_CARD\"}";
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

 @Transactional
 public RuntimeSessionResponseDTO start(UUID id,StartRequest r){lock(id);if(!r.approved())throw new BusinessException(ErrorCode.BAD_REQUEST,"Explicit approval required");
  var c=configurations.findById(id).orElseThrow(()->new BusinessException(ErrorCode.BAD_REQUEST,"Save runtime configuration first"));var s=scenarios.findById(r.scenarioId()).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));
  if(!id.equals(s.getProjectId())||!r.snapshotId().equals(c.getSourceSnapshotId()))throw new BusinessException(ErrorCode.BAD_REQUEST,"Pinned planning scope mismatch");
  if(c.getRevision()!=r.configurationRevision()||s.getRevision()!=r.scenarioRevision())throw new BusinessException(ErrorCode.CONFLICT);
  var pre=runtime.runComposePreflight(c.getSourceSnapshotId());if(!pre.isCompatible())throw new BusinessException(ErrorCode.BAD_REQUEST,"Compose preflight rejected");
  boolean hasRemediatedCompose=(c.getProfile()!=null&&c.getProfile().hasNonNull("sandboxCompose")&&!c.getProfile().path("sandboxCompose").asText().isBlank())
    ||(pre.getSandboxComposeYaml()!=null&&!pre.getSandboxComposeYaml().isBlank()&&(pre.getUnresolvableRunnerIssues()==null||pre.getUnresolvableRunnerIssues().isEmpty()));
  List<String> blockingIssues=hasRemediatedCompose?List.of():(pre.getUnresolvableRunnerIssues()!=null&&!pre.getUnresolvableRunnerIssues().isEmpty()?pre.getUnresolvableRunnerIssues():pre.getRunnerIssues());
  if(blockingIssues!=null&&!blockingIssues.isEmpty())throw new BusinessException(ErrorCode.BAD_REQUEST,"The sandbox runner cannot execute this Compose file: "+String.join("; ",blockingIssues.subList(0,Math.min(3,blockingIssues.size()))));
  var apps=c.getProfile().path("applications");
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
  normalizeAndBindScenarioVariables(normalizedSteps);
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
  ObjectNode profileCopy=c.getProfile().deepCopy();
  profileCopy.remove("sealedInputs");
  if(!profileCopy.hasNonNull("collectorImage")&&runnerCollectorImage!=null&&!runnerCollectorImage.isBlank())profileCopy.put("collectorImage",runnerCollectorImage.trim());
  if(!profileCopy.hasNonNull("scenarioRunnerImage")&&runnerScenarioImage!=null&&!runnerScenarioImage.isBlank())profileCopy.put("scenarioRunnerImage",runnerScenarioImage.trim());
  if(profileCopy.has("approvedForLocalPoc")&&!profileHasPinnedRunnerImages(profileCopy)){
   throw new BusinessException(ErrorCode.BAD_REQUEST,"Sandbox runner images are not configured. An operator must set MAVIS_RUNNER_COLLECTOR_IMAGE and MAVIS_RUNNER_SCENARIO_RUNNER_IMAGE to digest-pinned images");
  }
  if(!profileCopy.hasNonNull("sandboxCompose")&&pre.getSandboxComposeYaml()!=null&&!pre.getSandboxComposeYaml().isBlank()&&(pre.getUnresolvableRunnerIssues()==null||pre.getUnresolvableRunnerIssues().isEmpty())){
   profileCopy.put("sandboxCompose",pre.getSandboxComposeYaml());
  }
  if(!execEnv.bindings().isEmpty())profileCopy.set("environmentBindings",execEnv.bindings());
  config.set("profile",profileCopy);
  var scenario=config.putObject("scenario");scenario.set("steps",normalizedSteps);scenario.put("timeoutSeconds",settings.requireProfile(c.getProfileId()).timeoutSeconds());
  var planning=config.putObject("planning");planning.put("scenarioId",s.getId().toString());planning.put("scenarioRevision",s.getRevision());planning.put("configurationRevision",c.getRevision());
  Map<String,String> confirmedMappings=resolveConfirmedServiceMappings(c.getModelVersionId(),c.getProfile(),pre,apps);
  var createBuilder=RuntimeSessionCreateRequest.builder()
   .projectId(id)
   .sourceSnapshotId(c.getSourceSnapshotId())
   .modelVersionId(c.getModelVersionId())
   .profileName(c.getProfileId())
   .scenarioName(s.getName())
   .scenarioConfig(config);
  if(!confirmedMappings.isEmpty())createBuilder.confirmedServiceMappings(confirmedMappings);
  var created=runtime.createRuntimeSession(createBuilder.build());

  // Fails (and rolls back the session) when MAVIS_RUNTIME_ENVIRONMENT_KEY is missing instead of silently dropping inputs.
  if(!boundedProtectedEnv.isEmpty())environments.store(created.getId(),boundedProtectedEnv);
  return runtime.approveAndStartSession(created.getId());
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

 private void normalizeAndBindScenarioVariables(ArrayNode steps){
  if(steps==null)return;
  Set<String> available=new HashSet<>();
  for(JsonNode node:steps){
   if(!(node instanceof ObjectNode step))continue;
   if(step.path("path").isTextual()){
    String rawPath=step.get("path").asText();
    Matcher single=SINGLE_BRACE_PATH_PARAM.matcher(rawPath);
    StringBuilder sb=new StringBuilder();
    while(single.find()){
     single.appendReplacement(sb,Matcher.quoteReplacement(inferSampleParamValue(single.group(1))));
    }
    single.appendTail(sb);
    step.put("path",sb.toString());
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
     if(envVars.size()<64&&!envVars.has(envKey)){
      envVars.put(envKey,envKey);
     }
     available.add(envKey);
     if(!orig.equals(envKey)){
      String from="{{"+orig+"}}",to="{{"+envKey+"}}";
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
    }
   }
   if(step.path("extract").isObject()){
    ObjectNode ext=(ObjectNode)step.get("extract");
    List<String> extKeys=new ArrayList<>();
    ext.fieldNames().forEachRemaining(extKeys::add);
    for(String ek:extKeys){
     String ptr=ext.path(ek).asText("").trim();
     if(ptr.startsWith("$."))ext.put(ek,"/"+ptr.substring(2).replace('.','/'));
     else if(!ptr.isEmpty()&&!ptr.startsWith("/"))ext.put(ek,"/"+ptr.replace('.','/'));
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
  String mintedBearer=null;
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
    if(!bodyRef.isBlank()&&!isValidJsonObject(protectedEnv.get(bodyRef))){
     String defBody=step1Defaults!=null?step1Defaults.get(bodyRef):null;
     String fallback=isValidJsonObject(defBody)?defBody:detectedBodyByRoute.get((svc+":"+method+":"+path).toLowerCase(Locale.ROOT));
     if(fallback==null)fallback=detectedBodyByRoute.get(canonicalRouteKey(svc,method,path));
     protectedEnv.put(bodyRef,isValidJsonObject(fallback)?fallback:inferSampleJsonBody(path));
    }
    // Dual-compatibility with pinned ScenarioRunnerImage: when body payload uses {{VAR}}, promote to inline jsonBody so Replace(body.RootElement) executes
    String resolvedBody=protectedEnv.get(bodyRef);
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
    step.path("environmentVariables").fields().forEachRemaining(e->{
     String envRef=e.getValue().asText("");
     if(!envRef.isBlank()&&envRef.matches("[A-Z][A-Z0-9_]{0,63}")&&(protectedEnv.get(envRef)==null||protectedEnv.get(envRef).isBlank())){
      String defVal=step1Defaults!=null?step1Defaults.get(envRef):null;
      protectedEnv.put(envRef,(defVal!=null&&!defVal.isBlank()&&defVal.length()<=16000&&defVal.indexOf('\0')<0)?defVal:inferSampleParamValue(envRef));
     }
    });
   }
   if(step.path("envHeaders").isArray()){
    for(JsonNode h:step.path("envHeaders")){
     String hName=h.path("name").asText("");
     String hRef=h.path("reference").asText("");
     if(!hRef.isBlank()&&hRef.matches("[A-Z][A-Z0-9_]{0,63}")&&(protectedEnv.get(hRef)==null||protectedEnv.get(hRef).isBlank())){
      String defVal=step1Defaults!=null?step1Defaults.get(hRef):null;
      if(defVal!=null&&!defVal.isBlank()&&defVal.length()<=16000&&defVal.indexOf('\0')<0){
       protectedEnv.put(hRef,defVal);
      }else if("Authorization".equalsIgnoreCase(hName)){
       if(mintedBearer==null)mintedBearer=mintSandboxBearerToken(protectedEnv,allRequiredRoles);
       protectedEnv.put(hRef,mintedBearer);
      }else{
       protectedEnv.put(hRef,"sandbox-verification-value");
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

  Set<String> userOverriddenKeys=new HashSet<>();
  candidates.forEach((k,v)->{
   if(k==null||!k.matches("[A-Z][A-Z0-9_]{0,63}")||v==null||v.isBlank()||v.length()>16000)return;
   var meta=known.get(k);
   // Unchanged defaults already live in Compose/source; only real overrides are injected.
   if(meta!=null&&meta.isDefaultPresent()&&v.equals(meta.getDefaultValue()))return;
   userOverriddenKeys.add(k);
   protectedEnv.put(k,v);
   if(isBindableEnvName(k)){
    for(String target:owningServices(meta,composeServices,appServices)){
     serviceBindings.computeIfAbsent(target,x->new LinkedHashMap<>()).put(k,k);
    }
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
   if(userOverriddenKeys.contains(key)||v.isDefaultPresent()||!isBindableEnvName(key))continue;
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
     if(sharedGenerated==null)sharedGenerated=randomSecretFor(key,rsaPair);
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

 private static boolean isBindableEnvName(String name){
  return name!=null&&name.matches("[A-Z][A-Z0-9_]{0,63}")&&!"PATH".equals(name)&&RESERVED_ENV_PREFIXES.stream().noneMatch(name::startsWith);
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
    n.get("extract").fields().forEachRemaining(e->{
     String ek=e.getKey();
     String ptr=e.getValue().asText("");
     if(!ek.matches("[a-zA-Z][a-zA-Z0-9_]{0,63}")||!ptr.startsWith("/")||ptr.length()>512){
      throw new BusinessException(ErrorCode.BAD_REQUEST,"Invalid extract variable or JSON pointer");
     }
    });
   }
   if(n.hasNonNull("jsonBody")){try{var body=json.readTree(n.get("jsonBody").asText());if(body==null||!body.equals(SecretRedactor.redactJson(body)))throw new IllegalArgumentException();}catch(Exception ex){throw new BusinessException(ErrorCode.BAD_REQUEST,"JSON body must not contain literal secrets");}}
   result.add(n);
  }return result;
 }
}
