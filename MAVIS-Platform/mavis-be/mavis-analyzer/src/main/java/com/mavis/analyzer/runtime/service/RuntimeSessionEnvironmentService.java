package com.mavis.analyzer.runtime.service;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.RuntimeSession;
import com.mavis.common.repository.RuntimeSessionRepository;
import com.mavis.common.exception.*;
import com.mavis.analyzer.runtime.security.RunnerServiceAuthGuard;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.security.SecureRandom;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Service
public class RuntimeSessionEnvironmentService {
 private final RuntimeSessionRepository sessions;private final RunnerServiceAuthGuard runner;private final ObjectMapper json;private final String key;
 public RuntimeSessionEnvironmentService(RuntimeSessionRepository sessions,RunnerServiceAuthGuard runner,ObjectMapper json,@Value("${mavis.runtime.environment-key:}") String key){this.sessions=sessions;this.runner=runner;this.json=json;this.key=key;}
 private BusinessException invalid(String message){return new BusinessException(ErrorCode.BAD_REQUEST,message);}
 private byte[] key(){try{byte[] bytes=Base64.getDecoder().decode(key);if(bytes.length!=32)throw new IllegalArgumentException();return bytes;}catch(Exception e){throw invalid("Protected runtime environment storage is not configured");}}
 public boolean isConfigured(){try{key();return runner.isConfigured();}catch(BusinessException ex){return false;}}
 private byte[] scope(RuntimeSession s){return (s.getId()+"|"+s.getSourceSnapshot().getId()+"|"+s.getModelVersion().getId()).getBytes(StandardCharsets.UTF_8);}
 @Transactional
 public void store(UUID sessionId,Map<String,String> values){
  if(values==null||values.isEmpty())return;
  if(!isConfigured())throw invalid("Protected runtime environment storage is not configured");
  if(values.size()>64||values.entrySet().stream().anyMatch(e->e.getKey()==null||!e.getKey().matches("[A-Z][A-Z0-9_]{0,63}")||e.getValue()==null||e.getValue().length()>16000||e.getValue().indexOf(0)>=0))throw invalid("Invalid runtime environment inputs");
  var session=sessions.findById(sessionId).orElseThrow(()->invalid("Session unavailable"));
  if(!Set.of("NOT_STARTED","PENDING").contains(session.getExecutionStatus()))throw invalid("Environment must be pinned before approval");
  try{
   byte[] plain=json.writeValueAsBytes(values);if(plain.length>65536)throw invalid("Runtime environment exceeds size limit");
   byte[] nonce=new byte[12];new SecureRandom().nextBytes(nonce);var cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(key(),"AES"),new GCMParameterSpec(128,nonce));cipher.updateAAD(scope(session));
   session.setEnvironmentCiphertext("v1."+Base64.getEncoder().encodeToString(nonce)+"."+Base64.getEncoder().encodeToString(cipher.doFinal(plain)));sessions.save(session);
  }catch(BusinessException e){throw e;}catch(Exception e){throw invalid("Could not protect runtime environment");}
 }
 public record EnvironmentView(UUID sessionId,String resourceProject,Map<String,String> values){}
 @Transactional(readOnly=true)
 public EnvironmentView readForRunner(UUID sessionId){
  runner.requireRunnerService();var session=sessions.findById(sessionId).orElseThrow(()->invalid("Session unavailable"));
  if(!Set.of("READY_FOR_DISPATCH","ALLOCATED","RUNNING").contains(session.getExecutionStatus()))throw invalid("Runtime environment is unavailable for this session state");
  if(session.getEnvironmentCiphertext()==null)return new EnvironmentView(sessionId,session.getResourceProject(),Map.of());
  try{
   var parts=session.getEnvironmentCiphertext().split("\\.");if(parts.length!=3||!parts[0].equals("v1"))throw new IllegalArgumentException();
   var cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(key(),"AES"),new GCMParameterSpec(128,Base64.getDecoder().decode(parts[1])));cipher.updateAAD(scope(session));
   Map<String,String> values=json.readValue(cipher.doFinal(Base64.getDecoder().decode(parts[2])),json.getTypeFactory().constructMapType(LinkedHashMap.class,String.class,String.class));
   return new EnvironmentView(sessionId,session.getResourceProject(),values);
  }catch(BusinessException e){throw e;}catch(Exception e){throw invalid("Could not read protected runtime environment");}
 }
}
