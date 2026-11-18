package com.mavis.analyzer.diagram.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.diagram.service.DiagramProjectionService;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.common.exception.*;
import com.mavis.common.security.CourseLabPolicy;
import com.mavis.common.utils.CourseworkDiagramTypes;
import com.mavis.common.utils.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.util.*;

@Service @RequiredArgsConstructor
public class DiagramProjectionServiceImpl implements DiagramProjectionService {
    private final DiagramVersionRepository diagrams;
    private final ModelVersionRepository models;
    private final ModelElementRepository elements;
    private final ModelRelationshipRepository relationships;
    private final EvidenceRepository evidence;
    private final ObjectMapper json;
    private final com.mavis.common.security.AccessPolicyService accessPolicy;
    private final SubmissionSnapshotRepository submissions;

    @Override @Transactional(propagation=Propagation.MANDATORY)
    public List<com.mavis.analyzer.diagram.dto.DiagramResponseDTO> generateDefaultDiagramsForModel(ModelVersion model,List<ModelElement> nodes,List<ModelRelationship> edges){
        if(nodes.size()>10000 || edges.size()>50000)throw new BusinessException(ErrorCode.BAD_REQUEST,"Diagram projection exceeds supported budget");
        var ordered=nodes.stream().sorted(Comparator.comparing(e->e.getId().toString())).toList();
        var containerKinds=Set.of("SERVICE_CONTAINER","DATABASE","EXTERNAL_SYSTEM","QUEUE_BROKER","MESSAGE_CHANNEL");
        var containers=ordered.stream().filter(e->containerKinds.contains(e.getElementType())).toList();
        var components=ordered.stream().filter(e->!"CLASS_INTERFACE".equals(e.getElementType())).toList();
        var projections = new ArrayList<>(List.of(
                create(model,"DEPENDENCY_GRAPH","SERVICE",containers,edges),
                create(model,"C4","CONTAINER",containers,edges),
                create(model,"C4","COMPONENT",components,edges)));
        var workspace = model.getProject().getWorkspace();
        if (workspace != null && (workspace.isCourseMode()
                || "TEACHER_REFERENCE".equalsIgnoreCase(model.getProject().getProjectType())
                || Boolean.TRUE.equals(model.getProject().getIsReferenceTemplate()))) {
            projections.add(createContext(model, ordered, edges));
        }
        return diagrams.saveAll(projections).stream().map(com.mavis.analyzer.diagram.dto.DiagramResponseDTO::fromEntity).toList();
    }

