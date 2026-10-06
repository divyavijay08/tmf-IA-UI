import type {AssuranceRun} from './assuranceData';
import type {CloudSpan} from './cloudwatchData';

const text=(v:unknown):string=>typeof v==='string'?v.trim():'';
const validNumber=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
export function spanType(s:CloudSpan){
 if(s.operation==='invoke_agent'||s.spanKind==='AGENT'||s.name.startsWith('invoke_agent '))return 'Agent invocation';
 if(s.operation==='execute_event_loop_cycle'||s.name==='execute_event_loop_cycle')return 'Agent cycle';
 if(s.mcpMethod||/^mcp[. ]/.test(s.name))return 'MCP request';
 if(s.tool||s.operation==='execute_tool')return 'Tool call';
 if(s.model||['chat','text_completion','generate_content','embeddings'].includes(s.operation||'')||[s.inputTokens,s.outputTokens,s.totalTokens].some(validNumber))return 'Model request';
 return 'Service request';
}
export function spanDetails(s:CloudSpan){
 const type=spanType(s),http=s.httpStatus!=null||/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/.test(s.name);
 const modelMissing=type==='Tool call'||(type==='Service request'&&http)?'Not applicable to this span':'Not recorded';
 const rows:Record<string,string|number>={'Span type':type,'Agent':s.agent||'Not recorded','Service':s.service||'Not recorded','Operation':s.name,'Trace ID':s.traceId,'Span ID':s.spanId,'Parent':s.parentSpanId||'No parent recorded','Start (UTC)':new Date(s.startTime).toISOString(),'End (UTC)':new Date(s.endTime).toISOString(),'Duration':`${s.durationMs.toFixed(1)} ms`,'Tool':s.tool||(type==='Tool call'?'Not recorded':'Not applicable to this span'),'Model':s.model||modelMissing,'Input tokens':s.inputTokens??modelMissing,'Output tokens':s.outputTokens??modelMissing};
 if(s.totalTokens!=null)rows['Total tokens']=s.totalTokens;
 else if(validNumber(s.inputTokens)&&validNumber(s.outputTokens))rows['Total tokens (input + output)']=s.inputTokens+s.outputTokens;
 else rows['Total tokens']=modelMissing;
 for(const [label,value] of Object.entries({'Operation type':s.operation,'Provider':s.system,'MCP method':s.mcpMethod,'Tool call ID':s.toolCallId,'Cache read tokens':s.cacheReadTokens,'Cache write tokens':s.cacheWriteTokens,'Log group':s.logGroup,'Log stream':s.logStream,'Run ID':s.runId,'Action ID':s.actionId,'Error type':s.errorType}))if(value!=null&&value!=='')rows[label]=value;
 rows['Span status']=s.status?.toUpperCase()==='UNSET'?'UNSET — no explicit span status recorded':s.status||'Not recorded';
 rows['HTTP status']=s.httpStatus??'Not recorded';
 return rows;
}

// A declared run ID takes precedence; never borrow assessments from a different run.
export function matchConversationRun(runs:AssuranceRun[],runId?:string,traceId?:string){
 if(runId){const run=runs.find(r=>r.id===runId);return run&&(!traceId||!run.workflow.traceId||run.workflow.traceId===traceId)?run:undefined;}
 if(!traceId)return undefined;
 const matches=runs.filter(r=>r.workflow.traceId===traceId||r.events.some(e=>e.trace_id===traceId));
 return matches.length===1?matches[0]:undefined;
}
export function conversationControls(run?:AssuranceRun,traceId?:string){
 return ([['7','Event recording',run?.c7,'Requires the expected event inventory and a recording assessment.'],['16','Spend cap',run?.c16,'Requires measured usage, the configured cap and a spend assessment.'],['9','Performance drift',run?.c9,'Requires a baseline, comparison windows and a drift assessment.']] as const).map(([id,name,report,requirement])=>{
  const mismatch=!!report&&((text(report.run_id)&&report.run_id!==run?.id)||(text(report.runId)&&report.runId!==run?.id)||(traceId&&text(report.trace_id)&&report.trace_id!==traceId)||(traceId&&text(report.traceId)&&report.traceId!==traceId));
  const known=['SATISFIED','NOT SATISFIED','PASS','BREACH','NO EVIDENCE','INCONCLUSIVE'];
  const value=!mismatch&&known.includes(report?.verdict)?String(report?.verdict):undefined;
  return {id,name,verdict:value||'Not assessed',assessed:!!value,detail:mismatch?'Assessment identity does not match this conversation.':value?`Recorded assessment for ${run!.id}.`:run?`No assessment result in the collected run. ${requirement}`:'No matching run evidence is available.',report:mismatch?undefined:report};
 });
}
export function conversationReferences(run?:AssuranceRun,traceId?:string){
 const refs=new Map<string,{finding:string;number:string;sysId:string;receipt:string;source:string}>();
 for(const e of run?.events||[]){
  if((text(e.run_id)&&e.run_id!==run!.id)||(text(e.runId)&&e.runId!==run!.id)||(traceId&&text(e.trace_id)&&e.trace_id!==traceId))continue;
  const number=text(e.servicenow_number),sysId=text(e.servicenow_sys_id),finding=text(e.finding_id);
  if(!number&&!sysId&&!finding)continue;
  const ref={finding,number,sysId,receipt:text(e.receipt_id),source:e.source};
  refs.set(JSON.stringify(ref),ref);
 }
 return [...refs.values()];
}
export function elapsedSeconds(start?:string,end?:string){
 const a=Date.parse(start||''),b=Date.parse(end||'');return Number.isFinite(a)&&Number.isFinite(b)&&b>=a?(b-a)/1000:null;
}

// Prefer actual model-call spans; parent agent/cycle spans repeat the same token usage.
export function traceUsage(spans:CloudSpan[]){
 const explicit=spans.filter(s=>['chat','text_completion','generate_content','embeddings'].includes(s.operation||'')||s.name==='chat');
 const calls=explicit.length?explicit:spans.filter(s=>spanType(s)==='Model request');
 const ids=new Set(calls.map(s=>s.spanId));
 const byId=new Map(spans.map(s=>[s.spanId,s]));
 const parentIds=new Set<string>();
 for(const s of calls){let id=s.parentSpanId;const seen=new Set<string>();while(id&&!seen.has(id)){seen.add(id);if(ids.has(id))parentIds.add(id);id=byId.get(id)?.parentSpanId;}}
 const leaves=calls.filter(s=>!parentIds.has(s.spanId));
 const sum=(key:'inputTokens'|'outputTokens')=>leaves.length&&leaves.every(s=>s[key]!=null)?leaves.reduce((n,s)=>n+s[key]!,0):null;
 const sorted=leaves.map(s=>s.durationMs).sort((a,b)=>a-b);
 return {calls:leaves.length,input:sum('inputTokens'),output:sum('outputTokens'),p95:sorted.length?sorted[Math.ceil(sorted.length*.95)-1]:null,basis:explicit.length?'model-call spans':'model-related leaf spans'};
}
