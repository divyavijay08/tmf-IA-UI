/** Browser projection of the backend's agent-workflow/v1 contract. */
export const stageNames:Record<string,string>={
 'customer:triage':'Customer service', 'it:analysis':'IT investigation',
 'network:analysis':'Network analysis', 'customer:response':'Customer response',
};
export const outcomeNames:Record<string,string>={answered:'Response ready',insufficient_information:'More information needed',human_approval_required:'Human approval required',execution_failure:'Investigation incomplete'};
export type WorkflowFinding={stage:string;invocation_id:string;answer:string;findings:string[];evidence_references:string[];unresolved_issues:string[];limitations:string[];recommended_next_steps:string[]};
export type WorkflowStage={stage:string;role:string;actor:string;status:string;invoked:boolean;invocation_id?:string|null;reason?:string;routing_reason?:string;routing?:string;outcome?:string;started_at?:string;completed_at?:string;evidence_errors:string[]};
export type WorkflowEvent={id:string;stage:string;invocation_id?:string;trace_id?:string;kind?:string;request_tool_name?:string;outcome?:string;http_status?:number;time?:string};
export type AgentWorkflow={version:'agent-workflow/v1';mode:'workflow';status:string;outcome?:string|null;finalAnswer:string;traceId:string;assessmentStatus:string;stages:WorkflowStage[];findings:WorkflowFinding[];events?:WorkflowEvent[]};
const strings=(v:unknown):v is string[]=>Array.isArray(v)&&v.every(x=>typeof x==='string');
export function parseWorkflow(value:unknown,traceId?:string):AgentWorkflow|null{
 if(value==null)return null;
 const w=value as AgentWorkflow;
 if(w.version!=='agent-workflow/v1'||w.mode!=='workflow'||!['running','completed','failed','interrupted'].includes(w.status)||typeof w.finalAnswer!=='string'||!(/^[a-f0-9]{32}$/i.test(w.traceId))||(traceId&&traceId!==w.traceId)||!Array.isArray(w.stages)||w.stages.length!==4||!Array.isArray(w.findings))throw Error('Workflow evidence is unavailable: invalid identity or schema.');
 if(w.outcome!=null&&!outcomeNames[w.outcome])throw Error('Workflow evidence has an unknown outcome.');
 if(['completed','failed'].includes(w.status)&&!w.outcome)throw Error('Completed workflow evidence is missing its outcome.');
 for(const [index,s] of w.stages.entries()){
  if(s.stage!==Object.keys(stageNames)[index]||s.role!==s.stage.split(':')[0]||typeof s.actor!=='string'||typeof s.invoked!=='boolean'||!['pending','running','interrupted','completed','failed','unnecessary'].includes(s.status)||!strings(s.evidence_errors)||s.invoked&&typeof s.invocation_id!=='string')throw Error('Workflow stage evidence is invalid.');
  const allowed=s.stage==='customer:triage'?['finish','request_it']:s.stage==='it:analysis'?['finish','request_network']:['finish'];
  if(s.routing&&!allowed.includes(s.routing))throw Error('Workflow routing evidence is invalid.');
 }
 for(const f of w.findings){const s=w.stages.find(s=>s.stage===f.stage);if(!s||s.invocation_id!==f.invocation_id||typeof f.answer!=='string'||!['findings','evidence_references','unresolved_issues','limitations','recommended_next_steps'].every(k=>strings(f[k as keyof WorkflowFinding])))throw Error('Workflow findings do not match the recorded stage.');}
 if(w.events!=null&&(!Array.isArray(w.events)||w.events.some(e=>!w.stages.some(s=>s.stage===e.stage&&s.invocation_id===e.invocation_id)||e.trace_id&&e.trace_id!==w.traceId)))throw Error('Workflow events do not match this conversation.');
 return w;
}
export function workflowAnswer(workflow:AgentWorkflow|null,legacyAnswer?:string){return workflow?workflow.finalAnswer:legacyAnswer||'';}
export function stageState(s:WorkflowStage,w:AgentWorkflow){return s.status==='unnecessary'?(w.status==='failed'||w.status==='interrupted'?'Not run · investigation stopped':'Not needed'):s.status==='completed'?'Completed':s.status==='failed'?'Failed':s.status==='running'?'Working':s.status==='interrupted'?'Interrupted':'Awaiting routing';}
export function workflowTools(w:AgentWorkflow,stage?:string){return (w.events||[]).filter(e=>e.kind==='tool'&&(!stage||e.stage===stage));}
