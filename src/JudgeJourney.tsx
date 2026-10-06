import {useEffect,useMemo,useRef,useState} from 'react';
import {Alert,Button} from '@mui/material';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import ChatBubbleOutlineRounded from '@mui/icons-material/ChatBubbleOutlineRounded';
import {ThinkingState} from './aicss/ThinkingState';
import './judge-chat.css';
import {VoiceInput} from './VoiceInput';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import {spanType,matchConversationRun,conversationControls,conversationReferences,elapsedSeconds,traceUsage} from './conversationEvidence';
import type {AssuranceData,AssuranceRun} from './assuranceData';
import {workflowStatus} from './assuranceData';
import {parseWorkflow,workflowAnswer,stageNames,outcomeNames,stageState,workflowTools,type AgentWorkflow} from './workflowJourney';
import {parseCloudCapture,type CloudSpan} from './cloudwatchData';
import {ConversationTrace} from './ConversationTrace';
import {workshopLinks} from './workshopLinks';

const REFERENCE_TRACE='c0b7e0a31db241a3adf9218c40c6cf8f';
const CLOUDWATCH=`https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#/gen-ai-observability/spans?traceId=${REFERENCE_TRACE}`;
type JourneyStage={id:string;role:string;title:string;state:string;startedAt?:string;finishedAt?:string;answer?:string;error?:string;disposition?:string;toolCalls?:{tool_name?:string;request_tool_name?:string;outcome?:string;attempt_id?:string}[]};
type Job={workflow?:unknown;journey?:JourneyStage[];journeyError?:string;evidenceState?:string;id:string;runId:string;scenario:string;state:string;createdAt:string;startedAt?:string;finishedAt?:string;message?:string;traceId?:string;invokedAgents?:string[];kind?:string;userMessage?:string;answer?:string;parentId?:string;history?:{role:string;content:string}[]};
type Config={enabled:boolean;chatEnabled?:boolean;scenarios:{id:string;title:string}[];threshold:{version?:string};actors:Record<string,string>};
type JourneyProps={data:AssuranceData|null;onRefresh:()=>void;onOpenRun:(id:string)=>void;onOpenControls:(id:string)=>void;onOpenTelemetry:(id:string)=>void};

const isActive=(state?:string)=>!!state&&['queued','running','collecting'].includes(state);
const verdictClass=(value:unknown)=>['SATISFIED','PASS'].includes(String(value))?'good':['NOT SATISFIED','BREACH'].includes(String(value))?'bad':'unknown';
const actorFor=(span:CloudSpan)=>span.service||'Unidentified service';


function AgentEvent({span}:{span:CloudSpan}){
 const actor=actorFor(span);
 const failed=span.status?.toUpperCase()==='ERROR'||Number(span.httpStatus)>=400;
 return <div className="journey-event"><span aria-hidden="true">{failed?'!':'•'}</span><div><div className="journey-event-heading"><strong>{actor}</strong><span>{span.durationMs.toFixed(1)} ms</span></div><p>{spanType(span)} · <code>{span.tool||span.name}</code></p>{span.model&&<p>{span.model}{span.totalTokens!=null?` · ${span.totalTokens.toLocaleString()} tokens`:''}</p>}</div><span className="journey-event-status" data-error={failed}>{failed?'Recorded error':'Recorded'}</span></div>;
}

