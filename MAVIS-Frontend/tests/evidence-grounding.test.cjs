const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(module,file)=>{
 const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 module._compile(output.replace(/require\(["']@\/([^"']+)["']\)/g,(_,name)=>'require('+JSON.stringify(path.join(root,'src',name))+')'),file);
};
const projections=require('../src/features/architecture/diagram-projections.ts');
const {selectDiagram}=require('../src/features/architecture/diagram-catalog.ts');
const {collectConcreteThreeEEvidences,buildThreeEAiContext,buildDeterministicThreeESimplified}=require('../src/features/architecture/three-e-content.ts');
const {normalizeThreeE,normalizeC4}=require('../src/lib/ai/evidence-grounding.ts');
const element=(id,kind,name=id,parentId=null)=>({id,name,elementType:kind,parentId,description:'',layer:'unclassified',evidence:[],properties:parentId?{responsibility:'Exposes HTTP endpoints'}:{}});
const edge=(id,from,to,protocol='SERVICE_HTTP_CALL',originLayer='STATIC',properties={})=>({id,from,to,protocol,originLayer,properties,evidence:[],uncertain:false});
function fixture(){return{id:'audit-model',projectId:'audit-project',snapshotId:'source',revision:1,label:'Audit',elements:[...['employee','department','organization','gateway','config','discovery','zipkin'].map(id=>element(id,'SERVICE_CONTAINER')),...['employee','department','organization'].map(id=>element(id+'-controller','COMPONENT',id[0].toUpperCase()+id.slice(1)+'Controller',id))],edges:[edge('e1','organization','department'),edge('e2','organization','employee'),edge('e3','department','employee')]};}
function subject(model,node=model.elements[0],relationship=null){return{activeTargetId:relationship?.id??node.id,scopeKey:'selection',subject:{node:relationship?null:node,edge:relationship,title:relationship?.id??node.name,type:relationship?.protocol??node.elementType,summary:'Declared model element',connections:model.edges.filter(e=>e.from===node.id||e.to===node.id)}};}

