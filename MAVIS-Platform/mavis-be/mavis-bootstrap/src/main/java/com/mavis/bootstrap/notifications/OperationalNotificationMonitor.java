package com.mavis.bootstrap.notifications;
import com.mavis.bootstrap.admin.AdminHealthController;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.*;
import org.springframework.stereotype.Component;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
@EnableScheduling
@ConditionalOnProperty(name="mavis.notifications.monitoring-enabled",havingValue="true")
public class OperationalNotificationMonitor {
 private static final Logger log=LoggerFactory.getLogger(OperationalNotificationMonitor.class);
 private final JdbcTemplate jdbc;private final AdminHealthController health;
 public OperationalNotificationMonitor(JdbcTemplate jdbc,AdminHealthController health){this.jdbc=jdbc;this.health=health;}
 @Scheduled(fixedDelay=60000,initialDelay=90000)
 public void check(){try{
  Object checks=health.snapshot().get("checks");
  if(checks instanceof List<?> list) for(Object item:list) if(item instanceof Map<?,?> row) jdbc.queryForObject("SELECT mavis_observe_health(?,?)",Object.class,String.valueOf(row.get("id")),String.valueOf(row.get("status")));
 }catch(org.springframework.dao.DataAccessException e){log.warn("Operational notification storage unavailable; check migration V22.");}}
}
