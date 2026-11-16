const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');for(const ext of ['.ts','.tsx'])require.extensions[ext]=(module,file)=>{const out=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;module._compile(out.replace(/require\(["']@\/([^"']+)["']\)/g,(_,name)=>'require('+JSON.stringify(path.join(root,'src',name))+')'),file);};
const {detectSequenceFlows,buildAutoSequenceInteraction,validateInteractionDocument}=require('../src/features/architecture/scenario-design.ts');
const {savedUmlCoversSource}=require('../src/features/architecture/uml-source-coverage.ts');
const node=(id,name,parentId=null,properties={})=>({id,name,parentId,elementType:parentId?'COMPONENT':'SERVICE_CONTAINER',description:'',layer:'unclassified',evidence:[],properties});
const cfg=(name,path,calls)=>({methodName:name,signature:name+'(Long)',endpointDeclarations:['@GetMapping("'+path+'")'],calls,nodes:[]});
const call=(receiver,type,name,loops=[])=>({receiver,receiverType:type,methodName:name,arguments:'[id]',line:30,loopConditions:loops});
function fixture(){return{id:'method-model',projectId:'p',snapshotId:'s',revision:1,label:'Organization APIs',elements:[node('org','organization-service'),node('dep','department-service'),node('emp','employee-service'),node('oc','OrganizationController','org',{umlClassifier:{methodsCfg:[cfg('withDepartments','/departments',[call('departmentClient','DepartmentClient','findDepartments')]),cfg('withEmployees','/employees',[call('employeeClient','EmployeeClient','findEmployees')])]}}),node('dc','DepartmentClient','org',{targetService:'department-service',umlClassifier:{members:[{name:'findDepartments',endpointDeclarations:['@GetMapping("/organization/{id}/with-employees")']}]}}),node('ec','EmployeeClient','org',{targetService:'employee-service',umlClassifier:{members:[{name:'findEmployees',endpointDeclarations:['@GetMapping("/organization/{id}")']}]}}),node('dp','DepartmentController','dep',{umlClassifier:{methodsCfg:[cfg('findDepartments','/organization/{id}/with-employees',[call('repository','DepartmentRepository','findByOrganization'),call('employeeClient','EmployeeClient','findByDepartment',['each department in departments'])])]}}),node('dr','DepartmentRepository','dep',{umlClassifier:{methodsCfg:[]}}),node('de','EmployeeClient','dep',{targetService:'employee-service',umlClassifier:{members:[{name:'findByDepartment',endpointDeclarations:['@GetMapping("/department/{id}")']}]}}),node('ep','EmployeeController','emp',{umlClassifier:{methodsCfg:[cfg('findByDepartment','/department/{id}',[call('repository','EmployeeRepository','findByDepartment')]),cfg('findEmployees','/organization/{id}',[call('repository','EmployeeRepository','findByOrganization')])]}}),node('er','EmployeeRepository','emp',{umlClassifier:{methodsCfg:[]}})],edges:[]};}

test('Source endpoint sequences keep different Organization endpoints separate and preserve the department loop',()=>{
 const model=fixture(),flows=detectSequenceFlows(model,{level:'MICRO',serviceId:'org'});
 const departments=flows.find(flow=>flow.sourceMethod&&flow.title.includes('withDepartments'));
 const employees=flows.find(flow=>flow.sourceMethod&&flow.title.includes('withEmployees'));
 assert.ok(departments);assert.ok(employees);
 const doc=buildAutoSequenceInteraction(model,departments),other=buildAutoSequenceInteraction(model,employees);
 assert.ok(doc.messages.some(message=>message.label.includes('repository.findByOrganization')));
 assert.ok(doc.messages.some(message=>message.label.includes('employeeClient.findByDepartment')));
 assert.ok(!doc.messages.some(message=>message.label.includes('employeeClient.findEmployees')));
 assert.ok(!other.messages.some(message=>message.label.includes('departmentClient')));
 assert.equal(doc.fragments.length,1);assert.equal(doc.fragments[0].operator,'loop');assert.match(doc.fragments[0].operands[0].guard,/each department/);
 assert.equal(doc.semanticStatus,'PARTIAL');assert.ok(!doc.messages.some(message=>message.replyToMessageId));
 assert.equal(validateInteractionDocument(doc,model).valid,true);
});
test('Feign expansion requires a unique exact endpoint match and never guesses from a service edge',()=>{
 const model=fixture();model.elements.find(node=>node.id==='dc').properties.umlClassifier.members[0].endpointDeclarations=['@GetMapping("/different")'];
 const flow=detectSequenceFlows(model,{level:'MICRO',serviceId:'org'}).find(flow=>flow.sourceMethod&&flow.title.includes('withDepartments'));
 const doc=buildAutoSequenceInteraction(model,flow);
 assert.equal(doc.messages.length,1);assert.ok(doc.limitations.some(text=>text.includes('FEIGN_TARGET_METHOD_UNRESOLVED')));
});
test('Dependency-only previews never use strict fragments or synthesize source method messages',()=>{
 const model=fixture();const flow={flowId:'dependency',viewId:'dependency',level:'MACRO',serviceId:'org',serviceName:'organization-service',title:'Dependencies',description:'',participantElementIds:['org','dep'],steps:[{fromElementId:'org',toElementId:'dep',label:'relationship',messageSort:'UNKNOWN',sourceRelationshipIds:[],evidenceIds:[]}]};
 const doc=buildAutoSequenceInteraction(model,flow);assert.equal(doc.fragments.length,0);assert.ok(doc.limitations.includes('DEPENDENCY_ONLY_NOT_AN_EXECUTION_TRACE'));
});
test('Saved UML layouts cannot mask newly extracted client or model nodes',()=>{
 const projection={diagramKind:'UML_CLASS',classifiers:[{classifierId:'controller-id',provenance:'EXTRACTED'},{classifierId:'client-id',provenance:'EXTRACTED'},{classifierId:'model-id',provenance:'EXTRACTED'}]};
 assert.equal(savedUmlCoversSource('<xml id="controller-id"/>',projection),false);
 assert.equal(savedUmlCoversSource('<xml id="controller-id client-id model-id"/>',projection),true);
});
test('Source-backed API context is useful without inventing human actors',()=>{
 const {deriveC4ContextModel}=require('../src/features/architecture/diagram-projections.ts');const model=fixture();const context=deriveC4ContextModel(model);
 assert.equal(context.persons.length,0);assert.match(context.systemDescription,/HTTP APIs declared by/);assert.match(context.systemDescription,/OrganizationController/);assert.doesNotMatch(context.systemDescription,/Employee User/);
});

test('Long RequestMapping annotations keep full source metadata but no longer break sequence rendering',()=>{
 const {interactionToDrawioXml}=require('../src/features/architecture/scenario-design.ts');
 const model=fixture(),controller=model.elements.find(n=>n.id==='oc');
 controller.name='DeliveryServiceController';
 const method=controller.properties.umlClassifier.methodsCfg[0];
 method.methodName='updateCourierLocation';
 method.endpointDeclarations=['@RequestMapping(path = "/couriers/{courierId}/availability", method = RequestMethod.POST)'];
 const flow=detectSequenceFlows(model,{level:'MACRO'}).find(f=>f.sourceMethod?.classifierId==='oc');
 assert.ok(flow.title.length<=120);assert.ok(!flow.title.includes('@RequestMapping'));
 assert.ok(flow.description.includes(method.endpointDeclarations[0]));
 const doc=buildAutoSequenceInteraction(model,flow);
 assert.ok(doc.messages.length>0);assert.doesNotThrow(()=>interactionToDrawioXml(doc,model));
 controller.name='ExtremelyLongControllerName'.repeat(8);
 const longFlow=detectSequenceFlows(model,{level:'MACRO'}).find(f=>f.sourceMethod?.classifierId==='oc');
 assert.ok(longFlow.title.length<=120);assert.ok(longFlow.description.includes(controller.name));
});

test('Sequence candidates and dependency references are separate without losing service scope',()=>{
 const {partitionSequenceFlows}=require('../src/features/architecture/sequence-preview.ts');
 const model=fixture();model.edges=[{id:'dep',from:'org',to:'dep',protocol:'SERVICE_HTTP_CALL',evidence:[]}];
 const flows=detectSequenceFlows(model,{level:'MACRO'}),groups=partitionSequenceFlows(flows);
 assert.ok(groups.sequences.length>0);assert.ok(groups.dependencies.length>0);
 assert.ok(groups.sequences.every(f=>f.sourceMethod));assert.ok(groups.dependencies.every(f=>!f.sourceMethod));
 assert.equal(groups.sequences.length+groups.dependencies.length,flows.length);
});

test('Sequence preview reports renderer validation failures and unresolved calls explicitly',()=>{
 const {renderSequencePreview}=require('../src/features/architecture/sequence-preview.ts');
 const model=fixture(),flow=detectSequenceFlows(model,{level:'MACRO'}).find(f=>f.sourceMethod);
 const doc=buildAutoSequenceInteraction(model,flow);
 assert.ok(renderSequencePreview(doc,model).xml.includes('mxGraphModel'));
 const invalid=renderSequencePreview({...doc,name:'x'.repeat(121)},model);
 assert.equal(invalid.xml,'');assert.match(invalid.error,/name:.*120/);
 const empty=renderSequencePreview({...doc,messages:[]},model);
 assert.equal(empty.xml,'');assert.match(empty.empty,/does not mean the service has no behavior/);
 assert.equal(renderSequencePreview(null,model).error,'');
});

test('Duplicate dependency declarations merge exact canonical endpoints, retaining all evidence and distinct same-name targets',()=>{
 const model=fixture();model.elements.push(node('different-dep','department-service'));
 model.edges=[{id:'e1',from:'org',to:'dep',protocol:'CODE_DEPENDENCY',evidence:[]},
 {id:'e2',from:'org',to:'dep',protocol:'CODE_DEPENDENCY',evidence:[]},
 {id:'e3',from:'org',to:'different-dep',protocol:'CODE_DEPENDENCY',evidence:[]}];
 const step=(to,id,ev)=>({fromElementId:'org',toElementId:to,label:'Dependency',messageSort:'UNKNOWN',sourceRelationshipIds:[id],evidenceIds:[ev]});
 const flow={flowId:'d',viewId:'d',level:'MACRO',serviceId:'org',serviceName:'organization-service',title:'Dependencies',description:'',participantElementIds:['org','dep','different-dep'],steps:[step('dep','e1','ev1'),step('dep','e2','ev2'),step('different-dep','e3','ev3')]};
 const before=JSON.stringify(flow),doc=buildAutoSequenceInteraction(model,flow);
 assert.equal(doc.messages.length,2);assert.deepEqual(doc.messages[0].sourceRelationshipIds,['e1','e2']);
 assert.deepEqual(doc.messages[0].evidenceIds,['ev1','ev2']);assert.equal(doc.messages[0].label,'Code dependency');
 assert.notEqual(doc.messages[0].toParticipantId,doc.messages[1].toParticipantId);assert.equal(JSON.stringify(flow),before);
 assert.ok(doc.limitations.includes('DEPENDENCY_ONLY_NOT_AN_EXECUTION_TRACE'));
});


function activitySourceFixture() {
 const cfg=(name,action,calls=[],endpoint=false)=>({methodName:name,signature:name+'()',endpointDeclarations:endpoint?['@PostMapping("/orders")']:[],calls,
  nodes:[{id:name+'-start',kind:'INITIAL',label:'Start',line:1},{id:name+'-decision',kind:'DECISION',label:'valid?',line:2},
   {id:name+'-action',kind:'ACTION',label:action,line:10},{id:name+'-end',kind:'ACTIVITY_FINAL',label:'End',line:20}],
  edges:[{id:name+'-e1',from:name+'-start',to:name+'-decision'}, {id:name+'-e2',from:name+'-decision',to:name+'-action',guard:'[valid]'},
   {id:name+'-e3',from:name+'-decision',to:name+'-end',guard:'[invalid]'}, {id:name+'-e4',from:name+'-action',to:name+'-end'}]});
 const call={receiver:'orderService',receiverType:'OrderService',methodName:'createOrder',line:10};
 return {id:'activity-source',projectId:'p',snapshotId:'s',revision:1,label:'Source workflow',elements:[
 node('svc','order-service'),
 node('controller','OrderController','svc',{umlClassifier:{annotations:['RestController'],methodsCfg:[cfg('create','return orderService.createOrder()', [call],true),cfg('getOrder','return orderService.createOrder()', [call],true)]}}),
 node('service','OrderService','svc',{umlClassifier:{annotations:['Service'],methodsCfg:[cfg('createOrder','return saveOrder()')]}}),
 node('config','OrderWebConfiguration','svc',{umlClassifier:{annotations:['Configuration'],methodsCfg:[cfg('objectMapper','return new ObjectMapper()')]}}),
 node('builder','OrderBuilder','svc',{umlClassifier:{methodsCfg:[cfg('build','return new Order()')]}}),
 ],edges:[]};
}

test('Activity default list excludes configuration/builders and retains getter-named HTTP endpoints',()=>{
 const {listActivityOperations}=require('../src/features/architecture/uml-diagrams.ts');const model=activitySourceFixture();
 const standard=listActivityOperations(model);assert.ok(!standard.some(op=>op.methodName==='objectMapper'||op.methodName==='build'));
 assert.ok(standard.some(op=>op.methodName==='getOrder'));
 assert.ok(listActivityOperations(model,{includeTechnical:true}).some(op=>op.methodName==='objectMapper'));
});

test('Source Activity workflow expands exact callee CFG into responsibility lanes and preserves root/callee branch guards',()=>{
 const {projectUmlActivityDiagram,validateActivityStructure}=require('../src/features/architecture/uml-diagrams.ts');const model=activitySourceFixture(),before=JSON.stringify(model);
 const method=projectUmlActivityDiagram(model,{operationId:'controller::create()'});
 const workflow=projectUmlActivityDiagram(model,{operationId:'workflow:controller::create()'});
 assert.equal(method.partitions.length,1);assert.equal(workflow.partitions.length,2);
 assert.ok(workflow.partitions.some(p=>p.name.includes('OrderController')));assert.ok(workflow.partitions.some(p=>p.name.includes('OrderService')));
 assert.equal(workflow.edges.filter(e=>e.guard==='[valid]').length,2);assert.equal(workflow.edges.filter(e=>e.guard==='[invalid]').length,2);
 assert.equal(workflow.nodes.filter(n=>n.kind==='INITIAL').length,1);assert.equal(workflow.nodes.filter(n=>n.kind==='ACTIVITY_FINAL').length,1);
 assert.ok(workflow.nodes.some(n=>n.label==='return saveOrder()'));assert.ok(workflow.nodes.length>method.nodes.length);
 assert.equal(validateActivityStructure(workflow.nodes,workflow.edges).filter(i=>i.severity==='ERROR').length,0);
 assert.equal(JSON.stringify(model),before);
});

test('Ambiguous receivers and unavailable workflow entries remain explicit instead of fabricating swimlanes',()=>{
 const {projectUmlActivityDiagram}=require('../src/features/architecture/uml-diagrams.ts');const model=activitySourceFixture();
 model.elements.push({...model.elements.find(n=>n.id==='service'),id:'duplicate-service-class'});
 const projected=projectUmlActivityDiagram(model,{operationId:'workflow:controller::create()'});
 assert.equal(projected.partitions.length,1);assert.equal(projected.extractionCompleteness,'PARTIAL');
 assert.ok(projected.unsupportedConstructs.some(s=>s.includes('ambiguous receiver')));
 const unavailable=projectUmlActivityDiagram(model,{operationId:'workflow:none'});assert.equal(unavailable.nodes.length,0);
 const technical=projectUmlActivityDiagram(model,{operationId:'config::objectMapper()',includeTechnical:true});
 assert.equal(technical.selectedOperationId,'config::objectMapper()');assert.ok(technical.nodes.length>0);
});


test('Source workflow crosses a service boundary only for a unique exact Feign endpoint',()=>{
 const {projectUmlActivityDiagram}=require('../src/features/architecture/uml-diagrams.ts');const model=activitySourceFixture();
 const client=model.elements.find(n=>n.id==='service');client.properties={targetService:'payment-service',umlClassifier:{methodsCfg:[],members:[{name:'createOrder',endpointDeclarations:['@PostMapping("/orders")']}]}};
 model.elements.push(node('remote-svc','payment-service'),node('remote-controller','PaymentController','remote-svc',{umlClassifier:{annotations:['RestController'],methodsCfg:[{...model.elements.find(n=>n.id==='controller').properties.umlClassifier.methodsCfg[0],calls:[],methodName:'accept',signature:'accept()'}]}}));
 const op='workflow:controller::create()';const projected=projectUmlActivityDiagram(model,{operationId:op});
 assert.equal(projected.partitions.length,2);assert.ok(projected.partitions.some(p=>p.serviceId==='remote-svc'));
 assert.ok(projected.nodes.some(n=>n.partitionName.includes('PaymentController')));
 client.properties.umlClassifier.members[0].endpointDeclarations=['@PostMapping("/different")'];
 const unmatched=projectUmlActivityDiagram(model,{operationId:op});assert.equal(unmatched.partitions.length,1);
 assert.ok(unmatched.unsupportedConstructs.some(s=>s.includes('exact remote endpoint')));
});

test('Source workflow preserves authored overlays only in their exact operation scope',()=>{
 const {projectUmlActivityDiagram}=require('../src/features/architecture/uml-diagrams.ts');const model=activitySourceFixture();
 const operationId='workflow:controller::create()';
 const overlay={operationId,designedNodes:[{nodeId:'authored-note',kind:'OBJECT_NODE',label:'Review note',partitionId:'partition:review',partitionName:'Reviewer',objectState:null,joinSpec:null,provenance:'DESIGNED'}],designedEdges:[]};
 const same=projectUmlActivityDiagram(model,{operationId,overlay});assert.ok(same.nodes.some(n=>n.nodeId==='authored-note'));
 assert.ok(same.partitions.some(p=>p.partitionId==='partition:review'));
 const other=projectUmlActivityDiagram(model,{operationId:'workflow:controller::getOrder()',overlay});assert.ok(!other.nodes.some(n=>n.nodeId==='authored-note'));
});


test('Expanded source Activity keeps partitions and CFG edges through XML save/hydrate cycles',()=>{
 const {projectUmlActivityDiagram,buildUmlDrawioXml,hydrateUmlWorkspaceFromXml}=require('../src/features/architecture/uml-diagrams.ts');
 const model=activitySourceFixture(),operationId='workflow:controller::create()';
 const baseline=projectUmlActivityDiagram(model,{operationId});let current=baseline;
 for(let cycle=0;cycle<3;cycle++) {
  const xml=buildUmlDrawioXml(current);const hydrated=hydrateUmlWorkspaceFromXml(xml,model,{diagramKind:'UML_ACTIVITY',selectedOperationId:operationId});
  assert.equal(hydrated.conflicts.length,0,JSON.stringify(hydrated.conflicts));
  current=projectUmlActivityDiagram(model,{operationId,overlay:hydrated.activityOverlay});
  assert.equal(current.nodes.length,baseline.nodes.length);assert.equal(current.edges.length,baseline.edges.length);
  assert.deepEqual(current.partitions,baseline.partitions);
 }
});

test('Recursive source Activity calls stop without losing a valid caller CFG',()=>{
 const {projectUmlActivityDiagram,validateActivityStructure}=require('../src/features/architecture/uml-diagrams.ts');const model=activitySourceFixture();
 const cfg=model.elements.find(n=>n.id==='service').properties.umlClassifier.methodsCfg[0];
 cfg.calls=[{receiver:'this',receiverType:'OrderService',methodName:'createOrder',line:10}];cfg.nodes.find(n=>n.kind==='ACTION').label='return this.createOrder()';
 const projected=projectUmlActivityDiagram(model,{operationId:'workflow:controller::create()'});
 assert.ok(projected.unsupportedConstructs.some(s=>s.includes('Recursive')));assert.equal(projected.extractionCompleteness,'PARTIAL');
 assert.equal(validateActivityStructure(projected.nodes,projected.edges).filter(i=>i.severity==='ERROR').length,0);
});

const {resolveReceiver,resolveCalledMethods}=require('../src/features/architecture/source-call-resolution.ts');
test('BE calls prefer exact qualified receiver and never bind a foreign same-named class',()=>{
 const owner={id:'controller',parentId:'service',name:'Controller'};
 const node=(id,q,parentId='service')=>({id,parentId,name:'Repository',properties:{umlClassifier:{qualifiedName:q}}});
 const model={elements:[owner,node('a','a.Repository'),node('b','b.Repository'),node('foreign','a.Repository','other-service')]};
 assert.deepEqual(resolveReceiver(model,owner,'a.Repository').map(n=>n.id),['a']);
 assert.deepEqual(resolveReceiver(model,owner,'missing.Repository'),[]);
 assert.equal(resolveReceiver(model,owner,'Repository').length,2);
});
test('BE overload resolution uses arity and typed AST arguments; unknown types remain ambiguous',()=>{
 const methods=[{methodName:'save',signature:'save()'},{methodName:'save',signature:'save(String)'},{methodName:'save',signature:'save(int)'}];
 assert.equal(resolveCalledMethods(methods,{methodName:'save',argumentCount:0})[0].signature,'save()');
 assert.equal(resolveCalledMethods(methods,{methodName:'save',argumentCount:1,argumentTypes:['String']})[0].signature,'save(String)');
 assert.equal(resolveCalledMethods(methods,{methodName:'save',argumentCount:1,argumentTypes:['int']})[0].signature,'save(int)');
 assert.equal(resolveCalledMethods(methods,{methodName:'save',argumentCount:1,argumentTypes:['UNKNOWN']}).length,2);
 assert.equal(resolveCalledMethods(methods,{methodName:'save',argumentCount:2}).length,0);
});
test('BE legacy argument counting handles generics in signatures without guessing complex expression types',()=>{
 const methods=[{name:'send',signature:'send(Map<String,Order>,String)'},{name:'send',signature:'send(String)'}];
 assert.equal(resolveCalledMethods(methods,{methodName:'send',arguments:'[orders, name]'})[0].signature,'send(Map<String,Order>,String)');
 assert.equal(resolveCalledMethods(methods,{methodName:'send',arguments:'[build(a,b)]'}).length,2);
 assert.equal(resolveCalledMethods(methods,{methodName:'send',arguments:'[null]'}).length,1);
});

test('Source method sequence viewIds strictly satisfy architectureDocument identifier contract across generic signatures',()=>{
 const model=fixture(),controller=model.elements.find(n=>n.id==='oc');
 controller.properties.umlClassifier.methodsCfg[0].signature='listProducts(): List<ProductEntity>';
 controller.properties.umlClassifier.methodsCfg[1].signature='listProducts(ProductEntity[]): List<ProductEntity>';
 const flows=detectSequenceFlows(model,{level:'MICRO',serviceId:'org'}).filter(f=>f.sourceMethod);
 assert.equal(flows.length,2);
 for(const f of flows){assert.match(f.viewId,/^[a-zA-Z0-9:_-]{1,160}$/);}
 assert.notEqual(flows[0].viewId,flows[1].viewId);
});
