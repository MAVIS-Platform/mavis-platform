using System.Net;
using System.Text;
using System.Text.Json;
using MAVIS.Runner;

namespace MAVIS.Worker.Tests.Integration;

public sealed class ManagedRecoveryTests
{
    private sealed class Docker : IDockerCommands
    {
        public int Calls;
        public Task<DockerCommandResult> RunAsync(IReadOnlyList<string> args,string directory,int timeout,CancellationToken ct)
        { Calls++;return Task.FromResult(new DockerCommandResult(0,"")); }
    }
    private sealed class Java : HttpMessageHandler
    {
        public bool Reject=true;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken ct)
        {
            Assert.EndsWith("/recovery-result",request.RequestUri!.AbsolutePath);
            if(Reject) return new(HttpStatusCode.Conflict);
            var text=await request.Content!.ReadAsStringAsync(ct);
            var result=JsonSerializer.Deserialize<RuntimeRecoveryResult>(text,RuntimeLifecycleJournal.Json)!;
            var body=JsonSerializer.Serialize(new { data=new { result.SessionId,result.ResourceProject,result.RecoveryId,
                recoveryDigest=ReceiptCanonicalJson.Digest(text),persistenceStatus="ALREADY_COMMITTED" } },RuntimeLifecycleJournal.Json);
            return new(HttpStatusCode.OK){Content=new StringContent(body,Encoding.UTF8,"application/json")};
        }
    }
    [Fact]
    public async Task CleanupResultSurvivesHttpFailureAndResendsWithoutRepeatingDocker()
    {
        var root=Path.Combine(Path.GetTempPath(),"mavis-managed-recovery-"+Guid.NewGuid().ToString("N"));
        var project="mavisrun-"+Guid.NewGuid().ToString("N");
        Directory.CreateDirectory(Path.Combine(root,project));
        File.WriteAllText(Path.Combine(root,project,"compose.yaml"),"services: {}");
        File.WriteAllText(Path.Combine(root,project,"override.json"),"{}");
        File.WriteAllText(Path.Combine(root,".allocation-"+project+".json"),JsonSerializer.Serialize(new {
            resourceProject=project,SessionId="s",ModelVersionId="m",SourceSnapshotId="source",ProfileVersionId="p",RunConfigurationVersionId="c",ScenarioVersionId="v" }));
        var docker=new Docker();var handler=new Java();
        using var java=new JavaRuntimeClient(new Uri("http://127.0.0.1"),"test-key",handler);
        try
        {
            await Assert.ThrowsAsync<InvalidOperationException>(()=>ManagedRecovery.RecoverAsync(java,docker,root,project,default));
            Assert.False(Directory.Exists(Path.Combine(root,project)));
            Assert.True(File.Exists(Path.Combine(root,".recovery-"+project+".json")));
            var calls=docker.Calls;handler.Reject=false;
            Assert.True(File.Exists(await ManagedRecovery.RecoverAsync(java,docker,root,project,default)));
            Assert.Equal(calls,docker.Calls);
        }
        finally { Directory.Delete(root,true); }
    }
}
