using System.Net;
using System.Text.Json;
using MAVIS.Runner;
namespace MAVIS.Worker.Tests.Integration;
public sealed class RuntimeEnvironmentInputsTests {
 private sealed class Handler(Func<HttpRequestMessage,Task<HttpResponseMessage>> action):HttpMessageHandler { protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken ct)=>action(request); }
 [Fact] public async Task ProtectedInputsBindPathHeaderAndTypedBodyWithoutLeakingToOutcome(){
  var step=new HttpScenarioStep("one","app","POST","/items/{{V0}}",200,EnvironmentVariables:new Dictionary<string,string>{{"V0","ITEM_ID"}},BodyReference:"BODY_JSON",EnvHeaders:[new("Authorization","AUTH")]);
  using var client=new HttpClient(new Handler(async request=>{Assert.Equal("",request.RequestUri!.Query);Assert.Equal("127.0.0.1",request.RequestUri.Host);Assert.Equal("Bearer fixture",request.Headers.Authorization!.ToString());using var body=JsonDocument.Parse(await request.Content!.ReadAsStringAsync());Assert.Equal(3,body.RootElement.GetProperty("count").GetInt32());Assert.Equal("{{literal}}",body.RootElement.GetProperty("note").GetString());return new(HttpStatusCode.OK){Content=new StringContent("{}")};}));
  var outcome=await new HttpScenarioRunner().ExecuteAsync(client,new("s",[step]),new Dictionary<string,Uri>{{"app",new("http://127.0.0.1:1234")}},new Dictionary<string,string>{{"ITEM_ID","part/one?x=y"},{"BODY_JSON","{\"count\":3,\"note\":\"{{literal}}\"}"},{"AUTH","Bearer fixture"}});
  Assert.Equal("Passed",outcome.Status);Assert.DoesNotContain("Bearer fixture",JsonSerializer.Serialize(outcome));
 }
 [Fact] public void MissingInputReferencesFailBeforeRequests(){var step=new HttpScenarioStep("one","app","GET","/{{V0}}",200,EnvironmentVariables:new Dictionary<string,string>{{"V0","MISSING"}});Assert.ThrowsAny<ArgumentException>(()=>new HttpScenarioRunner().ValidateDefinition(new("s",[step]),new Dictionary<string,Uri>{{"app",new("http://127.0.0.1:1234")}},new Dictionary<string,string>()));}
 [Fact] public void ApplicationEnvironmentCannotOverrideInstrumentation(){
  var digest=new string('a',64);var pre=ComposePreflight.Check($"services:\n  app:\n    image: app@sha256:{digest}\n");
  RunnerExecutionProfile Profile(string name)=>new("collector@sha256:"+digest,"mavis-agents-v1",new Dictionary<string,RuntimeServiceProfile>{{"app",new("java",8080)}},ApprovedForLocalPoc:true,EnvironmentBindings:new Dictionary<string,IReadOnlyList<RuntimeEnvironmentBinding>>{{"app",new[]{new RuntimeEnvironmentBinding(name,"INPUT")}}});
  var values=new Dictionary<string,string>{{"INPUT","fixture"}};
  using var result=JsonDocument.Parse(ComposeOverrideBuilder.Build(pre,Profile("DB_PASSWORD"),Path.Combine(Path.GetTempPath(),"collector.yaml"),values));Assert.Equal("fixture",result.RootElement.GetProperty("services").GetProperty("app").GetProperty("environment").GetProperty("DB_PASSWORD").GetString());
  using var dotnetResult=JsonDocument.Parse(ComposeOverrideBuilder.Build(pre,Profile("ConnectionStrings__CatalogDb"),Path.Combine(Path.GetTempPath(),"collector.yaml"),values));Assert.Equal("fixture",dotnetResult.RootElement.GetProperty("services").GetProperty("app").GetProperty("environment").GetProperty("ConnectionStrings__CatalogDb").GetString());
  Assert.Throws<ArgumentException>(()=>ComposeOverrideBuilder.Build(pre,Profile("JAVA_TOOL_OPTIONS"),Path.Combine(Path.GetTempPath(),"collector.yaml"),values));
  Assert.Throws<ArgumentException>(()=>ComposeOverrideBuilder.Build(pre,Profile("JDK_JAVA_OPTIONS"),Path.Combine(Path.GetTempPath(),"collector.yaml"),values));
  Assert.Throws<ArgumentException>(()=>ComposeOverrideBuilder.Build(pre,Profile("otel_exporter_otlp_endpoint"),Path.Combine(Path.GetTempPath(),"collector.yaml"),values));
  Assert.Throws<ArgumentException>(()=>ComposeOverrideBuilder.Build(pre,Profile("dotnet_startup_hooks"),Path.Combine(Path.GetTempPath(),"collector.yaml"),values));
  Assert.Throws<ArgumentException>(()=>ComposeOverrideBuilder.Build(pre,Profile("path"),Path.Combine(Path.GetTempPath(),"collector.yaml"),values));
 }

 [Fact] public void TraceCorrelatorNormalizesDotnetServiceNamesToComposeServiceKeys(){
  var traceId=new string('1',32);var parentId=new string('2',16);var childId=new string('3',16);
  var otlpJson=JsonSerializer.Serialize(new{resourceSpans=new object[]{
   new{resource=new{attributes=new[]{new{key="service.name",value=new{stringValue="ApiGateway"}}}},scopeSpans=new[]{new{spans=new[]{new{traceId,spanId=parentId,parentSpanId="",kind="SPAN_KIND_SERVER",startTimeUnixNano="1000",endTimeUnixNano="2000"}}}}},
   new{resource=new{attributes=new[]{new{key="service.name",value=new{stringValue="FruitCatalog.API"}}}},scopeSpans=new[]{new{spans=new[]{new{traceId,spanId=childId,parentSpanId=parentId,kind="SPAN_KIND_SERVER",startTimeUnixNano="1100",endTimeUnixNano="1900"}}}}}
  }});
  var result=TraceCorrelator.Correlate("sess","model",otlpJson,new Dictionary<string,string>{{"api-gateway","elem-gw"},{"fruit-catalog-api","elem-cat"}});
  Assert.DoesNotContain("UNMAPPED_SERVICE",result.Warnings);
  Assert.Contains(result.Spans,s=>s.RuntimeService=="api-gateway"&&s.ModelServiceId=="elem-gw");
  Assert.Contains(result.Spans,s=>s.RuntimeService=="fruit-catalog-api"&&s.ModelServiceId=="elem-cat");
  var interaction=Assert.Single(result.Interactions!);
  Assert.Equal("api-gateway",interaction.FromService);
  Assert.Equal("fruit-catalog-api",interaction.ToService);
 }

 private static RuntimeRunDefinition Definition()=>new("session","model","source","profile","services: {}",new("collector@sha256:"+new string('a',64),"agents",new Dictionary<string,RuntimeServiceProfile>()),new("session",[]),new Dictionary<string,string>(),ResourceProject:"mavisrun-"+new string('a',32),ProtectedEnvironmentAvailable:true);
 [Fact] public void ProtectedInputTransportRejectsNonTlsRemoteHostWithoutSendingRequest(){
  var calls=0;Assert.Throws<ArgumentException>(()=>new JavaRuntimeClient(new Uri("http://example.invalid"),"fixture-key",new Handler(request=>{calls++;return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK));})));Assert.Equal(0,calls);
 }
 [Fact] public async Task ProtectedInputResponseMustMatchAssignedSessionAndResource(){
  foreach(var matching in new[]{true,false}){
   using var client=new JavaRuntimeClient(new Uri("http://127.0.0.1"),"fixture-key",new Handler(request=>{
    Assert.EndsWith("/session/protected-environment",request.RequestUri!.AbsolutePath);Assert.Equal("fixture-key",Assert.Single(request.Headers.GetValues("X-Mavis-Runner-Key")));
    return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK){Content=new StringContent(JsonSerializer.Serialize(new{data=new{sessionId="session",resourceProject=matching?Definition().ResourceProject:"other",values=new Dictionary<string,string>{{"INPUT","fixture"}}}}),System.Text.Encoding.UTF8,"application/json")});
   }));
   if(matching)Assert.Equal("fixture",(await client.GetEnvironmentAsync(Definition(),CancellationToken.None))["INPUT"]);
   else await Assert.ThrowsAsync<InvalidOperationException>(()=>client.GetEnvironmentAsync(Definition(),CancellationToken.None));
  }
 }

 [Fact] public void ApplicationInputDollarSignsRemainLiteralInCompose(){
  var digest=new string('a',64);var pre=ComposePreflight.Check($"services:\n  app:\n    image: app@sha256:{digest}\n");
  var profile=new RunnerExecutionProfile("collector@sha256:"+digest,"agents",new Dictionary<string,RuntimeServiceProfile>{{"app",new("java",8080)}},ApprovedForLocalPoc:true,EnvironmentBindings:new Dictionary<string,IReadOnlyList<RuntimeEnvironmentBinding>>{{"app",new[]{new RuntimeEnvironmentBinding("DB_PASSWORD","INPUT")}}});
  using var result=JsonDocument.Parse(ComposeOverrideBuilder.Build(pre,profile,Path.Combine(Path.GetTempPath(),"collector.yaml"),new Dictionary<string,string>{{"INPUT","literal-${OPERATOR_KEY}"}}));
  Assert.Equal("literal-$${OPERATOR_KEY}",result.RootElement.GetProperty("services").GetProperty("app").GetProperty("environment").GetProperty("DB_PASSWORD").GetString());
 }
}
