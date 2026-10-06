import type {CloudSpan} from './cloudwatchData';
export type TraceNode={span:CloudSpan;depth:number;ancestors:string[];children:string[];missingParent:boolean};
export function traceHierarchy(spans:CloudSpan[]):TraceNode[]{
 const sorted=[...new Map(spans.map(s=>[s.spanId,s])).values()].sort((a,b)=>Date.parse(a.startTime)-Date.parse(b.startTime)||a.spanId.localeCompare(b.spanId));
 const map=new Map(sorted.map(s=>[s.spanId,s]));
 const parent=(s:CloudSpan)=>s.parentSpanId&&s.parentSpanId!==s.spanId&&map.get(s.parentSpanId)?.traceId===s.traceId?s.parentSpanId:undefined;
 const children=new Map<string,CloudSpan[]>();for(const s of sorted){const p=parent(s);if(p)children.set(p,[...(children.get(p)||[]),s]);}
 const result:TraceNode[]=[],seen=new Set<string>();
 function visit(s:CloudSpan,ancestors:string[]){if(seen.has(s.spanId))return;seen.add(s.spanId);const kids=(children.get(s.spanId)||[]).filter(c=>!seen.has(c.spanId));result.push({span:s,depth:ancestors.length,ancestors,children:kids.map(c=>c.spanId),missingParent:!!s.parentSpanId&&!parent(s)});for(const child of kids)visit(child,[...ancestors,s.spanId]);}
 for(const s of sorted.filter(s=>!parent(s)))visit(s,[]);
 for(const s of sorted)visit(s,[]); // Broken cyclic input remains visible without recursion loops.
 return result;
}
