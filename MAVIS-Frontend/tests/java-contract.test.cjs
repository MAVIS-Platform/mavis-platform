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

test("profile response preserves actual email and strips private account fields", async t => {
 environment(t);
 t.mock.method(globalThis,"fetch",async()=>Response.json({code:200,data:{id:project,email:"learner@example.org",fullName:"Real Learner",role:"STUDENT",passwordHash:"private",token:"private-token"}}));
 const session=await currentSession("jwt");
 assert.deepEqual(session,{user:{id:project,name:"Real Learner",role:"student",email:"learner@example.org"}});
 assert.ok(!JSON.stringify(session).includes("private"));
});

test("profile password API uses authenticated PATCH, validates policy and safely maps current-password errors",async t=>{
 environment(t);
 const input={fullName:"Real Learner",currentPassword:"old-secret",newPassword:"new-secret"};
 const {contracts}=require("../src/lib/api/contracts.ts");
 for(const bad of [{...input,currentPassword:""},{fullName:input.fullName,newPassword:input.newPassword},{...input,newPassword:"short"},{...input,newPassword:"x".repeat(101)}]) assert.equal(contracts.updateProfile.input.safeParse(bad).success,false);
 assert.equal(contracts.updateProfile.input.safeParse({fullName:input.fullName}).success,true);
 let mode="success";
 t.mock.method(globalThis,"fetch",async(url,options)=>{
   assert.ok(url.endsWith("/api/v1/auth/me"));assert.equal(options.method,"PATCH");assert.equal(options.headers.get("Authorization"),"Bearer jwt");assert.deepEqual(JSON.parse(options.body),input);
   if(mode==="wrong") return Response.json({message:"Current password is incorrect"},{status:400});
   if(mode==="unsafe") return Response.json({message:"private-upstream-details"},{status:400});
   return Response.json({code:200,data:{id:project,fullName:input.fullName,email:"learner@example.org",role:"STUDENT"}});
 });
 const result=await executeJava("updateProfile",input,"jwt",new AbortController().signal);
 assert.equal(result.user.email,"learner@example.org");assert.ok(!JSON.stringify(result).includes("secret"));
 mode="wrong";
 await assert.rejects(executeJava("updateProfile",input,"jwt",new AbortController().signal),e=>e.code==="PROFILE_CURRENT_PASSWORD" && !e.message.includes("secret"));
 const proxy=await route.POST(new NextRequest("http://127.0.0.1:3000/api/mavis/updateProfile",{method:"POST",headers:{host:"127.0.0.1:3000",origin:"http://127.0.0.1:3000",cookie:"mavis_session=jwt","Content-Type":"application/json"},body:JSON.stringify(input)}),{params:Promise.resolve({operation:"updateProfile"})});
 assert.equal(proxy.status,400);assert.equal((await proxy.json()).code,"PROFILE_CURRENT_PASSWORD");
 mode="unsafe";
 await assert.rejects(executeJava("updateProfile",input,"jwt",new AbortController().signal),e=>!e.code && !e.message.includes("private-upstream-details"));
});
const project="11111111-1111-4111-8111-111111111111",snapshot="22222222-2222-4222-8222-222222222222",model="33333333-3333-4333-8333-333333333333",node="44444444-4444-4444-8444-444444444444",job="55555555-5555-4555-8555-555555555555";
const metadata={id:model,projectId:project,sourceSnapshotId:snapshot,revision:1,isLatestValid:true};
const jobDto={jobId:job,projectId:project,sourceSnapshotId:snapshot,status:"COMPLETED",analysisState:"COMPLETED_WITH_REVIEW",modelVersionId:model,dotnetStatus:"PARTIAL"};
function environment(t){for(const [key,value] of Object.entries({MAVIS_API_MODE:"backend",MAVIS_JAVA_URL:"https://java.invalid"})){const before=process.env[key];process.env[key]=value;t.after(()=>before===undefined?delete process.env[key]:process.env[key]=before);}}

test("teaching API maps workspace creation, class projects and lecturer provisioning to existing backend contracts", async t => {
 environment(t);const requests=[];
 const workspace={id:job,code:"SA1",name:"Architecture class",status:"ACTIVE",myRoleInWorkspace:"LECTURER"};
 t.mock.method(globalThis,"fetch",async(url,options={})=>{
  const pathname=new URL(url).pathname.replace("/api/v1/","");
  const body=options.body?JSON.parse(options.body):undefined;requests.push({pathname,method:options.method??"GET",body});
  let data;
  if(pathname===`workspaces/${job}/members`)data=[{userId:node,fullName:"Teaching user",memberRole:"LECTURER"}];
  else if(pathname==="workspaces")data=workspace;
  else if(pathname===`assignments/${snapshot}`)data={id:snapshot,workspaceId:job,title:"Architecture review",description:"Instructions",dueAt:null};
  else if(pathname==="projects")data={id:project,name:"Course project",workspaceId:job,assignmentId:snapshot};
  else if(pathname===`admin/users/${node}/role`)data={id:node,email:"teacher@example.com",fullName:"Teaching user",roleCode:"LECTURER",status:"ACTIVE"};
  else throw Error("Unexpected path "+pathname);
  return Response.json({code:200,data});
 });
 const created=await executeJava("createWorkspace",{code:"SA1",name:"Architecture class"},"jwt",new AbortController().signal);
 assert.equal(created.myRole,"LECTURER");
 const coursework=await executeJava("createProject",{name:"Course project",workspaceId:job,assignmentId:snapshot},"jwt",new AbortController().signal);
 assert.equal(coursework.workspaceId,job);
 const projectRequest=requests.find(r=>r.pathname==="projects");
 assert.equal(projectRequest.body.projectType,"STUDENT_WORKING");assert.equal(projectRequest.body.assignmentId,snapshot);
 const teacher=await executeJava("setAccountRole",{accountId:node,role:"lecturer"},"jwt",new AbortController().signal);
 assert.equal(teacher.role,"lecturer");assert.equal(teacher.email,"teacher@example.com");
 assert.deepEqual(requests.find(r=>r.pathname.endsWith("/role")).body,{newRoleCode:"LECTURER"});
});

test("assignment review rejects foreign assignments and submissions before loading frozen models", async t => {
 environment(t);let mode="foreign-assignment",paths=[];
 t.mock.method(globalThis,"fetch",async url=>{
  const pathname=new URL(url).pathname.replace("/api/v1/","");paths.push(pathname);
  if(pathname===`assignments/${job}`)return Response.json({code:200,data:{id:job,workspaceId:mode==="foreign-assignment"?project:snapshot,title:"Review",description:"",dueAt:null}});
  if(pathname===`assignments/${job}/submissions`)return Response.json({code:200,data:mode==="empty"?[]:[{id:node,assignmentId:project}]});
  throw Error("Must not hydrate models for another assignment");
 });
 await assert.rejects(executeJava("assignmentSubmissions",{workspaceId:snapshot,assignmentId:job},"jwt",new AbortController().signal),e=>e.kind==="not-found");
 assert.ok(!paths.some(p=>p.endsWith("/submissions")));
 mode="foreign-submission";paths=[];
 await assert.rejects(executeJava("assignmentSubmissions",{workspaceId:snapshot,assignmentId:job},"jwt",new AbortController().signal),e=>e.kind==="contract");
 mode="empty";
 assert.deepEqual(await executeJava("assignmentSubmissions",{workspaceId:snapshot,assignmentId:job},"jwt",new AbortController().signal),[]);
 assert.throws(()=>validateResponse("assignmentSubmissions",{workspaceId:snapshot,assignmentId:job},[{assignmentId:project}]));
});

test("element evidence context preserves direct/relationship attribution and rejects another model", async t => {
 environment(t);
 const direct={id:"66666666-6666-4666-8666-666666666666",modelVersionId:model,elementId:node,relationshipId:null,sourceType:"STATIC_CODE",locator:"Handler.java:4",excerpt:"class Handler"};
 const related={id:"77777777-7777-4777-8777-777777777777",modelVersionId:model,elementId:null,relationshipId:job,sourceType:"STATIC_CODE",locator:"Handler.java:12",excerpt:"subscribe(commands)"};
 let responseModel=model;
 t.mock.method(globalThis,"fetch",async url=>Response.json({code:200,data:String(url).endsWith("/context")?{modelVersionId:responseModel,elementId:node,directEvidence:[direct],relationshipEvidence:[related]}:{id:node,modelVersionId:model}}));
 const context=await executeJava("elementEvidenceContext",{modelId:model,elementId:node},"jwt",new AbortController().signal);
 assert.equal(context.directEvidence[0].snippet,"class Handler");
 assert.equal(context.relationshipEvidence[0].relationshipId,job);
 assert.equal(context.relationshipEvidence[0].evidence.snippet,"subscribe(commands)");
 responseModel=project;
 await assert.rejects(executeJava("elementEvidenceContext",{modelId:model,elementId:node},"jwt",new AbortController().signal),e=>e.kind==="contract");
});

test("regenerate explanation explicitly refreshes the backend cache", async t => {
 environment(t);let body;
 t.mock.method(globalThis,"fetch",async(_url,options)=>{body=JSON.parse(options.body);return Response.json({code:200,data:{id:job,modelVersionId:model,elementId:node,explanationText:"Based on the linked relationship",citedEvidenceIds:[],providerMode:"DETERMINISTIC_EVIDENCE_SYNTHESIS",epistemicBadge:"Model context"}});});
 const result=await executeJava("explain",{modelId:model,elementId:node,forceRefresh:true,userQuestion:"Why does OrderService call Catalog?"},"jwt",new AbortController().signal);
 assert.equal(body.forceRefresh,true);
 assert.equal(body.explanationScope,"ELEMENT");
 assert.equal(body.userQuestion,"Why does OrderService call Catalog?");
 assert.equal(result.modelId,model);
 assert.equal(result.userQuestion,"Why does OrderService call Catalog?");
});
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
 assert.equal(m.elements[0].layer,"domain");assert.equal(m.elements[0].elementType,"SERVICE_CONTAINER");assert.equal(m.elements[0].properties.logicalKey,"keep-me");assert.deepEqual(m.elements[0].evidence,[]);
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
 const unavailable=await route.GET(new NextRequest("http://127.0.0.1:3000/api/mavis/notAnOperation"),context("notAnOperation"));assert.equal(unavailable.status,501);
});
test("session rejection never trusts browser metadata and preserves account restriction errors",async t=>{environment(t);t.mock.method(globalThis,"fetch",async()=>Response.json({message:"disabled"},{status:403}));await assert.rejects(currentSession("stale"),e=>e.status===403);});

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

test("public auth flows map to Java without requiring a previous session",async t=>{
 environment(t);const context=operation=>({params:Promise.resolve({operation})});const calls=[];
 t.mock.method(globalThis,"fetch",async(url,options)=>{calls.push({url,body:JSON.parse(options.body),authorization:options.headers.get("Authorization")});return Response.json({code:200,data:url.endsWith("/register")?{userId:project,email:"new@example.invalid",fullName:"New user",role:"STUDENT"}:null});});
 for(const [op,path,input] of [["register","register",{fullName:"New user",email:"new@example.invalid",password:"test-password"}],["verifyEmail","verify-email",{email:"new@example.invalid",otpCode:"123456"}],["resendOtp","resend-otp",{email:"new@example.invalid"}],["forgotPassword","forgot-password",{email:"new@example.invalid"}],["resetPassword","reset-password",{email:"new@example.invalid",otpCode:"123456",newPassword:"new-password"}]]){
 const response=await route.POST(new NextRequest("http://localhost:3000/api/mavis/"+op,{method:"POST",headers:{host:"localhost:3000",origin:"http://localhost:3000","Content-Type":"application/json"},body:JSON.stringify(input)}),context(op));assert.equal(response.status,200,op);const call=calls.at(-1);assert.equal(call.url,"https://java.invalid/api/v1/auth/"+path);assert.deepEqual(call.body,input);assert.equal(call.authorization,null);if(op!=="register")assert.deepEqual(await response.json(),{ok:true});
 }
});
test("Google credential exchange keeps the returned JWT inside HttpOnly cookie",async t=>{
 environment(t);t.mock.method(globalThis,"fetch",async(url,options)=>{assert.equal(url,"https://java.invalid/api/v1/auth/google");assert.deepEqual(JSON.parse(options.body),{idToken:"google-issued-id-token"});return Response.json({code:200,data:{token:"private-jwt",userId:project,fullName:"Google user",role:"STUDENT"}});});
 const response=await route.POST(new NextRequest("http://localhost:3000/api/mavis/googleSignIn",{method:"POST",headers:{host:"localhost:3000",origin:"http://localhost:3000","Content-Type":"application/json"},body:JSON.stringify({idToken:"google-issued-id-token"})}),{params:Promise.resolve({operation:"googleSignIn"})});assert.equal(response.status,200);assert.match(response.headers.get("set-cookie"),/HttpOnly/);assert.ok(!JSON.stringify(await response.json()).includes("private-jwt"));
});

