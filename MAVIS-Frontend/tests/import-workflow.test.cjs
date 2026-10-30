const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
require.extensions['.ts']=(module,file)=>{const out=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;module._compile(out.replace(/require\(["']@\/([^"']+)["']\)/g,(_,p)=>'require('+JSON.stringify(path.join(root,'src',p))+')'),file);};
const {importAndAnalyze}=require('../src/features/projects/import-workflow.ts');
const github=(branch='master',sha='')=>({kind:'github',repositoryUrl:'https://github.com/example/repository',branchName:branch,commitSha:sha});
function harness(){const calls=[];let n=0;return {calls,api:{mode:'mock',execute:async(op,input)=>{calls.push({op,input});if(op==='createProject')return {id:'project',name:input.name,repository:input.repositoryUrl,defaultBranch:input.defaultBranch};if(op==='importGithub'||op==='importSource')return {id:'snapshot-'+(++n),projectId:input.projectId};if(op==='startAnalysis')return {id:'job-'+n,projectId:input.projectId,snapshotId:input.snapshotId};throw Error('Unexpected operation');}}};}
test('new project uses remote default master then imports and analyzes its own snapshot',async()=>{const h=harness(),state={};const result=await importAndAnalyze(h.api,{name:'Example',source:github()},state);assert.deepEqual(h.calls.map(c=>c.op),['createProject','importGithub','startAnalysis']);assert.equal(h.calls[0].input.defaultBranch,'master');assert.equal(h.calls[1].input.branchName,'master');assert.equal(result.snapshotId,h.calls[2].input.snapshotId);assert.ok(h.calls[2].input.idempotencyKey);});
test('selected branch and full commit SHA reach the initial import unchanged',async()=>{const h=harness(),sha='a'.repeat(40);await importAndAnalyze(h.api,{name:'Pinned',source:github('develop',sha)},{});assert.equal(h.calls[1].input.branchName,'develop');assert.equal(h.calls[1].input.commitSha,sha);});
test('new snapshot reuses existing project and starts analysis',async()=>{const h=harness();await importAndAnalyze(h.api,{projectId:'existing',source:github('feature/order')},{});assert.deepEqual(h.calls.map(c=>c.op),['importGithub','startAnalysis']);assert.equal(h.calls[0].input.projectId,'existing');});
test('analysis-start retry reuses snapshot and idempotency key without creating/importing again',async()=>{const h=harness(),original=h.api.execute;let failed=false;h.api.execute=async(op,input)=>{if(op==='startAnalysis'&&!failed){failed=true;h.calls.push({op,input});throw Error('network');}return original(op,input);};const state={},input={name:'Retry',source:github()};await assert.rejects(()=>importAndAnalyze(h.api,input,state));const result=await importAndAnalyze(h.api,input,state);assert.equal(h.calls.filter(c=>c.op==='createProject').length,1);assert.equal(h.calls.filter(c=>c.op==='importGithub').length,1);const starts=h.calls.filter(c=>c.op==='startAnalysis');assert.equal(starts[0].input.idempotencyKey,starts[1].input.idempotencyKey);assert.equal(result.snapshotId,state.snapshot.snapshotId);});
test('import retry reuses the project already created',async()=>{const h=harness(),original=h.api.execute;let failed=false;h.api.execute=async(op,input)=>{if(op==='importGithub'&&!failed){failed=true;h.calls.push({op,input});throw Error('download');}return original(op,input);};const state={},input={name:'Retry',source:github()};await assert.rejects(()=>importAndAnalyze(h.api,input,state));await importAndAnalyze(h.api,input,state);assert.equal(h.calls.filter(c=>c.op==='createProject').length,1);});
test('invalid SHA cannot create an empty project',async()=>{const h=harness();await assert.rejects(()=>importAndAnalyze(h.api,{name:'Invalid',source:github('main','bad-sha')},{}));assert.equal(h.calls.length,0);});
test('different revision creates a new snapshot and a new analysis request',async()=>{const h=harness(),state={};const first=await importAndAnalyze(h.api,{projectId:'existing',source:github('main','a'.repeat(40))},state);const second=await importAndAnalyze(h.api,{projectId:'existing',source:github('main','b'.repeat(40))},state);assert.notEqual(first.snapshotId,second.snapshotId);const starts=h.calls.filter(c=>c.op==='startAnalysis');assert.notEqual(starts[0].input.idempotencyKey,starts[1].input.idempotencyKey);assert.equal(h.calls.filter(c=>c.op==='createProject').length,0);});
test('mismatched analysis job is rejected instead of navigating to another snapshot',async()=>{const h=harness(),original=h.api.execute;h.api.execute=async(op,input)=>op==='startAnalysis'?{id:'wrong-job',projectId:'other',snapshotId:'other'}:original(op,input);await assert.rejects(()=>importAndAnalyze(h.api,{projectId:'existing',source:github()},{}),/does not match/);});

