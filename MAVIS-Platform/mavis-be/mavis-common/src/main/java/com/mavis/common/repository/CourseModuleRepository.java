package com.mavis.common.repository;

import com.mavis.common.entity.CourseModule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface CourseModuleRepository extends JpaRepository<CourseModule, UUID> {
    List<CourseModule> findByCourseIdOrderByPositionAsc(UUID courseId);
    boolean existsByCourseIdAndPosition(UUID courseId, int position);
}
