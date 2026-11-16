package com.mavis.common.utils;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class ZipUtilsTest {
    @TempDir Path root;
    private Path zip(String name,Map<String,byte[]> entries)throws Exception{Path file=root.resolve(name);try(var out=new java.util.zip.ZipOutputStream(Files.newOutputStream(file))){for(var e:entries.entrySet()){out.putNextEntry(new java.util.zip.ZipEntry(e.getKey()));out.write(e.getValue());out.closeEntry();}}return file;}
    @Test void sealedSnapshotIsReusableAndTamperingIsRejected()throws Exception{Path file=zip("source.zip",Map.of("src/App.cs","class App {}".getBytes()));String digest=HashUtils.sha256Hex(file);Path extracted=Path.of(ZipUtils.extract(file.toString(),digest));assertEquals(extracted.toString(),ZipUtils.extract(file.toString(),digest));Files.writeString(extracted.resolve("src/App.cs"),"changed");assertThrows(java.io.IOException.class,()->ZipUtils.extract(file.toString(),digest));}
    @Test void traversalAndWrongSnapshotHashAreRejected()throws Exception{Path file=zip("escape.zip",Map.of("../outside","bad".getBytes()));assertThrows(java.io.IOException.class,()->ZipUtils.extract(file.toString()));assertFalse(Files.exists(root.resolve("outside")));Path valid=zip("valid.zip",Map.of("App.cs","class App {}".getBytes()));assertThrows(java.io.IOException.class,()->ZipUtils.extract(valid.toString(),"0".repeat(64)));}
    @Test void duplicatePortableNamesAndUnsealedTargetsAreRejected()throws Exception{Path file=zip("duplicate.zip",Map.of("A.cs","a".getBytes(),"a.cs","b".getBytes()));assertThrows(java.io.IOException.class,()->ZipUtils.extract(file.toString()));Path valid=zip("existing.zip",Map.of("App.cs","class App {}".getBytes()));Files.createDirectory(root.resolve("existing_extracted"));assertThrows(java.io.IOException.class,()->ZipUtils.extract(valid.toString()));}
    @Test void decompressionBudgetAndCancellationLeaveNoSealedOutput()throws Exception{Path file=zip("large.zip",Map.of("large.bin",new byte[20*1024*1024+1]));assertThrows(java.io.IOException.class,()->ZipUtils.extract(file.toString()));assertFalse(Files.exists(root.resolve("large_extracted")));try(var paths=Files.list(root)){assertFalse(paths.anyMatch(p->p.getFileName().toString().startsWith(".mavis-extract-")));}Thread.currentThread().interrupt();try{assertThrows(java.io.InterruptedIOException.class,()->ZipUtils.extract(file.toString()));}finally{Thread.interrupted();}}
}