test("GitHub dropdown discovers actual default and all paginated branches without sending session token",async t=>{
 const {githubBranches}=require("../src/lib/github/branches.ts");const calls=[];
 t.mock.method(globalThis,"fetch",async(url,options)=>{calls.push({url,options});return Response.json(url.endsWith("/repo")?{default_branch:"master"}:new URL(url).searchParams.get("page")==="1"?Array.from({length:100},(_,i)=>({name:i===0?"master":`feature/${i}`})):[{name:"release"}]);});
 const result=await githubBranches("https://github.com/owner/repo.git");
 assert.equal(result.defaultBranch,"master");assert.equal(result.branches.length,101);assert.ok(result.branches.includes("release"));assert.equal(result.truncated,false);assert.equal(calls.length,3);assert.equal(calls[0].options.headers.Authorization,undefined);
});
test("GitHub validation distinguishes URL, missing repository, rate limit and missing branch",async t=>{
 const {githubBranches}=require("../src/lib/github/branches.ts");let calls=0;
 t.mock.method(globalThis,"fetch",async()=>{calls++;return Response.json({},{status:404});});
 await assert.rejects(githubBranches("http://localhost/private"),e=>e.code==="GITHUB_URL");assert.equal(calls,0);
 await assert.rejects(githubBranches("https://github.com/owner/missing"),e=>e.code==="GITHUB_REPOSITORY");
 t.mock.method(globalThis,"fetch",async()=>Response.json({},{status:429}));await assert.rejects(githubBranches("https://github.com/owner/repo"),e=>e.code==="GITHUB_LIMIT");
 t.mock.method(globalThis,"fetch",async url=>Response.json(url.endsWith("/repo")?{default_branch:"master"}:[{name:"master"}]));
 await assert.rejects(executeJava("importGithub",{projectId:project,repositoryUrl:"https://github.com/owner/repo",branchName:"main"},"jwt",new AbortController().signal),e=>e.code==="GITHUB_BRANCH");
 await assert.rejects(executeJava("importGithub",{projectId:project,repositoryUrl:"https://github.com/owner/repo",commitSha:"invalid"},"jwt",new AbortController().signal),e=>e.code==="GITHUB_COMMIT");
});
test("browser adapter displays only approved actionable GitHub errors",async t=>{
 const {BackendAdapter}=require("../src/lib/api/backend-adapter.ts");const api=new BackendAdapter();
 t.mock.method(globalThis,"fetch",async()=>Response.json({code:"GITHUB_BRANCH",message:"private backend detail"},{status:400}));
 await assert.rejects(api.execute("importGithub",{projectId:project,repositoryUrl:"https://github.com/owner/repo",branchName:"main"}),e=>e.code==="GITHUB_BRANCH"&&e.message.includes("does not exist")&&!e.message.includes("private backend"));
 t.mock.method(globalThis,"fetch",async()=>Response.json({code:"RAW_SECRET",message:"private backend detail"},{status:400}));
 await assert.rejects(api.execute("githubBranches",{repositoryUrl:"https://github.com/owner/repo"}),e=>!e.code&&!e.message.includes("private backend"));
});
test("graph wire preserves origin and resolved status without inventing evidence",()=>{
 const value=wire.modelView(metadata,{nodes:[{id:node,name:"A",type:"SERVICE_CONTAINER"}],edges:[{id:job,sourceNodeId:node,targetNodeId:node,kind:"DECLARED_COMPOSE",originLayer:"DEPLOYMENT",resolutionStatus:"RESOLVED"}]},[{id:node,modelVersionId:model,name:"A",elementType:"SERVICE_CONTAINER",parentElementId:null,languageStack:"Apache Kafka"}]);
 assert.equal(value.edges[0].uncertain,false);assert.equal(value.edges[0].originLayer,"DEPLOYMENT");assert.deepEqual(value.edges[0].evidence,[]);assert.equal(value.elements[0].technology,"Apache Kafka");
 assert.throws(()=>validateResponse("saveArchitectureDocument",{modelId:model,viewId:"containers",expectedRevision:2,xml:"x"},{modelId:model,viewId:"containers",revision:2,xml:"x"}));
});
test("GitHub imports pin the selected branch to an immutable commit before downloading source",async t=>{
 environment(t);const sha="a".repeat(40);let submitted;
 t.mock.method(globalThis,"fetch",async(url,options)=>{
  if(url.startsWith("https://api.github.com/"))return Response.json(url.includes("/commits/")?{sha}:url.includes("/branches?")?[{name:"master"}]:{default_branch:"master"});
  if(options.method==="POST"){submitted=JSON.parse(options.body);return Response.json({code:200,data:{snapshotId:snapshot}});}
  return Response.json({code:200,data:{id:snapshot,projectId:project,sourceType:"GITHUB_COMMIT",branchName:"master",createdAt:"2026-10-23T00:00:00Z"}});
 });
 await executeJava("importGithub",{projectId:project,repositoryUrl:"https://github.com/owner/repo.git",branchName:"master"},"jwt",new AbortController().signal);
 assert.equal(submitted.commitSha,sha);assert.equal(submitted.branchName,"master");
});test("project overview aggregates real analysis/runtime evidence and keeps unknowns explicit",async t=>{
 environment(t);const p2="77777777-7777-4777-8777-777777777777",session="88888888-8888-4888-8888-888888888888";
 t.mock.method(globalThis,"fetch",async url=>{
  const path=new URL(url).pathname.replace("/api/v1","");
  const data={
   "/projects":[{id:project,name:"Ready project",repositoryUrl:"acme/one"},{id:p2,name:"Failed project",repositoryUrl:null}],
   [`/analyzer/projects/${project}/jobs`]:[{jobId:job,status:"COMPLETED",analysisState:"COMPLETED_WITH_REVIEW"},{jobId:p2,status:"RUNNING",analysisState:"RUNNING"}],
   [`/analyzer/projects/${project}/models`]:[{id:job,projectId:project,sourceSnapshotId:snapshot,revision:1,isLatestValid:false},{id:model,projectId:project,sourceSnapshotId:snapshot,revision:2,isLatestValid:true}],
   [`/analyzer/models/${model}/graph`]:{nodes:[{id:node,name:"A",type:"SERVICE_CONTAINER"},{id:job,name:"B",type:"SERVICE_CONTAINER"},{id:session,name:"C",type:"COMPONENT"}],edges:[]},
   [`/analyzer/projects/${project}/runtime-sessions`]:[],
   [`/analyzer/projects/${p2}/jobs`]:[{jobId:p2,status:"FAILED",analysisState:"FAILED"}],
   [`/analyzer/projects/${p2}/models`]:[],
   [`/analyzer/projects/${p2}/runtime-sessions`]:[{id:session,projectId:p2}]
  };
  if(!(path in data))throw new Error("unexpected call "+path);
  return Response.json({code:200,data:data[path]});
 });
 const rows=await executeJava("projectOverviews",{},"jwt",new AbortController().signal);
 assert.equal(rows.length,2);
 assert.deepEqual(validateResponse("projectOverviews",{},rows).map(r=>[r.status,r.services,r.runtimeSupported]),[["processing",null,null],["failed",null,true]]);
});
test("project overview degrades a broken per-project source to explicit unknowns instead of failing the page",async t=>{
 environment(t);t.mock.method(globalThis,"fetch",async url=>{
  const path=new URL(url).pathname.replace("/api/v1","");
  if(path==="/projects")return Response.json({code:200,data:[{id:project,name:"Broken",repositoryUrl:null}]});
  return Response.json({code:500,message:"down"},{status:500});
 });
 const rows=await executeJava("projectOverviews",{},"jwt",new AbortController().signal);
 assert.deepEqual(validateResponse("projectOverviews",{},rows),[{id:project,name:"Broken",repository:"",status:"unknown",services:null,runtimeSupported:null,description:null,defaultBranch:null,projectType:null,workspaceId:null,assignmentId:null,isReferenceTemplate:null,referenceSnapshotId:null,backendStatus:null,createdAt:null,updatedAt:null}]);
});
test("project status mapping keeps partial, cancelled and invented states honest",()=>{
 assert.equal(wire.projectStatusFromJobs([]),"unknown");
 assert.equal(wire.projectStatusFromJobs([{status:"PENDING",analysisState:"PENDING"}]),"processing");
 assert.equal(wire.projectStatusFromJobs([{status:"COMPLETED",analysisState:"COMPLETED"}]),"ready");
 assert.equal(wire.projectStatusFromJobs([{status:"COMPLETED",analysisState:"COMPLETED_LEGACY"}]),"ready");
 assert.equal(wire.projectStatusFromJobs([{status:"COMPLETED",analysisState:"PARTIAL"}]),"partial");
 assert.equal(wire.projectStatusFromJobs([{status:"CANCELLED",analysisState:"CANCELLED"}]),"unknown");
 assert.equal(wire.projectStatusFromJobs([{status:"TIMED_OUT",analysisState:"TIMED_OUT"}]),"failed");
 assert.equal(wire.projectStatusFromJobs([{status:"WEIRD",analysisState:null}]),"unknown");
});
test("latest model selection prefers the latest-valid revision and falls back to newest draft",()=>{
 const ma="99999999-9999-4999-8999-999999999999",mb="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
 assert.equal(wire.latestModelSummaryId([]),null);
 assert.equal(wire.latestModelSummaryId([{id:ma,revision:1,isLatestValid:false},{id:mb,revision:2,isLatestValid:true}]),mb);
 assert.equal(wire.latestModelSummaryId([{id:ma,revision:3,isLatestValid:false},{id:mb,revision:2,isLatestValid:false}]),ma);
 assert.equal(wire.latestModelSummaryId([{id:"not-a-uuid",revision:9,isLatestValid:true}]),null);
 assert.equal(wire.serviceCountFromGraph({nodes:[{type:"SERVICE_CONTAINER"},{type:"COMPONENT"},{type:"SERVICE_CONTAINER"}]}),2);
 assert.equal(wire.serviceCountFromGraph({nodes:[]}),0);
 assert.equal(wire.serviceCountFromGraph(null),null);
});
test("node metadata precedence: graph wins, explicit null hides detail, absent falls back to detail",()=>{
 const detailProps=()=>({protocol:"detail-kafka",transportAuthority:"detail-kafka",resolutionIssue:"DETAIL_ISSUE",other:"keep-me"});
 const nodeWith=meta=>wire.modelView(metadata,
  {nodes:[Object.assign({id:node,name:"order-events [kafka]",type:"MESSAGE_CHANNEL",sourcePath:null},meta)],edges:[]},
  [{id:node,modelVersionId:model,name:"order-events [kafka]",elementType:"MESSAGE_CHANNEL",properties:detailProps()}]).elements[0];
 const resolved=nodeWith({protocol:"kafka",transportAuthority:"kafka",resolutionIssue:"UNRESOLVED_MESSAGE_TRANSPORT"});
 assert.equal(resolved.properties.protocol,"kafka");assert.equal(resolved.properties.transportAuthority,"kafka");assert.equal(resolved.properties.resolutionIssue,"UNRESOLVED_MESSAGE_TRANSPORT");
 const unknown=nodeWith({protocol:null,transportAuthority:null,resolutionIssue:null});
 assert.equal(unknown.properties.protocol,null);assert.equal(unknown.properties.transportAuthority,null);assert.equal(unknown.properties.resolutionIssue,null);
 const legacy=nodeWith({});
 assert.equal(legacy.properties.protocol,"detail-kafka");assert.equal(legacy.properties.transportAuthority,"detail-kafka");assert.equal(legacy.properties.resolutionIssue,"DETAIL_ISSUE");
 assert.equal(resolved.properties.other,"keep-me");assert.equal(resolved.id,node);assert.equal(resolved.elementType,"MESSAGE_CHANNEL");
});
test("node metadata blank and wrong-typed values never become display data",()=>{
 const run=meta=>wire.modelView(metadata,
  {nodes:[Object.assign({id:node,name:"ch",type:"MESSAGE_CHANNEL",sourcePath:null},meta)],edges:[]},
  [{id:node,modelVersionId:model,name:"ch",elementType:"MESSAGE_CHANNEL",properties:{other:"keep"}}]).elements[0];
 const blank=run({protocol:"",transportAuthority:"   "});
 assert.equal(blank.properties.protocol,null);assert.equal(blank.properties.transportAuthority,null);
 const wrong=run({protocol:42,transportAuthority:{bad:true},resolutionIssue:["a"]});
 assert.equal(wrong.properties.protocol,null);assert.equal(wrong.properties.transportAuthority,null);assert.equal(wrong.properties.resolutionIssue,null);
 assert.equal(wrong.properties.other,"keep");assert.equal(wrong.technology,null);assert.equal(wrong.parentId,null);assert.deepEqual(wrong.evidence,[]);
});
test("first architecture document save uses expectedRevision 0 (fresh view) per Java CAS contract",()=>{
 const {contracts}=require("../src/lib/api/contracts.ts");
 const input={modelId:model,viewId:"components:fresh",expectedRevision:0,xml:"<mxfile/>"};
 assert.doesNotThrow(()=>contracts.saveArchitectureDocument.input.parse(input),"expectedRevision 0 must be accepted for a first save");
 assert.throws(()=>contracts.saveArchitectureDocument.input.parse({modelId:model,viewId:"components:fresh",expectedRevision:-1,xml:"<mxfile/>"}),"negative revisions stay invalid");
 assert.throws(()=>contracts.saveArchitectureDocument.input.parse({modelId:model,viewId:"components:fresh",xml:"<mxfile/>"}),"missing expectedRevision stays invalid");
 const saved={modelId:model,viewId:"components:fresh",revision:1,xml:"<mxfile/>"};
 const {validateResponse}=require("../src/lib/api/validate-response.ts");
 assert.equal(validateResponse("saveArchitectureDocument",input,saved).revision,1,"saved document response keeps a positive revision");
});
test("stage13 project wire retains educational scope without inventing runtime capability",()=>{
 const p=wire.projectView({id:project,name:"Class project",status:"ACTIVE",projectType:"STUDENT_WORKING",workspaceId:job,assignmentId:snapshot,isReferenceTemplate:false,description:"Scope"});
 assert.equal(p.status,"ready");assert.equal(p.backendStatus,"ACTIVE");assert.equal(p.workspaceId,job);assert.equal(p.projectType,"STUDENT_WORKING");assert.equal(p.runtimeSupported,null);
 assert.equal(wire.projectView({id:project,name:"Archived",status:"ARCHIVED"}).status,"unknown");
});
test("merged project overview retains stage13 educational metadata",()=>{
 const raw={id:project,name:"Class project",status:"ACTIVE",projectType:"STUDENT_WORKING",workspaceId:job,assignmentId:snapshot,isReferenceTemplate:false,description:"Scope"};
 const overview=wire.projectOverviewView(raw,[],null,[]);
 const detail=wire.projectView(raw);
 for(const key of ["backendStatus","workspaceId","assignmentId","projectType","description","isReferenceTemplate"]) assert.equal(overview[key],detail[key],key);
 assert.equal(overview.status,"unknown");assert.equal(overview.services,null);assert.equal(overview.runtimeSupported,null);
});

