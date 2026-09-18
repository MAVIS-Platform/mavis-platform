package com.mavis.common.repository;

import com.mavis.common.entity.ServiceNode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ServiceNodeRepository extends JpaRepository<ServiceNode, UUID> {
    List<ServiceNode> findBySessionId(UUID sessionId);
}
