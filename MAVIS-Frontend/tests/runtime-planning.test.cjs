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