export function JudgeJourney({data,onRefresh,onOpenRun,onOpenControls,onOpenTelemetry}:JourneyProps){
 const [config,setConfig]=useState<Config|null>(null),[jobs,setJobs]=useState<Job[]>([]),[prompt,setPrompt]=useState(''),[jobId,setJobId]=useState(''),[spans,setSpans]=useState<CloudSpan[]>([]),[selectedSpan,setSelectedSpan]=useState(''),[error,setError]=useState(''),[launching,setLaunching]=useState(false),[tab,setTab]=useState<'Conversation'|'Trace & controls'>('Conversation');
 const request=useRef<{message:string;parentId?:string;idempotencyKey:string}|null>(null);
 const [search,setSearch]=useState('');
 const busy=useRef(false);
 const refreshRef=useRef(onRefresh);refreshRef.current=onRefresh;
 const job=jobs.find(x=>x.id===jobId);
 const {workflow,workflowError}=useMemo(()=>{try{return {workflow:parseWorkflow(job?.workflow,job?.traceId),workflowError:''}}catch(e){return {workflow:null,workflowError:(e as Error).message}}},[job]);
 const traceId=workflow?.traceId||job?.traceId||'',answer=workflowError?'':workflowAnswer(workflow,job?.answer);
 const [traceNotice,setTraceNotice]=useState(''),[traceLoading,setTraceLoading]=useState(false),[traceRefresh,setTraceRefresh]=useState(0),[traceReadAt,setTraceReadAt]=useState('');
 const matchedRun=useMemo(()=>matchConversationRun(data?.runs||[],job?.runId,traceId),[data,job?.runId,traceId]);

 useEffect(()=>{
  const controller=new AbortController();
  fetch('api/execution-config',{cache:'no-store',signal:controller.signal}).then(async r=>{if(!r.ok)throw Error('Customer service is unavailable');setConfig(await r.json())}).catch(e=>{if(e.name!=='AbortError')setError(e.message)});
  return()=>controller.abort();
 },[]);
 useEffect(()=>{
  let cancelled=false;let timer:ReturnType<typeof setTimeout>|undefined;const controller=new AbortController();
  async function refresh(){
   try{
    const r=await fetch('api/executions',{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error('Message status is unavailable');
    const nextJobs=(await r.json()).executions as Job[];if(cancelled)return;setJobs(nextJobs);
    const selected=nextJobs.find(j=>j.id===jobId);
    if(selected&&!isActive(selected.state))refreshRef.current();
    if(!cancelled&&nextJobs.some(j=>isActive(j.state)||j.evidenceState==='collecting'))timer=setTimeout(()=>void refresh(),3000);
   }catch(e){if(!cancelled)setError((e as Error).message)}
  }
  void refresh();return()=>{cancelled=true;controller.abort();clearTimeout(timer)};
 },[jobId]);
 useEffect(()=>{
  setSpans([]);setSelectedSpan('');setTraceNotice('');setTraceReadAt('');setTraceLoading(false);
  if(!traceId||!job)return;
  let cancelled=false;let timer:ReturnType<typeof setTimeout>|undefined;const controller=new AbortController();
  const createdAt=job.createdAt,finishedAt=job.finishedAt;
  async function loadTrace(){
   setTraceLoading(true);
   try{
    const from=new Date(Date.parse(createdAt)-60_000),to=new Date(finishedAt?Date.parse(finishedAt)+60_000:Date.now());
    const r=await fetch('api/conversation-trace?'+new URLSearchParams({traceId,from:from.toISOString(),to:to.toISOString()}),{cache:'no-store',signal:controller.signal});
    if(!r.ok)throw Error('Trace service is unavailable.');
    const capture=parseCloudCapture(await r.json());if(!cancelled){const linked=capture.spans.filter(s=>s.traceId===traceId).sort((a,b)=>Date.parse(a.startTime)-Date.parse(b.startTime));setSpans(linked);setTraceReadAt(new Date().toISOString());setTraceNotice((capture.complete===false?'Partial CloudWatch evidence. ':linked.length?'':'No matching spans have arrived yet. ')+capture.coverage);}
   }catch{if(!cancelled)setTraceNotice('CloudWatch evidence is unavailable. Recorded workflow stages remain visible. Retry with Refresh evidence.');}
   finally{if(!cancelled)setTraceLoading(false);}
   if(!cancelled&&(!finishedAt||Date.now()<Date.parse(finishedAt)+90_000))timer=setTimeout(()=>void loadTrace(),15000);
  }
  void loadTrace();return()=>{cancelled=true;controller.abort();clearTimeout(timer)};
 },[traceId,job?.id,job?.createdAt,job?.finishedAt,traceRefresh]);
 async function launch(){
  if(!prompt.trim()||busy.current||!config?.chatEnabled||isActive(job?.state))return;
  const sentPrompt=prompt,parentId=job?.kind==='chat'&&job.state==='completed'&&job.answer?job.id:undefined;busy.current=true;setLaunching(true);setError('');setTab('Conversation');
  if(!request.current||request.current.message!==sentPrompt||request.current.parentId!==parentId)request.current={message:sentPrompt,parentId,idempotencyKey:crypto.randomUUID()};
  try{
   const r=await fetch('api/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request.current),signal:AbortSignal.timeout(15000)});const body=await r.json();if(!r.ok)throw Error(body.error||'Message rejected');
   setJobs(current=>[body,...current.filter(j=>j.id!==body.id)]);setJobId(body.id);setPrompt(current=>current===sentPrompt?'':current);setSpans([]);request.current=null;
  }catch(e){setError((e as Error).message)}finally{setLaunching(false);busy.current=false}
 }
 const visible=spans.filter(s=>s.traceId===traceId);
 const toolSpans=visible.filter(s=>spanType(s)==='Tool call');
 const modelSpans=visible.filter(s=>spanType(s)==='Model request');

 return <section className="judge-journey judge-chat-shell">
  <aside className="chat-history">
   <div className="chat-history-brand"><ChatBubbleOutlineRounded/><strong>Your conversations</strong></div>
   <button className="chat-new" onClick={()=>{setJobId('');setPrompt('');setSpans([]);setTab('Conversation')}}><AddRounded/>New chat</button>
   <label className="chat-search"><SearchRounded/><input aria-label="Search conversations" placeholder="Search chats" value={search} onChange={e=>setSearch(e.target.value)}/></label>
   <p className="chat-history-label">Recent</p>
   <div className="chat-history-list">{jobs.filter(j=>!jobs.some(child=>child.parentId===j.id)).filter(j=>`${j.runId} ${j.userMessage||j.scenario}`.toLowerCase().includes(search.toLowerCase())).map(j=><button key={j.id} aria-pressed={j.id===jobId} onClick={()=>{setJobId(j.id);setSpans([]);setTab('Conversation')}}><ChatBubbleOutlineRounded/><span><b>{j.userMessage||config?.scenarios.find(s=>s.id===j.scenario)?.title||j.scenario}</b><small>{j.state} · {new Date(j.createdAt).toLocaleDateString()}</small></span></button>)}{!jobs.length&&<p className="chat-history-empty">Your investigations will appear here.</p>}</div>
   <div className="chat-history-footer"><ChatBubbleOutlineRounded aria-hidden="true"/><span>Customer service agent<small>Team Alpha workspace</small></span></div>
  </aside>
  <div className="chat-workspace">
   <header className="chat-topbar"><div><strong>{job?'Service investigation':'Alpha assistant'}</strong>{job&&<span className="chat-status">{workflow?.outcome?outcomeNames[workflow.outcome]:job.state}</span>}</div><div className="chat-view-tabs"><button aria-pressed={tab==='Conversation'} onClick={()=>setTab('Conversation')}>Conversation</button>{job&&<button aria-pressed={tab==='Trace & controls'} onClick={()=>setTab('Trace & controls')}>Trace & controls</button>}</div></header>
   {error&&<Alert severity="warning">{error}</Alert>}
   {job&&<div className="chat-trace-status" aria-live="polite"><div><strong>{traceLoading?'Loading trace evidence…':traceReadAt?`${visible.length} spans · ${modelSpans.length} model-related spans · ${toolSpans.length} tool-related spans`:traceId?'Trace evidence unavailable':'Awaiting a conversation trace ID'}</strong><small>{traceNotice||'Recorded workflow activity is independent of CloudWatch ingestion.'}{traceReadAt&&` Last read ${new Date(traceReadAt).toLocaleTimeString()}.`}</small></div><Button disabled={!traceId||traceLoading} onClick={()=>{setTraceRefresh(n=>n+1);refreshRef.current()}}>Refresh evidence</Button></div>}
   {tab==='Conversation'?<div className={`chat-conversation ${job?'has-conversation':'is-empty'}`}>
    {!job?<div className="chat-welcome"><span className="chat-welcome-eyebrow">TEAM ALPHA</span><h1>Let’s investigate together.</h1><p>Your customer, IT and network agents. One connected investigation.</p></div>:<div className="chat-transcript">
     {job.history?.map((turn,index)=><div key={index} className={turn.role==='user'?'chat-user-message':'chat-answer'}>{turn.content}</div>)}
     <div className="chat-user-message">{job.userMessage||`Investigate ${config?.scenarios.find(s=>s.id===job.scenario)?.title||job.scenario}.`}</div>
     <div className="chat-agent-heading"><ChatBubbleOutlineRounded aria-hidden="true"/><b>Alpha assistant</b></div>
     {workflow?<WorkflowActivity workflow={workflow} journey={job?.journey}/>:!workflowError&&!!job.journey?.length&&<JourneyActivity stages={job.journey}/>}
     {workflowError&&<Alert severity="warning">{workflowError}</Alert>}
     {job.journeyError&&<Alert severity="warning">{job.journeyError}</Alert>}
     {answer&&<div className="chat-answer">{answer}</div>}
     {isActive(job.state)?<div className="chat-processing">{!answer&&<ThinkingState/>}<span>{answer?'Collecting trace evidence':(workflow?.stages.find(s=>s.status==='running')?stageNames[workflow.stages.find(s=>s.status==='running')!.stage]:job.journey?.find(s=>s.state==='running')?.title||'Starting investigation')}</span></div>:!answer&&!workflowError&&<p>{job.kind==='chat'?'No agent answer was returned.':'Saved scenario execution. No chat message was sent for this run.'}</p>}
     <details className="chat-activity" open={isActive(job.state)}><summary>CloudWatch activity <span>{visible.length} recorded spans</span></summary><div className="journey-events">{visible.length?visible.map(s=><AgentEvent key={s.traceId+s.spanId} span={s}/>):<p>{traceLoading?'Loading recorded activity…':traceReadAt?'No matching spans have arrived yet. Refresh to check for late-ingested evidence.':'Trace evidence has not loaded. See the connection status above.'}</p>}</div></details>
     {!workflow&&job.message&&<p className="chat-run-message">{job.message}</p>}
     {job.traceId&&<div className="chat-evidence-links"><Button onClick={()=>setTab('Trace & controls')}>Explore trace & controls</Button><Button component="a" href={CLOUDWATCH.replace(REFERENCE_TRACE,job.traceId)} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewOutlined/>}>CloudWatch</Button></div>}
    </div>}
    <div className="chat-compose-area"><form className="chat-compose" onSubmit={e=>{e.preventDefault();void launch()}}><textarea aria-label="Message the customer service agent" placeholder="Ask Alpha about a service issue…" rows={2} maxLength={3000} value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(!launching&&config?.chatEnabled&&!isActive(job?.state))void launch()}}}/><div className="chat-compose-toolbar"><span className="chat-model" aria-label="Model: NVIDIA Nemotron Super 120B"><span className="chat-model-brand">NVIDIA</span><strong>Nemotron Super 120B</strong><span className="chat-model-label">Customer service</span></span><div className="chat-compose-actions"><VoiceInput value={prompt} onChange={setPrompt} disabled={launching||isActive(job?.state)}/><button type="submit" aria-label="Send message" disabled={launching||!config?.chatEnabled||!prompt.trim()||isActive(job?.state)}><ArrowUpwardRounded/></button></div></div></form>
    {!job&&<div className="chat-suggestions">{['Investigate SITE-DEN-12','Check customer impact','Review network and digital twin'].map(label=><button key={label} onClick={()=>setPrompt(label==='Investigate SITE-DEN-12'?'Investigate fronthaul degradation at SITE-DEN-12. Check impacted customers, consult IT incident records, ask Network for digital-twin analysis, then summarize the evidence and next steps.':`${label}. Ask me for any missing service or customer details.`)}>{label}</button>)}</div>}
    <p className="chat-compose-note">{config?.chatEnabled?'Customer service brings in IT and Network when needed. Recorded activity appears as each stage reports back.':(error?'Customer service unavailable.':'Connecting to customer service…')}</p></div>
   </div>:<div className="chat-inspector"><TraceControls spans={visible} selected={selectedSpan} onSelected={setSelectedSpan} run={matchedRun} job={job} workflow={workflow} traceNotice={traceNotice} onOpenRun={onOpenRun} onOpenControls={onOpenControls} onOpenTelemetry={onOpenTelemetry}/></div>}
  </div>
 </section>;
}

