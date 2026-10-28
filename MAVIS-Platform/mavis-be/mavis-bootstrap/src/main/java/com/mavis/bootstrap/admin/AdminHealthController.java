package com.mavis.bootstrap.admin;

import com.mavis.common.dto.ApiResponse;
import com.mavis.common.security.AccessPolicyService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import javax.sql.DataSource;
import java.lang.management.ManagementFactory;
import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.sql.Connection;
import java.time.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminHealthController {
    private final AccessPolicyService policy;
    private final DataSource database;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    @Value("${mavis.worker.dotnet-url:http://localhost:5050}") private String workerUrl;
    @Value("${mavis.worker.enabled:false}") private boolean workerEnabled;
    @Value("${mavis.storage.upload-dir:./uploads}") private String storagePath;
    private Map<String,Object> cached;
    private long validUntil;
    public AdminHealthController(AccessPolicyService policy, DataSource database) {
        this.policy=policy; this.database=database;
    }
    @GetMapping("/health")
    public ApiResponse<?> health() {
        policy.requireSystemAdmin();
        return ApiResponse.success(snapshot());
    }
    private synchronized Map<String,Object> snapshot() {
        if(cached!=null && System.currentTimeMillis()<validUntil) return cached;
        List<Map<String,Object>> checks=new ArrayList<>();
        checks.add(check("backend","Application API","UP",null,"Responding to authenticated requests.",null));
        long start=System.nanoTime();
        try(Connection c=database.getConnection()) {
            boolean valid=c.isValid(2);
            checks.add(check("database","PostgreSQL",valid?"UP":"DOWN",elapsed(start),valid?"Connection validation succeeded.":"Connection validation failed.",valid?null:"Check database availability and connection settings."));
        } catch(Exception e) {
            checks.add(check("database","PostgreSQL","DOWN",elapsed(start),"Database connection could not be validated.","Check database availability and connection settings."));
        }
        start=System.nanoTime();
        if(!workerEnabled) checks.add(check("worker","Analysis Worker","DISABLED",null,"Worker is disabled in server configuration.","Enable the Worker before starting analysis that requires it."));
        else {
            try {
                int status=workerStatus();
                checks.add(check("worker","Analysis Worker",status==200?"UP":"DOWN",elapsed(start),status==200?"Readiness endpoint responded successfully.":"Readiness check returned HTTP "+status+".",status==200?null:"Check Worker availability and its readiness diagnostics."));
            } catch(Exception e) { checks.add(check("worker","Analysis Worker","DOWN",elapsed(start),"Worker readiness could not be reached.","Check Worker connectivity and readiness diagnostics.")); }
        }
        Map<String,Object> storage=new LinkedHashMap<>();
        try {
            Path path=Path.of(storagePath).toAbsolutePath();
            if(!Files.isDirectory(path)) throw new IllegalStateException();
            var store=storageStore(path);
            long total=store.getTotalSpace(), free=store.getUsableSpace();
            boolean low=total>0 && (double)free/total<0.1;
            storage.put("totalBytes",total); storage.put("freeBytes",free);
            checks.add(check("storage","Source & artifact storage",low?"WARNING":"UP",null,low?"Less than 10% of the storage volume is available.":"Storage volume is accessible.",low?"Review retained uploads and artifacts before running more jobs.":null));
        } catch(Exception e) { checks.add(check("storage","Source & artifact storage","UNKNOWN",null,"Storage volume could not be measured.","Check the configured upload directory and filesystem permissions.")); }
        Runtime runtime=Runtime.getRuntime();
        Map<String,Object> jvm=Map.of("usedBytes",runtime.totalMemory()-runtime.freeMemory(),"maxBytes",runtime.maxMemory(),"uptimeSeconds",ManagementFactory.getRuntimeMXBean().getUptime()/1000);
        String status=checks.stream().anyMatch(c->List.of("DOWN","WARNING").contains(c.get("status")))?"DEGRADED":checks.stream().anyMatch(c->List.of("UNKNOWN","DISABLED").contains(c.get("status")))?"UNKNOWN":"UP";
        cached=Map.of("status",status,"checkedAt",Instant.now().toString(),"checks",checks,"jvm",jvm,"storage",storage,"scope","Backend process and its configured dependencies; host-wide metrics and workload Runner are not probed.");
        validUntil=System.currentTimeMillis()+10000;
        return cached;
    }
    protected int workerStatus() throws Exception {
        var request=HttpRequest.newBuilder(URI.create(workerUrl.replaceAll("/+$","")+"/api/health/ready")).timeout(Duration.ofSeconds(3)).GET().build();
        return http.send(request,HttpResponse.BodyHandlers.discarding()).statusCode();
    }
    protected java.nio.file.FileStore storageStore(Path path) throws java.io.IOException {
        return Files.getFileStore(path);
    }
    private static long elapsed(long start){return (System.nanoTime()-start)/1000000;}
    private static Map<String,Object> check(String id,String name,String status,Long latency,String message,String action){
        Map<String,Object> c=new LinkedHashMap<>();c.put("id",id);c.put("name",name);c.put("status",status);c.put("latencyMs",latency);c.put("message",message);c.put("action",action);return c;
    }
}
