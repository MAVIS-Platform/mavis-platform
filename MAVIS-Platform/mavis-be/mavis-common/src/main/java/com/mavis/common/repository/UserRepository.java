package com.mavis.common.repository;

import com.mavis.common.entity.User;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID> {
    @EntityGraph(attributePaths = {"role"})
    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    Optional<User> findFirstByOrderByCreatedAtAsc();

    @EntityGraph(attributePaths = {"role"})
    List<User> findByEmailIn(Collection<String> emails);

    @EntityGraph(attributePaths = {"role"})
    List<User> findAllByOrderByCreatedAtDesc();
}

