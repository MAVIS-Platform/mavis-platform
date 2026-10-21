package com.mavis.analyzer.workerclient.service.impl;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;

/** Explicit snapshot configuration, never fuzzy class/name matching. Ambiguity is preserved. */
public final class ServiceBindingIndex {
    public record Binding(String service, List<String> projects, List<String> sourceRoots, List<String> endpoints) {}
    public record Document(String schemaVersion,List<Binding> bindings) {}
    private final List<Binding> bindings;
    private final String hash;
    private ServiceBindingIndex(List<Binding> bindings,String hash){this.bindings=bindings;this.hash=hash;}
    public static ServiceBindingIndex load(Path root)throws IOException {
        Path file=root.resolve("mavis.bindings.json");
        if(!Files.exists(file,LinkOption.NOFOLLOW_LINKS))return new ServiceBindingIndex(List.of(),null);
        if(Files.isSymbolicLink(file) || !Files.isRegularFile(file,LinkOption.NOFOLLOW_LINKS))throw new IOException("Invalid service binding source");
        byte[] bytes;try(var stream=Files.newInputStream(file,LinkOption.NOFOLLOW_LINKS)){bytes=stream.readNBytes(262145);}
        if(bytes.length>262144)throw new IOException("Service bindings exceed budget");
        var json=new ObjectMapper().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        Document document=json.readValue(bytes,Document.class);
        if(!"1.0".equals(document.schemaVersion()) || document.bindings()==null || document.bindings().size()>1000)throw new IOException("Unsupported service bindings");
        for(Binding b:document.bindings()) {
            if(b==null || b.service()==null || !b.service().matches("[A-Za-z0-9_-]{1,128}") || b.projects()==null || b.sourceRoots()==null || b.endpoints()==null ||
                    b.projects().size()+b.sourceRoots().size()+b.endpoints().size()>2000)throw new IOException("Invalid service binding");
            for(String p:b.projects())path(p);for(String p:b.sourceRoots())path(p);
            for(String endpoint:b.endpoints())if(alias(endpoint)==null)throw new IOException("Invalid endpoint binding");
        }
        try{return new ServiceBindingIndex(List.copyOf(document.bindings()),HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)));}
        catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}
    }
    public String hash(){return hash;}
    public Set<String> project(String project){var result=new TreeSet<String>();for(var b:bindings)if(b.projects().contains(project))result.add(b.service());return result;}
    public Set<String> endpoint(String endpoint){String key=alias(endpoint);var result=new TreeSet<String>();if(key!=null)for(var b:bindings)if(b.endpoints().stream().anyMatch(e->key.equals(alias(e))))result.add(b.service());return result;}
    public Set<String> source(String relative){int longest=-1;var result=new TreeSet<String>();for(var b:bindings)for(String prefix:b.sourceRoots())if(relative.equals(prefix)||relative.startsWith(prefix+"/")){
        if(prefix.length()>longest){longest=prefix.length();result.clear();}if(prefix.length()==longest)result.add(b.service());}return result;}
    public static String alias(String value){
        if(value==null)return null;
        try{URI uri=URI.create(value.contains("://")?value:"http://"+value);String host=uri.getHost();
            if(host==null||uri.getUserInfo()!=null||uri.getRawQuery()!=null||uri.getRawFragment()!=null||!(uri.getScheme().equals("http")||uri.getScheme().equals("https")))return null;
            if(!value.contains("://")&&uri.getPort()<0)return null;
            int port=uri.getPort()<0?(uri.getScheme().equals("https")?443:80):uri.getPort();if(port<1||port>65535)return null;
            return host.toLowerCase(Locale.ROOT)+":"+port;
        }catch(IllegalArgumentException e){return null;}
    }
    private static void path(String path)throws IOException {if(path==null||path.isBlank()||path.startsWith("/")||path.contains("\\")||path.contains(":")||Arrays.stream(path.split("/",-1)).anyMatch(s->s.isEmpty()||s.equals(".")||s.equals("..")))throw new IOException("Invalid relative binding path");}
}