function TraceControls({spans,selected,onSelected,run,job,workflow,traceNotice,onOpenRun,onOpenControls,onOpenTelemetry}:{spans:CloudSpan[];selected:string;onSelected:(id:string)=>void;run?:AssuranceRun;job?:Job;workflow:AgentWorkflow|null;traceNotice:string;onOpenRun:(id:string)=>void;onOpenControls:(id:string)=>void;onOpenTelemetry:(id:string)=>void}){
 const [spanFilter,setSpanFilter]=useState('All spans');
 const filtered=spans.filter(s=>spanFilter==='All spans'||spanType(s)===spanFilter);
 const chosen=filtered.find(s=>s.spanId===selected)??filtered.find(s=>spanType(s)==='Agent invocation')??filtered.find(s=>spanType(s)==='Model request')??filtered[0],traceId=workflow?.traceId||job?.traceId;
 const controls=conversationControls(run,traceId),references=conversationReferences(run,traceId),duration=elapsedSeconds(job?.startedAt,job?.finishedAt);
 const finalFinding=workflow?.findings.find(f=>f.stage==='customer:response')||workflow?.findings.at(-1);
 const failures=run?.workflow.failures.length,usage=traceUsage(spans);
 const telemetry:Record<string,string>={'7':`${spans.length} unique spans retrieved across ${new Set(spans.map(s=>s.logGroup).filter(Boolean)).size} log groups. A complete expected-event inventory is still required to evaluate recording coverage.`, '16':`${usage.calls} ${usage.basis}: ${usage.input==null?'input usage not recorded':usage.input.toLocaleString()+' input tokens'}, ${usage.output==null?'output usage not recorded':usage.output.toLocaleString()+' output tokens'}. Parent agent/cycle usage is excluded.`, '9':usage.p95==null?'Model-call latency is not recorded.':`Recorded model-call P95: ${usage.p95.toFixed(1)} ms (${usage.calls} calls). A baseline is required to assess drift.`};
 return <div className="journey-trace-layout">
  <div>{workflow&&<WorkflowActivity workflow={workflow} journey={job?.journey}/>}<div className="chat-span-filter"><label>Span category <select aria-label="Span category" value={spanFilter} onChange={e=>{setSpanFilter(e.target.value);onSelected('')}}>{['All spans','Agent invocation','Agent cycle','Model request','Tool call','MCP request','Service request'].map(type=><option key={type} value={type}>{type} ({type==='All spans'?spans.length:spans.filter(s=>spanType(s)===type).length})</option>)}</select></label><small>{usage.calls} {usage.basis} · {usage.input==null?'Input usage unavailable':`${usage.input.toLocaleString()} input tokens`} · {usage.output==null?'Output usage unavailable':`${usage.output.toLocaleString()} output tokens`}</small></div><ConversationTrace spans={spans} visibleIds={new Set(filtered.map(s=>s.spanId))} selected={chosen?.spanId} onSelect={id=>{if(!filtered.some(s=>s.spanId===id))setSpanFilter('All spans');onSelected(id)}}/><p className="chat-evidence-note">{traceNotice}</p></div>
  <aside>
   <section className="wa-panel journey-controls"><header><div><h2>Control evidence</h2><span className="control-run-id">{run?.id||'No collected run match'}</span></div><span className="control-assessment-count">{controls.filter(c=>c.assessed).length} of {controls.length} assessed</span></header>
    <div className="control-explanation"><strong>{controls.some(c=>c.assessed)?'Telemetry and assessments are separate':'No assessment results recorded'}</strong><p>{controls.some(c=>c.assessed)?'Recorded verdicts are shown below with the supporting telemetry for this conversation.':'“Not assessed” means no matching control assessment result was supplied for this run. It is not an access error, a pass, or a failure. Telemetry and assessment results are collected separately.'}</p></div>
    <div className="conversation-control-grid">{controls.map(c=><article key={c.id} className="conversation-control-card"><header><span className="control-number">C{c.id}</span><h3>{c.name}</h3><span className={`control-verdict ${c.assessed?verdictClass(c.verdict):'unassessed'}`}>{c.verdict}</span></header><div className="control-telemetry"><h4>Recorded telemetry</h4><p>{telemetry[c.id]}</p></div><div className="control-requirement"><h4>{c.assessed?'Assessment result':'Assessment needed'}</h4><p>{c.detail}</p></div></article>)}</div>
    <footer><span>Refresh evidence retrieves recorded results; it does not run assessments.</span>{run&&<div className="journey-control-actions"><Button onClick={()=>onOpenControls(run.id)}>Inspect controls</Button><Button onClick={()=>onOpenTelemetry(run.id)}>Open trace explorer</Button></div>}</footer>
   </section>
   <section className="wa-panel journey-outcome"><header><h2>Finding & outcome</h2><span>Evidence for this conversation</span></header><p><b>Workflow:</b> {workflow?.outcome?outcomeNames[workflow.outcome]:run?workflowStatus(run):job?.state||'No workflow status recorded'}{duration!=null&&` · ${duration.toFixed(1)} s elapsed`}</p>{workflow?.outcome==='answered'&&<p>The agent produced a response. Service restoration is not established by this status.</p>}{failures!=null&&<p><b>Recorded request failures:</b> {failures}{failures>0?' — review run evidence for failed attempts, including retries.':' in the collected workflow record.'}</p>}
    {finalFinding&&<details className="chat-outcome-details"><summary>Reported findings & next steps</summary>{([['Findings',finalFinding.findings],['Unresolved questions',finalFinding.unresolved_issues],['Limitations',finalFinding.limitations],['Next steps',finalFinding.recommended_next_steps]] as const).map(([label,items])=>items.length>0&&<div key={label}><b>{label}</b><ul>{items.map((item,i)=><li key={i}>{item}</li>)}</ul></div>)}<small>Agent-reported findings; external resolution is not independently verified.</small></details>}
    <p><b>ServiceNow / finding references:</b> {references.length?`${references.length} recorded reference(s) in this run. External record state has not been verified.`:run?'No finding ID or ServiceNow record reference was supplied in this run’s evidence.':'Run evidence is unavailable; finding linkage cannot be checked.'}</p>{references.length>0&&<ul className="chat-outcome-references">{references.map((ref,i)=><li key={i}>{ref.number&&<>ServiceNow: <code>{ref.number}</code> </>}{ref.sysId&&<>Record ID: <code>{ref.sysId}</code> </>}{ref.finding&&<>Finding: <code>{ref.finding}</code> </>}{ref.receipt&&<>Receipt: <code>{ref.receipt}</code> </>}<small>Source: {ref.source}</small></li>)}</ul>}
    <p><b>Measured business impact:</b> Not available in the current evidence. Elapsed runtime is shown above when recorded; time saved and avoided loss are not calculated.</p><div className="journey-control-actions">{run&&<Button onClick={()=>onOpenRun(run.id)}>Open run evidence</Button>}<Button component="a" href={workshopLinks.servicenow} target="_blank" rel="noopener noreferrer">Open ServiceNow workspace ↗</Button></div>
   </section>
  </aside>
 </div>;
}

