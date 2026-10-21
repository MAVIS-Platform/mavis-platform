package com.mavis.analyzer.diagram.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.diagram.service.DiagramProjectionService;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.common.exception.*;
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

    @Override @Transactional(propagation=Propagation.MANDATORY)
    public List<com.mavis.analyzer.diagram.dto.DiagramResponseDTO> generateDefaultDiagramsForModel(ModelVersion model,List<ModelElement> nodes,List<ModelRelationship> edges){
        if(nodes.size()>10000 || edges.size()>50000)throw new BusinessException(ErrorCode.BAD_REQUEST,"Diagram projection exceeds supported budget");
        var ordered=nodes.stream().sorted(Comparator.comparing(e->e.getId().toString())).toList();
        var containerKinds=Set.of("SERVICE_CONTAINER","DATABASE","EXTERNAL_SYSTEM","QUEUE_BROKER");
        var containers=ordered.stream().filter(e->containerKinds.contains(e.getElementType())).toList();
        var components=ordered.stream().filter(e->!"CLASS_INTERFACE".equals(e.getElementType())).toList();
        return diagrams.saveAll(List.of(create(model,"DEPENDENCY_GRAPH","SERVICE",containers,edges),create(model,"C4","CONTAINER",containers,edges),create(model,"C4","COMPONENT",components,edges))).stream().map(com.mavis.analyzer.diagram.dto.DiagramResponseDTO::fromEntity).toList();
    }
    private DiagramVersion create(ModelVersion model,String notation,String level,List<ModelElement> nodes,List<ModelRelationship> edges){
        var layout=json.createObjectNode().put("schemaVersion","1.0").put("modelVersionId",model.getId().toString());
        var positions=layout.putArray("nodes");var ids=new HashSet<UUID>();nodes.forEach(n->ids.add(n.getId()));
        for(int i=0;i<nodes.size();i++){
            var node=nodes.get(i);ids.add(node.getId());
            var point=positions.addObject().put("id",node.getId().toString()).put("name",node.getName()).put("kind",node.getElementType()).put("type",node.getElementType()).put("status",node.getStatus()).put("x",(i%8)*280).put("y",(i/8)*180);
            point.put("languageStack",node.getLanguageStack());
            point.putObject("position").put("x",(i%8)*280).put("y",(i/8)*180);
            point.putObject("data").put("label",node.getName()).put("status",node.getStatus()).put("technology",node.getLanguageStack());
            if("C4".equals(notation))point.put("c4Type","COMPONENT".equals(level)&&!containerKindsForNode(node)?"Component":"Container");
            if(node.getParentElement()!=null && ids.contains(node.getParentElement().getId()))point.put("parentId",node.getParentElement().getId().toString());
        }
        var connections=layout.putArray("edges");
        edges.stream().filter(e->ids.contains(e.getSourceElement().getId())&&ids.contains(e.getTargetElement().getId())).sorted(Comparator.comparing(e->e.getId().toString())).forEach(e->connections.addObject()
                .put("id",e.getId().toString()).put("from",e.getSourceElement().getId().toString()).put("to",e.getTargetElement().getId().toString()).put("type",e.getRelationType())
                .put("source",e.getSourceElement().getId().toString()).put("target",e.getTargetElement().getId().toString()).put("relationType",e.getRelationType()).put("label",e.getRelationType()).put("originLayer",e.getOriginLayer()).put("direction",e.getDirection()));
        return DiagramVersion.builder().modelVersion(model).notation(notation).level(level).layoutJson(layout).build();
    }
    @Override @Transactional(readOnly=true)
    public List<DiagramView> list(UUID model){owner(models.findById(model).orElseThrow(()->missing()));return diagrams.findByModelVersionId(model).stream().sorted(Comparator.comparing(DiagramVersion::getNotation).thenComparing(DiagramVersion::getLevel)).map(this::view).toList();}
    @Override @Transactional(readOnly=true)
    public DiagramView get(UUID diagram){var entity=diagrams.findById(diagram).orElseThrow(()->missing());owner(entity.getModelVersion());return view(entity);}
    @Override @Transactional
    public DiagramView updateLayout(UUID diagram,JsonNode request){
        var entity=diagrams.findById(diagram).orElseThrow(()->missing());owner(entity.getModelVersion());
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
        entity.setLayoutJson(copy);diagrams.save(entity);return view(entity);
    }
    @Override @Transactional(readOnly=true)
    public List<EvidenceView> elementEvidence(UUID id){var target=elements.findById(id).orElseThrow(()->missing());owner(target.getModelVersion());return evidence.findByElementId(id).stream().map(this::ev).toList();}
    @Override @Transactional(readOnly=true)
    public List<EvidenceView> relationshipEvidence(UUID id){var target=relationships.findById(id).orElseThrow(()->missing());owner(target.getModelVersion());return evidence.findByRelationshipId(id).stream().map(this::ev).toList();}
    private void owner(ModelVersion model){if(!model.getProject().getOwner().getId().equals(SecurityUtils.getCurrentUserId()))throw new BusinessException(ErrorCode.FORBIDDEN,"Model access denied");}
    private boolean containerKindsForNode(ModelElement node){return Set.of("SERVICE_CONTAINER","DATABASE","EXTERNAL_SYSTEM","QUEUE_BROKER").contains(node.getElementType());}
    private DiagramView view(DiagramVersion d){return new DiagramView(d.getId(),d.getModelVersion().getId(),d.getNotation(),d.getLevel(),d.getLayoutJson(),d.getCreatedAt());}
    private EvidenceView ev(Evidence e){return new EvidenceView(e.getId(),e.getModelVersion().getId(),e.getSourceSnapshot().getId(),e.getSourceType(),e.getLocator(),e.getAdapterVersion(),e.getProvenance());}
    private static BusinessException missing(){return new BusinessException(ErrorCode.NOT_FOUND,"Model artifact not found");}
    private static BusinessException invalid(){return new BusinessException(ErrorCode.BAD_REQUEST,"Layout accepts only known node IDs and bounded x/y coordinates");}

    @Transactional(readOnly=true) public List<com.mavis.analyzer.diagram.dto.DiagramResponseDTO> getDiagramsByModelVersion(UUID id){return list(id).stream().map(this::dto).toList();}
    @Transactional(readOnly=true) public com.mavis.analyzer.diagram.dto.DiagramResponseDTO getDiagramById(UUID id){return dto(get(id));}
    @Transactional public com.mavis.analyzer.diagram.dto.DiagramResponseDTO updateDiagramLayout(UUID id,JsonNode positions){return dto(updateLayout(id,positions));}
    @Transactional(readOnly=true) public List<com.mavis.analyzer.diagram.dto.EvidenceResponseDTO> getEvidencesByElement(UUID id){var target=elements.findById(id).orElseThrow(()->missing());owner(target.getModelVersion());return evidence.findByElementIdOrderByCreatedAtAsc(id).stream().map(com.mavis.analyzer.diagram.dto.EvidenceResponseDTO::fromEntity).toList();}
    @Transactional(readOnly=true) public List<com.mavis.analyzer.diagram.dto.EvidenceResponseDTO> getEvidencesByRelationship(UUID id){var target=relationships.findById(id).orElseThrow(()->missing());owner(target.getModelVersion());return evidence.findByRelationshipIdOrderByCreatedAtAsc(id).stream().map(com.mavis.analyzer.diagram.dto.EvidenceResponseDTO::fromEntity).toList();}
    private com.mavis.analyzer.diagram.dto.DiagramResponseDTO dto(DiagramView view){return com.mavis.analyzer.diagram.dto.DiagramResponseDTO.builder().id(view.id()).modelVersionId(view.modelVersionId()).notation(view.notation()).level(view.level()).layoutJson(view.layoutJson()).createdAt(view.createdAt()).build();}
}
