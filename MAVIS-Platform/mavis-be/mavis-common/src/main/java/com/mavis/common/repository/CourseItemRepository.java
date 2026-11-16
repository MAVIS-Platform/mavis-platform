package com.mavis.common.repository;

import com.mavis.common.entity.CourseItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface CourseItemRepository extends JpaRepository<CourseItem, UUID> {
    List<CourseItem> findByModuleIdOrderByPositionAsc(UUID moduleId);
    boolean existsByModuleIdAndPosition(UUID moduleId, int position);
}
