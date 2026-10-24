package com.mavis.common.entity;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.util.UUID;
@Entity @Table(name="runtime_configurations") @Data @NoArgsConstructor
public class RuntimeConfiguration {
 @Id private UUID projectId;
 private UUID sourceSnapshotId;
 private UUID modelVersionId;
 private String profileId;
 @JdbcTypeCode(SqlTypes.JSON) @Column(nullable=false) private JsonNode profile;
 private int revision;
}
