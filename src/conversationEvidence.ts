import type {AssuranceRun} from './assuranceData';
import type {CloudSpan} from './cloudwatchData';

const text=(v:unknown):string=>typeof v==='string'?v.trim():'';
const validNumber=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
export function spanType(s:CloudSpan){
 if(s.tool||s.operation==='execute_tool')return 'Tool call';
 if(s.model||['chat','text_completion','generate_content','embeddings'].includes(s.operation||'')||[s.inputTokens,s.outputTokens,s.totalTokens].some(validNumber))return 'Model request';
 return 'Service request';
}
export function spanDetails(s:CloudSpan){
 const type=spanType(s),http=s.httpStatus!=null||/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/.test(s.name);
 const modelMissing=type==='Tool call'||(type==='Service request'&&http)?'Not applicable to this span':'Not recorded';
 const rows:Record<string,string|number>={'Span type':type,'Operation':s.name,'Trace ID':s.traceId,'Span ID':s.spanId,'Parent':s.parentSpanId||'No parent recorded','Duration':`${s.durationMs.toFixed(1)} ms`,'Tool':s.tool||(type==='Tool call'?'Not recorded':'Not applicable to this span'),'Model':s.model||modelMissing,'Input tokens':s.inputTokens??modelMissing,'Output tokens':s.outputTokens??modelMissing};
 if(s.totalTokens!=null)rows['Total tokens']=s.totalTokens;
 else if(validNumber(s.inputTokens)&&validNumber(s.outputTokens))rows['Total tokens (input + output)']=s.inputTokens+s.outputTokens;
 else rows['Total tokens']=modelMissing;
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
