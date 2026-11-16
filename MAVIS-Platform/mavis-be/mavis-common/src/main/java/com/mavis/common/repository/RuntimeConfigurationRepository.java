package com.mavis.common.repository;
import com.mavis.common.entity.RuntimeConfiguration;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface RuntimeConfigurationRepository extends JpaRepository<RuntimeConfiguration,UUID> {}
