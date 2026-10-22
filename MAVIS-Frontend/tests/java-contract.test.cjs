const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname,"..");
require.extensions[".ts"] = (module,filename) => {
 const output=ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 module._compile(output.replace(/require\(["']@\/([^"']+)["']\)/g,(_,name)=>`require(${JSON.stringify(path.join(root,"src",name))})`),filename);
};
const wire=require("../src/lib/api/java-wire.ts");
const {executeJava,currentSession}=require("../src/lib/api/java-operations.ts");
const {validateResponse}=require("../src/lib/api/validate-response.ts");
const {NextRequest}=require("next/server");
const route=require("../app/api/mavis/[operation]/route.ts");
const project="11111111-1111-4111-8111-111111111111",snapshot="22222222-2222-4222-8222-222222222222",model="33333333-3333-4333-8333-333333333333",node="44444444-4444-4444-8444-444444444444",job="55555555-5555-4555-8555-555555555555";
const metadata={id:model,projectId:project,sourceSnapshotId:snapshot,revision:1,isLatestValid:true};
const jobDto={jobId:job,projectId:project,sourceSnapshotId:snapshot,status:"COMPLETED",analysisState:"COMPLETED_WITH_REVIEW",modelVersionId:model,dotnetStatus:"PARTIAL"};
function environment(t){for(const [key,value] of Object.entries({MAVIS_API_MODE:"backend",MAVIS_JAVA_URL:"https://java.invalid"})){const before=process.env[key];process.env[key]=value;t.after(()=>before===undefined?delete process.env[key]:process.env[key]=before);}}
test("wire project/snapshot preserve unknown coverage and runtime capability",()=>{
 const p=wire.projectView({id:project,name:"Actual project",repositoryUrl:null});assert.equal(p.services,null);assert.equal(p.runtimeSupported,null);assert.equal(p.status,"unknown");
 const s=wire.snapshotView({id:snapshot,projectId:project,sourceType:"GITHUB_COMMIT",branchName:"main",createdAt:"2026-10-22T00:00:00Z"});assert.equal(s.validation,"unknown");assert.equal(s.evidenceComplete,null);
});
test("job mapping keeps review/cancellation separate from success and has no fabricated progress",()=>{
 const j=wire.jobView(jobDto);assert.equal(j.status,"completed");assert.equal(j.analysisState,"COMPLETED_WITH_REVIEW");assert.equal(j.progress,null);
 const cancelled=wire.jobView({...jobDto,status:"CANCELLED"});assert.equal(cancelled.status,"cancelled");assert.equal(cancelled.modelId,null);
 assert.equal(wire.jobView({...jobDto,status:"CANCELLING"}).status,"cancelling");assert.equal(wire.jobView({...jobDto,status:"TIMED_OUT"}).status,"timed-out");
 assert.throws(()=>wire.jobView({...jobDto,status:"INVENTED"}));
});
test("model mapping retains UUIDs, properties and unclassified types without pretending evidence is complete",()=>{
 const m=wire.modelView(metadata,{nodes:[{id:node,name:"Service",type:"SERVICE_CONTAINER"}],edges:[]},[{id:node,modelVersionId:model,name:"Service",elementType:"SERVICE_CONTAINER",properties:{description:"Saved",logicalKey:"keep-me"}}]);
 assert.equal(m.elements[0].layer,"unclassified");assert.equal(m.elements[0].elementType,"SERVICE_CONTAINER");assert.equal(m.elements[0].properties.logicalKey,"keep-me");assert.deepEqual(m.elements[0].evidence,[]);
 assert.throws(()=>wire.modelView(metadata,{nodes:[],edges:[{id:node,sourceNodeId:node,targetNodeId:node,kind:"HTTP"}]},[]));
 assert.throws(()=>wire.modelView(metadata,{nodes:[],edges:[]},[{id:node,modelVersionId:job,name:"foreign",elementType:"COMPONENT"}]));
 assert.equal(wire.modelView(metadata,{nodes:[],edges:[]},[]).elements.length,0);
});
test("role mapping is explicit and does not default unknown roles",()=>{assert.equal(wire.roleView("SYSTEM_ADMIN"),"admin");assert.equal(wire.roleView("LECTURER"),"lecturer");assert.throws(()=>wire.roleView("SUPERUSER"));});
test("analysis forwards stable Idempotency-Key and validates returned project scope",async t=>{
 environment(t);const calls=[];t.mock.method(globalThis,"fetch",async(url,options)=>{calls.push({url,options});return Response.json({code:200,data:options.method==="POST"?{jobId:job}:jobDto});});
 const input={projectId:project,snapshotId:snapshot,idempotencyKey:"same-key"};const result=await executeJava("startAnalysis",input,"jwt",new AbortController().signal);
 assert.equal(calls[0].options.headers.get("Idempotency-Key"),"same-key");assert.equal(calls[0].options.headers.get("Authorization"),"Bearer jwt");assert.equal(calls.filter(x=>x.options.method==="POST").length,1);
 assert.equal(validateResponse("startAnalysis",input,result).modelId,model);
 assert.throws(()=>validateResponse("startAnalysis",{...input,projectId:job},result));
 await assert.rejects(executeJava("startAnalysis",{projectId:project,snapshotId:snapshot},"jwt",new AbortController().signal),e=>e.status===422);
});
test("same-origin login stores token only in HttpOnly cookie and unknown operations never fall back",async t=>{
 environment(t);let calls=0;t.mock.method(globalThis,"fetch",async()=>{calls++;return Response.json({code:200,data:{token:"server-jwt",userId:project,fullName:"Actual user",role:"STUDENT",passwordHash:"do-not-return"}});});
 const context=operation=>({params:Promise.resolve({operation})});const request=origin=>new NextRequest("http://127.0.0.1:3000/api/mavis/signIn",{method:"POST",headers:{host:"127.0.0.1:3000",origin,"Content-Type":"application/json"},body:JSON.stringify({email:"user@example.invalid",password:"test"})});
 assert.equal((await route.POST(request("https://evil.invalid"),context("signIn"))).status,403);assert.equal(calls,0);
 const response=await route.POST(request("http://127.0.0.1:3000"),context("signIn"));assert.equal(response.status,200);const data=await response.json();assert.deepEqual(data,{user:{id:project,name:"Actual user",role:"student"}});assert.ok(!JSON.stringify(data).includes("server-jwt"));assert.match(response.headers.get("set-cookie"),/HttpOnly/);
 const unavailable=await route.GET(new NextRequest("http://127.0.0.1:3000/api/mavis/profiles",{headers:{cookie:"mavis_session=opaque"}}),context("profiles"));assert.equal(unavailable.status,501);
});
test("session rejection clears identity instead of trusting browser metadata",async t=>{environment(t);t.mock.method(globalThis,"fetch",async()=>Response.json({message:"disabled"},{status:403}));assert.deepEqual(await currentSession("stale"),{user:null});});

