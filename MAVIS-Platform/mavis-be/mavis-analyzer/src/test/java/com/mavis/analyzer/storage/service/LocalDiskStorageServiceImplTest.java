package com.mavis.analyzer.storage.service;
import com.mavis.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.mock.web.MockMultipartFile;
import java.io.*;
import java.nio.file.*;
import static org.junit.jupiter.api.Assertions.*;
class LocalDiskStorageServiceImplTest {
 @TempDir Path root;
 private LocalDiskStorageServiceImpl storage(){var service=new LocalDiskStorageServiceImpl();ReflectionTestUtils.setField(service,"uploadDir",root.toString());return service;}
 @Test void clientNamesCannotSelectPathsAndOverloadsPublishCompleteFiles() throws Exception {
  var service=storage();
  for(String path:new String[]{service.store(new byte[]{1},"../../escape.zip"),service.store(new ByteArrayInputStream(new byte[]{2}),"C:/outside.zip"),service.store(new MockMultipartFile("file","../evil.zip","application/zip",new byte[]{3}))}) {
   Path stored=Path.of(path);assertEquals(root,stored.getParent());assertTrue(stored.getFileName().toString().matches("[a-f0-9-]{36}_source\\.zip"));assertEquals(1,Files.size(stored));
  }
  try(var files=Files.list(root)){assertEquals(3,files.count());}
 }
 @Test void oversizeAndInterruptedStreamsLeaveNoPartialArtifact() throws Exception {
  InputStream large=new InputStream(){long remaining=100L*1024*1024+1;public int read(){return remaining-->0?0:-1;}public int read(byte[] b,int off,int len){if(remaining<=0)return -1;int count=(int)Math.min(remaining,len);remaining-=count;return count;}};
  assertThrows(BusinessException.class,()->storage().store(large,"large.zip"));
  Thread.currentThread().interrupt();try{assertThrows(BusinessException.class,()->storage().store(new ByteArrayInputStream(new byte[]{1}),"a.zip"));}finally{Thread.interrupted();}
  try(var files=Files.list(root)){assertEquals(0,files.count());}
 }
}