    private DiagramVersion createContext(ModelVersion model, List<ModelElement> nodes, List<ModelRelationship> edges) {
        var external = new LinkedHashMap<UUID, ModelElement>();
        var internal = new HashSet<UUID>();
        for (var node : nodes) {
            if (!"EXTERNAL_SYSTEM".equals(node.getElementType()) && !"PERSON".equals(node.getElementType())) {
                internal.add(node.getId());
                continue;
            }
            var properties = node.getProperties();
            if (properties != null) {
                String state = properties.path("contextReviewState").asText();
                if ("PROPOSED".equals(state) || "REJECTED".equals(state)
                        || ("EXTERNAL_SYSTEM".equals(node.getElementType()) && !"CONFIRMED".equals(state)
                        && (properties.hasNonNull("resolutionIssue")
                        || "UNCERTAIN_MAPPING".equals(properties.path("status").asText())))) continue;
            }
            external.put(node.getId(), node);
        }
        var layout = json.createObjectNode().put("schemaVersion", "1.0")
                .put("modelVersionId", model.getId().toString());
        var positions = layout.putArray("nodes");
        var connections = layout.putArray("edges");
        if (nodes.isEmpty()) {
            return DiagramVersion.builder().modelVersion(model).notation("C4").level("CONTEXT").layoutJson(layout).build();
        }
        String systemId = "system:" + model.getProject().getId();
        positions.addObject().put("id", systemId).put("kind", "SYSTEM")
                .put("name", model.getProject().getName()).put("x", 280).put("y", 0);
        var included = new LinkedHashSet<UUID>();
        var structuralEdges = edges.stream()
                .filter(edge -> !"DEPLOYMENT".equals(edge.getOriginLayer()) && !"RUNTIME".equals(edge.getOriginLayer()))
                .filter(edge -> !Set.of("DECLARED_COMPOSE", "DECLARED_LINK", "STARTUP_DEPENDENCY").contains(edge.getRelationType()))
                .sorted(Comparator.comparing(edge -> edge.getId().toString())).toList();
        for (var edge : structuralEdges) {
            UUID from = edge.getSourceElement().getId();
            UUID to = edge.getTargetElement().getId();
            boolean outbound = internal.contains(from) && external.containsKey(to);
            boolean inbound = external.containsKey(from) && internal.contains(to);
            if (!outbound && !inbound) continue;
            included.add(outbound ? to : from);
            String source = outbound ? systemId : from.toString();
            String target = inbound ? systemId : to.toString();
            connections.addObject().put("id", edge.getId().toString()).put("from", source).put("to", target)
                    .put("source", source).put("target", target).put("type", edge.getRelationType())
                    .put("relationType", edge.getRelationType()).put("originLayer", edge.getOriginLayer());
        }
        int y = 0;
        for (var id : included) {
            var node = external.get(id);
            positions.addObject().put("id", id.toString()).put("name", node.getName())
                    .put("kind", node.getElementType()).put("x", 640).put("y", y);
            y += 140;
        }
        return DiagramVersion.builder().modelVersion(model).notation("C4").level("CONTEXT").layoutJson(layout).build();
    }
    private DiagramVersion create(ModelVersion model,String notation,String level,List<ModelElement> nodes,List<ModelRelationship> edges){
        var layout=json.createObjectNode().put("schemaVersion","1.0").put("modelVersionId",model.getId().toString());
        var positions=layout.putArray("nodes");var ids=new HashSet<UUID>();nodes.forEach(n->ids.add(n.getId()));
        for(int i=0;i<nodes.size();i++){
            var node=nodes.get(i);ids.add(node.getId());
            var point=positions.addObject().put("id",node.getId().toString()).put("name",node.getName()).put("kind",node.getElementType()).put("type",node.getElementType()).put("status",node.getStatus()).put("x",(i%8)*280).put("y",(i/8)*180);
            point.put("languageStack",node.getLanguageStack());
            if (node.getProperties() != null) {
                point.set("properties", node.getProperties().deepCopy());
                point.put("description", node.getProperties().path("responsibility").asText(node.getProperties().path("description").asText("")));
            }
            point.putObject("position").put("x",(i%8)*280).put("y",(i/8)*180);
            point.putObject("data").put("label",node.getName()).put("status",node.getStatus()).put("technology",node.getLanguageStack());
            if("C4".equals(notation))point.put("c4Type","COMPONENT".equals(level)&&!containerKindsForNode(node)?"Component":"Container");
            if(node.getParentElement()!=null && ids.contains(node.getParentElement().getId()))point.put("parentId",node.getParentElement().getId().toString());
        }
        var connections=layout.putArray("edges");
        edges.stream().filter(e->ids.contains(e.getSourceElement().getId())&&ids.contains(e.getTargetElement().getId())).sorted(Comparator.comparing(e->e.getId().toString())).forEach(e->connections.addObject()
                .put("id",e.getId().toString()).put("from",e.getSourceElement().getId().toString()).put("to",e.getTargetElement().getId().toString()).put("type",e.getRelationType())
                .put("source",e.getSourceElement().getId().toString()).put("target",e.getTargetElement().getId().toString()).put("relationType",e.getRelationType()).put("label",e.getRelationType()).put("originLayer",e.getOriginLayer()).put("direction",e.getDirection())
                .put("resolutionStatus", e.getProperties() == null ? "UNKNOWN" : e.getProperties().path("resolutionStatus").asText("UNKNOWN")));
        return DiagramVersion.builder().modelVersion(model).notation(notation).level(level).layoutJson(layout).build();
    }
    @Override @Transactional(readOnly=true)
    public List<DiagramView> list(UUID model) {
        var version = models.findById(model).orElseThrow(DiagramProjectionServiceImpl::missing);
        owner(version);
        boolean guided = CourseLabPolicy.isGuidedStaticStudent(version, accessPolicy);
        return diagrams.findByModelVersionId(model).stream()
                .filter(diagram -> !guided || isGuidedStaticView(diagram))
                .sorted(Comparator.comparing(DiagramVersion::getNotation).thenComparing(DiagramVersion::getLevel))
                .map(this::view).toList();
    }
    @Override @Transactional(readOnly=true)
    public DiagramView get(UUID diagram) {
        var entity = diagrams.findById(diagram).orElseThrow(DiagramProjectionServiceImpl::missing);
        owner(entity.getModelVersion());
        if (CourseLabPolicy.isGuidedStaticStudent(entity.getModelVersion(), accessPolicy)
                && !"BUNDLE".equals(entity.getNotation()) && !isGuidedStaticView(entity)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Unsupported static diagram for a guided Lab");
        }
        return view(entity);
    }

