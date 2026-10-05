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
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import type {AssuranceData,AssuranceRun} from './assuranceData';
import {workflowStatus} from './assuranceData';
import {parseCloudCapture,type CloudSpan} from './cloudwatchData';
import {SpanWaterfall} from './WorkspaceCharts';
import {workshopLinks} from './workshopLinks';

const REFERENCE_TRACE='c0b7e0a31db241a3adf9218c40c6cf8f';
const CLOUDWATCH=`https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#/gen-ai-observability/spans?traceId=${REFERENCE_TRACE}`;
type JourneyStage={id:string;role:string;title:string;state:string;startedAt?:string;finishedAt?:string;answer?:string;error?:string;disposition?:string;toolCalls?:{tool_name?:string;request_tool_name?:string;outcome?:string;attempt_id?:string}[]};
type Job={journey?:JourneyStage[];journeyError?:string;evidenceState?:string;id:string;runId:string;scenario:string;state:string;createdAt:string;finishedAt?:string;message?:string;traceId?:string;invokedAgents?:string[];kind?:string;userMessage?:string;answer?:string;parentId?:string;history?:{role:string;content:string}[]};
type Config={enabled:boolean;chatEnabled?:boolean;scenarios:{id:string;title:string}[];threshold:{version?:string};actors:Record<string,string>};
type JourneyProps={data:AssuranceData|null;onRefresh:()=>void;onOpenRun:(id:string)=>void;onOpenControls:(id:string)=>void;onOpenTelemetry:(id:string)=>void};

const isActive=(state?:string)=>!!state&&['queued','running','collecting'].includes(state);
const verdict=(value:unknown)=>value==null?'Not assessed':String(value);
const verdictClass=(value:unknown)=>['SATISFIED','PASS'].includes(String(value))?'good':['NOT SATISFIED','BREACH'].includes(String(value))?'bad':'unknown';
const display=(value:unknown)=>value==null?'Awaiting evidence':typeof value==='number'?value.toLocaleString():String(value);
const actorFor=(span:CloudSpan)=>span.tool?.includes('customer')?'Customer service agent':span.tool?.includes('runbook')?'IT resolution agent':span.tool?.includes('network')?'Network agent':span.service||'Agent';


function AgentEvent({span}:{span:CloudSpan}){
 const actor=actorFor(span),tool=span.operation==='execute_tool'||!!span.tool;
 return <div className="journey-event"><CheckCircleOutline aria-hidden="true"/><div><div className="journey-event-heading"><strong>{actor}</strong><span>{span.durationMs.toFixed(1)} ms</span></div><p>{tool?'Tool call':'Agent activity'} · <code>{span.tool||span.name}</code></p></div><span className="journey-event-ok"><CheckCircleOutline/> Recorded</span></div>;
}

