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
    @org.springframework.data.jpa.repository.QueryHints(@jakarta.persistence.QueryHint(name = "org.hibernate.readOnly", value = "true"))
    java.util.Optional<Job> findByProjectIdAndAnalysisRequestKey(UUID projectId,String analysisRequestKey);
    List<Job> findByProjectIdOrderByStartedAtDesc(UUID projectId);
    List<Job> findBySourceSnapshotId(UUID sourceSnapshotId);
    List<Job> findByStatus(String status);
    List<Job> findTop100ByStatusOrderByStartedAtAsc(String status);
    @org.springframework.data.jpa.repository.EntityGraph(attributePaths={"project","sourceSnapshot"})
    @org.springframework.data.jpa.repository.Query(value="select j from Job j where j.project.owner.id=:owner and (j.project.status is null or j.project.status<>'DELETED') order by coalesce(j.completedAt,j.startedAt) desc,j.id desc",countQuery="select count(j) from Job j where j.project.owner.id=:owner and (j.project.status is null or j.project.status<>'DELETED')")
    org.springframework.data.domain.Page<Job> findActivityForOwner(@org.springframework.data.repository.query.Param("owner") UUID owner,org.springframework.data.domain.Pageable page);
}