    private static boolean isGuidedStaticView(DiagramVersion diagram) {
        String type = CourseworkDiagramTypes.fromArtifact(diagram.getNotation(), diagram.getLevel(), diagram.getLayoutJson());
        return type != null && CourseworkDiagramTypes.GUIDED_STATIC.contains(type);
    }
    @Override @Transactional
    public DiagramView updateLayout(UUID diagram,JsonNode request){
        var entity=diagrams.findById(diagram).orElseThrow(()->missing());accessPolicy.requireProjectWriteAccess(entity.getModelVersion().getProject());
        if (CourseLabPolicy.isGuidedStaticStudent(entity.getModelVersion(), accessPolicy)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Guided Lab reference diagrams are read-only");
        }
        if(request==null||!request.isObject()||request.size()!=1||!request.has("nodes")||!request.get("nodes").isArray()||request.get("nodes").size()>10000)throw invalid();
        ObjectNode copy=entity.getLayoutJson().deepCopy();var known=new HashMap<String,ObjectNode>();for(var node:copy.withArray("nodes"))known.put(node.path("id").asText(),(ObjectNode)node);
        var seen=new HashSet<String>();
        for(var position:request.get("nodes")){
            String id=position.path("id").asText();
            if(!position.isObject()||position.size()!=3||!position.path("x").isNumber()||!position.path("y").isNumber()||!known.containsKey(id)||!seen.add(id))throw invalid();
            double x=position.get("x").asDouble(),y=position.get("y").asDouble();if(!Double.isFinite(x)||!Double.isFinite(y)||Math.abs(x)>1000000||Math.abs(y)>1000000)throw invalid();
            known.get(id).put("x",x).put("y",y);
            known.get(id).putObject("position").put("x",x).put("y",y);
        }
        if (entity.getLayoutJson().path("frozenDocument").asBoolean(false) || submissions.existsByDiagramVersionId(entity.getId())) throw new BusinessException(ErrorCode.CONFLICT, "Submitted diagrams are immutable. Save a new document revision instead.");
        entity.setLayoutJson(copy);diagrams.save(entity);return view(entity);
    }
    @Override @Transactional(readOnly=true)
    public List<EvidenceView> elementEvidence(UUID id){var target=elements.findById(id).orElseThrow(()->missing());owner(target.getModelVersion());return evidence.findByElementId(id).stream().map(this::ev).toList();}
    @Override @Transactional(readOnly=true)
    public List<EvidenceView> relationshipEvidence(UUID id){var target=relationships.findById(id).orElseThrow(()->missing());owner(target.getModelVersion());return evidence.findByRelationshipId(id).stream().map(this::ev).toList();}
    private void owner(ModelVersion model){accessPolicy.requireProjectReadAccess(model.getProject());}
    private boolean containerKindsForNode(ModelElement node){return Set.of("SERVICE_CONTAINER","DATABASE","EXTERNAL_SYSTEM","QUEUE_BROKER","MESSAGE_CHANNEL").contains(node.getElementType());}
    private DiagramView view(DiagramVersion d){return new DiagramView(d.getId(),d.getModelVersion().getId(),d.getNotation(),d.getLevel(),d.getLayoutJson(),d.getCreatedAt());}
    private EvidenceView ev(Evidence e){return new EvidenceView(e.getId(),e.getModelVersion().getId(),e.getSourceSnapshot().getId(),e.getSourceType(),e.getLocator(),e.getAdapterVersion(),e.getProvenance());}
    private static BusinessException missing(){return new BusinessException(ErrorCode.NOT_FOUND,"Model artifact not found");}
    private static BusinessException invalid(){return new BusinessException(ErrorCode.BAD_REQUEST,"Layout accepts only known node IDs and bounded x/y coordinates");}

