package com.mavis.analyzer.model.service;

import java.util.*;

public interface ModelVersionService {
    record ElementEdit(String ref,String operation,String name,String kind,String status,String parentRef) {}
    record RelationshipEdit(String ref,String operation,String fromRef,String toRef,String type,boolean confirmed) {}
    record RevisionRequest(List<ElementEdit> elements,List<RelationshipEdit> relationships) {}
    record ModelView(UUID id,UUID projectId,UUID sourceSnapshotId,UUID baseModelVersionId,int revision,String origin,boolean latest) {}
    record Difference(List<String> added,List<String> removed,List<String> modified,List<String> unchanged) {}
    record ModelDiff(UUID baseVersionId,UUID targetVersionId,Difference elements,Difference relationships) {}
    List<ModelView> list(UUID project);
    ModelView revise(UUID base,RevisionRequest request);
    ModelDiff compare(UUID base,UUID target);
}