export function JudgeJourney({data,onRefresh,onOpenRun,onOpenControls,onOpenTelemetry}:JourneyProps){
 const [config,setConfig]=useState<Config|null>(null),[jobs,setJobs]=useState<Job[]>([]),[prompt,setPrompt]=useState(''),[jobId,setJobId]=useState(''),[spans,setSpans]=useState<CloudSpan[]>([]),[selectedSpan,setSelectedSpan]=useState(''),[error,setError]=useState(''),[launching,setLaunching]=useState(false),[tab,setTab]=useState<'Conversation'|'Trace & controls'>('Conversation');
 const request=useRef<{message:string;parentId?:string;idempotencyKey:string}|null>(null);
 const [search,setSearch]=useState('');
 const busy=useRef(false);
 const refreshRef=useRef(onRefresh);refreshRef.current=onRefresh;
 const job=jobs.find(x=>x.id===jobId),traceId=job?.traceId||'';
 const matchedRun=useMemo(()=>data?.runs.find(r=>r.id===job?.runId)||data?.runs.find(r=>r.events.some(e=>e.trace_id===traceId)),[data,job?.runId,traceId]);

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
  if(!traceId||!job)return;
  let cancelled=false;let timer:ReturnType<typeof setTimeout>|undefined;const controller=new AbortController();
  const createdAt=job.createdAt,finishedAt=job.finishedAt;
  async function loadTrace(){
   try{
    const from=new Date(Date.parse(createdAt)-60_000),to=new Date(finishedAt?Date.parse(finishedAt)+60_000:Date.now());
    const r=await fetch('api/telemetry?'+new URLSearchParams({from:from.toISOString(),to:to.toISOString()}),{cache:'no-store',signal:controller.signal});
    if(r.ok&&!cancelled){const capture=parseCloudCapture(await r.json());setSpans(capture.spans.filter(s=>s.traceId===traceId).sort((a,b)=>Date.parse(a.startTime)-Date.parse(b.startTime)))}
   }catch{/* Stage progress stays available when CloudWatch is delayed. */}
   if(!cancelled&&(!finishedAt||Date.now()<Date.parse(finishedAt)+90_000))timer=setTimeout(()=>void loadTrace(),15000);
  }
  void loadTrace();return()=>{cancelled=true;controller.abort();clearTimeout(timer)};
 },[traceId,job?.createdAt,job?.finishedAt]);
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
 const toolSpans=visible.filter(s=>s.operation==='execute_tool'||s.tool);

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
   <header className="chat-topbar"><div><strong>{job?'Service investigation':'Alpha assistant'}</strong>{job&&<span className="chat-status">{job.state}</span>}</div><div className="chat-view-tabs"><button aria-pressed={tab==='Conversation'} onClick={()=>setTab('Conversation')}>Conversation</button>{job&&<button aria-pressed={tab==='Trace & controls'} onClick={()=>setTab('Trace & controls')}>Trace & controls</button>}</div></header>
   {error&&<Alert severity="warning">{error}</Alert>}
   {tab==='Conversation'?<div className={`chat-conversation ${job?'has-conversation':'is-empty'}`}>
    {!job?<div className="chat-welcome"><span className="chat-welcome-eyebrow">TEAM ALPHA</span><h1>Let’s investigate together.</h1><p>Your customer, IT and network agents. One connected investigation.</p></div>:<div className="chat-transcript">
     {job.history?.map((turn,index)=><div key={index} className={turn.role==='user'?'chat-user-message':'chat-answer'}>{turn.content}</div>)}
     <div className="chat-user-message">{job.userMessage||`Investigate ${config?.scenarios.find(s=>s.id===job.scenario)?.title||job.scenario}.`}</div>
     <div className="chat-agent-heading"><ChatBubbleOutlineRounded aria-hidden="true"/><b>Alpha assistant</b></div>
     {!!job.journey?.length&&<JourneyActivity stages={job.journey}/>}
     {job.journeyError&&<Alert severity="warning">{job.journeyError}</Alert>}
     {job.answer&&<div className="chat-answer">{job.answer}</div>}
     {isActive(job.state)?<div className="chat-processing">{!job.answer&&<ThinkingState/>}<span>{job.answer?'Collecting trace evidence':(job.journey?.find(s=>s.state==='running')?.title||'Starting investigation')}</span></div>:!job.answer&&<p>{job.kind==='chat'?'No agent answer was returned.':'Saved scenario execution. No chat message was sent for this run.'}</p>}
     <details className="chat-activity" open={isActive(job.state)}><summary>Agent activity <span>{toolSpans.length} recorded tool calls</span></summary><div className="journey-events">{toolSpans.length?toolSpans.map(s=><AgentEvent key={s.traceId+s.spanId} span={s}/>):<p>No tool spans loaded for this conversation yet.</p>}</div></details>
     {job.message&&<p className="chat-run-message">{job.message}</p>}
     {job.traceId&&<div className="chat-evidence-links"><Button onClick={()=>setTab('Trace & controls')}>Explore trace & controls</Button><Button component="a" href={CLOUDWATCH.replace(REFERENCE_TRACE,job.traceId)} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewOutlined/>}>CloudWatch</Button></div>}
    </div>}
    <div className="chat-compose-area"><form className="chat-compose" onSubmit={e=>{e.preventDefault();void launch()}}><textarea aria-label="Message the customer service agent" placeholder="Ask Alpha about a service issue…" rows={2} maxLength={3000} value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(!launching&&config?.chatEnabled&&!isActive(job?.state))void launch()}}}/><div className="chat-compose-toolbar"><span className="chat-model" aria-label="Model: NVIDIA Nemotron Super 120B"><span className="chat-model-brand">NVIDIA</span><strong>Nemotron Super 120B</strong><span className="chat-model-label">Customer service</span></span><div className="chat-compose-actions"><VoiceInput value={prompt} onChange={setPrompt} disabled={launching||isActive(job?.state)}/><button type="submit" aria-label="Send message" disabled={launching||!config?.chatEnabled||!prompt.trim()||isActive(job?.state)}><ArrowUpwardRounded/></button></div></div></form>
    {!job&&<div className="chat-suggestions">{['Investigate SITE-DEN-12','Check customer impact','Review network and digital twin'].map(label=><button key={label} onClick={()=>setPrompt(label==='Investigate SITE-DEN-12'?'Investigate fronthaul degradation at SITE-DEN-12. Check impacted customers, consult IT incident records, ask Network for digital-twin analysis, then summarize the evidence and next steps.':`${label}. Ask me for any missing service or customer details.`)}>{label}</button>)}</div>}
    <p className="chat-compose-note">{config?.chatEnabled?'Customer → IT → Network & digital twin → Customer response. Activity appears as each stage reports back.':(error?'Customer service unavailable.':'Connecting to customer service…')}</p></div>
   </div>:<div className="chat-inspector"><TraceControls spans={visible} selected={selectedSpan} onSelected={setSelectedSpan} run={matchedRun} job={job} onOpenRun={onOpenRun} onOpenControls={onOpenControls} onOpenTelemetry={onOpenTelemetry}/></div>}
  </div>
 </section>;
}

