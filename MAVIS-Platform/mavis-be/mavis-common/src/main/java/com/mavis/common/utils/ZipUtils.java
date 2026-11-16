package com.mavis.common.utils;

import java.io.*;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.ZipInputStream;

/** Bounded, sealed snapshot extraction. Never runs input code or rewrites a sealed snapshot. */
public final class ZipUtils {
    private static final String SEAL=".mavis-extraction-seal";
    private static final long MAX_ARCHIVE=100L*1024*1024,MAX_FILE=20L*1024*1024,MAX_TOTAL=200L*1024*1024;
    private ZipUtils(){}
    public static String extract(String path)throws IOException{return extract(path,null);}
    public static synchronized String extract(String path,String expectedHash)throws IOException{
        interrupted();Path archive=Path.of(path).toAbsolutePath().normalize();noLinks(archive);
        if(!Files.isRegularFile(archive,LinkOption.NOFOLLOW_LINKS)||Files.size(archive)>MAX_ARCHIVE)throw new IOException("Archive missing or exceeds size budget");
        String archiveHash=hash(archive);if(expectedHash!=null&&!archiveHash.equalsIgnoreCase(expectedHash))throw new IOException("Snapshot artifact hash mismatch");
        String name=archive.getFileName().toString();int dot=name.lastIndexOf('.');String folder=(dot>0&&name.substring(dot).equalsIgnoreCase(".zip")?name.substring(0,dot):name)+"_extracted";
        Path target=archive.getParent().resolve(folder),lock=archive.getParent().resolve("."+folder+".lock");
        if(Files.isSymbolicLink(lock))throw new IOException("Linked extraction lock rejected");
        try(var channel=FileChannel.open(lock,StandardOpenOption.CREATE,StandardOpenOption.WRITE,LinkOption.NOFOLLOW_LINKS);var held=channel.lock()){
            if(Files.exists(target,LinkOption.NOFOLLOW_LINKS)){
                noLinks(target);Path seal=target.resolve(SEAL);if(!Files.isRegularFile(seal,LinkOption.NOFOLLOW_LINKS)||Files.size(seal)>256)throw new IOException("Existing extraction is not sealed");
                var lines=Files.readAllLines(seal,StandardCharsets.UTF_8);if(lines.size()!=2||!archiveHash.equals(lines.get(0))||!treeHash(target).equals(lines.get(1)))throw new IOException("Sealed snapshot changed");
                return target.toString();
            }
            Path temporary=Files.createTempDirectory(archive.getParent(),".mavis-extract-");
            try{
                var seen=new HashSet<String>();var directories=new HashSet<Path>();long total=0;int entries=0;
                try(var stream=new ZipInputStream(Files.newInputStream(archive,LinkOption.NOFOLLOW_LINKS))){
                    java.util.zip.ZipEntry entry;
                    while((entry=stream.getNextEntry())!=null){
                        interrupted();if(++entries>10000)throw new IOException("Archive entry budget exceeded");
                        String relative=entry.getName().replace('\\','/');while(relative.startsWith("./"))relative=relative.substring(2);while(relative.endsWith("/"))relative=relative.substring(0,relative.length()-1);
                        if(relative.isEmpty()||relative.length()>1024||relative.startsWith("/")||relative.contains(":")||relative.chars().anyMatch(c->c<32)||relative.equalsIgnoreCase(SEAL)||relative.split("/",-1).length>32||Arrays.stream(relative.split("/",-1)).anyMatch(p->p.isEmpty()||p.equals(".")||p.equals(".."))||!seen.add(relative.toLowerCase(Locale.ROOT)))throw new IOException("Invalid or duplicate archive entry");
                        Path output=temporary.resolve(relative).normalize();if(!output.startsWith(temporary))throw new IOException("Archive path escaped scope");
                        for(Path parent=output.getParent();parent!=null&&!parent.equals(temporary);parent=parent.getParent()){directories.add(parent);if(directories.size()>20000)throw new IOException("Archive directory budget exceeded");}
                        if(entry.isDirectory()){Files.createDirectories(output);continue;}
                        Files.createDirectories(output.getParent());long fileBytes=0;
                        try(var file=Files.newOutputStream(output,StandardOpenOption.CREATE_NEW,StandardOpenOption.WRITE,LinkOption.NOFOLLOW_LINKS)){
                            byte[] buffer=new byte[8192];int count;while((count=stream.read(buffer))!=-1){interrupted();fileBytes+=count;total+=count;if(fileBytes>MAX_FILE||total>MAX_TOTAL)throw new IOException("Archive decompression budget exceeded");file.write(buffer,0,count);}
                        }
                        stream.closeEntry();
                    }
                }
                if(entries==0)throw new IOException("Archive contains no entries");
                Files.writeString(temporary.resolve(SEAL),archiveHash+"\n"+treeHash(temporary)+"\n",StandardCharsets.UTF_8,StandardOpenOption.CREATE_NEW);
                Files.move(temporary,target,StandardCopyOption.ATOMIC_MOVE);return target.toString();
            }finally{
                // Only our fresh temporary directory, never a caller-selected target or sealed snapshot.
                if(Files.exists(temporary,LinkOption.NOFOLLOW_LINKS)){
                    if(!temporary.getParent().equals(archive.getParent())||!temporary.getFileName().toString().startsWith(".mavis-extract-"))throw new IOException("Invalid extraction cleanup scope");
                    try(var paths=Files.walk(temporary)){for(Path item:paths.sorted(Comparator.reverseOrder()).toList())Files.deleteIfExists(item);}
                }
            }
        }
    }
    private static String treeHash(Path root)throws IOException{
        var files=new TreeMap<String,Path>();int entries=0;
        try(var paths=Files.walk(root)){
            var iterator=paths.iterator();while(iterator.hasNext()){
                interrupted();Path path=iterator.next();if(++entries>30000||Files.isSymbolicLink(path))throw new IOException("Invalid extracted tree");
                if(Files.isRegularFile(path,LinkOption.NOFOLLOW_LINKS)&&!path.equals(root.resolve(SEAL)))files.put(root.relativize(path).toString().replace('\\','/'),path);
            }
        }
        var digest=sha();long total=0;for(var e:files.entrySet()){long size=Files.size(e.getValue());total+=size;if(size>MAX_FILE||total>MAX_TOTAL)throw new IOException("Extracted tree budget exceeded");digest.update(e.getKey().getBytes(StandardCharsets.UTF_8));digest.update((byte)0);digest.update(HexFormat.of().parseHex(hash(e.getValue())));}return HexFormat.of().formatHex(digest.digest());
    }
    private static String hash(Path path)throws IOException{var digest=sha();try(var in=Files.newInputStream(path,LinkOption.NOFOLLOW_LINKS)){byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){interrupted();digest.update(buffer,0,n);}}return HexFormat.of().formatHex(digest.digest());}
    private static MessageDigest sha(){try{return MessageDigest.getInstance("SHA-256");}catch(Exception e){throw new IllegalStateException(e);}}
    private static void interrupted()throws InterruptedIOException{if(Thread.currentThread().isInterrupted())throw new InterruptedIOException("Extraction cancelled");}
    private static void noLinks(Path path)throws IOException{for(Path p=path;p!=null;p=p.getParent())if(Files.isSymbolicLink(p))throw new IOException("Linked archive/extraction path rejected");}
}