test("stage13 update profile forwards PATCH and refreshes identity without credentials in response",async t=>{
 environment(t);let sent;t.mock.method(globalThis,"fetch",async(url,options)=>{sent={url,options};return Response.json({code:200,data:{id:project,fullName:"Updated",role:"STUDENT"}});});
 const result=await executeJava("updateProfile",{fullName:"Updated",currentPassword:"old",newPassword:"new-secret"},"jwt",new AbortController().signal);
 assert.equal(sent.options.method,"PATCH");assert.ok(sent.url.endsWith("auth/me"));assert.equal(result.user.name,"Updated");assert.ok(!JSON.stringify(result).includes("secret"));
 const {contracts}=require("../src/lib/api/contracts.ts");assert.equal(contracts.updateProfile.input.safeParse({fullName:" ",newPassword:"123"}).success,false);
});

test("education joins workspace members using user IDs and maps assignment policy",async t=>{
 environment(t);t.mock.method(globalThis,"fetch",async url=>Response.json({code:200,data:url.endsWith("/members")?[{id:node,userId:job,fullName:"Student",memberRole:"STUDENT"}]:url.endsWith("/assignments")?[{id:node,workspaceId:project,title:"Task",description:"Instructions",dueAt:null,requireRuntimeTrace:true,requiredDiagramTypes:["C4"]}]:[{id:project,code:"SE",name:"Class",status:"ACTIVE",myRoleInWorkspace:"LECTURER"}]}));
 const workspaces=validateResponse("workspaces",{},await executeJava("workspaces",{},"jwt",new AbortController().signal));assert.equal(workspaces[0].members[0].id,job);assert.equal(workspaces[0].myRole,"LECTURER");
 const input={workspaceId:project};const assignments=validateResponse("assignments",input,await executeJava("assignments",input,"jwt",new AbortController().signal));assert.equal(assignments[0].instructions,"Instructions");assert.equal(assignments[0].requireRuntimeTrace,true);assert.equal(assignments[0].dueAt,"No deadline");
});
test("submit rejects mismatched source and missing diagram before any mutation",async t=>{
 environment(t);let posts=0;t.mock.method(globalThis,"fetch",async(url,options)=>{if(options.method==="POST")posts++;return Response.json({code:200,data:url.endsWith("/diagrams")?[]:metadata});});
 const input={assignmentId:job,modelId:model,snapshotId:snapshot,runtimeSessionId:null};
 await assert.rejects(executeJava("submit",{...input,snapshotId:node},"jwt",new AbortController().signal),e=>e.status===422);
 await assert.rejects(executeJava("submit",input,"jwt",new AbortController().signal),e=>e.status===422&&e.code==="SUBMISSION_DIAGRAM");assert.equal(posts,0);
});
test("submit sends complete pinned payload and hydrates the submitted version rather than latest",async t=>{
 environment(t);let payload;
 const sub={id:job,assignmentId:node,projectId:project,submittedById:node,submittedAt:"2026-10-23T00:00:00Z",sourceSnapshotId:snapshot,modelVersionId:model,runtimeSessionId:null};
 t.mock.method(globalThis,"fetch",async(url,o)=>{let data;if(url.endsWith("/submissions")&&o.method==="POST"){payload=JSON.parse(o.body);data=sub;}else if(url.endsWith("/feedbacks"))data=[];else if(url.endsWith("/diagrams"))data=[{id:node,modelVersionId:model}];else if(url.endsWith("/graph"))data={nodes:[],edges:[]};else if(url.endsWith("/elements"))data=[];else if(url.includes("/snapshots/"))data={id:snapshot,projectId:project};else data=metadata;return Response.json({code:200,data});});
 const input={assignmentId:node,modelId:model,snapshotId:snapshot,runtimeSessionId:null};const result=validateResponse("submit",input,await executeJava("submit",input,"jwt",new AbortController().signal));assert.equal(result.model.id,model);assert.equal(result.snapshot.id,snapshot);assert.equal(payload.projectId,project);assert.equal(payload.diagramVersionId,node);assert.equal(payload.modelVersionId,model);
});
test("feedback uses commentText and rejects a foreign model before writing",async t=>{
 environment(t);let writes=0;t.mock.method(globalThis,"fetch",async(url,o)=>{if(o.method==="POST")writes++;return Response.json({code:200,data:{modelVersionId:job}});});await assert.rejects(executeJava("feedback",{submissionId:job,modelId:model,text:"Review"},"jwt",new AbortController().signal),e=>e.status===422);assert.equal(writes,0);
});
test("reference lookup never substitutes a model from another source snapshot",async t=>{
 environment(t);t.mock.method(globalThis,"fetch",async url=>Response.json({code:200,data:url.endsWith("reference-snapshots")?[{id:snapshot,projectId:project}]:[{...metadata,sourceSnapshotId:job}]}));await assert.rejects(executeJava("referenceVersions",{workspaceId:project},"jwt",new AbortController().signal),e=>e.code==="REFERENCE_MODEL");
});

test("browser displays only allowlisted submission validation errors",async t=>{const {BackendAdapter}=require("../src/lib/api/backend-adapter.ts");t.mock.method(globalThis,"fetch",async()=>Response.json({code:"SUBMISSION_DIAGRAM"},{status:422}));await assert.rejects(new BackendAdapter().execute("submit",{assignmentId:node,modelId:model,snapshotId:snapshot,runtimeSessionId:null}),e=>e.code==="SUBMISSION_DIAGRAM"&&e.message.includes("Save a diagram"));});

test("admin accounts use role codes and the actual newStatus payload",async t=>{environment(t);let body;t.mock.method(globalThis,"fetch",async(url,o)=>{if(o.body)body=JSON.parse(o.body);return Response.json({code:200,data:{id:project,fullName:"Account",roleCode:"SYSTEM_ADMIN",status:"LOCKED"}});});const input={accountId:project,locked:true};const a=validateResponse("setAccountLock",input,await executeJava("setAccountLock",input,"jwt",new AbortController().signal));assert.equal(a.role,"admin");assert.equal(a.locked,true);assert.deepEqual(body,{newStatus:"LOCKED"});});
test("admin settings preserve stable string IDs, revisions and resource limits",async t=>{environment(t);let target,body;t.mock.method(globalThis,"fetch",async(url,o)=>{target=url;body=JSON.parse(o.body);return Response.json({code:200,data:{id:"JAVA_SPRING_OTEL_V1",name:"Java",enabled:false,revision:3,memoryMiB:512,cpus:0.5,timeoutSeconds:60}});});const input={profileId:"JAVA_SPRING_OTEL_V1",enabled:false,expectedRevision:2,memoryMiB:512,cpus:0.5,timeoutSeconds:60};const p=validateResponse("configureProfile",input,await executeJava("configureProfile",input,"jwt",new AbortController().signal));assert.equal(p.revision,3);assert.equal(p.memoryMiB,512);assert.ok(target.endsWith("admin/profiles/JAVA_SPRING_OTEL_V1"));assert.equal(body.expectedRevision,2);});
test("admin inventory is not a service health probe and uses only running-session counts",async t=>{environment(t);t.mock.method(globalThis,"fetch",async()=>Response.json({code:200,data:{totalProjects:3,totalUsers:4,totalJobs:5,totalRuntimeSessions:99,runningRuntimeSessions:2,healthStatus:"available"}}));const v=validateResponse("platformSummary",{},await executeJava("platformSummary",{},"jwt",new AbortController().signal));assert.equal(v.health,"unknown");assert.equal(v.runningSessions,2);assert.match(v.message,/not been probed/);});
test("administrative runtime monitoring uses the guarded global endpoint",async t=>{environment(t);let path;t.mock.method(globalThis,"fetch",async url=>{path=url;return Response.json({code:200,data:[]});});assert.deepEqual(await executeJava("runtimeReadSessions",{projectId:"*"},"jwt",new AbortController().signal),[]);assert.ok(path.endsWith("admin/runtime-sessions"));});

test("runtime configuration reads and saves durable revisions rather than treating preflight as a save",async t=>{environment(t);const calls=[];const config={projectId:project,snapshotId:snapshot,modelId:model,profileId:"JAVA_SPRING_OTEL_V1",profile:{},revision:0,configured:false,supported:true,ready:false,prerequisites:["Save first"]};t.mock.method(globalThis,"fetch",async(url,o)=>{calls.push({url,o});return Response.json({code:200,data:o.method==="PUT"?{...config,revision:1,configured:true,ready:true}:config});});assert.equal(validateResponse("runtimeConfiguration",{projectId:project},await executeJava("runtimeConfiguration",{projectId:project},"jwt",new AbortController().signal)).ready,false);const input={projectId:project,snapshotId:snapshot,modelId:model,profileId:"JAVA_SPRING_OTEL_V1",profile:{collectorImage:"actual"},expectedRevision:0};assert.equal(validateResponse("saveRuntimeConfiguration",input,await executeJava("saveRuntimeConfiguration",input,"jwt",new AbortController().signal)).revision,1);assert.equal(calls[1].o.method,"PUT");assert.ok(calls.every(x=>x.url.endsWith("runtime-plan")));});
test("starting runtime queues exact approved revisions without inventing execution or cleanup",async t=>{environment(t);let body;const sessionId=job;const response={id:sessionId,projectId:project,sourceSnapshotId:snapshot,executionStatus:"READY_FOR_DISPATCH",scenarioStatus:"APPROVED",evidenceStatus:"UNAVAILABLE",cleanupStatus:"NOT_APPLICABLE",traceStatus:"NONE",scenarioConfig:{planning:{scenarioId:node,configurationRevision:2,scenarioRevision:3}}};t.mock.method(globalThis,"fetch",async(url,o)=>{body=JSON.parse(o.body);return Response.json({code:200,data:response});});const input={projectId:project,snapshotId:snapshot,scenarioId:node,configurationRevision:2,scenarioRevision:3,approved:true};const r=validateResponse("startRuntime",input,await executeJava("startRuntime",input,"jwt",new AbortController().signal));assert.equal(r.status,"pending");assert.equal(r.executionStatus,"READY_FOR_DISPATCH");assert.equal(r.cleanupStatus,"NOT_APPLICABLE");assert.equal(r.approvedAt,null);assert.equal(r.outcome,"unknown");assert.deepEqual(body,input);});
test("scenario creation and revision updates use real persisted API paths",async t=>{environment(t);const calls=[];t.mock.method(globalThis,"fetch",async(url,o)=>{calls.push({url,o});const b=JSON.parse(o.body);return Response.json({code:200,data:{id:node,projectId:project,name:b.name,steps:b.steps,revision:b.expectedRevision+1}});});const input={projectId:project,name:"Health",steps:['{"id":"s","service":"orders","method":"GET","path":"/health","expectedStatus":200}']};assert.equal(validateResponse("createScenario",input,await executeJava("createScenario",input,"jwt",new AbortController().signal)).revision,1);const update={...input,scenarioId:node,expectedRevision:1};assert.equal(validateResponse("saveScenario",update,await executeJava("saveScenario",update,"jwt",new AbortController().signal)).revision,2);assert.equal(calls[0].o.method,"POST");assert.equal(calls[1].o.method,"PUT");});
test("runtime stop preserves cancelling until separate cleanup acknowledgement",async t=>{environment(t);t.mock.method(globalThis,"fetch",async()=>Response.json({code:200,data:{id:job,projectId:project,sourceSnapshotId:snapshot,executionStatus:"CANCELLING",scenarioStatus:"RUNNING",cleanupStatus:"STOP_REQUESTED",traceStatus:"NONE"}}));const input={sessionId:job,action:"terminate"};const r=validateResponse("stopRuntime",input,await executeJava("stopRuntime",input,"jwt",new AbortController().signal));assert.equal(r.status,"cancelling");assert.equal(r.cleanupStatus,"STOP_REQUESTED");assert.equal(r.outcome,"unknown");});

test("merged 3E finding evidence retains provenance and refuses another model's evaluation",async t=>{
 environment(t);const calls=[];let foreign=false;
 t.mock.method(globalThis,"fetch",async url=>{
  calls.push(url);
  return Response.json({code:200,data:url.endsWith("/evidence")
   ?[{id:project,sourceType:"STATIC_CODE",locator:"src/Repository.java",excerpt:"findAll()"}]
   :{id:job,modelVersionId:foreign?snapshot:model}});
 });
 const input={modelId:model,evaluationId:job,findingId:node};
 const result=validateResponse("findingEvidence",input,await executeJava("findingEvidence",input,"jwt",new AbortController().signal));
 assert.equal(result[0].sourceType,"STATIC_CODE");assert.equal(result[0].kind,"source");
 assert.equal(result[0].location,"src/Repository.java");assert.equal(result[0].complete,null);
 assert.ok(calls[1].endsWith(`/evaluations/${job}/findings/${node}/evidence`));
 foreign=true;calls.length=0;
 await assert.rejects(executeJava("findingEvidence",input,"jwt",new AbortController().signal),e=>e.status===502);
 assert.equal(calls.length,1);assert.ok(!calls[0].endsWith("/evidence"));
});

test("elementEvidenceContext fallback hydrates incident relationship evidence when /context returns 404 and explain supports RELATIONSHIP + userQuestion",async t=>{
 environment(t);
 const edgeId="88888888-8888-4888-8888-888888888888";
 const peerId="99999999-9999-4999-8999-999999999999";
 let lastPostBody=null;
 t.mock.method(globalThis,"fetch",async(url,options)=>{
  const u=String(url);
  if(u.endsWith("/context"))return Response.json({code:404,message:"Not found"},{status:404});
  if(u.endsWith(`/evidences/element/${node}`))return Response.json({code:200,data:[]});
  if(u.endsWith(`/models/${model}/graph`))return Response.json({code:200,data:{nodes:[{id:node},{id:peerId}],edges:[{id:edgeId,sourceNodeId:peerId,targetNodeId:node,evidenceCount:1}]}});
  if(u.endsWith(`/evidences/relationship/${edgeId}`))return Response.json({code:200,data:[{id:project,modelVersionId:model,relationshipId:edgeId,sourceType:"STATIC_CODE",locator:"Repo.java:9",excerpt:"interface Repo"}]});
  if(u.endsWith("/ai/explain")&&options?.method==="POST"){
   lastPostBody=JSON.parse(options.body);
   return Response.json({code:200,data:{id:job,modelVersionId:model,elementId:null,relationshipId:edgeId,explanationScope:"RELATIONSHIP",userQuestion:lastPostBody.userQuestion,explanationText:"### Grounded\n- **Verified**",citedEvidenceIds:[project],citedEvidences:[{id:project,sourceType:"STATIC_CODE",locator:"Repo.java:9",excerpt:"interface Repo"}],providerMode:"LIVE_LLM_PROVIDER",aiModelName:"gemini-2.5-flash",epistemicBadge:"Grounded",cached:false}});
  }
  return Response.json({code:200,data:{id:node,modelVersionId:model}});
 });
 const ctx=await executeJava("elementEvidenceContext",{modelId:model,elementId:node},"jwt",new AbortController().signal);
 assert.equal(ctx.directEvidence.length,0);
 assert.equal(ctx.relationshipEvidence.length,1);
 assert.equal(ctx.relationshipEvidence[0].relationshipId,edgeId);
 assert.equal(ctx.relationshipEvidence[0].evidence.snippet,"interface Repo");

 const explainInput={modelId:model,elementId:edgeId,relationshipId:edgeId,explanationScope:"RELATIONSHIP",userQuestion:"How does this connect?",forceRefresh:true};
 const explained=validateResponse("explain",explainInput,await executeJava("explain",explainInput,"jwt",new AbortController().signal));
 assert.equal(lastPostBody.explanationScope,"RELATIONSHIP");
 assert.equal(lastPostBody.relationshipId,edgeId);
 assert.equal(lastPostBody.userQuestion,"How does this connect?");
 assert.equal(explained.citedEvidences[0].locator,"Repo.java:9");
 assert.equal(explained.aiModelName,"gemini-2.5-flash");
});



