// Local QA only: exercises the production extractor in a real browser DOM and the production
// renderer in Node, without cookies, database access, or a new test dependency.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, '../output/m1/codex-roundtrip');
fs.mkdirSync(output, { recursive: true });
require.extensions['.ts'] = (module, filename) => {
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  module._compile(js.replace(/require\(["']@\/([^"']+)["']\)/g, (_, n) => `require(${JSON.stringify(path.join(root, 'src', n))})`), filename);
};
const { generateDrawio } = require(path.join(root, 'src/lib/drawio/server.ts'));
const { projectDiagram } = require(path.join(root, 'src/lib/drawio/rules.ts'));
const { selectDiagram } = require(path.join(root, 'src/features/architecture/diagram-catalog.ts'));
const extractorPath = path.join(root, 'src/features/architecture/drawio-document.ts');
const extractorSource = fs.readFileSync(extractorPath, 'utf8');
const ast = ts.createSourceFile(extractorPath, extractorSource, ts.ScriptTarget.ES2022, true);
const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'extractDraftDocument');
if (!fn) throw Error('Production extractor not found');
const browserJs = 'var exports={};\n' + ts.transpileModule(fn.getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText + '\nwindow.extractDraftDocument=exports.extractDraftDocument;';
const node = (id, kind, parentId, properties = {}) => ({ id, name: id, elementType: kind, parentId, properties, description: '', layer: 'unclassified', evidence: [] });
const edge = (id, from, to, protocol) => ({ id, from, to, protocol, originLayer: 'STATIC', resolutionStatus: 'RESOLVED', uncertain: false, evidence: [] });
const model = { id: 'qa', projectId: 'qa-project', snapshotId: 'qa-snapshot', revision: 1, label: 'Synthetic roundtrip',
  elements: [node('api','SERVICE_CONTAINER'),node('db','DATABASE',null,{resourceRole:'LOGICAL_DATASTORE'}),
    node('topic','MESSAGE_CHANNEL',null,{protocol:'Kafka & <v3>',transportAuthority:'broker',resolutionIssue:'REVIEW'}),
    node('external','EXTERNAL_SYSTEM'),node('http','COMPONENT','api'),node('publisher','COMPONENT','api')],
  edges: [edge('data','api','db','DATABASE_ACCESS'),edge('publish','publisher','topic','MESSAGE_PUBLISH'),
    edge('call','api','external','SERVICE_HTTP_CALL'),edge('internal','http','publisher','CODE_DEPENDENCY')] };
const cases = [];
const expected = new Map();
async function prepare() {
  for (const [name, kind, id] of [['C2','CONTAINER',undefined],['C3','COMPONENT','api']]) {
    const document = selectDiagram(model, kind, id, {systemName:'Roundtrip & <scope>'}).document;
    cases.push({name,xml:await generateDrawio(document),notation:document.notation,level:document.level,scope:kind==='COMPONENT'?'components:api':'container'});
    expected.set(name, document);
  }
  const old = path.resolve(root,'../output/m1/container-rev3.drawio');
  if(fs.existsSync(old)) cases.push({name:'Legacy-Test1-valid',xml:fs.readFileSync(old,'utf8'),notation:'C4',level:'CONTAINER',scope:'container',legacy:true});
}
function canonical(document) {
  return {
    notation: document.notation, level: document.level, scopeContainerId:document.scopeContainerId,
    nodes: document.layoutJson.nodes.map(n=>({id:n.id,kind:n.kind,parentId:n.parentId??null,properties:n.properties??{},viewLocal:n.viewLocal??false})).sort((a,b)=>a.id.localeCompare(b.id)),
    edges:document.layoutJson.edges.map(e=>({id:e.id,from:e.from,to:e.to,type:e.relationType??e.type,origin:e.originLayer,underlying:e.underlyingEdgeIds??[],status:e.resolutionStatus,uncertain:e.uncertain})).sort((a,b)=>a.id.localeCompare(b.id)),
  };
}
const html = `<!doctype html><meta charset="utf-8"><title>M1 real DOM roundtrip regression</title><h1>M1 production roundtrip with browser DOMParser</h1><pre id="result">Running…</pre><script src="/extractor.js"></script><script>
(async()=>{try{
 const cases=await(await fetch('/cases')).json(), results=[];
 for(const c of cases){let xml=c.xml;
  for(let cycle=1;cycle<=2;cycle++){
   const draft=extractDraftDocument(xml,'qa',c.name,cycle===1?c.notation:undefined,cycle===1?c.level:undefined,c.scope);
   const response=await fetch('/cycle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:c.name,cycle,draft})});
   const result=await response.json();if(!response.ok)throw Error(JSON.stringify(result));
   xml=result.xml;const dom=new DOMParser().parseFromString(xml,'text/xml');
   if(dom.querySelector('parsererror'))throw Error('Invalid XML');
   const boundary=[...dom.querySelectorAll('mxCell')].filter(x=>x.getAttribute('mavisRole')==='boundary');
   if(boundary.length!==1)throw Error(c.name+' lost boundary');
   const members=[...dom.querySelectorAll('mxCell')].filter(x=>x.getAttribute('parent')===boundary[0].id).length;
   results.push({name:c.name,cycle,boundary:boundary[0].getAttribute('mavisId'),members,nodes:draft.layoutJson.nodes.length,edges:draft.layoutJson.edges.length});
  }
 }
 const c=cases[0];const broken=c.xml.replace('mavisRole="boundary"','mavisRole="SERVICE_CONTAINER"');let rejected=false;
 try{extractDraftDocument(broken,'qa','container','C4','CONTAINER','container')}catch(e){rejected=/lost its boundary/.test(e.message)}
 if(!rejected)throw Error('Flattened legacy boundary was not rejected');
 const report={pass:true,results,flattenedDraftRejected:true,userAgent:navigator.userAgent};
 await fetch('/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});
 document.querySelector('#result').textContent=JSON.stringify(report,null,2);
 }catch(e){document.querySelector('#result').textContent='FAIL: '+e.stack;await fetch('/result',{method:'POST',body:JSON.stringify({pass:false,error:e.stack})})}})();
</script>`;
prepare().then(()=>http.createServer(async(req,res)=>{
  try{
    if(req.url==='/extractor.js'){res.setHeader('Content-Type','text/javascript');return res.end(browserJs)}
    if(req.url==='/cases'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(cases))}
    if(req.method==='POST'){
      let body='';for await(const chunk of req){body+=chunk;if(body.length>2000000)throw Error('Payload too large')}
      const data=JSON.parse(body);
      if(req.url==='/result'){
        fs.writeFileSync(path.join(output,'real-dom-results.json'),JSON.stringify({...data,extractorSha256:crypto.createHash('sha256').update(extractorSource).digest('hex')},null,2));return res.end('ok');
      }
      if(req.url==='/cycle'){
        assert(cases.some(c=>c.name===data.name));const doc=projectDiagram(data.draft);const key=data.name;
        if(expected.has(key)){
          const source=canonical(expected.get(key)),actual=canonical(doc);
          // Null/undefined parent fields have the same root meaning.
          assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(source)));
          assert.deepEqual(doc.projection,expected.get(key).projection);
        } else if(key==='Legacy-Test1-valid'){
          assert.equal(doc.layoutJson.nodes.filter(n=>n.parentId==='system:boundary').length,17);
        }
        const xml=await generateDrawio(doc);fs.writeFileSync(path.join(output,key+'-cycle'+data.cycle+'.drawio'),xml);
        res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({xml}));
      }
    }
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);
  }catch(e){res.statusCode=500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:e.message}));}
}).listen(8814,'127.0.0.1',()=>console.log('Real DOM QA: http://127.0.0.1:8814'))).catch(e=>{console.error(e);process.exitCode=1});
