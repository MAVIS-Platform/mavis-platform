package com.mavis.common.repository;

import com.mavis.common.entity.Project;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
    List<Project> findByOwnerId(UUID ownerId);
}
