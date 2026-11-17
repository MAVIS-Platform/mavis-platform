package com.mavis.common.repository;

import com.mavis.common.entity.LabStudioExercise;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface LabStudioExerciseRepository extends JpaRepository<LabStudioExercise, UUID> {

    Optional<LabStudioExercise> findByAssignmentId(UUID assignmentId);
}
