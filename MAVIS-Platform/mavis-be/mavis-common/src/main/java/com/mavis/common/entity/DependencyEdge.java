package com.mavis.common.entity;

import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "dependency_edges")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DependencyEdge {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    private AnalysisSession session;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_node_id", nullable = false)
    private ServiceNode sourceNode;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_node_id", nullable = false)
    private ServiceNode targetNode;

    @Column(name = "dependency_kind", nullable = false, length = 30)
    private String dependencyKind;

    private String description;
}