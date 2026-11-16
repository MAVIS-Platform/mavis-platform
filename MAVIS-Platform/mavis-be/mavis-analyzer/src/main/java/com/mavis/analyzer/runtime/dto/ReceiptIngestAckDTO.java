package com.mavis.analyzer.runtime.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReceiptIngestAckDTO {

    private UUID sessionId;
    private String resourceProject;
    private String receiptDigest;
    private String persistenceStatus;
    private String publicationGateStatus;
    private Boolean promotedLatest;
    private UUID baseModelVersionId;
    private UUID enrichedModelVersionId; // nullable
    private Integer enrichedRevision;    // nullable
    private OffsetDateTime acknowledgedAt;
}
