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
 const result=await executeJava("explain",{modelId:model,elementId:node,forceRefresh:true},"jwt",new AbortController().signal);
 assert.equal(body.forceRefresh,true);
 assert.equal(body.explanationScope,"ELEMENT");
 assert.equal(result.modelId,model);
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
 const unavailable=await route.GET(new NextRequest("http://127.0.0.1:3000/api/mavis/notAnOperation"),context("notAnOperation"));assert.equal(unavailable.status,501);
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
 assert.deepEqual(validateResponse("projectOverviews",{},rows).map(r=>[r.status,r.services,r.runtimeSupported]),[["processing",2,null],["failed",null,true]]);
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
  const result=validateResponse(operation,input,await executeJava(operation,input,"jwt",new AbortController().signal));
  assert.equal(result.length,2);assert.equal(result[0].model.revision,1);
  assert.equal(paths.filter(p=>p===`analyzer/models/${model}`).length,1);
  assert.ok(!paths.some(p=>/\/(graph|elements)$/.test(p)||p.startsWith("analyzer/diagrams/")||p.startsWith("analyzer/runtime/")));
 }
 paths.length=0;
 const detail=validateResponse("submission",{submissionId:job},await executeJava("submission",{submissionId:job},"jwt",new AbortController().signal));
 assert.equal(detail.model.elements[0].name,"Service");assert.equal(detail.diagramLayout.frozenDocument,true);assert.equal(detail.runtime.id,node);
 assert.ok(paths.includes(`analyzer/models/${model}/graph`));assert.ok(paths.includes(`analyzer/models/${model}/elements`));
 paths.length=0;
 await executeJava("submissions",{},"another-jwt",new AbortController().signal);
 assert.equal(paths.filter(p=>p===`analyzer/models/${model}`).length,1);
});

test("overview starts independent APIs together and graph waits only for models", async t => {
 environment(t);const paths=[];let releaseJobs,releaseModels,releaseSessions;
 const jobsGate=new Promise(resolve=>{releaseJobs=resolve;});
 const modelsGate=new Promise(resolve=>{releaseModels=resolve;});
 const sessionsGate=new Promise(resolve=>{releaseSessions=resolve;});
 t.mock.method(globalThis,"fetch",async url=>{
  const path=new URL(url).pathname.replace("/api/v1/","");paths.push(path);let data;
  if(path==="projects")data=[{id:project,name:"Project"}];
  else if(path.endsWith("/jobs")){await jobsGate;data=[];}
  else if(path.endsWith("/models")){await modelsGate;data=[metadata];}
  else if(path.endsWith("/runtime-sessions")){await sessionsGate;data=[];}
  else if(path.endsWith("/graph"))data={nodes:[],edges:[]};
  else throw Error("Unexpected request "+path);
  return Response.json({code:200,data});
 });
 const pending=executeJava("projectOverviews",{},"jwt",new AbortController().signal);
 try {
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(paths.includes(`analyzer/projects/${project}/jobs`));assert.ok(paths.includes(`analyzer/projects/${project}/models`));assert.ok(paths.includes(`analyzer/projects/${project}/runtime-sessions`));
  assert.ok(!paths.includes(`analyzer/models/${model}/graph`));
  releaseModels();await new Promise(resolve=>setImmediate(resolve));
  assert.ok(paths.includes(`analyzer/models/${model}/graph`));
 } finally {releaseJobs();releaseModels();releaseSessions();await pending;}
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
