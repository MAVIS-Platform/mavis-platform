import type { ArchitecturalModel } from "@/types/domain";
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const type = (value: string) => value.replace(/\s+/g, "").replace(/<.*>/g, "");

export function resolveReceiver(model: ArchitecturalModel, owner: ArchitecturalModel["elements"][number], receiverType: string) {
  const wanted = type(receiverType);
  if (!wanted) return [];
  const local = model.elements.filter(node => node.parentId === owner.parentId);
  const exact = local.filter(node => type(String(record(node.properties?.["umlClassifier"])["qualifiedName"] ?? "")) === wanted);
  if (exact.length) return exact;
  // A fully qualified name must not silently bind a same-named foreign class.
  if (wanted.includes(".")) return [];
  return local.filter(node => node.name === wanted);
}

function parameters(method: RecordValue): string[] | null {
  if (Array.isArray(method["parameters"])) return method["parameters"].map(p => String(record(p)["type"] ?? ""));
  const signature = String(method["signature"] ?? method["signatureKey"] ?? "");
  const text = /\((.*)\)/.exec(signature)?.[1];
  if (text === undefined) return null;
  if (!text.trim()) return [];
  let depth=0,start=0;const parts:string[]=[];
  for(let i=0;i<text.length;i++){
    if(text[i]==="<")depth++;if(text[i]===">")depth--;
    if(text[i]===","&&depth===0){parts.push(text.slice(start,i).trim());start=i+1;}
  }
  if(depth!==0)return null;
  parts.push(text.slice(start).trim());return parts;
}
function argumentCount(call: RecordValue): number | null {
  const explicit=call["argumentCount"];
  if(typeof explicit==="number"&&Number.isSafeInteger(explicit)&&explicit>=0)return explicit;
  if(Array.isArray(call["arguments"]))return call["arguments"].length;
  const args=call["arguments"];
  if(typeof args!=="string"||!args.startsWith("[")||!args.endsWith("]"))return null;
  const inner=args.slice(1,-1).trim();if(!inner)return 0;
  // Legacy metadata: count only simple expressions; nested syntax remains unknown.
  if(!inner.split(",").every(arg=>/^\s*(?:[\w$.]+|"[^"\\]*"|'[^'\\]*')\s*$/.test(arg)))return null;
  return inner.split(",").length;
}

export function resolveCalledMethods(methods: RecordValue[], call: RecordValue): RecordValue[] {
  let candidates=methods.filter(method=>String(method["methodName"]??method["name"])===call["methodName"]);
  const count=argumentCount(call);
  if(count!==null)candidates=candidates.filter(method=>{const p=parameters(method);return p===null||p.length===count;});
  if(candidates.length<=1)return candidates;
  const args=call["argumentTypes"];
  if(!Array.isArray(args)||args.some(arg=>typeof arg!=="string"||!arg||arg==="UNKNOWN"||arg==="null"))return candidates;
  const exact=candidates.filter(method=>{
    const p=parameters(method);return p?.length===args.length&&p.every((param,i)=>{
      const expected=type(param),actual=type(String(args[i]));
      return expected===actual||(!expected.includes(".")&&!actual.includes(".")&&expected===actual);
    });
  });
  return exact.length?exact:candidates;
}