test("assignment source pins survive the Java adapter without replacing exact model versions", async t => {
 environment(t); const referenceSource={projectId:project,projectName:"Generic teaching source",snapshotId:snapshot,modelId:model,revision:4,sourceType:"ZIP_UPLOAD",artifactHash:"sha256-archive",branch:null,commitSha:null,repositoryUrl:null};
 let posted;
 t.mock.method(globalThis,"fetch",async(url,options={})=>{posted=JSON.parse(options.body);return Response.json({code:200,data:{id:node,workspaceId:job,title:"Pinned source",description:"Task",dueAt:null,referenceSource}});});
 const result=await executeJava("createAssignment",{workspaceId:job,title:"Pinned source",description:"Task",dueAt:null,requiredDiagramTypes:["UML_CLASS"],requireRuntimeTrace:false,referenceModelId:model},"jwt",new AbortController().signal);
 assert.equal(posted.referenceModelId,model);
 assert.deepEqual(validateResponse("createAssignment",{workspaceId:job,title:"Pinned source",dueAt:null,requiredDiagramTypes:["UML_CLASS"],requireRuntimeTrace:false,referenceModelId:model},result).referenceSource,referenceSource);
});


test("submission lists deduplicate metadata and defer heavy assets until detail opens", async t => {
 environment(t);const paths=[];
 const submission={id:job,assignmentId:node,projectId:project,submittedById:node,submittedAt:"2026-10-26T00:00:00Z",sourceSnapshotId:snapshot,modelVersionId:model,diagramVersionId:node,runtimeSessionId:node};
 const rows=[submission,{...submission,id:project}];
 t.mock.method(globalThis,"fetch",async url=>{
  const path=new URL(url).pathname.replace("/api/v1/","");paths.push(path);let data;
  if(path==="submissions/me")data=rows;
  else if(path===`assignments/${node}`)data={id:node,workspaceId:job,title:"Assignment"};
  else if(path===`assignments/${node}/submissions`)data=rows;
  else if(path===`submissions/${job}`)data=submission;
  else if(path===`analyzer/models/${model}`)data=metadata;
  else if(path===`analyzer/models/${model}/graph`)data={nodes:[{id:node,name:"Service",type:"SERVICE_CONTAINER"}],edges:[]};
  else if(path===`analyzer/models/${model}/elements`)data=[{id:node,modelVersionId:model,name:"Service",elementType:"SERVICE_CONTAINER"}];
  else if(path===`analyzer/snapshots/${snapshot}`)data={id:snapshot,projectId:project};
  else if(path.endsWith("/feedbacks"))data=[];
  else if(path===`analyzer/diagrams/${node}`)data={id:node,modelVersionId:model,layoutJson:{frozenDocument:true}};
  else if(path===`analyzer/runtime/sessions/${node}`)data={id:node,projectId:project,sourceSnapshotId:snapshot,executionStatus:"COMPLETED"};
  else throw Error("Unexpected request "+path);
  return Response.json({code:200,data});
 });
 for(const [operation,input] of [["submissions",{}],["assignmentSubmissions",{workspaceId:job,assignmentId:node}]]) {
  paths.length=0;
  const result=validateResponse(operation,input,await executeJava(operation,input,"dedup-fixture-"+operation,new AbortController().signal));
  assert.equal(result.length,2);assert.equal(result[0].model.revision,1);
  assert.equal(paths.filter(p=>p===`analyzer/models/${model}`).length,1);
  assert.ok(!paths.some(p=>/\/(graph|elements)$/.test(p)||p.startsWith("analyzer/diagrams/")||p.startsWith("analyzer/runtime/")));
 }
 paths.length=0;
 const detail=validateResponse("submission",{submissionId:job},await executeJava("submission",{submissionId:job},"dedup-detail-fixture",new AbortController().signal));
 assert.equal(detail.model.elements[0].name,"Service");assert.equal(detail.diagramLayout.frozenDocument,true);assert.equal(detail.runtime.id,node);
 assert.ok(paths.includes(`analyzer/models/${model}/graph`));assert.ok(paths.includes(`analyzer/models/${model}/elements`));
 paths.length=0;
 await executeJava("submissions",{},"another-jwt",new AbortController().signal);
 assert.equal(paths.filter(p=>p===`analyzer/models/${model}`).length,1);
});

test("overview loads status and runtime concurrently without waiting for models or graphs", async t => {
 environment(t);const paths=[];let releaseJobs,releaseSessions;
 const jobsGate=new Promise(resolve=>{releaseJobs=resolve;});
 const sessionsGate=new Promise(resolve=>{releaseSessions=resolve;});
 t.mock.method(globalThis,"fetch",async url=>{
  const path=new URL(url).pathname.replace("/api/v1/","");paths.push(path);let data;
  if(path==="projects")data=[{id:project,name:"Project"}];
  else if(path.endsWith("/jobs")){await jobsGate;data=[jobDto];}
  else if(path.endsWith("/runtime-sessions")){await sessionsGate;data=[{id:node,projectId:project}];}
  else return new Promise(()=>{}); // A heavy model/graph call would prevent completion.
  return Response.json({code:200,data});
 });
 const pending=executeJava("projectOverviews",{},"jwt",new AbortController().signal);
 try {
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(paths.sort(),["projects",`analyzer/projects/${project}/jobs`,`analyzer/projects/${project}/runtime-sessions`].sort());
 } finally {releaseJobs();releaseSessions();}
 const rows=validateResponse("projectOverviews",{},await pending);
 assert.equal(rows[0].services,null);
 assert.equal(rows[0].status,"ready");
 assert.equal(rows[0].runtimeSupported,true);
});

test("mutation invalidation excludes unrelated IDs and uses submission response scope", () => {
 const {mutationScope,queryMatchesScope,mutationInvalidations}=require("../src/lib/api/cache-policy.ts");
 const scope=mutationScope("feedback",{submissionId:job,modelId:model},{id:job,assignmentId:node,model:{projectId:project}});
 assert.equal(queryMatchesScope(["api","submission",{submissionId:job}],scope),true);
 assert.equal(queryMatchesScope(["api","submission",{submissionId:node}],scope),false);
 assert.equal(queryMatchesScope(["api","assignmentSubmissions",{assignmentId:node}],scope),true);
 assert.equal(queryMatchesScope(["api","assignmentSubmissions",{assignmentId:job}],scope),false);
 assert.equal(queryMatchesScope(["api","models",{projectId:job}],scope),false);
 assert.equal(queryMatchesScope(["api","models",{projectId:project}],scope),true);
 assert.equal(queryMatchesScope(["api","submissions",{}],scope),true);
 assert.equal(queryMatchesScope(["other","submissions",{}],scope),false);
 assert.deepEqual(mutationInvalidations.gradeSubmission,["submissionReview"]);
});


test("mutation releases pending state before background refresh and patches feedback cache", async t => {
 const {QueryClient,QueryObserver}=require("@tanstack/react-query");
 const Module=require("node:module");const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false,gcTime:0}}});
 let operationResult={id:project,name:"Created"};let refreshes=0,release;
 const gate=new Promise(resolve=>{release=resolve;});
 const observer=new QueryObserver(client,{queryKey:["api","projects",{}],initialData:[],staleTime:Infinity,queryFn:async()=>{refreshes++;await gate;return [operationResult];}});
 const unsubscribe=observer.subscribe(()=>{});
 const filename=path.join(root,"src/hooks/use-api.ts");const hook=new Module(filename,module);hook.filename=filename;hook.paths=module.paths;
 hook.require=name=>{
  if(name==="react")return {useContext:()=>({execute:async()=>operationResult,mode:"backend"})};
  if(name==="@tanstack/react-query")return {useQueryClient:()=>client,useMutation:options=>client.getMutationCache().build(client,options)};
  if(name==="sonner")return {toast:{success:()=>{},error:()=>{}}};
  if(name==="@/providers/app-context")return {ApiContext:{},SelectionContext:{}};
  return require(name.startsWith("@/")?path.join(root,"src",name.slice(2)):name);
 };
 hook._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
 const mutation=hook.exports.useApiMutation("createProject");
 let finished=false;const pending=mutation.execute({name:"Created"}).then(()=>{finished=true;});
 try {
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(refreshes,1);assert.equal(finished,true);assert.equal(mutation.state.status,"success");
  const old={id:job,assignmentId:node,model:{projectId:project,elements:[{id:node}]},feedback:[]};
  const unrelated={id:node,feedback:[]};
  client.setQueryData(["api","submissions",{}],[old,unrelated]);
  client.setQueryData(["api","submission",{submissionId:job}],old);
  client.setQueryData(["api","submission",{submissionId:node}],unrelated);
  operationResult={id:job,assignmentId:node,model:{projectId:project,elements:[]},feedback:[{id:node,text:"Updated"}]};
  const feedback=hook.exports.useApiMutation("feedback");
  await feedback.execute({submissionId:job,modelId:model,text:"Updated"});
  const expectedMerged={...old,feedback:[{id:node,text:"Updated"}]};
  assert.deepEqual(client.getQueryData(["api","submission",{submissionId:job}]),expectedMerged);
  assert.deepEqual(client.getQueryData(["api","submissions",{}]),[expectedMerged,unrelated]);
  assert.deepEqual(client.getQueryData(["api","submission",{submissionId:node}]),unrelated);
  assert.equal(client.getQueryState(["api","submissions",{}]).isInvalidated,false);
 } finally {release();await pending;unsubscribe();client.clear();}
});

test("workspaces with embedded members and feedback mutations skip redundant round-trips", async t => {
 environment(t);const paths=[];
 const submission={id:job,assignmentId:node,projectId:project,submittedById:node,submittedAt:"2026-10-26T00:00:00Z",sourceSnapshotId:snapshot,modelVersionId:model,diagramVersionId:node,runtimeSessionId:node};
 t.mock.method(globalThis,"fetch",async(url,options={})=>{
  const path=new URL(url).pathname.replace("/api/v1/","");paths.push(`${options.method??"GET"} ${path}`);
  if(path==="workspaces")return Response.json({code:200,data:[{id:job,code:"SE1",name:"Embedded class",status:"ACTIVE",myRoleInWorkspace:"LECTURER",members:[{userId:node,fullName:"Lecturer",memberRole:"LECTURER"}]}]});
  if(path===`submissions/${job}`)return Response.json({code:200,data:submission});
  if(path===`submissions/${job}/feedbacks`)return Response.json({code:200,data:options.method==="POST"?{id:node}:[{id:node,commentText:"Fast",createdAt:"2026-10-26T00:00:00Z",lecturerId:node}]});
  if(path===`analyzer/models/${model}`)return Response.json({code:200,data:metadata});
  if(path===`analyzer/snapshots/${snapshot}`)return Response.json({code:200,data:{id:snapshot,projectId:project}});
  throw Error("Unexpected request "+path);
 });
 const ws=await executeJava("workspaces",{},"jwt",new AbortController().signal);
 assert.equal(ws[0].members[0].id,node);
 assert.ok(!paths.some(p=>p.endsWith("/members")));
 paths.length=0;
 const fb=await executeJava("feedback",{submissionId:job,modelId:model,text:"Fast"},"jwt",new AbortController().signal);
 assert.equal(fb.feedback[0].text,"Fast");
 assert.equal(paths.filter(p=>p===`GET submissions/${job}`).length,1);
});

test("audit: reviewed business errors survive Java and BFF without forwarding arbitrary upstream text", async t => {
 environment(t);
 const {javaRequest}=require("../src/lib/api/java-client.ts");
 const {BackendAdapter}=require("../src/lib/api/backend-adapter.ts");
 let message="Sai email hoặc mật khẩu";
 t.mock.method(globalThis,"fetch",async()=>Response.json({code:401,errorCode:"LOGIN_CREDENTIALS",message},{status:401}));
 await assert.rejects(javaRequest("auth/login",undefined,{method:"POST"}),e=>e.code==="LOGIN_CREDENTIALS");
 const response=await route.POST(new NextRequest("http://127.0.0.1:3000/api/mavis/signIn",{method:"POST",headers:{host:"127.0.0.1:3000",origin:"http://127.0.0.1:3000","content-type":"application/json"},body:JSON.stringify({email:"u@example.org",password:"wrong"})}),{params:Promise.resolve({operation:"signIn"})});
 assert.equal(response.status,401);
 const body=await response.json();assert.equal(body.code,"LOGIN_CREDENTIALS");
 t.mock.method(globalThis,"fetch",async()=>Response.json(body,{status:401}));
 await assert.rejects(new BackendAdapter().execute("signIn",{email:"u@example.org",password:"wrong"}),e=>e.code==="LOGIN_CREDENTIALS" && e.message.includes("password"));
 t.mock.method(globalThis,"fetch",async()=>Response.json({message:"password=secret jdbc:postgresql://private SQL error"},{status:500}));
 await assert.rejects(javaRequest("projects","jwt"),e=>!e.code && !e.message.includes("secret") && !e.message.includes("jdbc"));
});

