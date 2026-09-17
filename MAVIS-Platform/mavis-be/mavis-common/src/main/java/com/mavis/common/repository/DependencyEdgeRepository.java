package com.mavis.common.repository;

import com.mavis.common.entity.DependencyEdge;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface DependencyEdgeRepository extends JpaRepository<DependencyEdge, UUID> {
}