test('C4 context does not invent people or business purpose from controllers',()=>{
 const model=fixture();const result=projections.deriveC4ContextModel(model);
 assert.deepEqual(result.persons,[]);assert.doesNotMatch(result.systemDescription,/encapsulating|food orders/);
 const xml=projections.buildContextDiagramDrawioXml(model,'Organization demo');
 assert.doesNotMatch(xml,/Employee User|Department User|Organization User|Application User|NaN|Infinity/);
 assert.match(xml,/not established|unknown/);
});
test('Container retains all seven recognized services including isolated infrastructure',()=>{
 const document=selectDiagram(fixture(),'CONTAINER').document;
 const services=document.layoutJson.nodes.filter(n=>n.kind==='SERVICE_CONTAINER').map(n=>n.name);
 assert.equal(services.length,7);for(const name of ['gateway','config','discovery','zipkin'])assert.ok(services.includes(name));
 assert.equal(document.layoutJson.edges.length,3);assert.ok(document.projection.excludedNodes.every(n=>n.id.endsWith('-controller')));
});
test('Only explicit actors and actual context relationships may be drawn',()=>{
 const model=fixture();model.elements.push(element('actor','PERSON','Confirmed operator'),element('unconnected','EXTERNAL_SYSTEM','Unconnected external'));
 assert.equal(projections.deriveC4ContextModel(model).persons.length,0);
 model.edges.push(edge('uses','actor','gateway','USES_API'));
 const context=projections.deriveC4ContextModel(model);assert.deepEqual(context.persons.map(p=>p.name),['Confirmed operator']);assert.equal(context.externals.length,0);
});
test('Configuration stays typed and startup links do not become business HTTP calls',()=>{
 const model=fixture();model.edges.push(edge('config','employee','config','CONFIGURATION_DEPENDENCY','CONFIG'),edge('trace','employee','zipkin','TRACING_EXPORT','CONFIG',{profile:'docker'}),edge('link','employee','discovery','DECLARED_LINK','DEPLOYMENT'));
 const doc=selectDiagram(model,'CONTAINER').document;
 assert.ok(doc.layoutJson.edges.some(e=>e.type==='CONFIGURATION_DEPENDENCY'));
 assert.ok(doc.layoutJson.edges.some(e=>e.type==='TRACING_EXPORT'));
 assert.ok(!doc.layoutJson.edges.some(e=>e.type==='DECLARED_LINK'));
 assert.equal(doc.projection.excludedEdges.filter(e=>e.id==='link').length,1);
});
test('Metadata previews cannot masquerade as literal implementation evidence',()=>{
 const model=fixture(),ctx=subject(model,model.elements[0],edge('db','employee','config','DATABASE_ACCESS'));
 const preview=collectConcreteThreeEEvidences(model,ctx);
 assert.ok(preview.length);assert.ok(preview.every(item=>item.origin==='preview'&&!item.complete));
 assert.doesNotMatch(preview[0].snippet,/jdbc:mysql|JpaRepository|restTemplate|HttpMethod.POST/);
 const payload=buildThreeEAiContext(model,ctx,preview,[]);assert.deepEqual(payload.codeSnippets,[]);
 const response=normalizeThreeE({explainSimple:'The service validates payments and writes MySQL'},payload);
 assert.equal(response.grounding.status,'MODEL_ONLY');assert.doesNotMatch(response.explainSimple,/validates payments|MySQL/);
 assert.doesNotMatch(buildDeterministicThreeESimplified(model,ctx,preview,[]).evaluateSimple,/well-bounded|conform/);
});
test('Grounding keeps only supplied snippet IDs and invalidates cache when evidence changes',()=>{
 const model=fixture(),ctx=subject(model);
 const evidence={id:'saved-1',kind:'source',origin:'persisted',sourceType:'STATIC_CODE',location:'Employee.java:12',snippet:'return employeeRepository.findAll();',complete:false};
 const first=buildThreeEAiContext(model,ctx,[evidence],[]),second=buildThreeEAiContext(model,ctx,[{...evidence,snippet:'return List.of();'}],[]);
 assert.notEqual(first.contextHash,second.contextHash);
 const response=normalizeThreeE({snippetNotes:{'saved-1':'Delegates to repository','invented':'Invented fact'},assumptions:['Caching might help'],unknowns:['Runtime load']},first);
 assert.deepEqual(Object.keys(response.snippetNotes),['saved-1']);assert.equal(response.grounding.status,'PARTIAL_SOURCE');assert.equal(response.assumptions.length,1);
});
test('C4 AI cannot create actors, invent a business purpose, or annotate unsupported nodes',()=>{
 const context={astSkeleton:'class EmployeeController {}',nodes:[{id:'supported',hasSourceEvidence:true},{id:'metadata-only',hasSourceEvidence:false}]};
 const output=normalizeC4({persons:{invented:{name:'Employee User'}},systemDescription:'Banking system',nodeDescriptions:{supported:'Exposes employee endpoints','metadata-only':'Validates employees',invented:'Invented'}},context);
 assert.deepEqual(output,{nodeDescriptions:{supported:'Exposes employee endpoints'}});
 assert.deepEqual(normalizeC4({persons:{user:{name:'User'}}},{...context,astSkeleton:''}),{});
});
test('AI routes do not call an LLM without literal source evidence',async t=>{
 const {NextRequest}=require('next/server');const {POST}=require('../app/api/ai-diagram-semantics/route.ts');let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('Unexpected LLM request');});
 const context=buildThreeEAiContext(fixture(),subject(fixture()),[],[]);
 const response=await POST(new NextRequest('http://local/api/ai-diagram-semantics',{method:'POST',body:JSON.stringify({threeEContext:context,threeEFallback:{explainSimple:'Invented behavior'}})}));
 const data=await response.json();assert.equal(data.threeEEnrichment.grounding.status,'MODEL_ONLY');assert.doesNotMatch(data.threeEEnrichment.explainSimple,/Invented behavior/);
 const c4=await POST(new NextRequest('http://local/api/ai-diagram-semantics',{method:'POST',body:JSON.stringify({c4Context:{contextHash:'empty-evidence',astSkeleton:'',nodes:[]}})}));
 assert.deepEqual((await c4.json()).c4Enrichment,{});assert.equal(calls,0);
});