function JourneyActivity({stages}:{stages:JourneyStage[]}){
 stages=stages.filter(s=>s.state!=='not-required');
 const done=stages.filter(s=>s.state==='completed').length;
 return <section className="chat-journey" aria-label="Investigation journey"><header><strong>Investigation journey</strong><span>{done}/{stages.length} stages complete</span></header>
 <ol>{stages.map(step=><li key={step.id} data-state={step.state}><span className="chat-stage-marker" aria-hidden="true">{step.state==='completed'?'✓':step.state==='failed'?'!':'·'}</span><div><details><summary><strong>{step.title}</strong><span>{step.state.replace('-',' ')}</span></summary><p>{step.answer||step.error||(step.state==='running'?'Waiting for the governed agent response.':'This stage has not run.')}</p>{!!step.toolCalls?.length&&<ul className="chat-stage-tools">{step.toolCalls.map((call,i)=><li key={call.attempt_id||i}><code>{call.tool_name||call.request_tool_name||'Tool call'}</code><span>{call.outcome||'Recorded'}</span></li>)}</ul>}</details>{step.state==='running'&&<small>Working with {step.role==='it'?'IT':step.role} agent</small>}</div></li>)}</ol></section>;
}

function WorkflowActivity({workflow:w,journey}:{workflow:AgentWorkflow;journey?:JourneyStage[]}){
 const called=w.stages.filter(s=>s.invoked),done=called.filter(s=>s.status==='completed');
 return <section className="chat-journey" aria-label="Investigation journey"><header><strong>Investigation journey</strong><span>{done.length}/{called.length} invoked stages complete</span></header>
 <ol>{w.stages.map(s=>{const finding=w.findings.find(f=>f.stage===s.stage),tools=workflowTools(w,s.stage),reported=journey?.find(j=>j.id===s.stage)?.toolCalls;const handoff=w.stages.find(next=>next.stage===(s.routing==='request_it'?'it:analysis':s.routing==='request_network'?'network:analysis':''))?.routing_reason;return <li key={s.stage} data-state={s.status}><span className="chat-stage-marker" aria-hidden="true">{s.status==='completed'?'✓':s.status==='failed'?'!':s.status==='unnecessary'?'–':'·'}</span><div><details><summary><strong>{stageNames[s.stage]}</strong><span>{stageState(s,w)}</span></summary>
 <p className="chat-stage-reason">{s.routing_reason||s.reason||'Awaiting the agent’s routing decision.'}</p>
 {s.outcome&&<p><b>Outcome:</b> {outcomeNames[s.outcome]||s.outcome}</p>}
 {finding&&<><p>{finding.answer}</p>{([['Findings',finding.findings],['Source references',finding.evidence_references],['Unresolved questions',finding.unresolved_issues],['Limitations',finding.limitations],['Next steps',finding.recommended_next_steps]] as const).filter(([,items])=>items.length).map(([label,items])=><div className="chat-stage-findings" key={label}><strong>{label}</strong><ul>{items.map((item,i)=><li key={i}>{item}</li>)}</ul></div>)}</>}
 {!!s.evidence_errors.length&&<Alert severity="warning">Recording issues: {s.evidence_errors.join('; ')}</Alert>}
 {!!tools.length&&<ul className="chat-stage-tools">{tools.map(t=><li key={t.id}><code>{t.request_tool_name||'Tool call'}</code><span>{t.outcome||'Recorded'}</span></li>)}</ul>}{!tools.length&&reported&&<div className="chat-stage-findings"><strong>Recorded tool calls</strong>{reported.length?<ul className="chat-stage-tools">{reported.map((t,i)=><li key={i}><code>{t.request_tool_name||t.tool_name||'Tool call'}</code><span>{t.outcome||'Recorded'}</span></li>)}</ul>:<p>No tool calls recorded for this stage.</p>}</div>}
 <dl className="chat-stage-identity"><div><dt>Runtime</dt><dd>{s.actor}</dd></div>{s.invocation_id&&<div><dt>Invocation</dt><dd>{s.invocation_id}</dd></div>}{s.started_at&&<div><dt>Started</dt><dd>{new Date(s.started_at).toLocaleTimeString()}</dd></div>}</dl>
 </details>{s.routing&&s.routing!=='finish'&&<small className="chat-handoff">↳ {s.routing==='request_it'?'Handed to IT':'Handed to Network'}{handoff?` · ${handoff}`:''}</small>}</div></li>})}</ol>
 <footer className="chat-journey-footer">{w.outcome?outcomeNames[w.outcome]:'Investigation in progress'}<code title="Conversation trace ID">{w.traceId}</code></footer></section>;
}
