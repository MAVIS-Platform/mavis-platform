package com.mavis.common.config;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import com.mavis.common.exception.BusinessException;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
class PlatformRuntimeSettingsTest {
 @Test void revisionLimitsAndAuditFailureAreAtomic(){var s=new PlatformRuntimeSettings();assertThrows(IllegalStateException.class,()->s.updateIntegration("github",false,1,n->{throw new IllegalStateException();}));assertTrue(s.enabled("github"));s.updateIntegration("github",false,1,n->{});assertThrows(BusinessException.class,()->s.requireIntegration("github"));assertThrows(BusinessException.class,()->s.updateIntegration("github",true,1,n->{}));assertThrows(BusinessException.class,()->s.updateProfile("JAVA_SPRING_OTEL_V1",true,1,4096,1.0,120,n->{}));assertEquals(1,s.profile("JAVA_SPRING_OTEL_V1").revision());assertTrue(new PlatformRuntimeSettings().enabled("github"));}
 @Test void competingWritersHaveOneWinner()throws Exception{var s=new PlatformRuntimeSettings();var won=new AtomicInteger();try(var pool=Executors.newFixedThreadPool(2)){var ready=new CountDownLatch(2);var go=new CountDownLatch(1);var work=(Callable<Void>)()->{ready.countDown();go.await();try{s.updateProfile("JAVA_SPRING_OTEL_V1",false,1,128,0.5,60,n->won.incrementAndGet());}catch(BusinessException expected){}return null;};var a=pool.submit(work);var b=pool.submit(work);assertTrue(ready.await(2,TimeUnit.SECONDS));go.countDown();a.get();b.get();}assertEquals(1,won.get());assertEquals(2,s.profile("JAVA_SPRING_OTEL_V1").revision());}
}