    @Transactional(readOnly=true) public List<com.mavis.analyzer.diagram.dto.DiagramResponseDTO> getDiagramsByModelVersion(UUID id){return list(id).stream().map(this::dto).toList();}
    @Transactional(readOnly=true) public com.mavis.analyzer.diagram.dto.DiagramResponseDTO getDiagramById(UUID id){return dto(get(id));}
    @Transactional public com.mavis.analyzer.diagram.dto.DiagramResponseDTO updateDiagramLayout(UUID id,JsonNode positions){return dto(updateLayout(id,positions));}
    @Transactional(readOnly=true) public List<com.mavis.analyzer.diagram.dto.EvidenceResponseDTO> getEvidencesByElement(UUID id){var target=elements.findById(id).orElseThrow(()->missing());owner(target.getModelVersion());return evidence.findByElementIdOrderByCreatedAtAsc(id).stream().map(com.mavis.analyzer.diagram.dto.EvidenceResponseDTO::fromEntity).toList();}
    @Override @Transactional(readOnly=true)
    public com.mavis.analyzer.diagram.dto.ElementEvidenceContextDTO getElementEvidenceContext(UUID id) {
        var target = elements.findById(id).orElseThrow(() -> missing());
        owner(target.getModelVersion());
        var scoped = evidence.findElementContext(target.getModelVersion().getId(), id).stream()
            .filter(e -> com.mavis.analyzer.diagram.service.ElementEvidenceScope.includes(e, target))
            .collect(java.util.stream.Collectors.toMap(Evidence::getId, e -> e, (a, b) -> a, LinkedHashMap::new)).values();
        var direct = scoped.stream().filter(e -> com.mavis.analyzer.diagram.service.ElementEvidenceScope.isDirect(e, target)).map(com.mavis.analyzer.diagram.dto.EvidenceResponseDTO::fromEntity).toList();
        var related = scoped.stream().filter(e -> !com.mavis.analyzer.diagram.service.ElementEvidenceScope.isDirect(e, target)).map(com.mavis.analyzer.diagram.dto.EvidenceResponseDTO::fromEntity).toList();
        return new com.mavis.analyzer.diagram.dto.ElementEvidenceContextDTO(target.getModelVersion().getId(), id, direct, related);
    }
    @Transactional(readOnly=true) public List<com.mavis.analyzer.diagram.dto.EvidenceResponseDTO> getEvidencesByRelationship(UUID id){var target=relationships.findById(id).orElseThrow(()->missing());owner(target.getModelVersion());return evidence.findByRelationshipIdOrderByCreatedAtAsc(id).stream().map(com.mavis.analyzer.diagram.dto.EvidenceResponseDTO::fromEntity).toList();}
    private com.mavis.analyzer.diagram.dto.DiagramResponseDTO dto(DiagramView view){return com.mavis.analyzer.diagram.dto.DiagramResponseDTO.builder().id(view.id()).modelVersionId(view.modelVersionId()).notation(view.notation()).level(view.level()).layoutJson(view.layoutJson()).createdAt(view.createdAt()).build();}
}
