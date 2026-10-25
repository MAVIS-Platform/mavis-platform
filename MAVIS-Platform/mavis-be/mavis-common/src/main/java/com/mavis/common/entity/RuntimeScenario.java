package com.mavis.common.entity;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.util.UUID;
@Entity @Table(name="runtime_scenarios") @Data @NoArgsConstructor
public class RuntimeScenario {
 @Id @GeneratedValue(strategy=GenerationType.UUID) private UUID id;
 private UUID projectId;
 private String name;
 @JdbcTypeCode(SqlTypes.JSON) @Column(nullable=false) private JsonNode steps;
 private int revision;
}
