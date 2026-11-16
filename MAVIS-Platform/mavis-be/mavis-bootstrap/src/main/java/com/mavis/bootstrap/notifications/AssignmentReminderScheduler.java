package com.mavis.bootstrap.notifications;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.*;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
@EnableScheduling
@ConditionalOnProperty(name="mavis.notifications.reminders-enabled",havingValue="true")
public class AssignmentReminderScheduler {
 private static final Logger log=LoggerFactory.getLogger(AssignmentReminderScheduler.class);
 private final JdbcTemplate jdbc;
 public AssignmentReminderScheduler(JdbcTemplate jdbc){this.jdbc=jdbc;}
 @Scheduled(fixedDelayString="${mavis.notifications.reminder-interval-ms:60000}",initialDelay=60000)
 public void remind(){try{jdbc.execute("SELECT mavis_assignment_reminders()");}catch(org.springframework.dao.DataAccessException e){log.warn("Notification reminder storage unavailable; check migration V22.");}}
}
