export type RecordData = {[key:string]:any};
export type AssuranceEvent=RecordData & {id:string;source:string;time:string|null;actor?:string;phase?:string};
export type AssuranceRun={id:string;scenario:string;sources:RecordData;collectedAt:string|null;window:string[];c7:RecordData;c7Threshold:RecordData;c16:RecordData;budget:RecordData;c16Threshold?:RecordData;c9?:RecordData;c9Threshold?:RecordData;qualityBaseline?:RecordData;qualityWindows?:RecordData[];expectedQualityWindowIds?:string[];expectedCallIds?:string[];expectedEvents?:RecordData[];workflow:{aborted:boolean|null;completedAt:string|null;results:RecordData[];failures:RecordData[]};events:AssuranceEvent[]};
export type AssuranceData={schema:2;source:string;readAt:string;runs:AssuranceRun[];errors:RecordData[];freshness:string};
export function parseAssurance(value:unknown):AssuranceData{
 const d=value as AssuranceData;
 if(!d||d.schema!==2||d.source!=='AWS collected evidence'||!Array.isArray(d.runs)||!Number.isFinite(Date.parse(d.readAt)))throw Error('Invalid assurance response');
 for(const r of d.runs){if(typeof r.id!=='string'||!r.c7||!r.c16||!r.budget||!r.workflow||!Array.isArray(r.events)||!Array.isArray(r.workflow.results)||!Array.isArray(r.workflow.failures))throw Error('Incomplete run');
 for(const c of [r.c7,r.c16])if(c.verdict!=null&&!['SATISFIED','NOT SATISFIED','NO EVIDENCE','INCONCLUSIVE','PASS','BREACH'].includes(c.verdict))throw Error('Unknown control verdict');
 for(const e of r.events)if(typeof e.id!=='string'||typeof e.source!=='string'||(e.time!=null&&!Number.isFinite(Date.parse(e.time))))throw Error('Invalid event time');
 }
 return d;
}
export function category(e:AssuranceEvent){const p=e.phase??'';if(p.includes('notification'))return 'Notification';if(p.startsWith('spend-'))return 'Budget';if(e.source.startsWith('decisions'))return 'Authorization';if(p.includes('tool'))return 'Tool';if(p==='invocation')return 'Model';return 'Agent'}
export const categories=['Agent','Model','Tool','Authorization','Budget','Notification'];
export const colors:Record<string,string>={Agent:'var(--chart-agent, #5466ad)',Model:'var(--chart-model, #2266cf)',Tool:'var(--chart-tool, #087f8c)',Authorization:'var(--chart-authorization, #7947b5)',Budget:'var(--chart-budget, #9b6500)',Notification:'var(--chart-notification, #ad3f74)'};
export function failed(e:AssuranceEvent){return Number(e.http_status)>=400||!!e.error||['refused','deny','denied','refuse','error','breach'].includes(String(e.verdict??e.outcome??e.decision??'').toLowerCase())||e.phase==='spend-uncertain'}
export function filterEvents(events:AssuranceEvent[],query:string,actor:string,kind:string,onlyFailures:boolean,window?:[number,number]){return events.filter(e=>(!actor||e.actor===actor)&&(!kind||category(e)===kind)&&(!onlyFailures||failed(e))&&(!query||JSON.stringify(e).toLowerCase().includes(query.toLowerCase()))&&(!window||(e.time!=null&&Date.parse(e.time)>=window[0]&&Date.parse(e.time)<=window[1]))).sort((a,b)=>(a.time?Date.parse(a.time):Infinity)-(b.time?Date.parse(b.time):Infinity))}
export function histogram(events:AssuranceEvent[],start:number,end:number,bins=60){const counts=Array(bins).fill(0) as number[];for(const e of events){const t=Date.parse(e.time??'');if(Number.isFinite(t)&&t>=start&&t<=end)counts[Math.min(bins-1,Math.floor((t-start)/Math.max(1,end-start)*bins))]++}return counts}
export function workflowStatus(r:AssuranceRun){if(r.workflow.aborted)return 'Incomplete · run aborted';if(r.workflow.results.some(x=>x.returncode!==0))return 'Incomplete · agent execution failed';if(!r.workflow.results.length)return 'Completion not established';if(r.workflow.results.some(x=>!x.disposition||x.disposition==='undetermined'))return 'Outcome undetermined';return r.workflow.completedAt?'Execution finished · verify business outcome':'Completion not established'}

export function timeBuckets(events:AssuranceEvent[],start:number,end:number,size:number){
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||!Number.isFinite(size)||size<=0)return [];
 const count=Math.max(1,Math.ceil((end-start)/size));
 const buckets=Array.from({length:count},(_,i)=>({start:start+i*size,end:Math.min(end,start+(i+1)*size),events:[] as AssuranceEvent[]}));
 for(const event of events){const t=Date.parse(event.time??'');if(Number.isFinite(t)&&t>=start&&t<=end)buckets[Math.min(count-1,Math.floor((t-start)/size))].events.push(event)}
 return buckets;
}
