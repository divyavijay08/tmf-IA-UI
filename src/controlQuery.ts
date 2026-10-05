import type {AssuranceRun,AssuranceData,RecordData} from './assuranceData';
export const statusClass=(v:unknown)=>['SATISFIED','PASS'].includes(String(v))?'good':['NOT SATISFIED','BREACH'].includes(String(v))?'bad':'unknown';
export type QueryResult={control:string;runId:string;scope:string;verdict:string;measurement:number|null;windowMeasurement:number|null;limit:number|null;coverage:number|null;exceptions:number;denominator:number;exceptionRate:number|null;allowedExceptionRate:number|null;refs:string[];gaps:string[];enforcement:string;algorithm:string};
const numeric=(v:unknown)=>(typeof v==='number'||typeof v==='string')&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const stamp=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
export function queryControl(run:AssuranceRun,control:string,window?:[number,number]):QueryResult{
 const out:QueryResult={control,runId:run.id,scope:window?'Selected window; run cap remains whole-run':'Whole run',verdict:'INSUFFICIENT EVIDENCE',measurement:null,windowMeasurement:null,limit:null,coverage:null,exceptions:0,denominator:0,exceptionRate:null,allowedExceptionRate:null,refs:[],gaps:[],enforcement:'Not independently established',algorithm:'alpha-query-v1'};
 if(window&&(!window.every(Number.isFinite)||window[0]>window[1])){out.gaps.push('Invalid query window');return out}
 if(control==='9'){
  const baseline=run.qualityBaseline??{},threshold=run.c9Threshold??{},samples=run.qualityWindows??[],expected=run.expectedQualityWindowIds;
  const base=numeric(baseline.value),declared=stamp(baseline.frozen_at),effective=stamp(threshold.declared_at??threshold.effective_at);
  out.limit=numeric(threshold.max_absolute_drift);out.allowedExceptionRate=numeric(threshold.allowed_exception_rate);
  out.algorithm='alpha-quality-drift-v1';out.scope='Declared quality windows; absolute drift from frozen baseline';
  if(base==null||declared==null||!baseline.version||!baseline.metric)out.gaps.push('Frozen baseline value, metric, version and time are required');
  if(out.limit==null||out.limit<0||!threshold.version||effective==null||threshold.metric!==baseline.metric)out.gaps.push('Matching versioned drift threshold is required');
  if(out.allowedExceptionRate==null||out.allowedExceptionRate<0||out.allowedExceptionRate>1)out.gaps.push('Allowed drift exception rate is missing or invalid');
  if(!Array.isArray(expected)||!expected.length||new Set(expected).size!==expected.length)out.gaps.push('Independent expected quality-window inventory is missing or invalid');
  const seen=new Set<string>(),drifts:number[]=[];
  for(const sample of samples){const at=stamp(sample.start),end=stamp(sample.end),score=numeric(sample.value);
   if(!sample.id||seen.has(sample.id)||at==null||end==null||end<at||score==null){out.gaps.push('Invalid or duplicate scored window');continue}
   seen.add(sample.id);out.refs.push(sample.id);
   if(sample.baseline_version!==baseline.version||sample.threshold_version!==threshold.version||sample.metric!==baseline.metric)out.gaps.push('Scored window is not bound to the frozen baseline and threshold');
   if(declared==null||effective==null||at<declared||at<effective)out.gaps.push('Baseline or threshold was not frozen before scoring');
   if(base!=null)drifts.push(Math.abs(score-base));
  }
  out.denominator=expected?.length??0;out.coverage=expected?.length?expected.filter(id=>seen.has(id)).length/expected.length:null;
  if(!samples.length||expected?.some(id=>!seen.has(id))||[...seen].some(id=>!expected?.includes(id)))out.gaps.push('Quality-window inventory does not reconcile');
  out.measurement=drifts.length?Math.max(...drifts):null;out.windowMeasurement=out.measurement;out.exceptions=out.limit==null?0:drifts.filter(v=>v>out.limit!).length;out.exceptionRate=drifts.length?out.exceptions/drifts.length:null;
  if(!out.gaps.length)out.verdict=out.exceptionRate!>out.allowedExceptionRate!?'BREACH':'PASS';
  out.gaps=[...new Set(out.gaps)];return out;
 }
 if(!['7','16'].includes(control)){out.gaps.push('Unsupported control');return out}
 if(control==='16'){
  const threshold=run.c16Threshold??run.budget.threshold??{},calls=run.c16['evidence.refs']??[];
  out.limit=numeric(threshold.max_total_tokens??threshold.cap??run.c16['threshold.value']);out.allowedExceptionRate=numeric(threshold.exception_tolerance??threshold.allowed_exception_rate);
  if(out.limit==null||out.limit<0)out.gaps.push('Valid spend limit is missing');
  const effective=stamp(threshold.effective_at??threshold.declared_at),version=threshold.version;
  if(effective==null)out.gaps.push('Exact threshold effective time is missing');
  if(!version)out.gaps.push('Threshold manifest version is missing');
  if(out.allowedExceptionRate==null)out.gaps.push('Allowed over-cap run rate is not declared');else if(out.allowedExceptionRate!==0)out.gaps.push('C16 requires zero allowed over-cap runs');
  if(!Array.isArray(calls)||!calls.length){out.gaps.push('Raw gateway calls are missing');return out}
  const seen=new Set<string>();let total=0,subset=0,valid=true;
  for(const c of calls){const id=c.call_id,at=stamp(c.at??c.event_at),a=numeric(c.input_tokens),b=numeric(c.output_tokens);if(typeof id!=='string'||!id||seen.has(id)){out.gaps.push('Missing or duplicate gateway call ID');valid=false}else{seen.add(id);out.refs.push(id)}
   if(a==null||b==null||!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<0){out.gaps.push('Invalid or missing per-call usage');valid=false}else{total+=a+b;if(!window||(at!=null&&at>=window[0]&&at<=window[1]))subset+=a+b}
   if(at==null){out.gaps.push('Gateway call time missing');valid=false}else if(effective!=null&&at<effective)out.gaps.push('Gateway call predates threshold');
   if(c.threshold_version!==version)out.gaps.push('Gateway call lacks matching threshold version');
  }
  out.measurement=valid?total:null;out.windowMeasurement=valid?subset:null;out.denominator=1;out.exceptions=valid&&out.limit!=null&&total>out.limit?1:0;out.exceptionRate=valid?out.exceptions:null;
  const expected=run.expectedCallIds;
  if(!Array.isArray(expected))out.gaps.push('Independent expected gateway-call inventory is missing');else{if(!expected.length||expected.some((id:unknown)=>typeof id!=='string'||!id)||new Set(expected).size!==expected.length)out.gaps.push('Expected call inventory contains empty, invalid or duplicate IDs');out.coverage=expected.length?expected.filter((id:string)=>seen.has(id)).length/expected.length:null;if(expected.some((id:string)=>!seen.has(id))||[...seen].some(id=>!expected.includes(id)))out.gaps.push('Gateway call inventory does not reconcile')}
  const decisions=run.events.filter(e=>e.phase==='spend-decision');
  const bound=calls.every((c:RecordData)=>decisions.some(e=>e.call_id===c.call_id&&e.threshold_version===version&&stamp(e.time)!=null&&stamp(c.at??c.event_at)!=null&&Date.parse(e.time!)<=Date.parse(c.at??c.event_at)));
  out.enforcement=bound?'Pre-call decision bindings present; runtime compliance still needs proof':'Pre-call gateway decision matching not proven';
  if(valid&&!out.gaps.length&&out.allowedExceptionRate!=null)out.verdict=out.exceptions>out.allowedExceptionRate?'BREACH':'PASS';
 }else{
  const threshold=run.c7Threshold??{},inventory=run.expectedEvents;
  const refs=Array.isArray(inventory)?inventory: Object.entries(run.c7.source_refs??{}).map(([id,source])=>({id,source}));
  if(!Array.isArray(inventory))out.gaps.push('Expected event inventory comes from saved evaluator report; independent inventory missing');
  if(new Set(refs.map((ref:RecordData)=>ref.id??ref.source)).size!==refs.length)out.gaps.push('Duplicate expected event identifiers');
  const eligible=refs.filter((ref:RecordData)=>{if(!window)return true;const t=stamp(ref.time);return t!=null&&t>=window[0]&&t<=window[1]});
  if(window&&refs.some((ref:RecordData)=>stamp(ref.time)==null))out.gaps.push('Expected-event timestamps missing for window assessment');
  const matched=eligible.map((ref:RecordData)=>run.events.find(e=>e.source===ref.source||(ref.id&&e.event_id===ref.id))).filter(Boolean);
  out.denominator=eligible.length;out.measurement=matched.length;out.coverage=eligible.length?matched.length/eligible.length:null;out.limit=numeric(threshold.coverage_target);out.refs=matched.map((e:any)=>e.source);
  out.allowedExceptionRate=numeric(threshold.exception_tolerance);const gapLimit=numeric(threshold.gap_limit_ms);
  const times=[...new Set(matched.map((e:any)=>stamp(e.time)).filter((t:any)=>t!=null))].sort((a:any,b:any)=>a-b) as number[];
  const gaps=times.slice(1).map((t,i)=>t-times[i]);out.exceptions=gapLimit==null?0:gaps.filter(n=>n>gapLimit).length;out.exceptionRate=gaps.length?out.exceptions/gaps.length:null;out.windowMeasurement=gaps.length?Math.max(...gaps):null;
  if(gapLimit==null||gapLimit<0||out.allowedExceptionRate==null||out.allowedExceptionRate<0||out.allowedExceptionRate>1)out.gaps.push('Gap limit or allowed exception rate missing');
  if(!eligible.length)out.gaps.push('No independently expected events in scope');
  if(matched.some((e:any)=>stamp(e.time)==null))out.gaps.push('Required event timestamp missing');
  const declared=stamp(threshold.declared_at??threshold.effective_at);if(declared==null||times.some(t=>t<declared))out.gaps.push('Prior threshold declaration cannot be established');
  if(out.limit==null||out.limit<0||out.limit>1)out.gaps.push('Valid coverage target missing');
  if(!out.gaps.length)out.verdict=out.coverage!>= (out.limit??1)&&(out.exceptionRate??0)<=out.allowedExceptionRate!?'PASS':'BREACH';
  out.enforcement='Recording assessment; does not prove business completion';
 }
 out.gaps=[...new Set(out.gaps)];return out;
}
export async function digest(value:unknown){const bytes=new TextEncoder().encode(JSON.stringify(value));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('')}
export async function makeBundle(data:AssuranceData,extra:RecordData={}){const payload={assurance:data,...extra};return {format:'alpha-evidence-bundle-v1',exportedAt:new Date().toISOString(),digest:await digest(payload),payload}}
export async function readBundle(input:any){if(input?.format!=='alpha-evidence-bundle-v1'||!input.payload||await digest(input.payload)!==input.digest)throw Error('Bundle checksum mismatch or unsupported bundle');return input.payload}
