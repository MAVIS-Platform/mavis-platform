const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {suggestRuntimeScenarios}=require('../src/features/runtime/scenario-suggestions.ts');
const method=(name,route,verb='Get',extra={})=>({name,endpointDeclarations:[`@${verb}Mapping("${route}")`],parameters:[],...extra});
const model=(methods,meta={})=>({elements:[{id:'svc',name:'warehouse-api',elementType:'SERVICE_CONTAINER'},{id:'ctrl',name:'InventoryController',parentId:'svc',properties:{umlClassifier:{annotations:['RestController'],members:methods,...meta}}}],edges:[]});
test('runtime drafts use actual controller prefix and Compose mapping without business placeholders',()=>{
 const result=suggestRuntimeScenarios(model([method('list','/items')],{annotations:['RequestMapping'],endpointPrefixDeclarations:['@RequestMapping("/api")']}),{serviceMappings:{inventory:'svc'},applications:{inventory:{}}});
 assert.equal(result.length,1);assert.equal(result[0].path,'/api/items');assert.equal(result[0].service,'inventory');assert.equal(result[0].selected,true);
 assert.ok(!JSON.stringify(result).includes('/payments/process'));
});
test('runtime drafts surface path values, request data and access rules instead of auto-selecting writes',()=>{
 const result=suggestRuntimeScenarios(model([method('detail','/items/{id}'),method('add','/items','Post',{parameters:[{name:'request',type:'CreateItem'}]}),method('restricted','/admin','Get',{accessDeclarations:['@PreAuthorize("hasRole(\'ADMIN\')")']})]));
 assert.ok(result.every(s=>!s.selected));assert.ok(result.find(s=>s.path.includes('{id}')).missing.includes('Path parameter values'));assert.ok(result.find(s=>s.path==='/admin').missing.some(x=>x.includes('Authentication')));
});
test('legacy class prefix metadata never becomes a runnable guessed URL',()=>{
 const result=suggestRuntimeScenarios(model([method('list','/items')],{annotations:['RequestMapping']}));assert.equal(result[0].selected,false);assert.ok(result[0].missing.some(x=>x.includes('Re-analyze')));
});
test('unresolved routes and metadata-free projects do not produce sample scenarios',()=>{
 assert.deepEqual(suggestRuntimeScenarios({elements:[],edges:[]}),[]);
 const m=model([]);m.elements[1].properties.umlClassifier.members=[{name:'list',endpointDeclarations:['@GetMapping(ROUTE)']}];assert.deepEqual(suggestRuntimeScenarios(m),[]);
});
test('duplicate declarations collapse and unknown Compose application blocks selection',()=>{
 const result=suggestRuntimeScenarios(model([method('list','/items'),method('listAgain','/items')]),{applications:{another:{}}});assert.equal(result.length,1);assert.equal(result[0].selected,false);
});

test('content types and conditions do not become endpoint paths',()=>{
 const m=model([{name:'list',parameters:[],endpointDeclarations:['@GetMapping(path = "/items", produces = "application/json", params = "active")']}],{annotations:['RequestMapping'],endpointPrefixDeclarations:['@RequestMapping(value = "/api", produces = "application/json")']});
 const result=suggestRuntimeScenarios(m);assert.equal(result.length,1);assert.equal(result[0].path,'/api/items');assert.equal(result[0].selected,false);assert.ok(result[0].missing.some(x=>x.includes('query')));
});
test('unresolved class constants do not create runnable root routes',()=>{
 const result=suggestRuntimeScenarios(model([method('list','/items')],{annotations:['RequestMapping'],endpointPrefixDeclarations:['@RequestMapping(BASE_PATH)']}));assert.ok(result.every(x=>!x.selected));
});

const {automaticRuntimeDraft,parseRuntimeEnvFile}=require('../src/features/runtime/scenario-suggestions.ts');
test('automatic runtime draft binds path and auth through env references without placing values in scenario',()=>{
 const s=suggestRuntimeScenarios(model([method('detail','/items/{id}','Get',{parameters:[{name:'id'}],accessDeclarations:['@Secured("ROLE_USER")']})]));
 const draft=automaticRuntimeDraft(s);assert.equal(draft.steps.length,1);assert.match(draft.steps[0].path,/\{\{V0\}\}/);assert.equal(draft.inputs.length,2);assert.equal(draft.steps[0].envHeaders[0].name,'Authorization');assert.ok(draft.inputs.some(i=>i.kind==='credential'));
});
test('automatic runtime drafts do not conflate IDs from different resources or require manual request editing',()=>{
 const s=suggestRuntimeScenarios(model([method('item','/items/{id}','Get',{parameters:[{name:'id'}]}),method('user','/users/{id}','Get',{parameters:[{name:'id'}]})]));
 const draft=automaticRuntimeDraft(s);assert.equal(draft.steps.length,2);assert.equal(new Set(draft.inputs.map(i=>i.name)).size,2);
});
test('automatic write draft uses JSON body reference and exposes application env inputs',()=>{
 const draft=automaticRuntimeDraft(suggestRuntimeScenarios(model([method('create','/items','Post',{parameters:[{name:'body'}]})])),{environmentBindings:{'warehouse-api':[{name:'DB_PASSWORD',reference:'DB_PASSWORD'}]}});
 assert.equal(draft.steps.length,1);assert.ok(draft.steps[0].bodyReference);assert.ok(draft.inputs.some(i=>i.kind==='json'));assert.ok(draft.inputs.some(i=>i.name==='DB_PASSWORD'));
});
test('dotenv import is literal, bounded and never executes substitutions',()=>{
 const parsed=parseRuntimeEnvFile('export API_KEY="fixture-only"\nBODY=\'{"count":3}\'\nVALUE=$(not-executed)\n# ignored');assert.equal(parsed.API_KEY,'fixture-only');assert.equal(parsed.BODY,'{"count":3}');assert.equal(parsed.VALUE,'$(not-executed)');
 assert.throws(()=>parseRuntimeEnvFile('A=one\nA=two'),/Duplicate/);assert.throws(()=>parseRuntimeEnvFile('invalid-line-with-secret'),/line 1/);assert.throws(()=>parseRuntimeEnvFile('A='+ 'x'.repeat(65536)),/size/);
});