for(const branch of ['main','trunk'])test('default branch '+branch+' is not replaced by a hard-coded main/master',async()=>{const h=harness();await importAndAnalyze(h.api,{name:'Default',source:github(branch)},{});assert.equal(h.calls[0].input.defaultBranch,branch);assert.equal(h.calls[1].input.branchName,branch);});

const {analysisInProgress,snapshotAnalysisLabel,startSnapshotAnalysis}=require('../src/features/projects/snapshot-analysis.ts');
test('snapshot actions reflect latest attempt even when an older revision exists',()=>{
 for(const status of ['failed','cancelled','timed-out'])assert.equal(snapshotAnalysisLabel({status},true),'Retry');
 assert.equal(snapshotAnalysisLabel({status:'completed'},true),'Re-analyze');assert.equal(snapshotAnalysisLabel(undefined,false),'Analyze');
 for(const status of ['queued','processing','cancelling'])assert.equal(analysisInProgress({status}),true);
 assert.equal(analysisInProgress({status:'completed'}),false);
});
test('reanalysis reuses pinned snapshot and request key after a network retry',async()=>{
 const calls=[],request={projectId:'project',snapshotId:'pinned',idempotencyKey:'stable'};
 const api={execute:async(op,input)=>{calls.push({op,input:{...input}});if(calls.length===1)throw Error('network');return {id:'job',projectId:input.projectId,snapshotId:input.snapshotId};}};
 await assert.rejects(()=>startSnapshotAnalysis(api,request),/network/);await startSnapshotAnalysis(api,request);
 assert.deepEqual(calls,[{op:'startAnalysis',input:request},{op:'startAnalysis',input:request}]);
});
test('reanalysis rejects unrelated job responses',async()=>{
 await assert.rejects(()=>startSnapshotAnalysis({execute:async()=>({projectId:'other',snapshotId:'other'})},{projectId:'project',snapshotId:'pinned',idempotencyKey:'key'}),/does not match/);
});


test('import refresh invalidates current and legacy project lists without touching unrelated model data',async()=>{
 const {QueryClient,QueryObserver}=require('@tanstack/react-query');
 const {refreshImportProjectLists}=require('../src/features/projects/import-workflow.ts');
 const cache=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
 const keys=[["api","projects",{}],["api","projectOverviews",{}],["projects"]];
 const observers=[];const stops=[];let reads=0;
 try {
  for(const queryKey of keys){
   cache.setQueryData(queryKey,[{id:'existing'}]);
   const observer=new QueryObserver(cache,{queryKey,queryFn:async()=>{reads++;return [{id:'existing'},{id:'created'}];},staleTime:Infinity});
   observers.push(observer);stops.push(observer.subscribe(()=>{}));
  }
  cache.setQueryData(['api','model',{modelId:'unrelated'}],{id:'unrelated'});
  await refreshImportProjectLists(cache);
  assert.equal(reads,3);
  for(const key of keys)assert.deepEqual(cache.getQueryData(key).map(p=>p.id),['existing','created']);
  assert.equal(cache.getQueryState(['api','model',{modelId:'unrelated'}]).isInvalidated,false);
 } finally {stops.forEach(stop=>stop());observers.forEach(observer=>observer.destroy());cache.clear();}
});

const {adminJobsReturnHref,summarizeJobModel}=require('../src/lib/navigation/admin-job-review.ts');
test('admin review return retains the selected job and list context',()=>{
 const target='/administration/jobs?job=job-7&search=spring+demo&status=completed&page=3';
 assert.equal(adminJobsReturnHref(new URLSearchParams({returnTo:target})),target);
});
test('admin review return rejects external and user overview destinations',()=>{
 for(const target of ['https://example.com/administration/jobs','//example.com/administration/jobs','/project-overview?project=p','/administration/jobs/other','javascript:alert(1)'])
  assert.equal(adminJobsReturnHref(new URLSearchParams({returnTo:target})),'/administration/jobs');
 assert.equal(adminJobsReturnHref(new URLSearchParams()),'/administration/jobs');
});
test('admin review return keeps only list state parameters',()=>{
 assert.equal(adminJobsReturnHref(new URLSearchParams({returnTo:'/administration/jobs?job=j&returnTo=https://example.com#x'})),'/administration/jobs?job=j');
});
test('job model summary counts services, uncertain relationships and unique attached evidence',()=>{
 const proof={id:'shared'};
 assert.deepEqual(summarizeJobModel({elements:[{elementType:'SERVICE_CONTAINER',evidence:[proof]},{elementType:'COMPONENT',evidence:[]}],edges:[{uncertain:true,evidence:[proof,{id:'other'}]},{uncertain:false,evidence:[]}]}),
 {services:1,elements:2,relationships:2,evidence:2,uncertain:1});
 assert.deepEqual(summarizeJobModel({elements:[],edges:[]}),{services:0,elements:0,relationships:0,evidence:0,uncertain:0});
});
