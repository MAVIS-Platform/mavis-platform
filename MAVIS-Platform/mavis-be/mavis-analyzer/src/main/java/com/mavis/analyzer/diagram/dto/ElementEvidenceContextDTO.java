package com.mavis.analyzer.diagram.dto;

import java.util.List;
import java.util.UUID;

public record ElementEvidenceContextDTO(UUID modelVersionId, UUID elementId,
                                       List<EvidenceResponseDTO> directEvidence,
                                       List<EvidenceResponseDTO> relationshipEvidence) { }
