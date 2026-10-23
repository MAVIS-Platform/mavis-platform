package com.mavis.common.config;
import com.mavis.common.exception.*;
import org.springframework.stereotype.Component;
import java.util.*;
import java.util.function.Consumer;
/** Process-local switches and limits; restart restores defaults. No credentials are stored here. */
@Component
public class PlatformRuntimeSettings {
 public record Integration(String id, String name, boolean enabled, int revision) {}
 public record Profile(String id,String name,boolean enabled,int revision,int memoryMiB,double cpus,int timeoutSeconds) {}
 private final Map<String,Integration> integrations=new LinkedHashMap<>();
 private final Map<String,Profile> profiles=new LinkedHashMap<>();
 public PlatformRuntimeSettings(){
  for(var item:List.of(new Integration("github","GitHub Source Provider",true,1),new Integration("gemini-ai","Google Gemini AI Explanation",true,1),new Integration("otel-collector","OpenTelemetry OTLP Collector",true,1)))integrations.put(item.id(),item);
  for(String id:List.of("SPRING_BOOT_DOTNET_COMPOSE_V1","JAVA_SPRING_OTEL_V1","DOTNET8_LINUX_OTEL_V1"))profiles.put(id,new Profile(id,id,true,1,256,1,120));
 }
 public synchronized List<Integration> integrations(){return List.copyOf(integrations.values());}
 public synchronized List<Profile> profiles(){return List.copyOf(profiles.values());}
 public synchronized boolean enabled(String id){return integration(id).enabled();}
 private Integration integration(String id){var item=integrations.get(id);if(item==null)throw new BusinessException(ErrorCode.NOT_FOUND);return item;}
 public synchronized Profile profile(String id){var p=profiles.get(id);if(p==null)throw new BusinessException(ErrorCode.BAD_REQUEST,"Unknown execution profile");return p;}
 public void requireIntegration(String id){if(!enabled(id))throw new BusinessException(ErrorCode.FORBIDDEN,"Integration is disabled");}
 public Profile requireProfile(String id){var p=profile(id);if(!p.enabled())throw new BusinessException(ErrorCode.FORBIDDEN,"Execution profile is disabled");return p;}
 public synchronized Integration updateIntegration(String id,boolean enabled,int expected,Consumer<Integration> audit){var old=integration(id);if(old.revision()!=expected)throw new BusinessException(ErrorCode.CONFLICT);var next=new Integration(id,old.name(),enabled,expected+1);audit.accept(next);integrations.put(id,next);return next;}
 public synchronized Profile updateProfile(String id,boolean enabled,int expected,Integer memory,Double cpus,Integer timeout,Consumer<Profile> audit){
  var old=profile(id);if(old.revision()!=expected)throw new BusinessException(ErrorCode.CONFLICT);
  int m=memory==null?old.memoryMiB():memory,t=timeout==null?old.timeoutSeconds():timeout;double c=cpus==null?old.cpus():cpus;
  if(m<64||m>2048||!Double.isFinite(c)||c<=0||c>4||t<1||t>300)throw new BusinessException(ErrorCode.BAD_REQUEST,"Runner limits outside supported range");
  var next=new Profile(id,old.name(),enabled,expected+1,m,c,t);audit.accept(next);profiles.put(id,next);return next;
 }
}