function TraceControls({spans,selected,onSelected,run,job,onOpenRun,onOpenControls,onOpenTelemetry}:{spans:CloudSpan[];selected:string;onSelected:(id:string)=>void;run?:AssuranceRun;job?:Job;onOpenRun:(id:string)=>void;onOpenControls:(id:string)=>void;onOpenTelemetry:(id:string)=>void}){
 const chosen=spans.find(s=>s.spanId===selected)??spans[0],controls=[['7','Event recording',run?.c7],['16','Spend cap',run?.c16],['9','Performance drift',run?.c9]] as const;
 return <div className="journey-trace-layout">
  <div><SpanWaterfall spans={spans} selected={chosen?.spanId} onSelect={onSelected}/><section className="wa-panel journey-trajectory"><header><h2>Multi-agent trajectory</h2><span>Tool and delegation evidence</span></header><div className="trajectory-flow">{spans.length?Array.from(new Set(spans.map(actorFor))).map(actor=><span key={actor}>{actor}</span>):<span>Waiting for trace-linked agent activity</span>}</div><footer>{spans.length} spans loaded for this conversation</footer></section></div>
  <aside>
   <section className="wa-panel journey-span-detail"><header><h2>Selected span</h2><span>{chosen?.service}</span></header>{chosen&&<dl>{Object.entries({'Operation':chosen.name,'Trace ID':chosen.traceId,'Span ID':chosen.spanId,'Parent':chosen.parentSpanId,'Duration':`${chosen.durationMs.toFixed(1)} ms`,'Tool':chosen.tool,'Model':chosen.model,'Tokens':chosen.totalTokens}).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{display(v)}</dd></div>)}</dl>}</section>
   <section className="wa-panel journey-controls"><header><h2>Control evidence</h2><span>{run?.id||'No collected run match'}</span></header>{controls.map(([id,name,result])=><div key={id}><span><b>C{id}</b><small>{name}</small></span><em className={`wa-badge ${verdictClass(result?.verdict)}`}>{verdict(result?.verdict)}</em></div>)}{run?<div className="journey-control-actions"><Button onClick={()=>onOpenControls(run.id)}>Inspect controls</Button><Button onClick={()=>onOpenTelemetry(run.id)}>Open trace explorer</Button></div>:<Alert severity="info">The supplied CloudWatch trace is verified as telemetry, but no collected run/control record is linked in the current evidence response.</Alert>}</section>
   <section className="wa-panel journey-outcome"><header><h2>Finding & outcome</h2><span>Judge close-out</span></header><p><b>Workflow:</b> {run?workflowStatus(run):'Awaiting linked run evidence.'}</p><p><b>ServiceNow:</b> {run&&[run.c7,run.c16,run.c9].some(x=>['BREACH','NOT SATISFIED'].includes(String(x?.verdict)))?'A failed control needs a matching finding reference.':'No verified run-to-finding link is available.'}</p><p><b>Business outcome:</b> Investigation evidence is available; time saved and prevented loss still require a measured baseline.</p><div className="journey-control-actions">{run&&<Button onClick={()=>onOpenRun(run.id)}>Open run evidence</Button>}<Button component="a" href={workshopLinks.servicenow} target="_blank" rel="noopener noreferrer">Open Team Alpha ServiceNow ↗</Button></div></section>
  </aside>
 </div>;
}

function JourneyActivity({stages}:{stages:JourneyStage[]}){
 stages=stages.filter(s=>s.state!=='not-required');
 const done=stages.filter(s=>s.state==='completed').length;
 return <section className="chat-journey" aria-label="Investigation journey"><header><strong>Investigation journey</strong><span>{done}/{stages.length} stages complete</span></header>
 <ol>{stages.map(step=><li key={step.id} data-state={step.state}><span className="chat-stage-marker" aria-hidden="true">{step.state==='completed'?'✓':step.state==='failed'?'!':'·'}</span><div><details><summary><strong>{step.title}</strong><span>{step.state.replace('-',' ')}</span></summary><p>{step.answer||step.error||(step.state==='running'?'Waiting for the governed agent response.':'This stage has not run.')}</p>{!!step.toolCalls?.length&&<ul className="chat-stage-tools">{step.toolCalls.map((call,i)=><li key={call.attempt_id||i}><code>{call.tool_name||call.request_tool_name||'Tool call'}</code><span>{call.outcome||'Recorded'}</span></li>)}</ul>}</details>{step.state==='running'&&<small>Working with {step.role==='it'?'IT':step.role} agent</small>}</div></li>)}</ol></section>;
}
