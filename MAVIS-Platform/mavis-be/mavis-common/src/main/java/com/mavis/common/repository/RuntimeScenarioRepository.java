package com.mavis.common.repository;
import com.mavis.common.entity.RuntimeScenario;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface RuntimeScenarioRepository extends JpaRepository<RuntimeScenario,UUID> {List<RuntimeScenario> findByProjectIdOrderByNameAsc(UUID projectId);}