test("audit: sequence normalizes optional transport fields without inventing calls",()=>{
 const {runtimeSequence}=require("../src/lib/api/java-operations.ts");
 const raw={runtimeSessionId:job,modelVersionId:model,steps:[{stepOrder:1,httpMethod:"  ",traceId:"",spanId:"  ",parentSpanId:null,httpStatusCode:0,operation:"actual operation"},{httpMethod:" GET ",traceId:" trace ",httpStatusCode:200},{httpStatusCode:600},{httpStatusCode:200.5}]};
 const value=runtimeSequence(raw,job);
 assert.equal(value.steps.length,4);assert.equal(value.steps[0].httpMethod,null);assert.equal(value.steps[0].httpStatusCode,null);assert.equal(value.steps[0].traceId,null);assert.equal(value.steps[0].spanId,null);assert.equal(value.steps[0].operation,"actual operation");
 assert.equal(value.steps[1].httpMethod,"GET");assert.equal(value.steps[1].traceId,"trace");assert.equal(value.steps[1].httpStatusCode,200);assert.equal(value.steps[2].httpStatusCode,null);assert.equal(value.steps[3].httpStatusCode,null);
 assert.deepEqual(runtimeSequence({...raw,steps:[]},job).steps,[]);
 assert.throws(()=>runtimeSequence(raw,project));
});

test("audit: graph layers retain explicit classification and resolved certainty",()=>{
 for(const [type,name,layer] of [["DATABASE","orders","data"],["QUEUE_BROKER","events","platform"],["SERVICE_CONTAINER","api-gateway","edge"],["COMPONENT","Orders","domain"],["UNKNOWN","unknown","unclassified"]]) {
  const graph={nodes:[{id:node,name,type}],edges:[{id:job,sourceNodeId:node,targetNodeId:node,kind:"HTTP",resolutionStatus:"RESOLVED"}]};
  const detail={id:node,modelVersionId:model,name,elementType:type,properties:{}};
  const mapped=wire.modelView(metadata,graph,[detail]);assert.equal(mapped.elements[0].layer,layer);assert.equal(mapped.edges[0].uncertain,false);
  detail.properties.layer="edge";assert.equal(wire.modelView(metadata,graph,[detail]).elements[0].layer,"edge");
  graph.edges[0].resolutionStatus="AMBIGUOUS";assert.equal(wire.modelView(metadata,graph,[detail]).edges[0].uncertain,true);
 }
});

test("audit: legacy proxy permits documented reads/evaluation while excluding internal and arbitrary paths",()=>{
 const {allowedBackendPath}=require("../src/lib/api/backend-path.ts");
 for(const p of [`projects/${project}/snapshots`,`projects/${project}/jobs`,`analyzer/snapshots/${snapshot}`,`analyzer/models/${model}/elements`,`analyzer/models/${model}/elements/${node}`,`analyzer/models/${model}/evaluate`,`analyzer/evaluations/${job}/findings`,`assignments/${job}/reference-source`]) assert.equal(allowedBackendPath(p),true,p);
 for(const p of ["admin/users",`analyzer/runtime/sessions/${job}/recovery-result`,"../admin/users",`projects/${project}/snapshots/extra`,"https://private",`analyzer/models/${model}/evaluate/extra`]) assert.equal(allowedBackendPath(p),false,p);
});

test("audit: optional runtime failure cannot block submission; required runtime remains gated",()=>{
 const {runtimeEvidenceBlocked}=require("../src/features/submissions/submission-readiness.ts");
 for(const pending of [true,false])for(const failed of [true,false])assert.equal(runtimeEvidenceBlocked(false,pending,failed),false);
 assert.equal(runtimeEvidenceBlocked(true,true,false),true);assert.equal(runtimeEvidenceBlocked(true,false,true),true);assert.equal(runtimeEvidenceBlocked(true,false,false),false);
});

test("audit: explain selection accepts only a target in the current revision and correct kind",()=>{
 const {explainUrlTarget}=require("../src/features/ai-explanations/target.ts");
 const value={elements:[{id:node}],edges:[{id:job}]};
 assert.deepEqual(explainUrlTarget(value,job,"relationship"),{id:job,kind:"relationships"});
 assert.deepEqual(explainUrlTarget(value,node,"element"),{id:node,kind:"elements"});
 assert.equal(explainUrlTarget(value,project,"element"),null);assert.equal(explainUrlTarget(value,node,"relationship"),null);
});

test("audit: every backend operation has a Java adapter case or an explicit BFF auth handler",()=>{
 const {contracts}=require("../src/lib/api/contracts.ts");
 const source=fs.readFileSync(path.join(root,"src/lib/api/java-operations.ts"),"utf8");
 const routeSource=fs.readFileSync(path.join(root,"app/api/mavis/[operation]/route.ts"),"utf8");
 const cases=new Set([...source.matchAll(/case "([^"]+)":/g)].map(match=>match[1]));
 const bff=["session","signIn","googleSignIn","signOut","mockLogin","register","verifyEmail","resendOtp","forgotPassword","resetPassword"];
 for(const name of Object.keys(contracts)) {
  assert.ok(cases.has(name)||bff.includes(name),`Missing backend operation: ${name}`);
  if(bff.includes(name))assert.ok(routeSource.includes(`"${name}"`)||routeSource.includes(`${name}:`),name);
 }
});

test("audit: admin role selection maps all three UI roles to canonical backend codes",async t=>{
 environment(t);const {contracts}=require("../src/lib/api/contracts.ts");
 for(const [role,code] of [["student","STUDENT"],["lecturer","LECTURER"],["admin","SYSTEM_ADMIN"]]) {
  assert.equal(contracts.setAccountRole.input.safeParse({accountId:node,role}).success,true);
  t.mock.method(globalThis,"fetch",async(url,options)=>{
   assert.ok(url.endsWith(`/admin/users/${node}/role`));assert.equal(options.method,"PATCH");assert.equal(options.headers.get("Authorization"),"Bearer jwt");assert.deepEqual(JSON.parse(options.body),{newRoleCode:code});
   return Response.json({code:200,data:{id:node,email:"role@example.org",fullName:"Role test",roleCode:code,status:"ACTIVE"}});
  });
  assert.equal((await executeJava("setAccountRole",{accountId:node,role},"jwt",new AbortController().signal)).role,role);
 }
 assert.equal(contracts.setAccountRole.input.safeParse({accountId:node,role:"superuser"}).success,false);
});

test("Feign evidence boundary preserves only recognized saved communication roles",()=>{
 const base={id:node,sourceType:"STATIC_CODE",locator:"order/CatalogFeignClient.java:17",excerpt:"@PostMapping(\"/deduct\")",provenance:{communicationRole:"CLIENT_CONTRACT",privateField:"not exposed"}};
 const mapped=wire.evidenceView(base);assert.equal(mapped.communicationRole,"CLIENT_CONTRACT");assert.equal(mapped.origin,"persisted");assert.ok(!JSON.stringify(mapped).includes("privateField"));
 assert.equal(wire.evidenceView({...base,provenance:{communicationRole:"invented"}}).communicationRole,undefined);
 assert.equal(wire.evidenceView({...base,provenance:null}).communicationRole,undefined);
});

test("admin AI usage returns real scoped measurements and preserves unavailable fields", async t => {
 environment(t);
 const data={status:"AVAILABLE",updatedAt:"2026-10-28T00:00:00Z",message:null,providers:[{provider:"openai",model:"gpt-test",usage:{inputTokens:21,outputTokens:7,requestCount:2},coverage:{java:"OBSERVED",next:"UNKNOWN"},providerDataMessage:"Provider project data",providerUsage:{scope:"project",inputTokens:30,outputTokens:9,requestCount:3,startTime:"2026-10-01T00:00:00Z",endTime:"2026-10-28T00:00:00Z"},limits:{scope:"project",models:[{model:"gpt-test",requestsPerMinute:10,tokensPerMinute:300}]},cost:{scope:"project",amount:0.12,currency:"usd",startTime:"2026-10-01T00:00:00Z",endTime:"2026-10-28T00:00:00Z"},balance:null,status:"AVAILABLE",message:null},{provider:"gemini",model:"gemini-test",usage:null,limits:null,cost:null,balance:null,status:"UNAVAILABLE",message:null,geminiQuota:{scope:"project",partial:true,samples:[{model:"gemini-test",metric:"serviceruntime.googleapis.com/quota/rate/net_usage",limitName:"requests",kind:"usage",value:1,measuredAt:"2026-10-28T00:00:00Z",startTime:"2026-10-27T23:59:00Z"}]}}]};
 let url,auth;
 t.mock.method(globalThis,"fetch",async (u,options)=>{url=String(u);auth=new Headers(options.headers).get("Authorization");return Response.json({code:200,data});});
 const result=validateResponse("adminAiUsage",{},await executeJava("adminAiUsage",{},"jwt",new AbortController().signal));
 assert.match(url,/\/api\/v1\/admin\/ai-usage$/);assert.equal(auth,"Bearer jwt");assert.deepEqual(result,data);
});
test("admin AI usage denies access on backend authorization failure", async t => {
 environment(t);t.mock.method(globalThis,"fetch",async()=>new Response(null,{status:403}));
 await assert.rejects(()=>executeJava("adminAiUsage",{},"jwt",new AbortController().signal),error=>error.status===403);
});

test("admin health uses protected backend probes and preserves degraded states",async t=>{
 environment(t);
 const data={status:"DEGRADED",checkedAt:"2026-10-28T08:00:00Z",scope:"Application dependencies",checks:[{id:"database",name:"PostgreSQL",status:"DOWN",latencyMs:20,message:"Could not connect",action:"Check database"}],jvm:{usedBytes:100,maxBytes:1000,uptimeSeconds:30},storage:{}};
 t.mock.method(globalThis,"fetch",async(url,options)=>{assert.ok(url.endsWith("/api/v1/admin/health"));assert.equal(options.headers.get("Authorization"),"Bearer jwt");return Response.json({code:200,data});});
 const result=await executeJava("adminHealth",{},"jwt");assert.equal(result.status,"DEGRADED");
 const {operationPermission}=require("../src/lib/auth/permissions.ts");assert.equal(operationPermission("adminHealth"),"admin:manage");
});


test("notification requests use only signed-in inbox and safe read endpoints",async t=>{
 environment(t);const calls=[];
 t.mock.method(globalThis,"fetch",async(url,options)=>{
  const parsed=new URL(url);calls.push({path:parsed.pathname,search:parsed.search,method:options.method,auth:options.headers.get("Authorization")});
  if(parsed.pathname.endsWith('/read')||parsed.pathname.endsWith('/read-all'))return Response.json({code:200,data:{ok:true}});
  return Response.json({code:200,data:{items:[],total:0,unreadCount:0,page:0,size:5,asOf:"2026-10-28T00:00:00Z"}});
 });
 await executeJava("notifications",{page:0,size:5,unreadOnly:true,category:"ASSIGNMENT"},"jwt");
 await executeJava("readNotification",{notificationId:node},"jwt");
 await executeJava("readAllNotifications",{before:"2026-10-28T00:00:00Z"},"jwt");
 assert.equal(calls[0].path,'/api/v1/notifications');assert.ok(calls[0].search.includes('category=ASSIGNMENT'));assert.ok(!calls[0].search.includes('recipient'));
 assert.equal(calls[1].method,'PATCH');assert.equal(calls[1].path,`/api/v1/notifications/${node}/read`);assert.equal(calls[2].method,'POST');assert.ok(calls.every(c=>c.auth==='Bearer jwt'));
});
test("notification contracts reject unsafe redirects and invalid filters",()=>{
 const {contracts}=require('../src/lib/api/contracts.ts');
 assert.equal(contracts.notifications.input.safeParse({page:-1,size:5,unreadOnly:false}).success,false);
 assert.equal(contracts.notifications.input.safeParse({page:0,size:51,unreadOnly:false}).success,false);
 const data={items:[{id:node,title:'Test',body:'Body',category:'ACCOUNT',targetPath:'//evil.example',createdAt:'2026-10-28T00:00:00Z',readAt:null}],total:1,unreadCount:1,page:0,size:20,asOf:'2026-10-28T00:00:00Z'};
 assert.equal(contracts.notifications.output.safeParse(data).success,false);
 const {mutationInvalidations}=require('../src/lib/api/cache-policy.ts');assert.ok(mutationInvalidations.readNotification.includes('notifications'));assert.ok(mutationInvalidations.readAllNotifications.includes('notifications'));
});


test("project activity maps true job times and project names without per-project requests",async t=>{
 environment(t);let calls=0;
 t.mock.method(globalThis,"fetch",async(url,options)=>{calls++;assert.ok(url.endsWith('/api/v1/activity/analysis?page=0&size=10'));assert.equal(options.headers.get('Authorization'),'Bearer jwt');return Response.json({code:200,data:{items:[{projectName:'Example',job:{jobId:job,projectId:project,sourceSnapshotId:snapshot,status:'FAILED',startedAt:'2026-10-28T10:00:00Z',completedAt:'2026-10-28T10:01:00Z'}}],total:1,page:0,size:10}});});
 const result=await executeJava('projectAnalysisActivity',{page:0,size:10},'jwt');assert.equal(calls,1);assert.equal(result.items[0].projectName,'Example');assert.equal(result.items[0].completedAt,'2026-10-28T10:01:00Z');assert.equal(result.items[0].status,'failed');const {terminalSignature}=require('../src/lib/api/cache-policy.ts');assert.equal(terminalSignature('projectAnalysisActivity',result),job+':failed');
});


test("new project persists its repository and default branch in the create request",async t=>{
 environment(t);let payload;
 t.mock.method(globalThis,'fetch',async(url,options)=>{assert.ok(url.endsWith('/api/v1/projects'));payload=JSON.parse(options.body);return Response.json({code:200,data:{id:project,name:'Example',status:'ACTIVE',repositoryUrl:'https://github.com/example/repo',defaultBranch:'master'}});});
 const result=await executeJava('createProject',{name:'Example',repositoryUrl:'https://github.com/example/repo',defaultBranch:'master'},'jwt');
 assert.equal(payload.repositoryUrl,'https://github.com/example/repo');assert.equal(payload.defaultBranch,'master');assert.equal(result.repository,payload.repositoryUrl);
});

test("delete mutations use scoped DELETE endpoints and never send repository deletion requests",async()=>{
 const original=global.fetch,calls=[];
 global.fetch=async(url,init)=>{calls.push({url:String(url),method:init?.method});return Response.json({code:200,message:"Deleted",data:null});};
 try{
  assert.deepEqual(await executeJava("deleteProject",{projectId:project},"jwt",new AbortController().signal),{ok:true});
  assert.deepEqual(await executeJava("deleteSnapshot",{projectId:project,snapshotId:snapshot},"jwt",new AbortController().signal),{ok:true});
  assert.equal(calls.length,2);assert.ok(calls.every(c=>c.method==="DELETE"));assert.ok(calls[0].url.endsWith('/projects/'+project));assert.ok(calls[1].url.endsWith('/projects/'+project+'/snapshots/'+snapshot));
 }finally{global.fetch=original;}
});

test("project activity adapter retains deletion identity when job/actor names are omitted",async()=>{
 const previous=global.fetch;global.fetch=async()=>Response.json({code:200,data:{items:[{id:job,kind:"SNAPSHOT_DELETED",projectId:project,projectName:"Archived project",occurredAt:"2026-10-29T09:00:00Z",projectDeleted:true,targetId:snapshot,targetName:"main / abc12345",actorId:node}],total:1,page:0,size:10}});
 try{const result=await executeJava("projectActivity",{page:0,size:10},"jwt",new AbortController().signal);assert.equal(result.items[0].kind,"SNAPSHOT_DELETED");assert.equal(result.items[0].targetId,snapshot);assert.equal(result.items[0].job,null);assert.equal(result.items[0].actorName,null);}finally{global.fetch=previous;}
});


test("login redirect accepts internal destinations and rejects external or disguised URLs", () => {
 const {safeLoginRedirect}=require("../src/lib/auth/safe-login-redirect.ts");
 for(const value of [null,"","/","/login","/login?next=/workspaces","/login/","/a/../login","https://example.com","//example.com","javascript:alert(1)","/\\example.com","/\n/example.com","/%2f%2fexample.com","/%5cexample.com","/%0a/example.com","/%ZZ"]){
  assert.equal(safeLoginRedirect(value),null,String(value));
 }
 for(const value of ["/workspaces","/project-overview?project=test#details","/architecture?project=a&model=b"]){
  assert.equal(safeLoginRedirect(value),value);
 }
});

test("auth errors use structured backend codes and safe fallbacks through the BFF", async t => {
 environment(t);
 const {javaRequest}=require("../src/lib/api/java-client.ts");
 const {publicErrors}=require("../src/lib/errors/api-error.ts");
 const cases=[
  ["auth/login",401,"LOGIN_CREDENTIALS"],["auth/login",403,"LOGIN_VERIFICATION"],["auth/login",403,"LOGIN_LOCKED"],
  ...["INVALID","EXPIRED","USED"].map(s=>["auth/verify-email",400,`AUTH_CODE_${s}`]),
  ...["INVALID","EXPIRED","USED"].map(s=>["auth/reset-password",400,`AUTH_RESET_${s}`]),
  ["auth/reset-password",400,"AUTH_PASSWORD_POLICY"],["auth/register",500,"AUTH_EMAIL_DELIVERY"],
 ];
 for(const [path,status,errorCode] of cases) {
  t.mock.method(globalThis,"fetch",async()=>Response.json({code:status,errorCode,message:"secret provider details"},{status}));
  await assert.rejects(javaRequest(path,undefined,{method:"POST"}),e=>e.code===errorCode&&e.message===publicErrors[errorCode]&&!e.message.includes("secret"));
 }
 t.mock.method(globalThis,"fetch",async()=>Response.json({code:400,errorCode:"UNRECOGNIZED",message:"secret"},{status:400}));
 await assert.rejects(javaRequest("auth/verify-email",undefined),e=>e.code==="AUTH_INPUT_INVALID");
 t.mock.method(globalThis,"fetch",async()=>Response.json({message:"secret"},{status:429,headers:{"Retry-After":"120"}}));
 await assert.rejects(javaRequest("auth/resend-otp",undefined),e=>e.code==="AUTH_RESEND_LIMIT"&&e.retryAfter===120);
 const response=await route.POST(new NextRequest("http://127.0.0.1:3000/api/mavis/resendOtp",{method:"POST",headers:{host:"127.0.0.1:3000",origin:"http://127.0.0.1:3000","content-type":"application/json"},body:JSON.stringify({email:"fixture@example.org"})}),{params:Promise.resolve({operation:"resendOtp"})});
 assert.equal(response.status,429);assert.equal(response.headers.get("retry-after"),"120");assert.equal((await response.json()).code,"AUTH_RESEND_LIMIT");
});

test("public auth contract rejects incomplete and nonnumeric OTPs for both purposes",()=>{
 const {contracts}=require("../src/lib/api/contracts.ts");
 for(const otpCode of ["","12345","1234567","12x456","１２３４５６","123 56"])
  for(const op of ["verifyEmail","resetPassword"]) assert.equal(contracts[op].input.safeParse({email:"fixture@example.org",otpCode,newPassword:"valid-password"}).success,false);
 for(const op of ["verifyEmail","resetPassword"]) assert.equal(contracts[op].input.safeParse({email:"fixture@example.org",otpCode:"012345",newPassword:"valid-password"}).success,true);
});

test("intentional logout deletes the cookie without redirecting or storing a return destination",async t=>{
 environment(t);let calls=0;t.mock.method(globalThis,"fetch",async()=>{calls++;throw Error("Logout must be local");});
 const response=await route.POST(new NextRequest("http://127.0.0.1:3000/api/mavis/signOut",{method:"POST",headers:{host:"127.0.0.1:3000",origin:"http://127.0.0.1:3000",cookie:"mavis_session=fixture","content-type":"application/json"},body:"{}"}),{params:Promise.resolve({operation:"signOut"})});
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});assert.match(response.headers.get("set-cookie"),/mavis_session=;/);assert.equal(response.headers.get("location"),null);assert.equal(calls,0);
});

