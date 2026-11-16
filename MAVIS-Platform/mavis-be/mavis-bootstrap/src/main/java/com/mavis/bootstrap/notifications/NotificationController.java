package com.mavis.bootstrap.notifications;

import com.mavis.common.dto.ApiResponse;
import com.mavis.common.security.AccessPolicyService;
import jakarta.validation.constraints.*;
import org.springframework.dao.DataAccessException;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api/v1/notifications")
@Validated
public class NotificationController {
    private static final Set<String> CATEGORIES=Set.of("WORKSPACE","ASSIGNMENT","SUBMISSION","ANALYSIS","RUNTIME","ACCOUNT","SYSTEM");
    private final AccessPolicyService policy;
    private final JdbcTemplate jdbc;
    public NotificationController(AccessPolicyService policy, JdbcTemplate jdbc){this.policy=policy;this.jdbc=jdbc;}
    @GetMapping
    @Transactional(readOnly=true)
    public ApiResponse<?> list(@RequestParam(defaultValue="0") @Min(0) @Max(10000) int page,
                              @RequestParam(defaultValue="20") @Min(1) @Max(50) int size,
                              @RequestParam(defaultValue="false") boolean unreadOnly,
                              @RequestParam(defaultValue="") String category) {
        UUID user=policy.requireCurrentActiveUser().getId();
        if(page<0||page>10000||size<1||size>50||(!category.isEmpty()&&!CATEGORIES.contains(category)))throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        Instant asOf=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        List<Object> args=new ArrayList<>(List.of(user,Timestamp.from(asOf)));
        String where=" WHERE recipient_id=? AND created_at<=?";
        if(unreadOnly) where+=" AND read_at IS NULL";
        if(!category.isEmpty()){where+=" AND category=?";args.add(category);}
        Long total=jdbc.queryForObject("SELECT count(*) FROM user_notifications"+where,Long.class,args.toArray());
        Long unread=jdbc.queryForObject("SELECT count(*) FROM user_notifications WHERE recipient_id=? AND read_at IS NULL AND created_at<=?",Long.class,user,Timestamp.from(asOf));
        args.add(size);args.add(page*size);
        List<Map<String,Object>> items=jdbc.query("SELECT id,category,title,body,target_path,created_at,read_at FROM user_notifications"+where+" ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",(rs,row)->{
            Map<String,Object> item=new LinkedHashMap<>();item.put("id",rs.getObject("id").toString());item.put("category",rs.getString("category"));item.put("title",rs.getString("title"));item.put("body",rs.getString("body"));item.put("targetPath",safePath(rs.getString("target_path")));item.put("createdAt",rs.getTimestamp("created_at").toInstant().toString());Timestamp read=rs.getTimestamp("read_at");item.put("readAt",read==null?null:read.toInstant().toString());return item;
        },args.toArray());
        return ApiResponse.success(Map.of("items",items,"total",total,"unreadCount",unread,"page",page,"size",size,"asOf",asOf.toString(),"recipientId",user.toString()));
    }
    private Map<String,Object> acknowledgement(UUID user,Instant asOf,Instant readAt){
        Long unread=jdbc.queryForObject("SELECT count(*) FROM user_notifications WHERE recipient_id=? AND read_at IS NULL AND created_at<=?",Long.class,user,Timestamp.from(asOf));
        if(unread==null)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        Map<String,Object> result=new LinkedHashMap<>();result.put("ok",true);result.put("recipientId",user.toString());result.put("asOf",asOf.toString());result.put("readAt",readAt.toString());result.put("unreadCount",unread);return result;
    }
    @PatchMapping("/{id}/read") @Transactional
    public ApiResponse<?> read(@PathVariable UUID id){
        UUID user=policy.requireCurrentActiveUser().getId();
        Instant now=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        if(jdbc.update("UPDATE user_notifications SET read_at=coalesce(read_at,?) WHERE id=? AND recipient_id=?",Timestamp.from(now),id,user)==0)throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        Timestamp stored=jdbc.queryForObject("SELECT read_at FROM user_notifications WHERE id=? AND recipient_id=?",Timestamp.class,id,user);
        if(stored==null)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        var result=acknowledgement(user,Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS),stored.toInstant());result.put("notificationId",id.toString());return ApiResponse.success(result);
    }
    public record ReadAll(@NotNull Instant before){}
    @PostMapping("/read-all") @Transactional
    public ApiResponse<?> readAll(@jakarta.validation.Valid @RequestBody ReadAll input){
        if(input==null||input.before()==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid notification request");
        UUID user=policy.requireCurrentActiveUser().getId();Instant now=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);Instant requested=input.before().truncatedTo(java.time.temporal.ChronoUnit.MICROS);Instant cutoff=requested.isAfter(now)?now:requested;
        jdbc.update("UPDATE user_notifications SET read_at=? WHERE recipient_id=? AND read_at IS NULL AND created_at<=?",Timestamp.from(now),user,Timestamp.from(cutoff));
        var result=acknowledgement(user,now,now);result.put("before",cutoff.toString());return ApiResponse.success(result);
    }
    static String safePath(String path){
        if(path==null||path.contains("\\")||path.contains("\r")||path.contains("\n"))return "/notifications";
        return path.matches("^/(?:notifications|profile|workspaces|assignments|members|references|submissions|analysis-history|architecture|project-overview|sessions|administration)(?:[/?#].*)?$")||path.equals("/")?path:"/notifications";
    }
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<?> status(ResponseStatusException error){return ResponseEntity.status(error.getStatusCode()).body(Map.of("code",error.getStatusCode().value(),"message","Notification request unavailable"));}
    @ExceptionHandler({jakarta.validation.ConstraintViolationException.class,org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class,
            org.springframework.web.bind.MethodArgumentNotValidException.class,
            org.springframework.http.converter.HttpMessageNotReadableException.class})
    ResponseEntity<?> invalid(){return ResponseEntity.badRequest().body(Map.of("code",400,"message","Invalid notification request"));}
    @ExceptionHandler(DataAccessException.class)
    ResponseEntity<?> unavailable(){return ResponseEntity.status(503).body(Map.of("code",503,"message","Notification storage unavailable"));}
}
