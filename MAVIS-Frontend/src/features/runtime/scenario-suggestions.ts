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

export type BuiltinClusterKey =
  | "AUTH_IDENTITY"
  | "CATALOG_INVENTORY"
  | "ORDER_CART"
  | "PAYMENT_BILLING"
  | "NOTIFICATION"
  | "DISCOVERY_INFRA"
  | "GENERAL_BUSINESS";

export type ApiFeatureClusterId = string;

export interface ApiFeatureClusterMeta {
  id: ApiFeatureClusterId;
  order: number;
  icon: string;
  title: string;
  shortTitle: string;
  description: string;
  badgeClass: string;
  cardBorderClass: string;
  isAiEvaluated?: boolean;
}

const FEATURE_CLUSTERS: Record<BuiltinClusterKey, ApiFeatureClusterMeta> = {
  AUTH_IDENTITY: {
    id: "AUTH_IDENTITY",
    order: 1,
    icon: "🔐",
    title: "Auth & User Identity Flow",
    shortTitle: "Auth & Identity",
    description: "Register, login (issue JWT token), user profile & addresses",
    badgeClass: "border-violet-500/40 bg-violet-500/15 text-violet-300",
    cardBorderClass: "border-violet-500/35 bg-violet-950/15",
  },
  CATALOG_INVENTORY: {
    id: "CATALOG_INVENTORY",
    order: 2,
    icon: "📦",
    title: "Catalog & Inventory Flow",
    shortTitle: "Catalog & Inventory",
    description: "Categories, products, variants & stock inventory lookup/deduction",
    badgeClass: "border-sky-500/40 bg-sky-500/15 text-sky-300",
    cardBorderClass: "border-sky-500/35 bg-sky-950/15",
  },
  ORDER_CART: {
    id: "ORDER_CART",
    order: 3,
    icon: "🛒",
    title: "Order, Cart & Coupon Flow",
    shortTitle: "Order & Coupon",
    description: "Shopping cart, discount coupons, order creation & order status verification",
    badgeClass: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
    cardBorderClass: "border-emerald-500/35 bg-emerald-950/15",
  },
  PAYMENT_BILLING: {
    id: "PAYMENT_BILLING",
    order: 4,
    icon: "💳",
    title: "Payment & Checkout URL Flow",
    shortTitle: "Payment & Checkout",
    description: "Payment URL generation, transaction verification & billing callbacks",
    badgeClass: "border-amber-500/40 bg-amber-500/15 text-amber-300",
    cardBorderClass: "border-amber-500/35 bg-amber-950/15",
  },
  NOTIFICATION: {
    id: "NOTIFICATION",
    order: 5,
    icon: "🔔",
    title: "Notification & Messaging Flow",
    shortTitle: "Notification",
    description: "Email/SMS/push notifications & event alerts",
    badgeClass: "border-pink-500/40 bg-pink-500/15 text-pink-300",
    cardBorderClass: "border-pink-500/35 bg-pink-950/15",
  },
  GENERAL_BUSINESS: {
    id: "GENERAL_BUSINESS",
    order: 6,
    icon: "⚡",
    title: "Core Business API Flow",
    shortTitle: "Core Business",
    description: "Domain service operations & state verification",
    badgeClass: "border-cyan-500/40 bg-cyan-500/15 text-cyan-300",
    cardBorderClass: "border-cyan-500/35 bg-cyan-950/15",
  },
  DISCOVERY_INFRA: {
    id: "DISCOVERY_INFRA",
    order: 7,
    icon: "⚙️",
    title: "Service Discovery & Health",
    shortTitle: "Discovery / Health",
    description: "Service registry heartbeats & health probes",
    badgeClass: "border-slate-500/40 bg-slate-500/15 text-slate-300",
    cardBorderClass: "border-slate-700/60 bg-slate-900/30",
  },
};

