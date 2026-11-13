package com.mavis.analyzer.workerclient.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.workerclient.WorkerContract;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

/** ID-based candidate import. No network, name matching, service guessing or independent publication. */
@Service
@RequiredArgsConstructor
public class WorkerCanonicalImporter {
    private final ModelElementRepository elements;
    private final ModelRelationshipRepository relationships;
    private final EvidenceRepository evidence;
    private final ObjectMapper json;

    @Transactional(propagation = Propagation.MANDATORY)
    public void importResult(ModelVersion version, WorkerContract.Result result, Map<String, String> callSites) {
        var byId=new LinkedHashMap<String,ModelElement>();
        for(var element:result.canonical().elements()) {
            ObjectNode properties=json.valueToTree(element.properties()==null?Map.of():element.properties());
            if (properties.has("umlClassifierJson") && properties.get("umlClassifierJson").isTextual()) {
                try {
                    var parsedUml = json.readTree(properties.get("umlClassifierJson").asText());
                    properties.set("umlClassifier", parsedUml);
                    if (parsedUml.hasNonNull("qualifiedName") && !properties.hasNonNull("qualifiedName")) {
                        properties.put("qualifiedName", parsedUml.get("qualifiedName").asText());
                    }
                    if (parsedUml.hasNonNull("packageName") && !properties.hasNonNull("packageName")) {
                        properties.put("packageName", parsedUml.get("packageName").asText());
                    }
                    if (parsedUml.hasNonNull("typeKind") && !properties.hasNonNull("typeKind")) {
                        properties.put("typeKind", parsedUml.get("typeKind").asText());
                    }
                } catch (Exception ignored) {
                }
            }
            properties.put("workerLogicalId",element.id());properties.put("workerProjectPath",element.projectPath());
            properties.put("workerResolutionStatus",element.resolutionStatus());properties.put("adapterVersion",result.analyzerVersion());
            properties.put("requiresCanonicalMerge",true);
            byId.put(element.id(),ModelElement.builder().modelVersion(version).elementType(element.kind()).name(element.name())
                    .languageStack("CSHARP_DOTNET").status("NEEDS_REVIEW").properties(properties).build());
        }
        for(var element:result.canonical().elements()) {
            String parent=element.properties()==null?null:element.properties().get("moduleId");
            if(parent!=null && !parent.equals(element.id())) {
                if(!byId.containsKey(parent))throw new IllegalArgumentException("Unknown Worker module reference");
                byId.get(element.id()).setParentElement(byId.get(parent));
            }
        }
        elements.saveAll(byId.values());elements.flush();
        var relById=new LinkedHashMap<String,ModelRelationship>();
        for(var relation:result.canonical().relationships()) {
            ObjectNode properties=json.createObjectNode().put("workerLogicalId",relation.id()).put("dependencyKind",relation.dependencyKind())
                    .put("resolutionStatus",relation.resolutionStatus()).put("sourceOrigin",relation.origin()).put("requiresCanonicalMerge",true);
            if (relation.dependencyKind() != null) {
                String umlRelKind = switch (relation.dependencyKind().toUpperCase(Locale.ROOT)) {
                    case "INHERITS", "GENERALIZATION" -> "GENERALIZATION";
                    case "IMPLEMENTS", "REALIZATION" -> "REALIZATION";
                    case "ASSOCIATION" -> "ASSOCIATION";
                    case "DI", "CODEDEPENDENCY", "DEPENDENCY" -> "DEPENDENCY";
                    default -> null;
                };
                if (umlRelKind != null) {
                    properties.put("umlRelationKind", umlRelKind);
                    properties.put("multiplicityStatus", "UNKNOWN");
                    properties.put("provenance", "SOURCE_EXTRACTED");
                }
            }
            var srcEl = byId.get(relation.fromId());
            var tgtEl = byId.get(relation.toId());
            if (srcEl != null && tgtEl != null && srcEl.getProperties() != null && srcEl.getProperties().has("umlClassifier")) {
                var structuralRels = srcEl.getProperties().path("umlClassifier").path("structuralRelations");
                if (structuralRels.isArray()) {
                    for (var sr : structuralRels) {
                        String srTarget = sr.path("targetType").asText("");
                        String tgtQualified = tgtEl.getProperties() != null ? tgtEl.getProperties().path("qualifiedName").asText(tgtEl.getName()) : tgtEl.getName();
                        if (srTarget.equals(tgtEl.getName()) || srTarget.equals(tgtQualified)) {
                            if (sr.hasNonNull("umlRelationKind")) {
                                properties.put("umlRelationKind", sr.get("umlRelationKind").asText());
                            }
                            if (sr.hasNonNull("roleName")) {
                                properties.put("roleName", sr.get("roleName").asText());
                            }
                            if (sr.hasNonNull("memberName")) {
                                properties.put("memberName", sr.get("memberName").asText());
                            }
                            if (sr.hasNonNull("memberSignature")) {
                                properties.put("memberSignature", sr.get("memberSignature").asText());
                            }
                            break;
                        }
                    }
                }
            }
            relById.put(relation.id(),ModelRelationship.builder().modelVersion(version).sourceElement(srcEl).targetElement(tgtEl)
                    .relationType(relation.type()).originLayer("STATIC").direction("DIRECTED").properties(properties).build());
        }
        relationships.saveAll(relById.values());relationships.flush();
        var evById=new HashMap<String,WorkerContract.Evidence>();result.canonical().evidence().forEach(e->evById.put(e.id(),e));
        var batch=new ArrayList<Evidence>();
        for(var element:result.canonical().elements()) for(String id:element.evidenceIds()) batch.add(entity(evById.get(id),version,byId.get(element.id()),null,null));
        for(var relation:result.canonical().relationships()) for(String id:relation.evidenceIds()) {
            String excerpt = "SERVICE_HTTP_CALL".equals(relation.type()) ? callSites.get(id) : null;
            batch.add(entity(evById.get(id),version,null,relById.get(relation.id()),excerpt));
        }
        // One DB row per target association; shared source evidence ID/hash stays in provenance.
        evidence.saveAll(batch);evidence.flush();
    }
    private Evidence entity(WorkerContract.Evidence source,ModelVersion version,ModelElement element,ModelRelationship relationship,String excerpt) {
        if(source==null)throw new IllegalArgumentException("Orphan Worker evidence");
        ObjectNode provenance = json.valueToTree(source);
        if (excerpt != null) provenance.put("communicationRole", "CALL_SITE");
        return Evidence.builder().modelVersion(version).sourceSnapshot(version.getSourceSnapshot()).element(element).relationship(relationship)
                .locator(source.locator()).adapterVersion(source.adapterVersion()).sourceType("CONFIG".equals(source.origin())?"CONFIG_FILE":"STATIC_CODE")
                .excerpt(excerpt).provenance(provenance).build();
    }
}