test("session checks distinguish expired credentials from restrictions and outages",async t=>{
 environment(t);
 for(const status of [401,403,500]) {
  t.mock.method(globalThis,"fetch",async()=>Response.json({code:status},{status}));
  if(status===401) assert.deepEqual(await currentSession("expired"),{user:null});
  else await assert.rejects(currentSession("present"),e=>e.status===status);
 }
 assert.deepEqual(await currentSession(undefined),{user:null});
});

test("session recovery confirms expiry, coalesces failures and never confuses login or network failures",async()=>{
 const {QueryClient}=require("@tanstack/react-query");
 const {createSessionRecovery}=require("../src/lib/auth/session-recovery.ts");
 const {ApiError}=require("../src/lib/errors/api-error.ts");
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
 const session={user:{id:"one",role:"student"}};client.setQueryData(["api","session",{}],session);client.setQueryData(["projects"],[1]);
 let calls=0,release;
 const recovery=createSessionRecovery(client,{execute:async()=>{calls++;return await new Promise(resolve=>release=resolve);}});
 for(const operation of ["signIn","googleSignIn","verifyEmail","resetPassword","session","signOut"]) await recovery(new ApiError("unauthorized",401),operation);
 for(const kind of ["network","server","forbidden"]) await recovery(new ApiError(kind),"projects");
 assert.equal(calls,0);assert.ok(client.getQueryData(["api","session",{}]).user);
 const first=recovery(new ApiError("unauthorized",401),"projects"),second=recovery(new ApiError("unauthorized",401),"models");
 assert.equal(calls,1);release({user:null});await Promise.all([first,second]);
 assert.deepEqual(client.getQueryData(["api","session",{}]),{user:null});assert.equal(client.getQueryData(["projects"]),undefined);
 client.setQueryData(["api","session",{}],session);
 const healthy=createSessionRecovery(client,{execute:async()=>session});await healthy(new ApiError("unauthorized",401),"projects");assert.ok(client.getQueryData(["api","session",{}]).user);
 const outage=createSessionRecovery(client,{execute:async()=>{throw new ApiError("network");}});await outage(new ApiError("unauthorized",401),"projects");assert.ok(client.getQueryData(["api","session",{}]).user);
 const stale=recovery(new ApiError("unauthorized",401),"projects");client.setQueryData(["api","session",{}],{user:{id:"new",role:"lecturer"}});release({user:null});await stale;assert.equal(client.getQueryData(["api","session",{}]).user.id,"new");client.clear();
});

test("login restoration validates routes, current resource access and role defaults",async()=>{
 const {loginDestination}=require("../src/lib/auth/login-destination.ts");
 const calls=[];const api={execute:async(op,input)=>{calls.push([op,input]);return op==="workspaces"?[{id:"workspace-1"}]:{};}};
 const next="/architecture?project=project-1&model=model-1&origin=STATIC#node-1";
 assert.equal(await loginDestination(next,"student",api),next);assert.deepEqual(calls[0],["project",{projectId:"project-1"}]);
 assert.equal(await loginDestination("/workspace-overview?workspace=workspace-1","lecturer",api),"/workspace-overview?workspace=workspace-1");
 assert.equal(await loginDestination("/workspace-overview?workspace=removed","lecturer",api),"/workspaces");
 const unavailable={execute:async()=>{throw new Error("forbidden");}};assert.equal(await loginDestination(next,"student",unavailable),"/");
 for(const next of [null,"https://outside.invalid","//outside.invalid","/%2f%2foutside.invalid","/auth/verify","/api/backend/projects","/_next/static/x","/missing-route","/login?next=/login"])
  assert.equal(await loginDestination(next,"lecturer",api),"/workspaces");
 assert.equal(await loginDestination("/administration/users","student",api),"/");
 assert.equal(await loginDestination("/administration/users","admin",api),"/administration/users");
 assert.equal(await loginDestination(null,"admin",api),"/administration/health");
 assert.equal(await loginDestination("/profile","student",api),"/profile");
});

test("public auth network errors and unknown failures remain safe",async t=>{
 const {BackendAdapter}=require("../src/lib/api/backend-adapter.ts");
 t.mock.method(globalThis,"fetch",async()=>{throw new TypeError("secret connection details");});
 await assert.rejects(new BackendAdapter().execute("forgotPassword",{email:"fixture@example.org"}),e=>e.code==="AUTH_NETWORK"&&!e.message.includes("secret"));
 t.mock.method(globalThis,"fetch",async()=>Response.json({error:"secret sql"},{status:500}));
 await assert.rejects(new BackendAdapter().execute("signIn",{email:"fixture@example.org",password:"candidate"}),e=>e.code==="AUTH_SERVER");
});


test("Zipkin containers infer platform from technology or image while preserving explicit layers",()=>{
 for(const [name,technology,image,expected] of [
  ["zipkin",null,null,"platform"],
  ["trace-collector","Zipkin",null,"platform"],
  ["trace-collector",null,"registry:5000/openzipkin/zipkin:latest@sha256:abc","platform"],
  ["zipkin-business-service",null,"acme/orders:latest","domain"],
  ["orders",null,null,"domain"],
 ]){
  const graph={nodes:[{id:node,name,type:"SERVICE_CONTAINER"}],edges:[]};
  const detail={id:node,modelVersionId:model,name,elementType:"SERVICE_CONTAINER",languageStack:technology,properties:{image}};
  const mapped=wire.modelView(metadata,graph,[detail]);
  assert.equal(mapped.elements[0].layer,expected,name);
  assert.equal(mapped.elements[0].elementType,"SERVICE_CONTAINER");
  assert.equal(mapped.elements[0].id,node);
  detail.properties.layer="domain";
  assert.equal(wire.modelView(metadata,graph,[detail]).elements[0].layer,"domain");
 }
});

test("runtime planning failures cannot fabricate saved configuration, scenarios or dispatch",async t=>{
 environment(t);
 for(const operation of ['runtimeConfiguration','saveRuntimeConfiguration','scenarios','createScenario','saveScenario','startRuntime']){
  const calls=[];const mocked=t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url:String(url),options});return Response.json({code:409,message:'Planning conflict'},{status:409});});
  const input={projectId:project,snapshotId:snapshot,modelId:model,scenarioId:node,profileId:'profile',profile:{},name:'Scenario',steps:['{}'],expectedRevision:1,configurationRevision:1,scenarioRevision:1,approved:true};
  await assert.rejects(()=>executeJava(operation,input,'jwt',new AbortController().signal));
  assert.equal(calls.length,1,operation+' retried through a legacy/fabricated path');mocked.mock.restore();
 }
});
test("an empty saved scenario list remains empty instead of generating fake business requests",async t=>{
 environment(t);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({code:200,data:[]});});
 assert.deepEqual(await executeJava('scenarios',{projectId:project},'jwt',new AbortController().signal),[]);assert.equal(calls,1);
});

