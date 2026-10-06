import type {AssuranceEvent} from './assuranceData.ts';

export function hasEvidence(value: unknown): boolean {
 if(value == null) return false;
 if(typeof value === 'number') return Number.isFinite(value);
 if(typeof value === 'string') return !['', 'unknown', 'not recorded', 'not assessed', 'n/a'].includes(value.trim().toLowerCase());
 if(Array.isArray(value)) return value.length > 0;
 if(typeof value === 'object') return Object.keys(value).length > 0;
 return true;
}
export const evidenceFields = (fields: Record<string, unknown>) => Object.entries(fields).filter(([,v])=>hasEvidence(v));

// Transport records only: do not add parent-agent spans or merge another source's totals.
export function recordedModelUsage(events: AssuranceEvent[]) {
 const calls=new Map<string,{input:number;output:number}>(), conflicts=new Set<string>();
 let excluded=0;
 for(const e of events){
  if(e.kind!=='model'&&e.phase!=='invocation')continue;
  const key=e.attempt_id??e.call_id??e.logical_call_id;
  const input=e.usage?.input_tokens,output=e.usage?.output_tokens;
  if(!key||!Number.isInteger(input)||!Number.isInteger(output)||input<0||output<0){excluded++;continue}
  const previous=calls.get(key);
  if(previous&&(previous.input!==input||previous.output!==output)){conflicts.add(key);continue}
  calls.set(key,{input,output});
 }
 for(const key of conflicts)calls.delete(key);
 if(!calls.size)return null;
 const values=[...calls.values()];
 const input=values.reduce((n,c)=>n+c.input,0),output=values.reduce((n,c)=>n+c.output,0);
 return {input,output,total:input+output,calls:calls.size,excluded:excluded+conflicts.size};
}
