package com.mavis.common.entity;
import jakarta.persistence.*;
import lombok.*;
import java.time.OffsetDateTime;
import java.util.UUID;
@Entity @Table(name="architecture_documents",uniqueConstraints=@UniqueConstraint(columnNames={"model_version_id","view_key","revision"}))
@Getter @Setter @NoArgsConstructor
public class ArchitectureDocument {
    @Id @GeneratedValue(strategy=GenerationType.UUID) private UUID id;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="model_version_id",nullable=false) private ModelVersion modelVersion;
    @Column(name="view_key",nullable=false,length=160) private String viewKey;
    @Column(nullable=false) private long revision;
    @Column(name="xml_content",nullable=false,columnDefinition="text") private String xml;
    @Column(name="updated_at",nullable=false) private OffsetDateTime updatedAt;
}