test("runtimePreflight and buildRuntimeSandboxImages preserve full Step 1 automation and UUID mapping contracts",async t=>{
 environment(t);
 const calls=[];
 t.mock.method(globalThis,"fetch",async(url,options)=>{
  calls.push({url:String(url),method:options?.method??"GET"});
  if(String(url).includes("/snapshots/"))return Response.json({code:200,data:{id:snapshot,projectId:project}});
  if(String(url).includes("/runtime/preflight"))return Response.json({code:200,data:{
   compatible:true,
   detectedServices:["api-gateway","order-service","orders-db"],
   composeServices:["api-gateway","order-service","orders-db"],
   infrastructureServices:["orders-db"],
   securityWarnings:[],
   recommendedProfile:"SPRING_BOOT_DOTNET_COMPOSE_V1",
   serviceHealthPaths:{"api-gateway":"/actuator/health","order-service":"/"},
   serviceHealthConfidence:{"api-gateway":"DETECTED","order-service":"ASSUMED"},
   sandboxComposeYaml:"services:\n  api-gateway:\n    expose:\n    - '8080'\n",
   sandboxComposeChanges:["Converted ports to expose"],
   unresolvableRunnerIssues:["Service 'order-service' uses build:"],
   recommendedServiceMappings:{"api-gateway":node,"order-service":job},
   modelServiceNames:{[node]:"api-gateway",[job]:"order-service"},
   localImageBuildAvailable:true,
   requiredEnvVars:[{name:"JWT_SECRET",service:"api-gateway",services:["api-gateway","order-service"],category:"SECRET",scope:"SANDBOX",defaultPresent:false}]
  }});
  if(String(url).endsWith("/runtime-plan/build-images"))return Response.json({code:200,data:{
   projectId:project,
   snapshotId:snapshot,
   builtImages:{"order-service":"mavis-sandbox/order-service@sha256:"+"a".repeat(64),"api-gateway":"sha256:"+"b".repeat(64)},
   errors:[]
  }});
  throw Error("Unexpected URL "+url);
 });
 const pre=validateResponse("runtimePreflight",{projectId:project,snapshotId:snapshot},await executeJava("runtimePreflight",{projectId:project,snapshotId:snapshot},"jwt",new AbortController().signal));
 assert.equal(pre.localImageBuildAvailable,true);
 assert.equal(pre.recommendedServiceMappings["api-gateway"],node);
 assert.deepEqual(pre.requiredEnvVars[0].services,["api-gateway","order-service"]);
 assert.equal(pre.serviceHealthConfidence["order-service"],"ASSUMED");

 const built=validateResponse("buildRuntimeSandboxImages",{projectId:project,snapshotId:snapshot,services:["order-service"]},await executeJava("buildRuntimeSandboxImages",{projectId:project,snapshotId:snapshot,services:["order-service"]},"jwt",new AbortController().signal));
 assert.ok(built.builtImages["order-service"].includes("@sha256:"));
 assert.ok(built.builtImages["api-gateway"].startsWith("sha256:"));
 assert.ok(calls.some(c=>c.method==="POST"&&c.url.endsWith(`/analyzer/projects/${project}/runtime-plan/build-images`)));
 const {MockAdapter}=require("../src/lib/api/mock-adapter.ts");
 const mock=new MockAdapter("normal",0);
 const mockPre=validateResponse("runtimePreflight",{projectId:"sample-checkout",snapshotId:"source-1"},await mock.execute("runtimePreflight",{projectId:"sample-checkout",snapshotId:"source-1"}));
 assert.ok(mockPre.compatible);
 assert.ok(Object.keys(mockPre.recommendedServiceMappings).length>0);
});


test("generateRuntimeScenario, createScenario and saveScenario validate Step 2 contracts across Backend and MockAdapter",async t=>{
 environment(t);
 t.mock.method(globalThis,"fetch",async(url,options)=>{
  assert.ok(String(url).endsWith(`/analyzer/projects/${project}/runtime-plan/scenarios/generate`));
  assert.equal(options.method,"POST");
  return Response.json({code:200,data:{
   projectId:project,
   snapshotId:snapshot,
   modelId:model,
   suggestedName:"Multi-Service Order Verification",
   generatorMode:"SYSTEM_STATIC",
   aiModelName:null,
   summary:"Causal CRUD flow across api-gateway and order-service.",
   runnableServices:["api-gateway","order-service"],
   steps:[{
    id:"step-1",
    service:"order-service",
    method:"POST",
    path:"/api/orders",
    expectedStatus:201,
    allowClientError:true,
    rationale:"Create order using CreateOrderRequest DTO",
    source:"OrderController.java",
    bodyReference:"ORDER_SERVICE_BODY_1",
    envHeaders:[{name:"Authorization",reference:"ORDER_SERVICE_AUTH"}]
   }],
   sampleInputs:{ORDER_SERVICE_BODY_1:'{"sku":"SKU-100","quantity":2}',ORDER_SERVICE_AUTH:"Bearer sandbox-verification-token"},
   inheritedEnvKeys:["DB_PASSWORD","JWT_SECRET"]
  }});
 });
 const genReq={projectId:project,snapshotId:snapshot,modelId:model};
 const genRes=validateResponse("generateRuntimeScenario",genReq,await executeJava("generateRuntimeScenario",genReq,"jwt",new AbortController().signal));
 assert.deepEqual(genRes.runnableServices,["api-gateway","order-service"]);
 assert.equal(genRes.steps[0].allowClientError,true);
 assert.equal(genRes.steps[0].expectedStatus,201);
 assert.equal(genRes.sampleInputs.ORDER_SERVICE_BODY_1,'{"sku":"SKU-100","quantity":2}');

 const {MockAdapter}=require("../src/lib/api/mock-adapter.ts");
 const mock=new MockAdapter("normal",0);
 const mockGenReq={projectId:"sample-checkout",snapshotId:"source-1"};
 const mockDraft=validateResponse("generateRuntimeScenario",mockGenReq,await mock.execute("generateRuntimeScenario",mockGenReq));
 assert.ok(mockDraft.steps.length>0);
 assert.ok(Array.isArray(mockDraft.runnableServices)&&mockDraft.runnableServices.length>0);
 assert.equal(mockDraft.steps[0].allowClientError,true);

 const createReq={projectId:"sample-checkout",name:"Saved Step 2 Flow",steps:[JSON.stringify({id:"step-1",service:mockDraft.steps[0].service,method:"POST",path:"/checkout",expectedStatus:201,allowClientError:true,bodyReference:"CHECKOUT_BODY_1"})]};
 const created=validateResponse("createScenario",createReq,await mock.execute("createScenario",createReq));
 assert.equal(created.revision,1);
 const saveReq={...createReq,scenarioId:created.id,expectedRevision:1,name:"Updated Step 2 Flow"};
 const updated=validateResponse("saveScenario",saveReq,await mock.execute("saveScenario",saveReq));
 assert.equal(updated.revision,2);
 assert.equal(updated.name,"Updated Step 2 Flow");
});

test("Step 3 runtimeReadSession, permissions and MockAdapter validate enriched diagnostics, stepResults and sequence flows",async t=>{
 environment(t);
 const sessionId="66666666-6666-4666-8666-666666666666",enrichedId="77777777-7777-4777-8777-777777777777";
 t.mock.method(globalThis,"fetch",async()=>Response.json({code:200,data:{
  id:sessionId,
  projectId:project,
  sourceSnapshotId:snapshot,
  modelVersionId:model,
  enrichedModelVersionId:enrichedId,
  executionStatus:"COMPLETED",
  scenarioStatus:"PASSED",
  evidenceStatus:"AVAILABLE",
  cleanupStatus:"CONFIRMED",
  traceQuality:"CompleteForCapturedData",
  mappingStatus:"MAPPED",
  traceStatus:"COMPLETE",
  publicationGateStatus:"PROMOTED",
  failureReason:null,
  diagnostics:["CLEANUP_VERIFIED"],
  capturedSpanCount:3,
  stepResults:[{
   id:"step-1",
   service:"order-service",
   method:"POST",
   path:"/api/orders",
   expectedStatus:201,
   statusCode:201,
   status:"PASSED",
   durationMs:19,
   failureReason:null,
   traceId:"4bf92f3577b34da6a3ce929d0e0e4736",
   parentSpanId:"0000000000000001"
  }]
 }}));
 const readRes=validateResponse("runtimeReadSession",{sessionId},await executeJava("runtimeReadSession",{sessionId},"jwt",new AbortController().signal));
 assert.equal("outcome" in readRes,false);
 assert.equal(readRes.enrichedModelId,enrichedId);
 assert.equal(readRes.publicationGateStatus,"PROMOTED");
 assert.equal(readRes.capturedSpanCount,3);
 assert.equal(readRes.stepResults.length,1);
 assert.equal(readRes.stepResults[0].statusCode,201);
 assert.equal(readRes.stepResults[0].durationMs,19);

 const {operationPermission,hasPermission}=require("../src/lib/auth/permissions.ts");
 for(const op of ["runtimeReadSessions","runtimeReadSession","runtimeStop","runtimeSequence"]){
  assert.equal(operationPermission(op),undefined,op);
 }
 assert.equal(operationPermission("runtimeApprove"),"project:write");
 assert.equal(hasPermission("student","project:write"),true);
 assert.equal(hasPermission("admin","project:write"),false);

 const {MockAdapter}=require("../src/lib/api/mock-adapter.ts");
 const mock=new MockAdapter("normal",0);
 assert.deepEqual(validateResponse("runtimeReadSessions",{projectId:"*"},await mock.execute("runtimeReadSessions",{projectId:"*"})),[]);

 const cfg=await mock.execute("runtimeConfiguration",{projectId:"sample-checkout"});
 const scenarios=await mock.execute("scenarios",{projectId:"sample-checkout"});
 const started1=await mock.execute("startRuntime",{
  projectId:"sample-checkout",
  snapshotId:"source-1",
  scenarioId:scenarios[0].id,
  configurationRevision:cfg.revision,
  scenarioRevision:scenarios[0].revision,
  approved:true
 });
 const allSessions=validateResponse("runtimeReadSessions",{projectId:"*"},await mock.execute("runtimeReadSessions",{projectId:"*"}));
 assert.equal(allSessions.length,1);
 const projectSessions=validateResponse("runtimeReadSessions",{projectId:"sample-checkout"},await mock.execute("runtimeReadSessions",{projectId:"sample-checkout"}));
 assert.equal(projectSessions.length,1);

 const targetId=started1.id;
 const single=validateResponse("runtimeReadSession",{sessionId:targetId},await mock.execute("runtimeReadSession",{sessionId:targetId}));
 assert.equal("outcome" in single,false);
 const approved=validateResponse("runtimeApprove",{sessionId:targetId},await mock.execute("runtimeApprove",{sessionId:targetId}));
 assert.equal(approved.executionStatus,"COMPLETED");
 assert.ok(approved.enrichedModelId);
 assert.ok(Array.isArray(approved.stepResults)&&approved.stepResults.length>0);
 const seq=validateResponse("runtimeSequence",{sessionId:targetId},await mock.execute("runtimeSequence",{sessionId:targetId}));
 assert.equal(seq.sessionId,targetId);
 assert.equal(seq.steps.length,1);

 const started2=await mock.execute("startRuntime",{
  projectId:"sample-checkout",
  snapshotId:"source-1",
  scenarioId:scenarios[0].id,
  configurationRevision:cfg.revision,
  scenarioRevision:scenarios[0].revision,
  approved:true
 });
 const stopped=validateResponse("runtimeStop",{sessionId:started2.id},await mock.execute("runtimeStop",{sessionId:started2.id}));
 assert.equal("outcome" in stopped,false);
 assert.equal(stopped.executionStatus,"CANCELLED");
});

