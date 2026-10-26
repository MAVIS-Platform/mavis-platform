package com.mavis.analyzer.diagram.service;

import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.ModelElement;
import java.util.Objects;

public final class ElementEvidenceScope {
    private ElementEvidenceScope() { }
    public static boolean isDirect(Evidence evidence, ModelElement target) {
        return evidence.getElement() != null && Objects.equals(evidence.getElement().getId(), target.getId());
    }
    public static boolean includes(Evidence evidence, ModelElement target) {
        if (evidence.getModelVersion() != null && target.getModelVersion() != null &&
            !Objects.equals(evidence.getModelVersion().getId(), target.getModelVersion().getId())) return false;
        var relation = evidence.getRelationship();
        if (relation != null && relation.getModelVersion() != null && target.getModelVersion() != null &&
            !Objects.equals(relation.getModelVersion().getId(), target.getModelVersion().getId())) return false;
        if (isDirect(evidence, target)) return true;
        return relation != null &&
            ((relation.getSourceElement() != null && Objects.equals(relation.getSourceElement().getId(), target.getId())) ||
             (relation.getTargetElement() != null && Objects.equals(relation.getTargetElement().getId(), target.getId())));
    }
}
