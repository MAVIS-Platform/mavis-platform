package com.mavis.analyzer.model.service;

import java.util.*;

public interface ModelVersionService {
    record ElementEdit(String ref,String operation,String name,String kind,String status,String parentRef,String languageStack,String scope,com.fasterxml.jackson.databind.JsonNode properties) {
        public ElementEdit(String ref,String operation,String name,String kind,String status,String parentRef){this(ref,operation,name,kind,status,parentRef,null,null,null);}
    }
    record RelationshipEdit(String ref,String operation,String fromRef,String toRef,String type,boolean confirmed,com.fasterxml.jackson.databind.JsonNode properties) {
        public RelationshipEdit(String ref,String operation,String fromRef,String toRef,String type,boolean confirmed){this(ref,operation,fromRef,toRef,type,confirmed,null);}
    }
    record RevisionRequest(List<ElementEdit> elements,List<RelationshipEdit> relationships) {}
    record ModelView(UUID id,UUID projectId,UUID sourceSnapshotId,UUID baseModelVersionId,int revision,String origin,boolean latest) {}
    record Difference(List<String> added,List<String> removed,List<String> modified,List<String> unchanged) {}
    record ModelDiff(UUID baseVersionId,UUID targetVersionId,Difference elements,Difference relationships) {}
    List<ModelView> list(UUID project);
    ModelView revise(UUID base,RevisionRequest request);
    ModelDiff compare(UUID base,UUID target);
    List<com.mavis.analyzer.model.dto.ModelVersionResponseDTO> getModelVersionsByProject(UUID project);
    com.mavis.analyzer.model.dto.ModelVersionResponseDTO getModelVersionById(UUID model);
    com.mavis.analyzer.model.dto.ModelVersionResponseDTO createControlledRevision(UUID base,com.mavis.analyzer.model.dto.ModelRevisionRequestDTO request);
    com.mavis.analyzer.model.dto.ModelDiffResponseDTO compareModelVersions(UUID base,UUID target);
}