test('Sequence dependency edges cannot establish guards returns causality or business order',()=>{
 const {detectSequenceFlows,buildAutoSequenceInteraction,synthesizeAiSequenceEnrichment,interactionDocumentSchema}=require('../src/features/architecture/scenario-design.ts');
 const model=fixture();
 const flows=detectSequenceFlows(model,{level:'MACRO'});assert.ok(flows.length);
 for(const flow of flows){
  const hints=synthesizeAiSequenceEnrichment(model,flow);assert.equal(hints.hasAlt,false);assert.equal(hints.hasLoop,false);
  const doc=buildAutoSequenceInteraction(model,flow,{hasAlt:true,altGuard:'department == valid',altElseLabel:'return invalid / error',hasLoop:true,stepLabels:{0:'validateDepartment()'}});
  assert.equal(doc.semanticStatus,'PARTIAL');assert.equal(doc.executions.length,0);
  assert.ok(doc.messages.every(message=>message.endpointKind==='COMPLETE'&&!message.replyToMessageId&&!message.causalParentMessageIds.length));
  assert.ok(doc.fragments.every(fragment=>fragment.operator==='strict'&&fragment.operands[0].messageIds.length===1));
  assert.doesNotMatch(JSON.stringify(doc),/department == valid|return invalid \/ error|validateDepartment\(\)/);
  for(const message of doc.messages){
   const declaration=model.edges.find(edge=>message.sourceRelationshipIds.includes(edge.id));assert.ok(declaration);
   assert.equal(message.fromParticipantId,'part:'+declaration.from);assert.equal(message.toParticipantId,'part:'+declaration.to);
  }
 }
});
test('Activity prioritizes method CFG and labels graph-only candidates as unverified illustrations',()=>{
 const {listActivityOperations,projectUmlActivityDiagram}=require('../src/features/architecture/uml-diagrams.ts');
 const model=fixture();
 model.elements.push(element('method','COMPONENT','DepartmentController','department'));
 model.elements.at(-1).properties.umlClassifier={name:'DepartmentController',typeKind:'CLASS',methodsCfg:[{methodName:'findByOrganizationWithEmployees',signatureKey:'findByOrganizationWithEmployees(Long)',nodes:[{id:'start',kind:'INITIAL',label:'Start'},{id:'end',kind:'ACTIVITY_FINAL',label:'End'}],edges:[{id:'done',from:'start',to:'end',flowKind:'CONTROL_FLOW'}]}]};
 const options=listActivityOperations(model);assert.ok(options[0].operationId.startsWith('method::'));
 const projection=projectUmlActivityDiagram(model);assert.equal(projection.selectedOperationId,options[0].operationId);
 const graphOnly=listActivityOperations(fixture());assert.ok(graphOnly.length);
 assert.ok(graphOnly.every(option=>option.extractionCompleteness==='PARTIAL'&&option.methodName.includes('Unverified dependency illustration')));
 const illustrative=projectUmlActivityDiagram(fixture());assert.equal(illustrative.extractionCompleteness,'PARTIAL');
 assert.ok(illustrative.nodes.some(node=>node.kind==='ACTIVITY_FINAL'));
 assert.ok(!illustrative.nodes.some(node=>/Receive request \/ message/.test(node.label)));
});
test('Activity prioritizes API entry points and hides technical builder and configuration methods',()=>{
 const {listActivityOperations,projectUmlActivityDiagram}=require('../src/features/architecture/uml-diagrams.ts');
 const model=fixture();
 const add=(id,name,annotations,method)=>{
  const item=element(id,'COMPONENT',name,'department');
  item.properties.umlClassifier={name,typeKind:'CLASS',annotations,methodsCfg:[{methodName:method,signatureKey:method+'()',nodes:[{id:'start',kind:'INITIAL',label:'Start'},{id:'end',kind:'ACTIVITY_FINAL',label:'End'}],edges:[{id:'done',from:'start',to:'end',flowKind:'CONTROL_FLOW'}]}]};
  model.elements.push(item);
 };
 add('builder','PetDetailsBuilder',[],'id');
 add('config','MetricConfig',[],'metricsCommonTags');
 add('service','OrderService',[],'createOrder');
 add('api','OwnerResource',['RestController'],'createOwner');
 const options=listActivityOperations(model);
 assert.equal(options[0].operationId,'api::createOwner()');
 assert.equal(projectUmlActivityDiagram(model).selectedOperationId,options[0].operationId);
 assert.ok(options.some(option=>option.operationId==='service::createOrder()'));
 assert.ok(!options.some(option=>['builder','config'].includes(option.classifierId)));
 assert.ok(options.some(option=>option.methodName.includes('Unverified dependency illustration')));
});
test('Deployment selects a populated environment and falls back safely when selection disappears',()=>{
 const {projectUmlDeploymentDiagram}=require('../src/features/architecture/uml-diagrams.ts');
 const model=fixture();
 model.elements[0].properties={deploymentMetadata:{environment:'prod',image:'example:latest'}};
 const prod=projectUmlDeploymentDiagram(model);
 assert.equal(prod.environment,'prod');
 assert.ok(prod.nodes.some(node=>node.modelElementId===model.elements[0].id));
 assert.deepEqual(prod.availableEnvironments,['prod']);
 assert.equal(projectUmlDeploymentDiagram(model,{environment:'missing'}).environment,'prod');
 const empty=projectUmlDeploymentDiagram({...model,elements:[]});
 assert.equal(empty.environment,'default');
});
test('Class and Package keep local clients and same-named models in their service scope',()=>{
 const {projectUmlClassDiagram,projectUmlPackageDiagram}=require('../src/features/architecture/uml-diagrams.ts');
 const model=fixture();
 for(const svc of ['department','organization'])for(const [name,packageName,kind] of [['EmployeeClient','client','INTERFACE'],['Employee','model','CLASS']]){
  const item=element(svc+'-'+name,'CLASS_INTERFACE',name,svc);
  item.properties={qualifiedName:'demo.'+svc+'.'+packageName+'.'+name,packageName:'demo.'+svc+'.'+packageName,typeKind:kind};model.elements.push(item);
 }
 model.edges.push(edge('client-http','department-EmployeeClient','employee'));
 const classView=projectUmlClassDiagram(model,{serviceId:'department'});
 assert.ok(classView.classifiers.some(item=>item.classifierId==='department-EmployeeClient'));
 assert.ok(classView.classifiers.some(item=>item.classifierId==='department-Employee'));
 assert.ok(!classView.classifiers.some(item=>item.classifierId==='organization-Employee'));
 const packages=projectUmlPackageDiagram(model);assert.ok(packages.packages.some(item=>item.qualifiedName==='demo.department.client'));
 assert.ok(packages.packages.some(item=>item.qualifiedName==='demo.organization.model'));
 assert.ok(packages.edges.every(item=>!item.underlyingEdgeIds.includes('client-http')));
});
test('Deployment retains configuration semantics and distinguishes declared image and container ports',()=>{
 const {projectUmlDeploymentDiagram,buildUmlDrawioXml}=require('../src/features/architecture/uml-diagrams.ts');
 const model=fixture();
 for(const item of model.elements.filter(item=>item.elementType==='SERVICE_CONTAINER'))item.properties={deploymentMetadata:{environment:'docker',image:item.name+':1.0',ports:['8080'],composeFilePath:'docker-compose.yml'}};
 model.edges.push(edge('cfg','employee','config','CONFIGURATION_DEPENDENCY','CONFIG'),edge('registry','employee','discovery','SERVICE_DISCOVERY','CONFIG'),edge('trace','employee','zipkin','TRACING_EXPORT','CONFIG'),edge('route','gateway','employee','GATEWAY_ROUTE','CONFIG'));
 const deployment=projectUmlDeploymentDiagram(model,{environment:'docker'});
 for(const id of ['cfg','registry','trace','route'])assert.ok(deployment.edges.some(item=>item.sourceRelationshipId===id),'Missing configuration edge '+id);
 assert.ok(deployment.validationIssues.some(item=>item.code==='DECLARED_DEPLOYMENT_NOT_RUNTIME'));
 const xml=buildUmlDrawioXml(deployment);assert.match(xml,/host dynamically assigned/);assert.match(xml,/CONFIGURATION_DEPENDENCY/);
});