export function classifyApiFeatureCluster(
  path?: string | null,
  service?: string | null,
  calleeService?: string | null,
  aiJourneyPhase?: string | null,
): ApiFeatureClusterMeta {
  const p = (path ?? "").toLowerCase();
  const s = `${service ?? ""} ${calleeService ?? ""}`.toLowerCase();
  const rawPhase = (aiJourneyPhase ?? "").trim();

  // 1. If AI (Gemini 2.5 Pro / GPT-5.4) evaluated a descriptive domain cluster (e.g. "PREREQUISITE_SEED: Catalog & Inventory"), use AI's cluster directly!
  if (rawPhase && rawPhase.includes(":")) {
    const [phaseCodeRaw, ...rest] = rawPhase.split(":");
    const phaseCode = (phaseCodeRaw ?? "").trim().toUpperCase();
    const customLabel = rest.join(":").trim();
    if (customLabel) {
      const lowerLabel = customLabel.toLowerCase();
      const baseTemplate =
        /auth|identity|login|user|account/.test(lowerLabel) || phaseCode === "AUTH_ENTRY"
          ? FEATURE_CLUSTERS.AUTH_IDENTITY!
          : /payment|billing|checkout url|vnpay|stripe|invoice/.test(lowerLabel)
            ? FEATURE_CLUSTERS.PAYMENT_BILLING!
            : /catalog|inventory|product|category|stock|master/.test(lowerLabel) || phaseCode === "PREREQUISITE_SEED"
              ? FEATURE_CLUSTERS.CATALOG_INVENTORY!
              : /order|cart|coupon|booking|transfer|workflow/.test(lowerLabel) || phaseCode === "CROSS_SERVICE_WORKFLOW"
                ? FEATURE_CLUSTERS.ORDER_CART!
                : /notify|notification|alert|mail/.test(lowerLabel)
                  ? FEATURE_CLUSTERS.NOTIFICATION!
                  : FEATURE_CLUSTERS.GENERAL_BUSINESS!;
      const normalizedId = `AI_${customLabel.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase()}`;
      return {
        ...baseTemplate,
        id: normalizedId,
        title: customLabel,
        shortTitle: customLabel,
        isAiEvaluated: true,
      };
    }
  }

  // 2. Fallback heuristic + standard AI journeyPhase enum
  if (
    /service-discovery|discovery-service|eureka|config-server|consul/.test(p) ||
    /service-discovery|discovery-service|eureka|config-server|consul/.test(s)
  ) {
    return FEATURE_CLUSTERS.DISCOVERY_INFRA!;
  }
  if (/^AUTH_ENTRY$/i.test(rawPhase)) {
    return { ...FEATURE_CLUSTERS.AUTH_IDENTITY!, isAiEvaluated: true };
  }
  if (/\/(payment|payments|vnpay|momo|stripe|billing|charge|refund)\b/.test(p) || /payment|billing/.test(s)) {
    return { ...FEATURE_CLUSTERS.PAYMENT_BILLING!, isAiEvaluated: Boolean(rawPhase) };
  }
  if (/\/(auth|login|logout|register|signup|token|refresh|users|user|identity|profile|me|addresses)\b/.test(p) || /identity|auth|user-service/.test(s)) {
    return { ...FEATURE_CLUSTERS.AUTH_IDENTITY!, isAiEvaluated: Boolean(rawPhase) };
  }
  if (/\/(catalog|categories|category|products|product|inventory|stock|variants|variant|brands|reviews)\b/.test(p) || /catalog|inventory|product/.test(s)) {
    return { ...FEATURE_CLUSTERS.CATALOG_INVENTORY!, isAiEvaluated: Boolean(rawPhase) };
  }
  if (/\/(order|orders|cart|checkout|coupons|coupon|shipping|delivery)\b/.test(p) || /order|cart|delivery/.test(s)) {
    return { ...FEATURE_CLUSTERS.ORDER_CART!, isAiEvaluated: Boolean(rawPhase) };
  }
  if (/\/(notification|notifications|notify|mail|sms|alerts)\b/.test(p) || /notification|notify/.test(s)) {
    return { ...FEATURE_CLUSTERS.NOTIFICATION!, isAiEvaluated: Boolean(rawPhase) };
  }
  return { ...FEATURE_CLUSTERS.GENERAL_BUSINESS!, isAiEvaluated: Boolean(rawPhase) };
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