const {toServiceEnvPrefix,boundRuntimeEnvironment,resolveRuntimeTargetModel}=require('../src/features/runtime/scenario-suggestions.ts');
test('digit-leading and special service names always produce valid uppercase environment identifiers',()=>{
 for(const raw of ['2fa-service','3scale-gateway','---','','_edge_99','a'.repeat(80)]){
  const prefix=toServiceEnvPrefix(raw);
  assert.match(prefix,/^[A-Z][A-Z0-9_]{0,31}$/);
 }
 assert.equal(toServiceEnvPrefix('2fa-service'),'SVC_2FA_SERVICE');
 const digitModel={elements:[{id:'svc2',name:'2fa-service',elementType:'SERVICE_CONTAINER'},{id:'ctrl2',name:'AuthController',parentId:'svc2',properties:{umlClassifier:{annotations:['RestController','RequestMapping'],endpointPrefixDeclarations:['@RequestMapping("/api/2fa")'],members:[method('verify','/verify/{code}','Post',{parameters:[{name:'code'},{name:'body'}],accessDeclarations:['@Secured("ROLE_USER")']})]}}}],edges:[]};
 const draft=automaticRuntimeDraft(suggestRuntimeScenarios(digitModel));
 assert.equal(draft.steps.length,1);
 assert.match(draft.steps[0].bodyReference,/^[A-Z][A-Z0-9_]{0,63}$/);
 assert.match(draft.steps[0].envHeaders[0].reference,/^[A-Z][A-Z0-9_]{0,63}$/);
 for(const [alias,ref] of Object.entries(draft.steps[0].environmentVariables)){
  assert.match(alias,/^[A-Z][A-Z0-9_]{0,63}$/);
  assert.match(ref,/^[A-Z][A-Z0-9_]{0,63}$/);
 }
});

test('boundRuntimeEnvironment filters invalid keys, oversize values and caps at 64 entries',()=>{
 const raw={invalid_lower:'1','2BAD':'1',OVERSIZE:'x'.repeat(16001)};
 for(let i=1;i<=80;i++)raw[`VALID_KEY_${i}`]=`val-${i}`;
 const bounded=boundRuntimeEnvironment(raw);
 assert.equal(Object.keys(bounded).length,64);
 assert.ok(!('invalid_lower' in bounded)&&!('2BAD' in bounded)&&!('OVERSIZE' in bounded));
 assert.equal(bounded.VALID_KEY_1,'val-1');
 assert.equal(bounded.VALID_KEY_64,'val-64');
});

test('resolveRuntimeTargetModel unwraps RUNTIME_ENRICHED references on Run #2 and keeps snapshot/model scope aligned',()=>{
 const s1='22222222-2222-4222-8222-222222222221',s2='22222222-2222-4222-8222-222222222222';
 const m1={id:'33333333-3333-4333-8333-333333333331',snapshotId:s1,revision:1,origin:'STATIC',latest:false};
 const m2Enriched={id:'33333333-3333-4333-8333-333333333332',snapshotId:s1,revision:2,origin:'RUNTIME_ENRICHED',latest:true};
 const m3StaticS2={id:'33333333-3333-4333-8333-333333333333',snapshotId:s2,revision:3,origin:'STATIC',latest:false};
 assert.equal(resolveRuntimeTargetModel([m2Enriched,m1],m2Enriched.id,null)?.id,m1.id);
 assert.equal(resolveRuntimeTargetModel([m2Enriched,m1],null,m2Enriched.id)?.id,m1.id);
 assert.equal(resolveRuntimeTargetModel([m2Enriched,m1],null,null)?.id,m1.id);
 assert.equal(resolveRuntimeTargetModel([m3StaticS2,m2Enriched,m1],m2Enriched.id,null)?.id,m1.id);
 const pickedS2=resolveRuntimeTargetModel([m3StaticS2,m2Enriched,m1],m3StaticS2.id,m1.id);
 assert.equal(pickedS2?.id,m3StaticS2.id);
 assert.equal(pickedS2?.snapshotId,s2);
});

test('observed runtime uses the selected session model and exposes partial trace evidence', () => {
  const backend = fs.readFileSync(path.join(__dirname, '../src/features/runtime/backend.tsx'), 'utf8');
  assert.match(backend, /const targetModelId =\s*session\.data\?\.modelId \|\|\s*storedDraft\.modelId/);
  assert.match(backend, /observed && session\.data\?\.traceStatus\?\.toUpperCase\(\) === "PARTIAL"/);
});
