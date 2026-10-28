package com.mavis.analyzer.graph.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import com.mavis.analyzer.javaanalyzer.visitor.SpringHttpMappings;
import com.mavis.common.entity.*;
import com.mavis.analyzer.detector.config.dto.DetectedSpringConfigDTO;
import java.net.URI;
import java.util.*;

/** Joins source declarations by typed receiver, service ownership and HTTP contract, never by AI/name similarity. */
final class FeignCommunicationResolver {
    record Proof(String role, CodeEvidenceDTO fact) {}
    record Connection(ModelElement source, ModelElement target, ObjectNode properties, List<Proof> proofs) {}
    private final ObjectMapper json;
    private final List<ModelElement> elements;
    private final List<DetectedSpringConfigDTO> configurations;
    private final Map<String,ModelElement> owners=new HashMap<>(),external=new HashMap<>();
    private final Map<String,List<CodeEvidenceDTO>> endpoints=new HashMap<>(),calls=new HashMap<>();
    FeignCommunicationResolver(ObjectMapper json,List<ModelElement> elements,List<CodeEvidenceDTO> facts) {
        this(json,elements,facts,List.of());
    }
    FeignCommunicationResolver(ObjectMapper json,List<ModelElement> elements,List<CodeEvidenceDTO> facts,List<DetectedSpringConfigDTO> configurations) {
        this.json=json;this.elements=elements;
        this.configurations=configurations==null?List.of():configurations;
        for(var fact:facts) {
            if("REST_API".equals(fact.getElementType()) && Boolean.TRUE.equals(fact.getMetadata().get("pathResolved"))) {
                var owner=owner(fact.getFilePath());
                if(owner!=null) endpoints.computeIfAbsent(key(owner)+"|"+fact.getMetadata().get("httpMethod")+"|"+
                        SpringHttpMappings.routeKey(fact.getIdentifier()),ignored->new ArrayList<>()).add(fact);
            } else if("FEIGN_INVOCATION".equals(fact.getElementType()))
                calls.computeIfAbsent(fact.getTargetComponent(),ignored->new ArrayList<>()).add(fact);
        }
    }
    List<Connection> resolve(ModelVersion version,List<CodeEvidenceDTO> facts) {
        List<Connection> result=new ArrayList<>();
        var clients=facts.stream().filter(f->"FEIGN_CLIENT".equals(f.getElementType()) && "OPENFEIGN".equals(f.getMetadata().get("clientFramework"))).toList();
        for(var client:clients) {
            var metadata=client.getMetadata();
            var binding=target(client);
            boolean literal=binding.resolved();
            var targets=literal?elements.stream().filter(e->"SERVICE_CONTAINER".equals(e.getElementType()) && e.getName()!=null
                    && e.getName().equalsIgnoreCase(binding.value())).toList():List.<ModelElement>of();
            String resolution=targets.size()==1?"RESOLVED":targets.size()>1?"AMBIGUOUS":"UNRESOLVED";
            ModelElement target;
            if(targets.size()==1) target=targets.get(0);
            else {
                String externalKey=literal?binding.value():client.getQualifiedName()+"|"+client.getFilePath();
                target=external.computeIfAbsent(externalKey,ignored->ModelElement.builder().modelVersion(version)
                        .name(literal?binding.value():"Unresolved Feign target: "+client.getSourceComponent())
                        .elementType("EXTERNAL_SYSTEM").languageStack("HTTP / Spring Cloud OpenFeign")
                        .status("UNCERTAIN_MAPPING").properties(json.createObjectNode().put("resolutionIssue",resolution+"_FEIGN_TARGET")).build());
            }
            boolean uniqueType=clients.stream().filter(c->Objects.equals(c.getQualifiedName(),client.getQualifiedName())).count()==1;
            var invocations=uniqueType?calls.getOrDefault(client.getQualifiedName(),List.of()):List.<CodeEvidenceDTO>of();
            Map<String,ModelElement> sources=new LinkedHashMap<>();
            var declared=component(client);
            if(declared!=null) sources.put(key(owner(client.getFilePath())),declared);
            for(var call:invocations) {
                var source=component(call);
                if(source!=null) sources.putIfAbsent(key(owner(call.getFilePath())),source);
            }
            var operations=json.valueToTree(metadata.getOrDefault("operations",List.of()));
            if(operations.isEmpty()) operations=json.createArrayNode().add(json.createObjectNode());
            for(var operation:operations) for(var entry:sources.entrySet()) {
                var source=entry.getValue();
                String method=operation.path("httpMethod").asText("");
                String path=SpringHttpMappings.join(binding.basePath(),operation.path("httpPath").asText(""));
                boolean pathResolved=operation.path("pathResolved").asBoolean(false);
                List<CodeEvidenceDTO> matchingEndpoints=new ArrayList<>();
                if(targets.size()==1 && pathResolved && SpringHttpMappings.concreteMethod(method)) {
                    String suffix="|"+SpringHttpMappings.routeKey(path);
                    matchingEndpoints.addAll(endpoints.getOrDefault(key(target)+"|"+method+suffix,List.of()));
                    matchingEndpoints.addAll(endpoints.getOrDefault(key(target)+"|ANY"+suffix,List.of()));
                }
                var props=json.createObjectNode().put("clientFramework","OPENFEIGN").put("transport","HTTP")
                        .put("sourceService",serviceName(source)).put("targetService",target.getName())
                        .put("clientInterface",client.getQualifiedName()).put("clientName",String.valueOf(metadata.get("clientName")))
                        .put("clientMethod",operation.path("javaMethod").asText(""))
                        .put("httpMethod",method).put("httpPath",path).put("pathResolved",pathResolved)
                        .put("targetSelector",binding.selector())
                        .put("resolutionStatus",resolution).put("runtimeObserved",false)
                        .put("serverMatch",matchingEndpoints.size()==1?"MATCHED_METHOD_PATH":matchingEndpoints.isEmpty()?"NOT_FOUND_IN_IMPORTED_SOURCE":"AMBIGUOUS_ENDPOINT")
                        .put("serverCandidateCount",matchingEndpoints.size());
                List<Proof> proofs=new ArrayList<>();proofs.add(new Proof("CLIENT_DECLARATION",client));
                proofs.addAll(binding.proofs());
                if(operation.has("sourceLine")) proofs.add(new Proof("CLIENT_CONTRACT",CodeEvidenceDTO.builder()
                        .filePath(client.getFilePath()).lineNumber(operation.path("sourceLine").asInt())
                        .codeSnippet(operation.path("snippet").asText()).build()));
                props.put("callerService", serviceName(source));
                props.put("callerComponent", source.getName());
                props.put("callerFile", client.getFilePath());
                if (operation.has("sourceLine")) {
                    props.put("callerLine", operation.path("sourceLine").asInt());
                    props.put("callerSnippet", operation.path("snippet").asText(""));
                }
                props.put("calleeService", target.getName());
                if (matchingEndpoints.size() == 1) {
                    var ep = matchingEndpoints.get(0);
                    props.put("calleeController", ep.getSourceComponent() != null ? ep.getSourceComponent() : "");
                    props.put("calleeFile", ep.getFilePath() != null ? ep.getFilePath() : "");
                    props.put("calleeLine", ep.getLineNumber() != null ? ep.getLineNumber() : 0);
                    props.put("calleeRoute", ep.getIdentifier() != null ? ep.getIdentifier() : path);
                    props.put("calleeSnippet", ep.getCodeSnippet() != null ? ep.getCodeSnippet() : "");
                }
                Set<Integer> overloads=new HashSet<>();
                for(var alternative:operations) if(alternative.path("javaMethod").equals(operation.path("javaMethod"))
                        && alternative.path("parameterCount").equals(operation.path("parameterCount"))) overloads.add(alternative.path("sourceLine").asInt());
                int count=0;
                if(overloads.size()==1) for(var call:invocations) if(Objects.equals(call.getIdentifier(),operation.path("javaMethod").asText())
                        && Objects.equals(call.getMetadata().get("argumentCount"),operation.path("parameterCount").asInt(-1))
                        && entry.getKey().equals(key(owner(call.getFilePath())))) {
                    proofs.add(new Proof("CALL_SITE",call));
                    count++;
                    props.put("callerFile", call.getFilePath());
                    props.put("callerLine", call.getLineNumber());
                    props.put("callerSnippet", call.getCodeSnippet());
                }
                props.put("callSiteCount",count).put("invocationResolution",!uniqueType?"AMBIGUOUS_CLIENT_TYPE":overloads.size()>1?"AMBIGUOUS_OVERLOAD":count>0?"TYPED_SOURCE_CALL":"DECLARATION_ONLY");
                if (matchingEndpoints.size() == 1) proofs.add(new Proof("SERVER_ENDPOINT", matchingEndpoints.get(0)));
                result.add(new Connection(source,target,props,proofs));
            }
        }
        return result;
    }
    private record Target(String value,boolean resolved,String basePath,String selector,List<Proof> proofs) {}
    private Target target(CodeEvidenceDTO client) {
        var meta=client.getMetadata();
        String selector=String.valueOf(meta.get("targetSelector"));
        if("ANNOTATION_URL".equals(selector)) return new Target(client.getIdentifier(),Boolean.TRUE.equals(meta.get("targetResolved")),"",selector,List.of());
        String configId=String.valueOf(meta.getOrDefault("contextId",""));
        if(configId.isBlank()) configId=String.valueOf(meta.get("clientName"));
        String key="spring.cloud.openfeign.client.config."+configId+".url";
        List<Proof> proofs=new ArrayList<>();Set<String> urls=new HashSet<>();boolean profileDependent=false;
        var source=owner(client.getFilePath());
        for(var config:configurations) if(source!=null && ArchitectureResolver.same(source,owner(config.getConfigFilePath())))
            for(var url:config.getTargetServiceUrls()) if(key.equals(url.getConfigKey())) {
                urls.add(url.getTargetUrl());profileDependent|=url.getProfile()!=null && !url.getProfile().isBlank();
                proofs.add(new Proof("CLIENT_CONFIGURATION",CodeEvidenceDTO.builder().filePath(config.getConfigFilePath()).lineNumber(url.getLineNumber())
                        .codeSnippet(SpringHttpMappings.safeText(key+"="+url.getTargetUrl())).build()));
            }
        if(urls.isEmpty()) return new Target(client.getIdentifier(),Boolean.TRUE.equals(meta.get("targetResolved")),"",selector,List.of());
        if(urls.size()==1 && !profileDependent) {
            String value=urls.iterator().next();
            if(value!=null && !value.contains("${")) try {
                var uri=URI.create(value.contains("://")?value:"http://"+value);
                if(uri.getHost()!=null && Set.of("http","https").contains(uri.getScheme().toLowerCase(Locale.ROOT))) return new Target(uri.getHost(),true,Optional.ofNullable(uri.getPath()).orElse(""),"CONFIGURATION_URL",proofs);
            } catch(IllegalArgumentException ignored) { }
        }
        return new Target("",false,"","UNRESOLVED_CONFIGURATION_URL",proofs);
    }
    private ModelElement owner(String file) {
        if(!owners.containsKey(file)) owners.put(file,ArchitectureResolver.owner(elements,file));
        return owners.get(file);
    }
    private ModelElement component(CodeEvidenceDTO fact) {
        var owner=owner(fact.getFilePath());
        if(owner==null) return null;
        var component=ArchitectureResolver.component(elements,fact.getSourceComponent(),fact.getFilePath());
        return component==null?owner:component;
    }
    private static String key(ModelElement element) { return element==null?"":element.getId()==null?"node:"+System.identityHashCode(element):element.getId().toString(); }
    private static String serviceName(ModelElement element) {
        Set<ModelElement> visited=Collections.newSetFromMap(new IdentityHashMap<>());
        for(var current=element;current!=null && visited.add(current);current=current.getParentElement())
            if("SERVICE_CONTAINER".equals(current.getElementType())) return current.getName();
        return "Unresolved source service";
    }
}
