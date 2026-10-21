package com.mavis.workerclient;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;

public final class ImpactWorkerClient {
    public record Edge(String id,String from,String to,String kind,List<String> evidenceIds) {}
    public record Request(String modelVersionId,String graphModelVersionId,String graphRevisionId,boolean graphReady,String targetServiceId,
                          List<String> serviceIds,List<Edge> edges,int maxDepth,List<Object> runtime,int maxPaths) {}
    public record Path(String serviceId,String classification,int distance,List<String> hops,List<String> edgeIds,List<String> evidenceIds) {}
    public record Result(String modelVersionId,String graphRevisionId,String targetServiceId,List<Path> affectedServices,boolean truncated,List<String> warnings,List<Object> runtimeContext) {}
    public static final class Unavailable extends RuntimeException {public Unavailable(){super("Impact Worker request failed");}}
    private final ObjectMapper json=new ObjectMapper();
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
    private final URI endpoint;private final String key;
    public ImpactWorkerClient(String base,String key){URI uri=URI.create(base);if(uri.getHost()==null||!Set.of("http","https").contains(uri.getScheme())||uri.getUserInfo()!=null||uri.getQuery()!=null||uri.getFragment()!=null||key==null||key.isBlank()||key.length()>512)throw new IllegalArgumentException("Invalid impact transport configuration");this.endpoint=URI.create(base.replaceAll("/+$","")+"/api/v1/impact");this.key=key;}
    public Result analyze(Request request){
        CompletableFuture<HttpResponse<byte[]>> pending=null;
        try{
            var call=HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(30)).header("Content-Type","application/json").header("X-Mavis-Worker-Key",key).POST(HttpRequest.BodyPublishers.ofByteArray(json.writeValueAsBytes(request))).build();
            pending=http.sendAsync(call,ignored->new BoundedBodySubscriber(8*1024*1024));var response=pending.get(30,TimeUnit.SECONDS);
            if(response.statusCode()!=200)throw new Unavailable();var result=json.readValue(response.body(),Result.class);validate(request,result);return result;
        }catch(InterruptedException e){Thread.currentThread().interrupt();throw new Unavailable();}catch(Exception e){throw new Unavailable();}
        finally{if(pending!=null&&!pending.isDone())pending.cancel(true);}
    }
    public static void validate(Request request,Result result){
        if(result==null||!Objects.equals(result.modelVersionId(),request.modelVersionId())||!Objects.equals(result.graphRevisionId(),request.graphRevisionId())||!Objects.equals(result.targetServiceId(),request.targetServiceId())||
                result.affectedServices()==null||result.affectedServices().size()>request.maxPaths()||result.warnings()==null||result.warnings().size()>100||result.runtimeContext()==null||!result.runtimeContext().isEmpty())throw new IllegalArgumentException("Invalid impact provenance");
        var services=new HashSet<>(request.serviceIds());var edges=new HashMap<String,Edge>();request.edges().forEach(e->edges.put(e.id(),e));var seen=new HashSet<String>();
        for(var path:result.affectedServices()){
            if(path==null||!services.contains(path.serviceId())||path.serviceId().equals(request.targetServiceId())||!seen.add(path.serviceId())||path.distance()<1||path.distance()>request.maxDepth()||path.hops()==null||path.hops().size()!=path.distance()+1||
                    !path.serviceId().equals(path.hops().get(0))||!request.targetServiceId().equals(path.hops().get(path.hops().size()-1))||!Objects.equals(path.classification(),path.distance()==1?"Direct":"Indirect")||path.edgeIds()==null||path.evidenceIds()==null)throw new IllegalArgumentException("Invalid impact path");
            if(new HashSet<>(path.hops()).size()!=path.hops().size()||!services.containsAll(path.hops()))throw new IllegalArgumentException("Invalid impact hop");
            var support=new HashSet<String>();var pairs=new HashSet<String>();for(String id:path.edgeIds()){
                var edge=edges.get(id);if(edge==null)throw new IllegalArgumentException("Foreign impact edge");
                boolean onPath=false;for(int i=0;i<path.hops().size()-1;i++)if(edge.from().equals(path.hops().get(i))&&edge.to().equals(path.hops().get(i+1)))onPath=true;
                if(!onPath)throw new IllegalArgumentException("Edge outside selected path");support.addAll(edge.evidenceIds());pairs.add(edge.from()+"\n"+edge.to());
            }
            for(int i=0;i<path.hops().size()-1;i++)if(!pairs.contains(path.hops().get(i)+"\n"+path.hops().get(i+1)))throw new IllegalArgumentException("Missing path support");
            if(!support.equals(new HashSet<>(path.evidenceIds())))throw new IllegalArgumentException("Invalid impact evidence");
        }
    }
}
