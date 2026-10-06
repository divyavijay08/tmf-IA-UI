import type {AssuranceEvent,AssuranceRun} from './assuranceData.ts';

export function controlSpendSeries(run:AssuranceRun){
 const gateway=run.c16['evidence.refs'];
 if(Array.isArray(gateway)&&gateway.length)return {basis:'gateway',calls:gateway,excluded:0};
 const calls=new Map<string,any>(),conflicts=new Set<string>();let excluded=0;
 const invocations=new Set(run.workflow.stages?.filter(s=>s.invoked).map(s=>s.invocation_id));
 for(const e of run.events){
  if(e.kind!=='model')continue;
  const id=e.attempt_id,input=e.usage?.input_tokens,output=e.usage?.output_tokens;
  if(e.run_id!==run.id||!run.workflow.traceId||e.trace_id!==run.workflow.traceId||!invocations.has(e.invocation_id)||
     typeof id!=='string'||!id||!Number.isFinite(Date.parse(e.time??''))||
     !Number.isInteger(input)||!Number.isInteger(output)||input<0||output<0){excluded++;continue}
  const prior=calls.get(id);
  if(prior&&(prior.input_tokens!==input||prior.output_tokens!==output)){conflicts.add(id);continue}
  calls.set(id,{call_id:id,at:e.time,input_tokens:input,output_tokens:output,source:e.source});
 }
 for(const id of conflicts)calls.delete(id);
 return {basis:'agent_transport',calls:[...calls.values()].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)),excluded:excluded+conflicts.size};
}

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
