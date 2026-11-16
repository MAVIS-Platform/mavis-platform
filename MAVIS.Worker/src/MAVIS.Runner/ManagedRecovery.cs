using System.Text.Json;

namespace MAVIS.Runner;

public sealed record RuntimeRecoveryResult(string SessionId, string ModelVersionId, string SourceSnapshotId,
    string ProfileVersionId, string RunConfigurationVersionId, string ScenarioVersionId, string ResourceProject,
    string RecoveryId, string CleanupStatus, string RecoveredAt);

public static class ManagedRecovery
{
    public static async Task<string> RecoverAsync(JavaRuntimeClient java, IDockerCommands docker, string root, string project, CancellationToken ct)
    {
        _ = RuntimeAllocation.ProjectName(project);
        if (!Path.IsPathFullyQualified(root)) throw new ArgumentException("Absolute state root required.");
        var manifest=Path.Combine(root,".allocation-"+project+".json");
        var resultPath=Path.Combine(root,".recovery-"+project+".json");
        var ackPath=Path.Combine(root,".recovery-"+project+".ack.json");
        foreach(var path in new[]{manifest,resultPath,ackPath}) RuntimeAllocation.RejectLinks(path);
        RuntimeRecoveryResult result;
        if(File.Exists(resultPath))
            result=JsonSerializer.Deserialize<RuntimeRecoveryResult>(await Read(resultPath,ct),RuntimeLifecycleJournal.Json) ?? throw new ArgumentException();
        else
        {
            using var scope=JsonDocument.Parse(await Read(manifest,ct));
            var node=scope.RootElement;
            string Required(string name) => node.GetProperty(name).GetString() is { Length: > 0 } value ? value : throw new ArgumentException("Recovery manifest scope missing.");
            if(Required("resourceProject")!=project) throw new ArgumentException("Recovery allocation mismatch.");
            result=new(Required("SessionId"),Required("ModelVersionId"),Required("SourceSnapshotId"),Required("ProfileVersionId"),
                Required("RunConfigurationVersionId"),Required("ScenarioVersionId"),project,Guid.NewGuid().ToString("N"),"Confirmed",DateTimeOffset.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'"));
            if(File.Exists(Path.Combine(root,"receipts",project+".json")))
                throw new InvalidOperationException("Execution receipt exists; deliver it instead of recovery.");
            if(!await SessionRecovery.RecoverAsync(root,project,docker,ct,
                () => Save(resultPath,JsonSerializer.Serialize(result,RuntimeLifecycleJournal.Json))))
                throw new InvalidOperationException("Cleanup incomplete; recovery not acknowledged.");
        }
        if(result.ResourceProject!=project) throw new ArgumentException("Recovery allocation mismatch.");
        var body=JsonSerializer.Serialize(result,RuntimeLifecycleJournal.Json);
        var digest=ReceiptCanonicalJson.Digest(body);
        var response=File.Exists(ackPath) ? await Read(ackPath,ct) : await java.PostRecoveryAsync(result.SessionId,body,ct);
        using var document=JsonDocument.Parse(response);
        var ack=JavaRuntimeClient.Data(document.RootElement);
        JavaRuntimeClient.RequireIdentity(ack,result.SessionId,project);
        if(ack.GetProperty("recoveryId").GetString()!=result.RecoveryId || ack.GetProperty("recoveryDigest").GetString()!=digest ||
            ack.GetProperty("persistenceStatus").GetString() is not ("COMMITTED" or "ALREADY_COMMITTED"))
            throw new InvalidOperationException("Invalid recovery acknowledgement.");
        if(!File.Exists(ackPath)) Save(ackPath,response);
        return ackPath;
    }

    private static async Task<string> Read(string path,CancellationToken ct)
    {
        if(new FileInfo(path).Length>1_048_576) throw new ArgumentException("Recovery metadata exceeds budget.");
        return await File.ReadAllTextAsync(path,ct);
    }

    private static void Save(string target,string text)
    {
        var temp=target+"."+Guid.NewGuid().ToString("N")+".tmp";
        try
        {
            using(var file=new FileStream(temp,FileMode.CreateNew,FileAccess.Write,FileShare.None))
            { file.Write(System.Text.Encoding.UTF8.GetBytes(text));file.Flush(true); }
            File.Move(temp,target,false);
        }
        finally { if(File.Exists(temp)) File.Delete(temp); }
    }
}
