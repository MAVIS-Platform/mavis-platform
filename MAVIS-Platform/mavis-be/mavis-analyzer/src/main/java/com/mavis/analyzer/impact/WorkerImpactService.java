package com.mavis.analyzer.impact;

import com.mavis.workerclient.ImpactWorkerClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.util.*;

/** No transaction spans the HTTP call. Traversal belongs only to .NET. */
@Service
public class WorkerImpactService {
    private final ImpactGraphLoader graphs;private final String url,key;
    public record View(ImpactWorkerClient.Result impact,Map<String,String> serviceNames,Map<String,ImpactGraphLoader.EvidenceView> evidence,List<String> adapterWarnings){}
    public WorkerImpactService(ImpactGraphLoader graphs,@Value("${mavis.worker.dotnet-url:http://localhost:5050}")String url,@Value("${mavis.worker.service-key:}")String key){this.graphs=graphs;this.url=url;this.key=key;}
    public View analyze(UUID model,UUID target,String revision,int depth,int paths){var snapshot=graphs.load(model,target,revision,depth,paths);var result=new ImpactWorkerClient(url,key).analyze(snapshot.request());return new View(result,snapshot.serviceNames(),snapshot.evidence(),snapshot.warnings());}
}
