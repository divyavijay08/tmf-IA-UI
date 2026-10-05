export type Control = '7'|'9'|'16';
export type Window = 'all'|'first'|'last';
export type Verdict = 'Pass'|'Breach'|'Unknown';
export type Run = {id:string;scenario:string;status:'Pass'|'Breach'|'Incomplete';values:Record<Control,(number|null)[]>;retestOf?:string};
export const runs:Run[]=[
{id:'alpha-001',scenario:'Baseline resolution',status:'Pass',values:{7:[6,6],9:[103,105],16:[300,700]}},
{id:'alpha-002',scenario:'Latency drift',status:'Breach',values:{7:[6,6],9:[104,124],16:[350,800]}},
{id:'alpha-003',scenario:'Verified retest',status:'Pass',retestOf:'alpha-002',values:{7:[6,6],9:[104,106],16:[350,750]}},
{id:'alpha-004',scenario:'Missing network telemetry',status:'Incomplete',values:{7:[6,5],9:[104,null],16:[350,null]}}
];
export const controls:Control[]=['7','9','16'];
export const rules:Record<Control,{name:string;metric:string;limit:number;unit:string;owner:string;version:string;basis:string}>={
7:{name:'Event recording',metric:'Expected events captured',limit:100,unit:'%',owner:'Divya',version:'demo-v0.1',basis:'Six expected unique events per one-minute window across three zones, compared with an independent sample manifest. Zero missing events allowed.'},
9:{name:'Drift & performance',metric:'Maximum latency deviation',limit:10,unit:'%',owner:'Pethachi',version:'demo-v0.1',basis:'Absolute deviation from a 100 ms baseline in each one-minute window. No violating windows allowed.'},
16:{name:'Per-run budget',metric:'Cumulative run tokens',limit:1000,unit:'tokens',owner:'Sid',version:'demo-v0.1',basis:'Input plus output tokens from run start, including retries. These samples demonstrate measurement only, not runtime enforcement.'}
};
export function evaluate(run:Run,control:Control,window:Window='all'){
 const indices=window==='all'?[0,1]:[window==='first'?0:1];
 const records=indices.map(i=>({recordId:`sample-${run.id}-c${control}-${i+1}`,runId:run.id,controlId:control,thresholdVersion:rules[control].version,startUTC:`2026-10-04T10:0${i}:00Z`,endUTC:`2026-10-04T10:0${i+1}:00Z`,value:run.values[control][i],unit:control==='9'?'ms':control==='7'?'events':'tokens',source:'Synthetic fixture',sample:true}));
 const values=records.map(r=>r.value);let value:number|null=null;let verdict:Verdict='Unknown';
 if(values.every((v):v is number=>v!==null)){
 value=control==='7'?values.reduce((a,b)=>a+b,0)/(indices.length*6)*100:control==='9'?Math.max(...values.map(v=>Math.abs(v-100))):Math.max(...values);
 verdict=(control==='7'?value<rules[control].limit:value>rules[control].limit)?'Breach':'Pass';
 }
 return {sample:true,provenance:{source:'Synthetic fixture',invoker:null,actingComponent:'Browser sample evaluator',traceId:null},action:{status:'Not performed',description:'Sample verdict only; no runtime enforcement'},notification:{status:'Not sent',recipient:rules[control].owner,receiptId:null},runId:run.id,controlId:control,window,verdict,value,threshold:rules[control],records,retestOf:run.retestOf??null};
}
