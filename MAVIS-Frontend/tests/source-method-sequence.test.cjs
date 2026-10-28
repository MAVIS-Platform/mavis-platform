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
