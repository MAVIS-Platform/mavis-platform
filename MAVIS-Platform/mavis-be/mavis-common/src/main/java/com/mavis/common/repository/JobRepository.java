package com.mavis.common.repository;

import com.mavis.common.entity.Job;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface JobRepository extends JpaRepository<Job, UUID> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select j from Job j where j.id = :id")
    java.util.Optional<Job> findLockedById(@org.springframework.data.repository.query.Param("id") UUID id);
    List<Job> findByProjectId(UUID projectId);
    List<Job> findByProjectIdOrderByStartedAtDesc(UUID projectId);
    List<Job> findBySourceSnapshotId(UUID sourceSnapshotId);
    List<Job> findByStatus(String status);
}
