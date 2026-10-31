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
 private ModelElementRepository modelElements;
 @Autowired(required = false)
 private ModelRelationshipRepository modelRelationships;
 @Autowired(required = false)
 private ApiKeyProvider apiKeyProvider;
 @Autowired(required = false)
 private AiUsageRecorder aiUsageRecorder;

 @Value("${mavis.ai.endpoint-url:}")
 private String customAiEndpointUrl;

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
 public record GenerateScenarioRequest(UUID snapshotId,UUID modelId,@Size(max=500) String goal){}
 public record GeneratedStepDraft(String id,String service,String method,String path,int expectedStatus,String rationale,String source,Map<String,String> environmentVariables,List<Map<String,String>> envHeaders,String bodyReference){}
 public record GeneratedScenarioDraftView(UUID projectId,UUID snapshotId,UUID modelId,String suggestedName,String generatorMode,String aiModelName,String summary,List<GeneratedStepDraft> steps,Map<String,String> sampleInputs,List<String> inheritedEnvKeys){}

 private Project project(UUID id,boolean write){var p=projects.findById(id).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));if(write)policy.requireProjectWriteAccess(p);else policy.requireProjectReadAccess(p);return p;}
 private void lock(UUID id){var p=projects.findLockedById(id).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));policy.requireProjectWriteAccess(p);}

 @Transactional(readOnly=true)
 public ConfigurationView configuration(UUID id){project(id,false);var c=configurations.findById(id).orElse(null);var snapshot=c!=null?c.getSourceSnapshotId():sources.findFirstByProjectIdOrderByCreatedAtDesc(id).map(SourceSnapshot::getId).orElse(null);var warnings=new ArrayList<String>();boolean supported=false;
  PreflightCheckResponseDTO pre=null;
  if(snapshot!=null){pre=runtime.runComposePreflight(snapshot);supported=pre.isCompatible();warnings.addAll(pre.getSecurityWarnings());}else warnings.add("No source snapshot exists");
  if(c==null)warnings.add("Save a pinned source, model and operator-provisioned execution profile before starting");
  boolean enabled=settings.enabled("otel-collector")&&(c==null||settings.profile(c.getProfileId()).enabled());if(!enabled)warnings.add("Runtime integration or execution profile is disabled");
  ObjectNode profileNode=c!=null&&c.getProfile()!=null&&c.getProfile().isObject()?(ObjectNode)c.getProfile().deepCopy():json.createObjectNode();
  List<String> configuredSecrets=runtime.getConfiguredSecretKeys(id);
  if(!configuredSecrets.isEmpty()){
   ArrayNode csArr=profileNode.putArray("configuredSecretKeys");
   configuredSecrets.forEach(csArr::add);
  }
  if(pre!=null){
   profileNode.set("detectedServices",json.valueToTree(pre.getDetectedServices()));
   profileNode.set("servicePorts",json.valueToTree(pre.getServicePorts()));
   profileNode.set("serviceStacks",json.valueToTree(pre.getServiceStacks()));
   profileNode.set("detectedEndpoints",json.valueToTree(pre.getDetectedEndpoints()));
   profileNode.set("databaseChecks",json.valueToTree(pre.getDatabaseChecks()));
   profileNode.set("requiredEnvVars",json.valueToTree(pre.getRequiredEnvVars()));
  }
  return new ConfigurationView(id,snapshot,c==null?null:c.getModelVersionId(),c==null?"SPRING_BOOT_DOTNET_COMPOSE_V1":c.getProfileId(),profileNode,c==null?0:c.getRevision(),c!=null,supported,c!=null&&supported&&enabled,warnings,true);
 }

 @Transactional
 public ConfigurationView saveConfiguration(UUID id,ConfigurationRequest r){lock(id);var c=configurations.findById(id).orElseGet(RuntimeConfiguration::new);if(c.getRevision()!=r.expectedRevision())throw new BusinessException(ErrorCode.CONFLICT);
  var source=sources.findById(r.snapshotId()).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));var model=models.findById(r.modelId()).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));
  if(!source.getProject().getId().equals(id)||!model.getProject().getId().equals(id)||model.getSourceSnapshot()==null||!model.getSourceSnapshot().getId().equals(source.getId()))throw new BusinessException(ErrorCode.BAD_REQUEST,"Source/model scope mismatch");
  settings.requireProfile(r.profileId());
  JsonNode normalizedProfile=normalizeStep1Profile(id,r.snapshotId(),r.profileId(),r.profile());
  validateProfile(normalizedProfile);
  c.setProjectId(id);c.setSourceSnapshotId(r.snapshotId());c.setModelVersionId(r.modelId());c.setProfileId(r.profileId());c.setProfile(normalizedProfile.deepCopy());c.setRevision(c.getRevision()+1);configurations.saveAndFlush(c);return configuration(id);
 }

 private JsonNode normalizeStep1Profile(UUID projectId,UUID snapshotId,String profileId,JsonNode rawProfile){
  if(rawProfile==null||!rawProfile.isObject())return rawProfile;
  boolean isStep1Form=rawProfile.has("serviceMappings")||rawProfile.has("environmentVariables")||rawProfile.has("secretReferences")||rawProfile.has("secretValues");
  if(!isStep1Form)return rawProfile;
  ObjectNode p=(ObjectNode)rawProfile.deepCopy();
  Map<String,String> secretsToStore=new LinkedHashMap<>();
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
  }
  secretRefs.addAll(runtime.getConfiguredSecretKeys(projectId));
  p.set("secretReferences",json.valueToTree(secretRefs));
  if(!p.hasNonNull("collectorImage"))p.put("collectorImage","otel/opentelemetry-collector-contrib@sha256:"+"b".repeat(64));
  if(!p.hasNonNull("scenarioRunnerImage"))p.put("scenarioRunnerImage","mavis/scenario-runner@sha256:"+"c".repeat(64));
  if(!p.hasNonNull("instrumentationVolume"))p.put("instrumentationVolume","mavis-agents-v1");
  if(!p.hasNonNull("approvedForLocalPoc"))p.put("approvedForLocalPoc",true);
  if(!p.has("applications")||!p.get("applications").isObject()||p.get("applications").isEmpty()){
   ObjectNode apps=p.putObject("applications");
   Set<String> svcNames=new LinkedHashSet<>();
   PreflightCheckResponseDTO pre=null;
   try{pre=runtime.runComposePreflight(snapshotId);}catch(Exception ignored){}
   if(pre!=null&&pre.getDetectedServices()!=null)svcNames.addAll(pre.getDetectedServices());
   if(p.has("serviceMappings")&&p.get("serviceMappings").isObject()){
    p.get("serviceMappings").fieldNames().forEachRemaining(svcNames::add);
   }
   if(svcNames.isEmpty())svcNames.add("gateway");
   int count=0;
   for(String sName:svcNames){
    if(count>=10)break;
    String safeKey=sName.replaceAll("[^a-zA-Z0-9_-]","-");
    if(safeKey.isEmpty()||!Character.isLetterOrDigit(safeKey.charAt(0)))safeKey="svc-"+safeKey;
    if(safeKey.length()>62)safeKey=safeKey.substring(0,62);
    ObjectNode appNode=apps.putObject(safeKey);
    int port=pre!=null&&pre.getServicePorts()!=null&&pre.getServicePorts().containsKey(sName)?pre.getServicePorts().get(sName):8080;
    String stack=pre!=null&&pre.getServiceStacks()!=null?pre.getServiceStacks().getOrDefault(sName,"java"):"java";
    appNode.put("runtime","dotnet".equalsIgnoreCase(stack)?"dotnet8-linux-x64-glibc":"java");
    appNode.put("containerPort",(port>=1&&port<=65535)?port:8080);
    appNode.put("readinessPath","/health");
    count++;
   }
  }
  Map<String,String> mappings=new LinkedHashMap<>();
  if(p.has("serviceMappings")&&p.get("serviceMappings").isObject()){
   p.get("serviceMappings").fields().forEachRemaining(e->mappings.put(e.getKey(),e.getValue().asText("")));
  }
  runtime.updateProjectRuntimeConfig(projectId,RuntimeProjectConfigRequestDTO.builder()
   .profileId(profileId)
   .confirmedServiceMappings(mappings)
   .environmentVariables(cleanEnv)
   .secretReferences(new ArrayList<>(secretRefs))
   .build());
  return p;
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
   if(!model.getProject().getId().equals(id))throw new BusinessException(ErrorCode.BAD_REQUEST,"Model scope mismatch");
  }

  PreflightCheckResponseDTO pre=runtime.runComposePreflight(snapshotId);
  Set<String> allowedServices=new LinkedHashSet<>();
  if(pre!=null&&pre.getDetectedServices()!=null)allowedServices.addAll(pre.getDetectedServices());
  if(cfg!=null&&cfg.getProfile()!=null&&cfg.getProfile().path("applications").isObject()){
   Set<String> profileApps=new LinkedHashSet<>();
   cfg.getProfile().path("applications").fieldNames().forEachRemaining(profileApps::add);
   if(!profileApps.isEmpty()){
    if(allowedServices.isEmpty())allowedServices.addAll(profileApps);
    else allowedServices.retainAll(profileApps);
   }
  }

  List<DetectedEndpointDTO> rawEndpoints=new ArrayList<>();
  if(pre!=null&&pre.getDetectedEndpoints()!=null)rawEndpoints.addAll(pre.getDetectedEndpoints());
  List<String> relationshipSummaries=new ArrayList<>();
  Set<String> connectedServices=new LinkedHashSet<>();
  if(model!=null&&modelRelationships!=null){
   for(ModelRelationship rel:modelRelationships.findByModelVersionId(model.getId())){
    String sName=rel.getSourceElement()!=null?rel.getSourceElement().getName():"";
    String tName=rel.getTargetElement()!=null?rel.getTargetElement().getName():"";
    if(!sName.isBlank()&&!tName.isBlank()){
     connectedServices.add(sName);
     connectedServices.add(tName);
     relationshipSummaries.add(sName+" -> "+tName+" ("+rel.getRelationType()+")");
    }
   }
  }
  if(model!=null&&modelElements!=null&& allowedServices.isEmpty()){
   for(ModelElement el:modelElements.findByModelVersionId(model.getId())){
    if("SERVICE_CONTAINER".equals(el.getElementType())&&el.getName()!=null&&!el.getName().isBlank()){
     allowedServices.add(el.getName());
    }
   }
  }
  String fallbackService=allowedServices.stream().findFirst().orElse("gateway");

  // Filter & order candidate endpoints deterministically
  List<DetectedEndpointDTO> candidates=new ArrayList<>();
  Set<String> seenKeys=new HashSet<>();
  for(DetectedEndpointDTO ep:rawEndpoints){
   if(ep==null||ep.getPath()==null||!ep.getPath().startsWith("/")||ep.getPath().startsWith("//"))continue;
   String svc=ep.getService()!=null&&allowedServices.contains(ep.getService())?ep.getService():fallbackService;
   String verb=ep.getMethod()!=null?ep.getMethod().toUpperCase(Locale.ROOT):"GET";
   if(!Set.of("GET","POST","PUT","PATCH","DELETE").contains(verb))continue;
   String key=svc+":"+verb+":"+ep.getPath();
   if(seenKeys.add(key)){
    candidates.add(DetectedEndpointDTO.builder().service(svc).method(verb).path(ep.getPath()).source(ep.getSource()).build());
   }
  }
  candidates.sort((a,b)->{
   boolean aConn=connectedServices.contains(a.getService());
   boolean bConn=connectedServices.contains(b.getService());
   if(aConn!=bConn)return aConn?-1:1;
   boolean aGet="GET".equals(a.getMethod());
   boolean bGet="GET".equals(b.getMethod());
   if(aGet!=bGet)return aGet?-1:1;
   return (a.getService()+a.getPath()).compareTo(b.getService()+b.getPath());
  });

  // Inherited Step 1 environment keys
  Set<String> inheritedKeys=new LinkedHashSet<>(runtime.getProjectExecutionEnvironment(id).keySet());
  if(cfg!=null&&cfg.getProfile()!=null){
   JsonNode envNode=cfg.getProfile().path("environmentVariables");
   if(envNode.isObject())envNode.fieldNames().forEachRemaining(inheritedKeys::add);
   JsonNode secNode=cfg.getProfile().path("secretReferences");
   if(secNode.isArray())secNode.forEach(n->{if(!n.asText("").isBlank())inheritedKeys.add(n.asText().trim());});
  }

  Map<String,String> sampleInputs=new LinkedHashMap<>();
  List<GeneratedStepDraft> staticSteps=buildDeterministicSteps(candidates,allowedServices,connectedServices,sampleInputs);

  String goal=r!=null&&r.goal()!=null?SecretRedactor.redactString(r.goal().trim()):"";
  Optional<String> maybeKey=apiKeyProvider!=null?apiKeyProvider.resolveApiKey():Optional.empty();
  if(maybeKey.isPresent()&&!candidates.isEmpty()){
   try{
    GeneratedScenarioDraftView aiDraft=callAiScenarioGenerator(
      id,snapshotId,modelId,maybeKey.get(),goal,allowedServices,candidates,relationshipSummaries,new ArrayList<>(inheritedKeys));
    if(aiDraft!=null&&!aiDraft.steps().isEmpty()){
     return aiDraft;
    }
   }catch(Exception ex){
    log.warn("AI scenario generation fell back to deterministic system synthesis: {}",ex.getMessage());
   }
  }

  String summary=staticSteps.isEmpty()
    ?"No declared HTTP endpoints were automatically detected in source; you can add HTTP steps manually below."
    :"Automatically synthesized "+staticSteps.size()+" test steps across "+allowedServices.size()+" services and endpoints discovered in Step 1. Review and confirm below before running.";
  return new GeneratedScenarioDraftView(
    id,snapshotId,modelId,
    "Auto-generated Architecture Verification Scenario",
    "SYSTEM_STATIC",
    "deterministic-static-v1",
    summary,
    staticSteps,
    sampleInputs,
    new ArrayList<>(inheritedKeys)
  );
 }

 private List<GeneratedStepDraft> buildDeterministicSteps(
   List<DetectedEndpointDTO> candidates,
   Set<String> allowedServices,
   Set<String> connectedServices,
   Map<String,String> sampleInputs){
  List<GeneratedStepDraft> steps=new ArrayList<>();
  List<DetectedEndpointDTO> selected=candidates.stream().limit(6).toList();
  int idx=1;
  for(DetectedEndpointDTO ep:selected){
   String serviceKey=ep.getService().replaceAll("[^A-Za-z0-9]","_").toUpperCase(Locale.ROOT);
   if(serviceKey.length()>32)serviceKey=serviceKey.substring(0,32);
   Map<String,String> stepVars=new LinkedHashMap<>();
   StringBuffer rewrittenPath=new StringBuffer();
   Matcher m=PATH_PARAM_PATTERN.matcher(ep.getPath());
   while(m.find()){
    String param=m.group(1);
    String alias="V"+stepVars.size();
    String envName=(serviceKey+"_"+param.replaceAll("[^A-Za-z0-9]","_").toUpperCase(Locale.ROOT));
    if(envName.length()>60)envName=envName.substring(0,60);
    stepVars.put(alias,envName);
    sampleInputs.putIfAbsent(envName,inferSampleParamValue(param));
    m.appendReplacement(rewrittenPath,"{{"+alias+"}}");
   }
   m.appendTail(rewrittenPath);

   String bodyRef=null;
   if(Set.of("POST","PUT","PATCH").contains(ep.getMethod())){
    bodyRef=serviceKey+"_BODY_"+idx;
    sampleInputs.putIfAbsent(bodyRef,inferSampleJsonBody(ep.getPath()));
   }

   String rationale=connectedServices.contains(ep.getService())
     ?"Verify "+ep.getMethod()+" "+ep.getPath()+" on "+ep.getService()+" to capture cross-service OpenTelemetry traces."
     :"Verify "+ep.getMethod()+" "+ep.getPath()+" on "+ep.getService()+" (detected from "+(ep.getSource()!=null?ep.getSource():"source snapshot")+").";

   steps.add(new GeneratedStepDraft(
     "step-"+idx,
     ep.getService(),
     ep.getMethod(),
     rewrittenPath.toString(),
     200,
     rationale,
     ep.getSource()!=null?ep.getSource():"Step 1 Preflight",
     stepVars.isEmpty()?null:stepVars,
     null,
     bodyRef
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
   Set<String> allowedServices,
   List<DetectedEndpointDTO> candidates,
   List<String> relationships,
   List<String> inheritedKeys) throws Exception {

  StringBuilder prompt=new StringBuilder();
  prompt.append("You are an architecture runtime verification planner for MAVIS.\n");
  prompt.append("Build an ordered HTTP test scenario (max 6 steps) using ONLY the allowed services and discovered endpoints below.\n");
  prompt.append("Allowed services: ").append(String.join(", ",allowedServices)).append("\n");
  if(!relationships.isEmpty()){
   prompt.append("Architecture relationships:\n");
   relationships.stream().limit(20).forEach(r->prompt.append("- ").append(SecretRedactor.redactString(r)).append("\n"));
  }
  prompt.append("Discovered endpoints:\n");
  candidates.stream().limit(25).forEach(ep->prompt.append("- service=").append(ep.getService())
    .append(", method=").append(ep.getMethod())
    .append(", path=").append(ep.getPath())
    .append(", source=").append(ep.getSource()!=null?ep.getSource():"snapshot").append("\n"));
  if(!goal.isBlank()){
   prompt.append("User goal: ").append(goal).append("\n");
  }
  prompt.append("""
    Return strict JSON ONLY (no markdown fences) matching this structure:
    {
      "suggestedName": "Scenario title",
      "summary": "Brief English explanation of why this scenario verifies the architecture",
      "steps": [
        {
          "service": "must be one of Allowed services",
          "method": "GET|POST|PUT|PATCH|DELETE",
          "path": "/exact/or/parameterized/path",
          "expectedStatus": 200,
          "rationale": "English 1-line reason for this step",
          "sampleJsonBody": "{\\"optional\\":\\"sample\\"}"
        }
      ]
    }
    """);

  ObjectNode reqBody=json.createObjectNode();
  ArrayNode contents=reqBody.putArray("contents");
  ObjectNode contentNode=contents.addObject();
  ArrayNode parts=contentNode.putArray("parts");
  parts.addObject().put("text",SecretRedactor.redactString(prompt.toString()));
  ObjectNode genCfg=reqBody.putObject("generationConfig");
  genCfg.put("temperature",0.2);
  genCfg.put("responseMimeType","application/json");

  String endpoint=(customAiEndpointUrl!=null&&!customAiEndpointUrl.isBlank())
    ?customAiEndpointUrl
    :(DEFAULT_GEMINI_URL+apiKey);

  HttpRequest httpReq=HttpRequest.newBuilder()
    .uri(URI.create(endpoint))
    .timeout(Duration.ofSeconds(12))
    .header("Content-Type","application/json")
    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(reqBody)))
    .build();

  HttpResponse<String> resp=httpClient.send(httpReq,HttpResponse.BodyHandlers.ofString());
  if(resp.statusCode()<200||resp.statusCode()>=300){
   throw new IllegalStateException("LLM status "+resp.statusCode());
  }
  JsonNode root=json.readTree(resp.body());
  if(aiUsageRecorder!=null){
   aiUsageRecorder.recordResponse("gemini","gemini-2.5-flash",root);
  }
  String rawText=root.path("candidates").path(0).path("content").path("parts").path(0).path("text").asText("");
  String cleaned=rawText.replaceAll("(?s)^```(?:json)?\\s*","").replaceAll("(?s)\\s*```$","").trim();
  JsonNode parsed=json.readTree(cleaned);
  if(parsed==null||!parsed.isObject())return null;

  Map<String,String> sampleInputs=new LinkedHashMap<>();
  List<GeneratedStepDraft> validSteps=new ArrayList<>();
  int idx=1;
  for(JsonNode item:parsed.path("steps")){
   if(idx>6)break;
   String svc=item.path("service").asText("").trim();
   String verb=item.path("method").asText("GET").trim().toUpperCase(Locale.ROOT);
   String rawPath=item.path("path").asText("").trim();
   int status=item.path("expectedStatus").asInt(200);
   if(!allowedServices.contains(svc))continue;
   if(!Set.of("GET","POST","PUT","PATCH","DELETE").contains(verb))continue;
   if(!rawPath.startsWith("/")||rawPath.startsWith("//")||rawPath.contains("\n")||rawPath.contains("\r"))continue;
   if(status<100||status>599)status=200;

   String serviceKey=svc.replaceAll("[^A-Za-z0-9]","_").toUpperCase(Locale.ROOT);
   if(serviceKey.length()>32)serviceKey=serviceKey.substring(0,32);
   Map<String,String> stepVars=new LinkedHashMap<>();
   StringBuffer rewrittenPath=new StringBuffer();
   Matcher m=PATH_PARAM_PATTERN.matcher(rawPath);
   while(m.find()){
    String param=m.group(1);
    String alias="V"+stepVars.size();
    String envName=(serviceKey+"_"+param.replaceAll("[^A-Za-z0-9]","_").toUpperCase(Locale.ROOT));
    if(envName.length()>60)envName=envName.substring(0,60);
    stepVars.put(alias,envName);
    sampleInputs.putIfAbsent(envName,inferSampleParamValue(param));
    m.appendReplacement(rewrittenPath,"{{"+alias+"}}");
   }
   m.appendTail(rewrittenPath);

   String bodyRef=null;
   if(Set.of("POST","PUT","PATCH").contains(verb)){
    bodyRef=serviceKey+"_BODY_"+idx;
    String aiSampleBody=SecretRedactor.redactString(item.path("sampleJsonBody").asText(""));
    sampleInputs.putIfAbsent(bodyRef,isValidSafeJson(aiSampleBody)?aiSampleBody:inferSampleJsonBody(rawPath));
   }

   String rationale=SecretRedactor.redactString(item.path("rationale").asText("Verify API workflow proposed by AI + Static Analysis."));
   validSteps.add(new GeneratedStepDraft(
     "step-"+idx,
     svc,
     verb,
     rewrittenPath.toString(),
     status,
     rationale,
     "AI + Static Analysis",
     stepVars.isEmpty()?null:stepVars,
     null,
     bodyRef
   ));
   idx++;
  }
  if(validSteps.isEmpty())return null;
  String suggestedName=SecretRedactor.redactString(parsed.path("suggestedName").asText("AI Architecture Verification Scenario")).trim();
  if(suggestedName.isEmpty())suggestedName="AI Architecture Verification Scenario";
  String summary=SecretRedactor.redactString(parsed.path("summary").asText("Scenario synthesized by System + Gemini AI from Step 1 endpoints and architecture relationships.")).trim();
  return new GeneratedScenarioDraftView(
    projectId,snapshotId,modelId,
    suggestedName.length()>100?suggestedName.substring(0,100):suggestedName,
    "AI_ASSISTED",
    "gemini-2.5-flash",
    summary,
    validSteps,
    sampleInputs,
    inheritedKeys
  );
 }

 private String inferSampleParamValue(String param){
  String lower=param==null?"":param.toLowerCase(Locale.ROOT);
  if(lower.contains("uuid")||lower.contains("guid"))return "00000000-0000-0000-0000-000000000001";
  if(lower.contains("code")||lower.contains("slug")||lower.contains("name"))return "sample-item-1";
  return "1";
 }

 private String inferSampleJsonBody(String path){
  String lower=path==null?"":path.toLowerCase(Locale.ROOT);
  if(lower.contains("employee"))return "{\"name\":\"Nguyen Van A\",\"age\":28,\"position\":\"Developer\",\"departmentId\":1,\"organizationId\":1}";
  if(lower.contains("department"))return "{\"name\":\"Engineering\",\"organizationId\":1}";
  if(lower.contains("organization"))return "{\"name\":\"MAVIS Corp\",\"address\":\"Hanoi\"}";
  if(lower.contains("order")||lower.contains("checkout"))return "{\"itemId\":\"item-1\",\"quantity\":1}";
  if(lower.contains("payment"))return "{\"orderId\":\"order-1\",\"amount\":100}";
  if(lower.contains("user")||lower.contains("account"))return "{\"name\":\"Test User\",\"email\":\"user@example.org\"}";
  return "{\"name\":\"sample-entity\",\"organizationId\":1,\"departmentId\":1}";
 }

 private boolean isValidSafeJson(String text){
  if(text==null||text.isBlank())return false;
  try{
   JsonNode node=json.readTree(text);
   return node!=null&&node.isObject()&&node.equals(SecretRedactor.redactJson(node));
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
  var apps=c.getProfile().path("applications");for(var step:s.getSteps())if(!apps.has(step.path("service").asText())||!pre.getDetectedServices().contains(step.path("service").asText()))throw new BusinessException(ErrorCode.BAD_REQUEST,"Scenario service is not in the pinned Compose/profile");
  var config=json.createObjectNode();config.set("profile",c.getProfile().deepCopy());var scenario=config.putObject("scenario");scenario.set("steps",s.getSteps().deepCopy());scenario.put("timeoutSeconds",settings.requireProfile(c.getProfileId()).timeoutSeconds());
  var planning=config.putObject("planning");planning.put("scenarioId",s.getId().toString());planning.put("scenarioRevision",s.getRevision());planning.put("configurationRevision",c.getRevision());
  var created=runtime.createRuntimeSession(RuntimeSessionCreateRequest.builder().projectId(id).sourceSnapshotId(c.getSourceSnapshotId()).modelVersionId(c.getModelVersionId()).profileName(c.getProfileId()).scenarioName(s.getName()).scenarioConfig(config).build());

  // Merge Step 1 environment/secrets with Step 2 scenario inputs
  Map<String,String> mergedEnv=new LinkedHashMap<>();
  Map<String,String> step1Env=runtime.getProjectExecutionEnvironment(id);
  if(step1Env!=null){
   step1Env.forEach((k,v)->{
    if(k!=null&&k.matches("[A-Z][A-Z0-9_]{0,63}")&&v!=null&&v.length()<=16000)mergedEnv.put(k,v);
   });
  }
  if(r.environment()!=null){
   mergedEnv.putAll(r.environment());
  }
  if(r.environment()!=null&&!r.environment().isEmpty()){
   try{environments.store(created.getId(),mergedEnv);}catch(BusinessException ex){runtime.storeProjectSecrets(id,r.environment());}
  }else if(!mergedEnv.isEmpty()&&environments.isConfigured()){
   environments.store(created.getId(),mergedEnv);
  }
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