test("all 14 runtime operations pass strict executeJava + validateResponse contracts across a 2-run lifecycle with RUNTIME_ENRICHED promotion", async t => {
 environment(t);
 const {resolveRuntimeTargetModel}=require("../src/features/runtime/scenario-suggestions.ts");
 const snap1="22222222-2222-4222-8222-222222222221",snap2Unanalyzed="22222222-2222-4222-8222-222222222229";
 const staticM1="33333333-3333-4333-8333-333333333331",enrichedM2="33333333-3333-4333-8333-333333333332";
 const scenId="66666666-6666-4666-8666-666666666661",sess1Id="77777777-7777-4777-8777-777777777771",sess2Id="77777777-7777-4777-8777-777777777772";
 const digestImg="sha256:"+"a".repeat(64);
 let cfgRev=0,cfgSnap=snap2Unanalyzed,cfgModel=null,scenRev=0,runCount=0;
 let scenarioSteps=[JSON.stringify({id:"step-1",service:"order-api",method:"POST",path:"/api/orders",expectedStatus:201,allowClientError:true,bodyReference:"ORDER_API_BODY_1"})];

 t.mock.method(globalThis,"fetch",async(url,options={})=>{
  const u=new URL(url);
  const p=u.pathname.replace("/api/v1/","");
  const m=options.method??"GET";
  const body=options.body?JSON.parse(options.body):undefined;
  let data;
  if(p===`projects/${project}/snapshots`) data=[
   {id:snap2Unanalyzed,projectId:project,sourceType:"UPLOAD",branchName:null,commitSha:null,createdAt:"2026-11-01T12:05:00Z"},
   {id:snap1,projectId:project,sourceType:"GITHUB",branchName:"main",commitSha:"abcdef1234567890",createdAt:"2026-11-01T12:00:00Z"}
  ];
  else if(p===`analyzer/projects/${project}/models`) data=runCount===0
   ?[{id:staticM1,projectId:project,sourceSnapshotId:snap1,revision:1,origin:"STATIC",isLatestValid:true,createdAt:"2026-11-01T12:01:00Z"}]
   :[
     {id:enrichedM2,projectId:project,sourceSnapshotId:snap1,revision:2,origin:"RUNTIME_ENRICHED",isLatestValid:true,createdAt:"2026-11-01T12:03:00Z"},
     {id:staticM1,projectId:project,sourceSnapshotId:snap1,revision:1,origin:"STATIC",isLatestValid:false,createdAt:"2026-11-01T12:01:00Z"}
    ];
  else if(p===`analyzer/snapshots/${snap1}`) data={id:snap1,projectId:project,sourceType:"GITHUB"};
  else if(p===`analyzer/runtime/preflight`&&m==="POST") data={
   compatible:true,detectedServices:["order-api","orders-db"],composeServices:["order-api","orders-db"],
   infrastructureServices:["orders-db"],securityWarnings:[],recommendedProfile:"SPRING_BOOT_DOTNET_COMPOSE_V1",
   servicePorts:{"order-api":8080},serviceStacks:{"order-api":"SPRING_BOOT"},
   detectedEndpoints:[{service:"order-api",method:"POST",path:"/api/orders",source:"OrderController.java"}],
   databaseChecks:[{service:"order-api",dbType:"POSTGRESQL",requiredEnvVars:["DB_PASSWORD"],status:"DETECTED_CONTAINER"}],
   requiredEnvVars:[{name:"DB_PASSWORD",service:"order-api",services:["order-api","orders-db"],category:"DB_SECRET",defaultValue:null,scope:"SANDBOX",defaultPresent:false,required:true}],
   runnerIssues:["Service 'order-api' uses build: without digest-pinned image"],
   unresolvableRunnerIssues:["Service 'order-api' has no image"],
   sandboxComposeYaml:"services:\n  order-api:\n    ports: ['8080:8080']\n",
   sandboxComposeChanges:["Stripped build: on order-api"],
   recommendedServiceMappings:{"order-api":node},modelServiceNames:{[node]:"order-api"},localImageBuildAvailable:true
  };
  else if(p===`analyzer/projects/${project}/runtime-plan`&&m==="GET") data={
   projectId:project,snapshotId:cfgSnap,modelId:cfgModel,profileId:"SPRING_BOOT_DOTNET_COMPOSE_V1",
   profile:{detectedServices:["order-api"],composeServices:["order-api"],localImageBuildAvailable:true},
   revision:cfgRev,configured:cfgRev>0,supported:true,ready:cfgRev>0,prerequisites:[],protectedInputsReady:true
  };
  else if(p===`analyzer/projects/${project}/runtime-plan/build-images`&&m==="POST") data={
   projectId:project,snapshotId:body.snapshotId??snap1,builtImages:{"order-api":digestImg},errors:[]
  };
  else if(p===`analyzer/projects/${project}/runtime-plan`&&m==="PUT"){
   assert.equal(body.snapshotId,snap1,"snapshotId must match analyzed static model snapshot");
   assert.equal(body.modelId,staticM1,"modelId must stay pinned to base STATIC model across runs");
   assert.equal(body.expectedRevision,cfgRev);
   cfgRev+=1;cfgSnap=body.snapshotId;cfgModel=body.modelId;
   data={projectId:project,snapshotId:cfgSnap,modelId:cfgModel,profileId:body.profileId,profile:body.profile,revision:cfgRev,configured:true,supported:true,ready:true,prerequisites:[],protectedInputsReady:true};
  }
  else if(p===`analyzer/projects/${project}/runtime-plan/scenarios/generate`&&m==="POST") data={
   projectId:project,snapshotId:body.snapshotId??snap1,modelId:body.modelId??staticM1,
   suggestedName:"Auto-generated Architecture Verification Scenario",generatorMode:"SYSTEM_STATIC",aiModelName:"deterministic-static-v2",
   summary:"Synthesized 1 causal step.",
   steps:[{id:"step-1",service:"order-api",method:"POST",path:"/api/orders",expectedStatus:201,rationale:"Seed order",source:"OrderController.java",environmentVariables:null,envHeaders:null,bodyReference:"ORDER_API_BODY_1",allowClientError:true}],
   sampleInputs:{ORDER_API_BODY_1:'{"customerEmail":"alice@mavis.io","quantity":1}'},
   inheritedEnvKeys:["DB_PASSWORD"],runnableServices:["order-api"]
  };
  else if(p===`analyzer/projects/${project}/runtime-plan/scenarios`&&m==="GET") data=scenRev===0?[]:[{id:scenId,projectId:project,name:"Order Verification",steps:scenarioSteps,revision:scenRev}];
  else if(p===`analyzer/projects/${project}/runtime-plan/scenarios`&&m==="POST"){
   assert.equal(body.expectedRevision,0);scenRev=1;scenarioSteps=body.steps;
   data={id:scenId,projectId:project,name:body.name,steps:scenarioSteps,revision:scenRev};
  }
  else if(p===`analyzer/projects/${project}/runtime-plan/scenarios/${scenId}`&&m==="PUT"){
   assert.equal(body.expectedRevision,scenRev);scenRev+=1;scenarioSteps=body.steps;
   data={id:scenId,projectId:project,name:body.name,steps:scenarioSteps,revision:scenRev};
  }
  else if(p===`analyzer/projects/${project}/runtime-plan/start`&&m==="POST"){
   runCount+=1;
   const sid=runCount===1?sess1Id:sess2Id;
   // Java always unwraps RUNTIME_ENRICHED -> base STATIC modelVersionId (staticM1)
   data={
    id:sid,projectId:project,sourceSnapshotId:snap1,modelVersionId:staticM1,enrichedModelVersionId:null,
    scenarioName:"Order Verification",profileName:"SPRING_BOOT_DOTNET_COMPOSE_V1",
    scenarioConfig:{planning:{scenarioId:scenId,configurationRevision:body.configurationRevision,scenarioRevision:body.scenarioRevision}},
    executionStatus:"RUNNING",scenarioStatus:"RUNNING",evidenceStatus:"PENDING",cleanupStatus:"PENDING",
    traceQuality:"Pending",traceStatus:"NONE",mappingStatus:"PENDING",
    createdAt:"2026-11-01T12:02:00Z",startedAt:"2026-11-01T12:02:01Z",completedAt:null
   };
  }
  else if(p===`analyzer/runtime/sessions/${sess1Id}`&&m==="GET") data={
   id:sess1Id,projectId:project,sourceSnapshotId:snap1,modelVersionId:staticM1,enrichedModelVersionId:enrichedM2,
   scenarioName:"Order Verification",profileName:"SPRING_BOOT_DOTNET_COMPOSE_V1",
   scenarioConfig:{planning:{scenarioId:scenId,configurationRevision:1,scenarioRevision:2}},
   executionStatus:"COMPLETED",scenarioStatus:"PASSED",evidenceStatus:"COMPLETE",cleanupStatus:"CONFIRMED",
   traceQuality:"Complete",publicationGateStatus:"PROMOTED",traceStatus:"COMPLETE",mappingStatus:"MAPPED",
   capturedSpanCount:2,diagnostics:[],
   stepResults:[{id:"step-1",service:"order-api",method:"POST",path:"/api/orders",expectedStatus:201,statusCode:201,status:"PASSED",durationMs:14,failureReason:null,traceId:"4bf92f3577b34da6a3ce929d0e0e4736",parentSpanId:"00f067aa0ba902b7"}],
   createdAt:"2026-11-01T12:02:00Z",startedAt:"2026-11-01T12:02:01Z",completedAt:"2026-11-01T12:02:05Z"
  };
  else if(p===`analyzer/runtime/sessions/${sess1Id}/sequence`&&m==="GET") data={
   runtimeSessionId:sess1Id,modelVersionId:enrichedM2,baseModelVersionId:staticM1,sourceSnapshotId:snap1,
   modelRevision:2,baseModelRevision:1,modelOrigin:"RUNTIME_ENRICHED",traceStatus:"COMPLETE",mappingStatus:"MAPPED",
   startedAt:"2026-11-01T12:02:01Z",completedAt:"2026-11-01T12:02:05Z",limitations:["NO_SYNTHETIC_REPLY_FROM_END_TIME"],
   steps:[{stepOrder:1,callerService:"external",calleeService:"order-api",httpMethod:"POST",httpStatusCode:201,durationMs:14,traceId:"4bf92f3577b34da6a3ce929d0e0e4736",spanId:"1111111111111111",parentSpanId:"00f067aa0ba902b7"}]
  };
  else if(p===`analyzer/runtime/sessions/${sess2Id}/approve`&&m==="POST") data={
   id:sess2Id,projectId:project,sourceSnapshotId:snap1,modelVersionId:staticM1,enrichedModelVersionId:null,
   scenarioName:"Order Verification",profileName:"SPRING_BOOT_DOTNET_COMPOSE_V1",
   executionStatus:"RUNNING",scenarioStatus:"RUNNING",evidenceStatus:"PENDING",cleanupStatus:"PENDING",
   traceQuality:"Pending",traceStatus:"NONE",mappingStatus:"PENDING",
   createdAt:"2026-11-01T12:04:00Z",startedAt:"2026-11-01T12:04:01Z",completedAt:null
  };
  else if(p===`analyzer/runtime/sessions/${sess2Id}/stop`&&m==="POST") data={
   id:sess2Id,projectId:project,sourceSnapshotId:snap1,modelVersionId:staticM1,enrichedModelVersionId:null,
   scenarioName:"Order Verification",profileName:"SPRING_BOOT_DOTNET_COMPOSE_V1",
   scenarioConfig:{planning:{scenarioId:scenId,configurationRevision:2,scenarioRevision:2}},
   executionStatus:"CANCELLING",scenarioStatus:"RUNNING",evidenceStatus:"PENDING",cleanupStatus:"PENDING",
   traceQuality:"Pending",traceStatus:"NONE",mappingStatus:"PENDING",
   createdAt:"2026-11-01T12:04:00Z",startedAt:"2026-11-01T12:04:01Z",completedAt:null
  };
  else if(p===`analyzer/projects/${project}/runtime-sessions`&&m==="GET") data=[
   {id:sess2Id,projectId:project,sourceSnapshotId:snap1,modelVersionId:staticM1,executionStatus:"CANCELLING",scenarioStatus:"RUNNING",evidenceStatus:"PENDING",cleanupStatus:"PENDING",traceQuality:"Pending",mappingStatus:"PENDING",scenarioConfig:{planning:{scenarioId:scenId,configurationRevision:2,scenarioRevision:2}}},
   {id:sess1Id,projectId:project,sourceSnapshotId:snap1,modelVersionId:staticM1,enrichedModelVersionId:enrichedM2,executionStatus:"COMPLETED",scenarioStatus:"PASSED",evidenceStatus:"COMPLETE",cleanupStatus:"CONFIRMED",traceQuality:"Complete",publicationGateStatus:"PROMOTED",mappingStatus:"MAPPED",scenarioConfig:{planning:{scenarioId:scenId,configurationRevision:1,scenarioRevision:2}}}
  ];
  else throw new Error(`Unexpected fetch ${m} ${p}`);
  return Response.json({code:200,data});
 });

 const call=async(op,input)=>validateResponse(op,input,await executeJava(op,input,"jwt",new AbortController().signal));

 // --- RUN #1 (with unanalyzed newer snapshot snap2Unanalyzed present!) ---
 const snaps=await call("snapshots",{projectId:project});
 assert.equal(snaps.length,2);
 const modelsRun1=await call("modelVersions",{projectId:project});
 const cfg0=await call("runtimeConfiguration",{projectId:project});
 assert.equal(cfg0.snapshotId,snap2Unanalyzed); // Unconfigured default points to newest unanalyzed snapshot
 const targetRun1=resolveRuntimeTargetModel(modelsRun1,null,cfg0.modelId);
 assert.equal(targetRun1.id,staticM1);
 assert.equal(targetRun1.snapshotId,snap1); // Aligned to analyzed snapshot snap1!

 const pre=await call("runtimePreflight",{projectId:project,snapshotId:targetRun1.snapshotId});
 assert.equal(pre.compatible,true);
 assert.equal(pre.localImageBuildAvailable,true);

 const built=await call("buildRuntimeSandboxImages",{projectId:project,snapshotId:targetRun1.snapshotId,services:["order-api"]});
 assert.equal(built.builtImages["order-api"],digestImg);

 const cfg1=await call("saveRuntimeConfiguration",{
  projectId:project,profileId:"SPRING_BOOT_DOTNET_COMPOSE_V1",snapshotId:targetRun1.snapshotId,modelId:targetRun1.id,
  expectedRevision:cfg0.revision,profile:{serviceImageOverrides:built.builtImages}
 });
 assert.equal(cfg1.revision,1);

 const gen=await call("generateRuntimeScenario",{projectId:project,snapshotId:targetRun1.snapshotId,modelId:targetRun1.id});
 assert.equal(gen.steps.length,1);
 assert.equal((await call("scenarios",{projectId:project})).length,0);

 const createdScen=await call("createScenario",{projectId:project,name:"Order Verification",steps:scenarioSteps});
 assert.equal(createdScen.revision,1);
 const updatedScen=await call("saveScenario",{scenarioId:createdScen.id,projectId:project,expectedRevision:1,name:"Order Verification",steps:scenarioSteps});
 assert.equal(updatedScen.revision,2);

 const run1=await call("startRuntime",{
  projectId:project,snapshotId:targetRun1.snapshotId,modelId:targetRun1.id,scenarioId:updatedScen.id,
  configurationRevision:cfg1.revision,scenarioRevision:updatedScen.revision,approved:true,
  environment:{ORDER_API_BODY_1:'{"customerEmail":"alice@mavis.io","quantity":1}'}
 });
 assert.equal(run1.id,sess1Id);
 assert.equal(run1.status,"running");

 const read1=await call("runtimeReadSession",{sessionId:sess1Id});
 assert.equal(read1.publicationGateStatus,"PROMOTED");
 assert.equal(read1.enrichedModelId,enrichedM2);
 const seq1=await call("runtimeSequence",{sessionId:sess1Id});
 assert.equal(seq1.steps.length,1);
 assert.equal(seq1.steps[0].httpStatusCode,201);

 // --- RUN #2 (after RUNTIME_ENRICHED enrichedM2 became latest=true!) ---
 const modelsRun2=await call("modelVersions",{projectId:project});
 assert.equal(modelsRun2[0].id,enrichedM2);
 assert.equal(modelsRun2[0].origin,"RUNTIME_ENRICHED");
 const targetRun2=resolveRuntimeTargetModel(modelsRun2,enrichedM2,enrichedM2);
 assert.equal(targetRun2.id,staticM1); // Unwrapped to base STATIC model so startRuntime never hits 502 contract!

 const cfg2=await call("saveRuntimeConfiguration",{
  projectId:project,profileId:"SPRING_BOOT_DOTNET_COMPOSE_V1",snapshotId:targetRun2.snapshotId,modelId:targetRun2.id,
  expectedRevision:cfg1.revision,profile:{serviceImageOverrides:built.builtImages}
 });
 assert.equal(cfg2.revision,2);

 const run2=await call("startRuntime",{
  projectId:project,snapshotId:targetRun2.snapshotId,modelId:targetRun2.id,scenarioId:updatedScen.id,
  configurationRevision:cfg2.revision,scenarioRevision:updatedScen.revision,approved:true,
  environment:{ORDER_API_BODY_1:'{"customerEmail":"bob@mavis.io","quantity":2}'}
 });
 assert.equal(run2.id,sess2Id);
 const approved2=await call("runtimeApprove",{sessionId:sess2Id});
 assert.equal(approved2.executionStatus,"RUNNING");
 const stoppedRead2=await call("runtimeStop",{sessionId:sess2Id});
 assert.equal(stoppedRead2.executionStatus,"CANCELLING");
 const stoppedCoursework2=await call("stopRuntime",{sessionId:sess2Id,action:"cancel"});
 assert.equal(stoppedCoursework2.status,"cancelling");

 const readList=await call("runtimeReadSessions",{projectId:project});
 assert.equal(readList.length,2);
 const courseworkList=await call("runtimeSessions",{projectId:project});
 assert.equal(courseworkList.length,2);
 assert.equal(courseworkList[1].traces.length,1);
});
