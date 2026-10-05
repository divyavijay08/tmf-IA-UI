export type EventRecord={event_id:string;phase:string;actor:string;emitted_at:string;call_id:string|null;verdict:string|null;reason:string|null;committed:number|null;reserved:number|null;estimate:number|null;projected:number|null;recipient:string|null;delivery_status:string|null};
export type WorkshopRun={id:string;scenario:string;completed:boolean;sourcePath:string;report:{verdict:string|null;'threshold.version':string|null;'threshold.value':number|null;'measured.value':number|null;'evidence.refs':{call_id:string;at:string;input_tokens:number;output_tokens:number}[]|null;warnings:string[]|null;findings:string[]|null;window:string[]|null};budget:{committed:number;reserved:number;blocked:boolean;threshold:{cap:number;alert:number;refusal:number;version:string;owner:string}};events:EventRecord[]};
export type WorkshopSnapshot={schema:1;source:string;capturedAt:string;runs:WorkshopRun[]};
export function parseWorkshop(value:unknown):WorkshopSnapshot{
 const d=value as WorkshopSnapshot;
 if(!d||d.schema!==1||d.source!=='AWS Workshop evidence export'||!Number.isFinite(Date.parse(d.capturedAt))||!Array.isArray(d.runs)||!d.runs.length)throw new Error('Invalid workshop evidence snapshot');
 for(const r of d.runs){if(typeof r.id!=='string'||typeof r.scenario!=='string'||!r.report||!r.budget||!Array.isArray(r.events)||!r.budget.threshold)throw new Error('Incomplete run evidence');
 for(const n of [r.budget.committed,r.budget.reserved,r.budget.threshold.cap,r.budget.threshold.alert,r.budget.threshold.refusal])if(typeof n!=='number'||!Number.isFinite(n)||n<0)throw new Error('Invalid budget measurement');
 if(![null,'SATISFIED','NOT SATISFIED','NO EVIDENCE'].includes(r.report.verdict))throw new Error('Unsupported evaluator verdict');
 if(r.report['evidence.refs']!==null&&!Array.isArray(r.report['evidence.refs']))throw new Error('Invalid gateway references');
 for(const e of r.events)if(typeof e.event_id!=='string'||typeof e.phase!=='string'||typeof e.actor!=='string'||!Number.isFinite(Date.parse(e.emitted_at)))throw new Error('Invalid evidence event');
 for(const f of r.report['evidence.refs']??[])if(typeof f.call_id!=='string'||!Number.isFinite(Date.parse(f.at))||![f.input_tokens,f.output_tokens].every(n=>Number.isInteger(n)&&n>=0))throw new Error('Invalid gateway usage');
 }
 return d;
}
export const workshopLinks={ide:'https://drgzfgdt7rb0h.cloudfront.net/?folder=%2Fhome%2Fec2-user%2Fenvironment',workshop:'https://catalog.us-east-1.prod.workshops.aws/event/dashboard/en-US',servicenow:'https://platformdemoh8.service-now.com/now/ai-control-tower/configurations/params/selected-content-item/configuration_ai_sgc_discovery',studio:'https://platformdemoh8.service-now.com/now/agent-studio/create-manage/'};
