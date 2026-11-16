package com.mavis.common.repository;

import com.mavis.common.entity.CourseVersion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CourseVersionRepository extends JpaRepository<CourseVersion, UUID> {
    List<CourseVersion> findByCourseIdOrderByVersionDesc(UUID courseId);
    boolean existsByCourseIdAndSnapshotDigest(UUID courseId, String snapshotDigest);
    Optional<CourseVersion> findByCourseIdAndVersion(UUID courseId, int version);
}
