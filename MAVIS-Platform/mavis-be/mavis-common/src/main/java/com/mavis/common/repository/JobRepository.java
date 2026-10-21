package com.mavis.common.repository;

import com.mavis.common.entity.Job;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface JobRepository extends JpaRepository<Job, UUID> {
    List<Job> findByProjectId(UUID projectId);
    List<Job> findBySourceSnapshotId(UUID sourceSnapshotId);
    List<Job> findByStatus(String status);
}