test("runtime adapter preserves independent lifecycle/evidence/cleanup states",async t=>{
 environment(t);const sessionId="66666666-6666-4666-8666-666666666666";
 t.mock.method(globalThis,"fetch",async()=>Response.json({code:200,data:{id:sessionId,projectId:project,sourceSnapshotId:snapshot,modelVersionId:model,executionStatus:"READY_FOR_DISPATCH",scenarioStatus:"APPROVED",evidenceStatus:"NOT_CAPTURED",cleanupStatus:"PENDING",traceQuality:"NONE",mappingStatus:"UNCONFIRMED"}}));
 const result=await executeJava("runtimeReadSession",{sessionId},"jwt",new AbortController().signal);assert.equal(result.executionStatus,"READY_FOR_DISPATCH");assert.equal(result.scenarioStatus,"APPROVED");assert.equal(result.cleanupStatus,"PENDING");assert.equal("outcome" in result,false);
});
test("preflight cannot be requested under another project's snapshot",async t=>{
 environment(t);let calls=0;t.mock.method(globalThis,"fetch",async()=>{calls++;return Response.json({code:200,data:{id:snapshot,projectId:job}});});
 await assert.rejects(executeJava("runtimePreflight",{projectId:project,snapshotId:snapshot},"jwt",new AbortController().signal),e=>e.status===404);assert.equal(calls,1);
});
test("Java body errors and malformed envelopes cannot become successful view data",async t=>{
 environment(t);t.mock.method(globalThis,"fetch",async()=>Response.json({code:500,data:[]}));await assert.rejects(executeJava("projects",{},"jwt",new AbortController().signal),e=>e.kind==="contract");
});

test("fresh clone defaults to real backend mode; mock requires an explicit choice",()=>{
 const {readAppConfiguration}=require("../src/lib/api/config.ts");assert.equal(readAppConfiguration({}).mode,"backend");assert.equal(readAppConfiguration({MAVIS_API_MODE:"mock"}).mode,"mock");
});
