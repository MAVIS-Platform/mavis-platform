package com.mavis.bootstrap;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.nio.file.*;
import java.sql.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

/** Opt-in PostgreSQL test. Only creates/drops random databases on the dedicated loopback test port. */
@EnabledIfEnvironmentVariable(named="MAVIS_MIGRATION_TEST_JDBC_URL", matches="jdbc:postgresql://127\\.0\\.0\\.1:15438/[a-zA-Z0-9_]+")
class MigrationUpgradeTest {
    final String adminUrl=System.getenv("MAVIS_MIGRATION_TEST_JDBC_URL");
    final String user=System.getenv("MAVIS_MIGRATION_TEST_JDBC_USER");
    final String password=System.getenv("MAVIS_MIGRATION_TEST_JDBC_PASSWORD");
    final Path migrations=Path.of("src/main/resources/db/migration").toAbsolutePath();

    Flyway flyway(String url, String target) {
        var config=Flyway.configure().dataSource(url,user,password).locations("filesystem:"+migrations)
                .cleanDisabled(true).baselineOnMigrate(false)
                .configuration(Map.of("flyway.postgresql.transactional.lock","false"));
        if(target!=null) config.target(MigrationVersion.fromVersion(target));
        return config.load();
    }
    @Test void cleanInstallAndV15UpgradePreserveHistoryAndExistingData() throws Exception {
        try(var admin=DriverManager.getConnection(adminUrl,user,password);var commands=admin.createStatement()) {
            for(String baseline:Arrays.asList(null,"15","20")) {
                boolean upgrade=baseline!=null;
                String name="mavis_migration_"+UUID.randomUUID().toString().replace("-","");
                commands.execute("CREATE DATABASE "+name);
                String url=adminUrl.substring(0,adminUrl.lastIndexOf('/')+1)+name;
                try {
                    if(upgrade) {
                        flyway(url,baseline).migrate();
                        try(var connection=DriverManager.getConnection(url,user,password);var sql=connection.createStatement()) {
                            sql.execute(Files.readString(migrations.resolve("V21__Submission_Review.sql")));
                            sql.execute("INSERT INTO users(role_id,email,password_hash,full_name) SELECT id,'migration-preservation@example.invalid','fixture-only','Preserved learner' FROM roles WHERE code='STUDENT'");
                            sql.execute(Files.readString(migrations.resolve("V22__User_Notifications.sql")));
                            sql.execute("INSERT INTO user_notifications(recipient_id,event_key,category,title,body,target_path) SELECT id,'migration-preservation','ACCOUNT','Preserved notice','Fixture only','/profile' FROM users WHERE email='migration-preservation@example.invalid'");
                        }
                    }
                    var current=flyway(url,null);
                    current.migrate();
                    current.validate();
                    MigrationVersion expected;
                    try(var files=Files.list(migrations)) {
                        expected=files.map(path->path.getFileName().toString()).filter(migrationName->migrationName.matches("V[0-9]+__.*\\.sql"))
                                .map(migrationName->MigrationVersion.fromVersion(migrationName.substring(1,migrationName.indexOf("__"))))
                                .max(MigrationVersion::compareTo).orElseThrow();
                    }
                    assertEquals(expected,current.info().current().getVersion());
                    assertEquals(0,current.migrate().migrationsExecuted);
                    try(var connection=DriverManager.getConnection(url,user,password);var sql=connection.createStatement()) {
                        try(var rows=sql.executeQuery("SELECT version,script FROM flyway_schema_history WHERE version IN ('10','11') ORDER BY installed_rank")) {
                            assertTrue(rows.next());assertEquals("V10__Fence_Job_Updates.sql",rows.getString("script"));
                            assertTrue(rows.next());assertEquals("V11__Runtime_Recovery_Result.sql",rows.getString("script"));
                            assertFalse(rows.next());
                        }
                        if(upgrade) try(var rows=sql.executeQuery("SELECT full_name FROM users WHERE email='migration-preservation@example.invalid'")) {
                            assertTrue(rows.next());assertEquals("Preserved learner",rows.getString(1));
                        }
                        if(upgrade) try(var rows=sql.executeQuery("SELECT count(*) FROM user_notifications WHERE event_key='migration-preservation'")) { assertTrue(rows.next());assertEquals(1,rows.getInt(1)); }
                        try(var rows=sql.executeQuery("SELECT to_regclass('submission_reviews')")) { assertTrue(rows.next());assertNotNull(rows.getString(1)); }
                        try(var rows=sql.executeQuery("SELECT to_regclass('ai_usage_events')")) { assertTrue(rows.next());assertNotNull(rows.getString(1)); }
                        try(var rows=sql.executeQuery("SELECT to_regclass('user_notifications')")) { assertTrue(rows.next());assertNotNull(rows.getString(1)); }
                    }
                } finally { commands.execute("DROP DATABASE "+name+" WITH (FORCE)"); }
            }
        }
    }
}
