import type { ArchitecturalModel } from "@/types/domain";
export type RuntimeDraftStep = { service: string; method: string; path: string; status: string; rationale?: string | undefined; source?: string | undefined;
 environmentVariables?: Record<string,string>; envHeaders?: Array<{ name: string; reference: string }>; bodyReference?: string; allowClientError?: boolean; headers?: Record<string, string>; extract?: Record<string, string>; journeyPhase?: string };
export type RuntimeInput = { name:string; label:string; kind:"text"|"credential"|"json"; source:string };
export function toServiceEnvPrefix(serviceName:string|undefined):string {
 let prefix=(serviceName||"SVC").toUpperCase().replace(/[^A-Z0-9_]/g,"_").replace(/_+/g,"_").replace(/^_|_$/g,"");
 if(!prefix||!/^[A-Z]/.test(prefix))prefix=`SVC_${prefix}`;
 return prefix.slice(0,32);
}
export function boundRuntimeEnvironment(raw:Record<string,string>):Record<string,string> {
 const out:Record<string,string>={};
 for(const [k,v] of Object.entries(raw)){
  if(Object.keys(out).length>=64)break;
  if(/^[A-Z][A-Z0-9_]{0,63}$/.test(k)&&typeof v==="string"&&v.length<=16000)out[k]=v;
 }
 return out;
}
export function resolveRuntimeTargetModel<T extends {id:string;snapshotId:string;origin?:string|null|undefined;latest?:boolean|undefined}>(
 allModels:readonly T[],storedModelId?:string|null,configModelId?:string|null):T|undefined {
 const statics=allModels.filter(m=>m.origin!=="RUNTIME_ENRICHED");
 const candidates=statics.length>0?statics:allModels;
 if(!candidates.length)return undefined;
 const refId=storedModelId||configModelId||"";
 const refAny=refId?allModels.find(m=>m.id===refId):undefined;
 return (storedModelId?candidates.find(m=>m.id===storedModelId):undefined)
  ??(configModelId?candidates.find(m=>m.id===configModelId):undefined)
  ??(refAny?candidates.find(m=>m.snapshotId===refAny.snapshotId):undefined)
  ??candidates.find(m=>m.latest)
  ??candidates[0];
}
export function automaticRuntimeDraft(suggestions:ScenarioSuggestion[],profile?:Record<string,unknown>):{steps:RuntimeDraftStep[];inputs:RuntimeInput[];blocked:string[]} {
 const inputs:RuntimeInput[]=[],blocked:string[]=[],steps:RuntimeDraftStep[]=[];
 const add=(name:string,label:string,kind:RuntimeInput["kind"],source:string)=>{let candidate=name,counter=1;while(inputs.some(i=>i.name===candidate&&i.label!==label))candidate=name.slice(0,58)+"_"+(++counter);if(!inputs.some(i=>i.name===candidate))inputs.push({name:candidate,label,kind,source});return candidate;};
 const candidates=suggestions.filter(s=>!s.missing.some(m=>/Re-analyze|ambiguous|approved runtime|Required query|Required request headers/.test(m)));
 const read=candidates.filter(s=>s.method==="GET");const chosen=(read.length?read:candidates.filter(s=>["POST","PUT","PATCH"].includes(s.method))).slice(0,5);
 for(const suggestion of chosen){
  if(suggestion.missing.some(m=>m.includes("method parameters"))&&(suggestion.parameterCount??1)>(suggestion.path.match(/\{[^}]+\}/g)?.length??0)&&suggestion.method==="GET") {blocked.push(suggestion.source+": request parameter binding is not available");continue;}
  const variables:Record<string,string>={};const serviceKey=toServiceEnvPrefix(suggestion.service);
  const path=suggestion.path.replace(/\{([^}]+)\}/g,(_,param:string)=>{const alias="V"+Object.keys(variables).length;variables[alias]=add(`${serviceKey}_${param.replace(/[^A-Za-z0-9]/g,"_").toUpperCase()}`.slice(0,64),`${suggestion.service} ${suggestion.path}: ${param}`,"text",suggestion.source);return "{{"+alias+"}}";});
  const step:RuntimeDraftStep={service:suggestion.service,method:suggestion.method,path,status:suggestion.status};
  if(Object.keys(variables).length)step.environmentVariables=variables;
  if(suggestion.missing.some(m=>m.includes("Authentication")))step.envHeaders=[{name:"Authorization",reference:add(`${serviceKey}_AUTHORIZATION`,`${suggestion.service}: Authorization header (including Bearer prefix when needed)`,"credential",suggestion.source)}];
  if(["POST","PUT","PATCH"].includes(suggestion.method)&&suggestion.missing.some(m=>/request data|Request body/.test(m)))step.bodyReference=add(`${serviceKey}_BODY_${steps.length+1}`,`${suggestion.method} ${suggestion.path}: JSON test body`,"json",suggestion.source);
  steps.push(step);
 }
 const bindings=obj(profile?.["environmentBindings"]);
 for(const [service,value] of Object.entries(bindings))if(Array.isArray(value))for(const binding of value){const field=obj(binding);if(typeof field["reference"]==="string"&&/^[A-Z][A-Z0-9_]{0,63}$/.test(field["reference"]))add(field["reference"],`${service}: ${String(field["name"]??field["reference"])}`,"credential","Application environment");}
 for(const suggestion of suggestions.filter(s=>s.missing.some(m=>/Re-analyze|ambiguous|approved runtime|Required query|Required request headers/.test(m))))blocked.push(suggestion.source+": "+suggestion.missing.join("; "));
 return {steps,inputs,blocked};
}
export type ScenarioSuggestion = RuntimeDraftStep & { key: string; source: string; missing: string[]; selected: boolean; parameterCount?: number };
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const strings=(v:unknown):string[]=>Array.isArray(v)?v.filter((x):x is string=>typeof x==="string"):[];
function annotationPaths(declaration:string):{paths:string[];unresolved:boolean}{
 const args=/\(([\s\S]*)\)/.exec(declaration)?.[1]?.trim()??"";
 const named=/(?:^|,)\s*(?:value|path)\s*=\s*(\{[^}]*\}|"[^"\\]*"|[^,)]*)/.exec(args)?.[1];
 const route=named??(/^["{]/.test(args)?args:"");
 if(!route)return {paths:[""],unresolved:!!args&&!/^\w+\s*=/.test(args)};
 const paths=[...route.matchAll(/"([^"\\]*)"/g)].map(m=>m[1]!);
 return {paths,unresolved:!paths.length||paths.some(path=>!path.startsWith("/"))};
}
export function suggestRuntimeScenarios(model:ArchitecturalModel,profile?:Record<string,unknown>):ScenarioSuggestion[]{
 const services=model.elements.filter(n=>n.elementType==="SERVICE_CONTAINER"),mappings=obj(profile?.["serviceMappings"]),apps=obj(profile?.["applications"]);
 const result:ScenarioSuggestion[]=[],seen=new Set<string>();
 for(const node of model.elements){
  const owner=services.find(s=>s.id===node.parentId);if(!owner)continue;
  const meta=obj(node.properties?.["umlClassifier"]),annotations=strings(meta["annotations"]),prefixes=strings(meta["endpointPrefixDeclarations"]);
  const unknownPrefix=annotations.some(a=>/(?:^|[.@])RequestMapping(?:$|\()/.test(a))&&!prefixes.length;
  const parsedPrefixes=prefixes.map(annotationPaths);
  const paths=parsedPrefixes.flatMap(p=>p.paths);
  const mapped=Object.entries(mappings).filter(([,v])=>v===owner.id||v===owner.name),service=mapped.length===1?mapped[0]![0]:owner.name;
  const members=Array.isArray(meta["members"])?meta["members"].map(obj):[];
  const methods=members.length?members:Array.isArray(meta["methodsCfg"])?meta["methodsCfg"].map(obj):[];
  for(const method of methods)for(const declaration of strings(method["endpointDeclarations"])){
   const match=/^@(?:[\w.]+\.)?(Get|Post|Put|Patch|Delete|Request)Mapping\b/.exec(declaration);if(!match)continue;
   const verb=match[1]==="Request"?/RequestMethod\.(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/.exec(declaration)?.[1]:match[1]!.toUpperCase();if(!verb)continue;
   const parsed=annotationPaths(declaration);if(parsed.unresolved)continue;const routes=parsed.paths;
   for(const prefix of paths.length?paths:[""])for(const route of routes.length?routes:[""]){
    const path=(prefix+"/"+route).replace(/\/+/g,"/"),key=`${service}:${verb}:${path}`;if(seen.has(key)||/[\r\n]/.test(path))continue;seen.add(key);
    const missing:string[]=[];
    if(unknownPrefix||parsedPrefixes.some(p=>p.unresolved))missing.push("Re-analyze source to resolve the controller route prefix");
    if(/\bparams\s*=/.test(declaration))missing.push("Required query parameter values");
    if(/\bheaders\s*=/.test(declaration))missing.push("Required request headers");
    if(/\{[^}]+\}|\[[^\]]+\]|\$\{/.test(path))missing.push("Path parameter values");
    if([...annotations,...strings(meta["accessDeclarations"]),...strings(method["annotations"]),...strings(method["accessDeclarations"])].some(a=>/PreAuthorize|RolesAllowed|Secured|Authorize/.test(a)))missing.push("Authentication or access requirements");
    if(Array.isArray(method["parameters"])&&method["parameters"].length)missing.push("Review method parameters and request data");
    if(!["GET","HEAD","OPTIONS"].includes(verb))missing.push("Request body, test data and expected outcome");
    if(mapped.length>1)missing.push("Resolve ambiguous service mapping");
    if(Object.keys(apps).length&&!Object.hasOwn(apps,service))missing.push("Map this service to an approved runtime application");
    result.push({key,service,method:verb,path,status:"200",source:`${node.name}.${String(method["name"]??method["methodName"]??"")}`,missing,parameterCount:Array.isArray(method["parameters"])?method["parameters"].length:0,selected:verb==="GET"&&!missing.length});
   }
  }
 }
 return result.sort((a,b)=>Number(b.selected)-Number(a.selected)||a.key.localeCompare(b.key)).slice(0,30);
}

export function parseRuntimeEnvFile(text:string):Record<string,string> {
 if(text.length>65536)throw new Error("Environment file exceeds the supported size");
 const result:Record<string,string>={};
 for(const [index,line] of text.split(/\r?\n/).entries()){
  if(!line.trim()||/^\s*#/.test(line))continue;
  const match=/^\s*(?:export\s+)?([A-Z][A-Z0-9_]{0,63})\s*=\s*(.*)$/.exec(line);
  if(!match)throw new Error(`Invalid environment declaration at line ${index+1}`);
  const name=match[1]!;let value=match[2]!;
  if(Object.hasOwn(result,name))throw new Error(`Duplicate environment name at line ${index+1}`);
  if(value.startsWith('"')){try{const parsed:unknown=JSON.parse(value);if(typeof parsed!=="string")throw new Error();value=parsed;}catch{throw new Error(`Invalid quoted environment value at line ${index+1}`);}}
  else if(value.startsWith("'")){if(!value.endsWith("'"))throw new Error(`Invalid quoted environment value at line ${index+1}`);value=value.slice(1,-1);}
  else value=value.replace(/\s+#.*$/,"").trimEnd();
  if(value.length>16000||Object.keys(result).length>=64)throw new Error("Environment input exceeds the supported limits");
  result[name]=value;
 }
 return result;
}
