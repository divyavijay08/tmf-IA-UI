import {runs,controls,evaluate,type Run,type Control} from './evidence.ts';
export type Snapshot={runs:Run[];receivedAt:string;source:'sample'};
export interface EvidenceApi {getSnapshot(signal?:AbortSignal):Promise<Snapshot>}
// Replace this adapter with an authenticated backend client once the workshop contract is known.
export const sampleApi:EvidenceApi={async getSnapshot(signal){if(signal?.aborted)throw new Error('Request cancelled');return {runs:structuredClone(runs),receivedAt:new Date().toISOString(),source:'sample'}}};
export function runStatus(run:Run):Run['status']{const verdicts=controls.map(c=>evaluate(run,c).verdict);return verdicts.includes('Unknown')?'Incomplete':verdicts.includes('Breach')?'Breach':'Pass'}
export function summarize(data:Run[]){return {total:data.length,passing:data.filter(r=>runStatus(r)==='Pass').length,breaching:data.filter(r=>runStatus(r)==='Breach').length,incomplete:data.filter(r=>runStatus(r)==='Incomplete').length,breachedControls:controls.filter(c=>data.some(r=>evaluate(r,c).verdict==='Breach')).length}}
export const controlDetails:Record<Control,{scope:string;exceptions:string;location:string;action:string;notification:string}>={
'7':{scope:'All governed actions across customer, IT and network zones.',exceptions:'Zero missing events in the illustrative expected-event manifest.',location:'Agent handoffs and tool-call boundaries (planned).',action:'Record missing-event finding; retain gaps in exported evidence.',notification:'Escalate unresolved gaps to the named owner (planned).'},
'9':{scope:'Latency measurements in each one-minute window across fault resolution.',exceptions:'Zero windows beyond the illustrative 10% deviation limit.',location:'Telemetry evaluation and human approval queue (planned).',action:'Record a drift breach and create a finding.',notification:'Notify Pethachi on a breach; delivery receipt required (planned).'},
'16':{scope:'Input and output token usage across the entire run, including retries.',exceptions:'Zero runs over the illustrative 1,000-token limit.',location:'Model gateway, before model invocation (planned).',action:'Reserve budget before invocation and block calls exceeding the cap (planned).',notification:'Notify Sid when a run is blocked; delivery receipt required (planned).'}
};
export function exportJson(name:string,data:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
