import {useEffect,useMemo,useRef,useState} from 'react';
import {Alert,Button} from '@mui/material';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import ChatBubbleOutlineRounded from '@mui/icons-material/ChatBubbleOutlineRounded';
import {ThinkingState} from './aicss/ThinkingState';
import './judge-chat.css';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import type {AssuranceData,AssuranceRun} from './assuranceData';
import {workflowStatus} from './assuranceData';
import {parseCloudCapture,type CloudSpan} from './cloudwatchData';
import {SpanWaterfall} from './WorkspaceCharts';
import {StreamingText} from './aicss/StreamingText';
import {Orb,type OrbVariant} from './aicss/Orb';
import {workshopLinks} from './workshopLinks';

const REFERENCE_TRACE='c0b7e0a31db241a3adf9218c40c6cf8f';
const CLOUDWATCH=`https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#/gen-ai-observability/spans?traceId=${REFERENCE_TRACE}`;
const DEFAULT_PROMPT='Investigate fronthaul degradation at DU-PHX-04-B. Customer CUST-3310 is reporting connectivity drops. Respect the maintenance freeze and do not make a traffic-affecting change without named approval.';
type Job={id:string;runId:string;scenario:string;state:string;createdAt:string;message?:string;traceId?:string;invokedAgents?:string[]};
type Config={enabled:boolean;scenarios:{id:string;title:string}[];threshold:{version?:string};actors:Record<string,string>};
type JourneyProps={data:AssuranceData|null;onRefresh:()=>void;onOpenRun:(id:string)=>void;onOpenControls:(id:string)=>void;onOpenTelemetry:(id:string)=>void};

const referenceSpans:CloudSpan[]=[
 {traceId:REFERENCE_TRACE,spanId:'0000000000000001',name:'invoke_agent',kind:'INTERNAL',service:'Customer service agent',startTime:'2026-10-05T17:06:00.000Z',endTime:'2026-10-05T17:06:05.600Z',durationMs:5600,status:'OK',sourceUrl:CLOUDWATCH},
 {traceId:REFERENCE_TRACE,spanId:'0000000000000002',parentSpanId:'0000000000000001',name:'customer-records___customer_lookup',kind:'CLIENT',service:'Customer service agent',operation:'execute_tool',tool:'customer-records___customer_lookup',startTime:'2026-10-05T17:06:00.620Z',endTime:'2026-10-05T17:06:00.790Z',durationMs:170.6,status:'OK',sourceUrl:CLOUDWATCH},
 {traceId:REFERENCE_TRACE,spanId:'0000000000000003',parentSpanId:'0000000000000001',name:'delegate to IT resolution',kind:'INTERNAL',service:'Customer service agent',startTime:'2026-10-05T17:06:00.900Z',endTime:'2026-10-05T17:06:05.210Z',durationMs:4310,status:'OK',sourceUrl:CLOUDWATCH},
 {traceId:REFERENCE_TRACE,spanId:'0000000000000004',parentSpanId:'0000000000000003',name:'runbook-lookup___lookup ×3',kind:'CLIENT',service:'IT resolution agent',operation:'execute_tool',tool:'runbook-lookup___lookup',startTime:'2026-10-05T17:06:01.040Z',endTime:'2026-10-05T17:06:01.240Z',durationMs:196.3,status:'OK',sourceUrl:CLOUDWATCH},
 {traceId:REFERENCE_TRACE,spanId:'0000000000000005',parentSpanId:'0000000000000001',name:'delegate to network',kind:'INTERNAL',service:'Customer service agent',startTime:'2026-10-05T17:06:01.360Z',endTime:'2026-10-05T17:06:03.670Z',durationMs:2310,status:'OK',sourceUrl:CLOUDWATCH},
 {traceId:REFERENCE_TRACE,spanId:'0000000000000006',parentSpanId:'0000000000000005',name:'network-twin___predict_rsrp',kind:'CLIENT',service:'Network agent',operation:'execute_tool',tool:'network-twin___predict_rsrp',startTime:'2026-10-05T17:06:01.590Z',endTime:'2026-10-05T17:06:01.790Z',durationMs:200,status:'OK',sourceUrl:CLOUDWATCH},
 {traceId:REFERENCE_TRACE,spanId:'0000000000000007',parentSpanId:'0000000000000001',name:'chat',kind:'CLIENT',service:'IT resolution agent',operation:'chat',model:'nemotron-super-120b',inputTokens:1069,outputTokens:406,totalTokens:1475,startTime:'2026-10-05T17:06:01.900Z',endTime:'2026-10-05T17:06:06.211Z',durationMs:4311,status:'OK',sourceUrl:CLOUDWATCH},
];

const isActive=(state?:string)=>!!state&&['queued','running','collecting'].includes(state);
const verdict=(value:unknown)=>value==null?'Not assessed':String(value);
const verdictClass=(value:unknown)=>['SATISFIED','PASS'].includes(String(value))?'good':['NOT SATISFIED','BREACH'].includes(String(value))?'bad':'unknown';
const display=(value:unknown)=>value==null?'Awaiting evidence':typeof value==='number'?value.toLocaleString():String(value);
const actorFor=(span:CloudSpan)=>span.tool?.includes('customer')?'Customer service agent':span.tool?.includes('runbook')?'IT resolution agent':span.tool?.includes('network')?'Network agent':span.service||'Agent';
const orbFor=(actor:string):OrbVariant=>actor.startsWith('Customer')?'C3':actor.startsWith('IT')?'B5':'G2';

function AgentEvent({span}:{span:CloudSpan}){
 const actor=actorFor(span),tool=span.operation==='execute_tool'||!!span.tool;
 return <div className="journey-event"><Orb variant={orbFor(actor)} size={22}/><div><div className="journey-event-heading"><strong>{actor}</strong><span>{span.durationMs.toFixed(1)} ms</span></div><p>{tool?'Tool call':'Agent activity'} · <code>{span.tool||span.name}</code></p></div><span className="journey-event-ok"><CheckCircleOutline/> Recorded</span></div>;
}

export function JudgeJourney({data,onRefresh,onOpenRun,onOpenControls,onOpenTelemetry}:JourneyProps){
 const [config,setConfig]=useState<Config|null>(null),[jobs,setJobs]=useState<Job[]>([]),[prompt,setPrompt]=useState(''),[submittedPrompt,setSubmittedPrompt]=useState(DEFAULT_PROMPT),[jobId,setJobId]=useState(''),[spans,setSpans]=useState<CloudSpan[]>(referenceSpans),[selectedSpan,setSelectedSpan]=useState(referenceSpans[0].spanId),[error,setError]=useState(''),[launching,setLaunching]=useState(false),[tab,setTab]=useState<'Conversation'|'Trace & controls'>('Conversation');
 const request=useRef<{scenario:string;idempotencyKey:string}|null>(null);
 const [search,setSearch]=useState('');
 const [promptJobId,setPromptJobId]=useState('');
 const job=jobs.find(x=>x.id===jobId),traceId=job?.traceId||'';
 const scenario=useMemo(()=>config?.scenarios.find(s=>/fronthaul/i.test(`${s.id} ${s.title}`))??config?.scenarios[0],[config]);
 const matchedRun=useMemo(()=>data?.runs.find(r=>r.id===job?.runId)||data?.runs.find(r=>r.events.some(e=>e.trace_id===traceId)),[data,job?.runId,traceId]);

 async function load(){
  try{
   const [c,j]=await Promise.all([fetch('api/execution-config',{cache:'no-store'}),fetch('api/executions',{cache:'no-store'})]);
   if(!c.ok||!j.ok)throw Error('Live execution service is unavailable');
   const nextConfig=await c.json() as Config,nextJobs=(await j.json()).executions as Job[];
   setConfig(nextConfig);setJobs(nextJobs);setError('');
   if(jobId&&nextJobs.find(x=>x.id===jobId)?.traceId){
    const latest=nextJobs.find(x=>x.id===jobId)!;await loadTelemetry(latest.traceId!);
    if(['completed','failed','interrupted'].includes(latest.state)){onRefresh();}
   }
  }catch(e){setError((e as Error).message)}
 }
 async function loadTelemetry(id:string){
  try{const to=new Date(),from=new Date(to.getTime()-30*60_000);const r=await fetch('api/telemetry?'+new URLSearchParams({from:from.toISOString(),to:to.toISOString()}),{cache:'no-store'});if(!r.ok)return;const capture=parseCloudCapture(await r.json());const exact=capture.spans.filter(s=>s.traceId===id).sort((a,b)=>Date.parse(a.startTime)-Date.parse(b.startTime));if(exact.length)setSpans(exact)}catch{}
 }
 useEffect(()=>{void load();const timer=setInterval(()=>{if(!document.hidden)void load()},4000);return()=>clearInterval(timer)},[jobId]);
 async function launch(){
  if(!scenario||!prompt.trim())return;setLaunching(true);setError('');setSubmittedPrompt(prompt.trim());setTab('Conversation');
  if(!request.current)request.current={scenario:scenario.id,idempotencyKey:crypto.randomUUID()};
  try{const r=await fetch('api/executions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request.current),signal:AbortSignal.timeout(15000)});const body=await r.json();if(!r.ok)throw Error(body.error||'Run launch rejected');setJobId(body.id);setPromptJobId(body.id);setSpans([]);request.current=null;await load()}
  catch(e){setError((e as Error).message)}finally{setLaunching(false)}
 }
 const visible=spans.filter(s=>s.traceId===traceId||(!job&&s.traceId===REFERENCE_TRACE));
 const toolSpans=visible.filter(s=>s.operation==='execute_tool'||s.tool);

 return <section className="judge-journey judge-chat-shell">
  <aside className="chat-history">
   <div className="chat-history-brand"><ChatBubbleOutlineRounded/><strong>Alpha assistant</strong></div>
   <button className="chat-new" onClick={()=>{setJobId('');setPrompt('');setSpans([]);setTab('Conversation')}}><AddRounded/>New conversation</button>
   <label className="chat-search"><SearchRounded/><input aria-label="Search conversations" placeholder="Search conversations" value={search} onChange={e=>setSearch(e.target.value)}/></label>
   <p className="chat-history-label">Recent investigations</p>
   <div className="chat-history-list">{jobs.filter(j=>`${j.runId} ${j.scenario}`.toLowerCase().includes(search.toLowerCase())).map(j=><button key={j.id} aria-pressed={j.id===jobId} onClick={()=>{setJobId(j.id);setSpans([]);setTab('Conversation')}}><ChatBubbleOutlineRounded/><span><b>{config?.scenarios.find(s=>s.id===j.scenario)?.title||j.scenario}</b><small>{j.state} · {new Date(j.createdAt).toLocaleDateString()}</small></span></button>)}{!jobs.length&&<p className="chat-history-empty">Your investigations will appear here.</p>}</div>
   <div className="chat-history-footer"><Orb variant="S4" size={20}/><span>Customer service agent<small>Team Alpha workspace</small></span></div>
  </aside>
  <div className="chat-workspace">
   <header className="chat-topbar"><div><strong>{job?'Service investigation':'New conversation'}</strong>{job&&<span className="chat-status">{job.state}</span>}</div><div className="chat-view-tabs"><button aria-pressed={tab==='Conversation'} onClick={()=>setTab('Conversation')}>Conversation</button><button disabled={!job} aria-pressed={tab==='Trace & controls'} onClick={()=>setTab('Trace & controls')}>Trace & controls</button></div></header>
   {error&&<Alert severity="warning">{error}</Alert>}
   {tab==='Conversation'?<div className={`chat-conversation ${job?'has-conversation':'is-empty'}`}>
    {!job?<div className="chat-welcome"><Orb variant="S4" size={42}/><h1>How can I help you today?</h1><p>Investigate a service issue with your customer, IT and network agents.</p></div>:<div className="chat-transcript">
     <div className="chat-user-message">{job.id===promptJobId?submittedPrompt:`Investigate ${config?.scenarios.find(s=>s.id===job.scenario)?.title||job.scenario}.`}</div>
     <div className="chat-agent-heading"><Orb variant="S4" size={24}/><b>Alpha assistant</b></div>
     {isActive(job.state)?<div className="chat-processing"><ThinkingState/><span>Gathering evidence · {job.state}</span></div>:<StreamingText text={`This investigation is ${job.state}. Review the recorded tool activity and the trace evidence below.`}/>}
     <details className="chat-activity" open={isActive(job.state)}><summary>Agent activity <span>{toolSpans.length} recorded tool calls</span></summary><div className="journey-events">{toolSpans.length?toolSpans.map(s=><AgentEvent key={s.traceId+s.spanId} span={s}/>):<p>No tool spans loaded for this conversation yet.</p>}</div></details>
     {job.message&&<p className="chat-run-message">{job.message}</p>}
     {job.traceId&&<div className="chat-evidence-links"><Button onClick={()=>setTab('Trace & controls')}>Explore trace & controls</Button><Button component="a" href={CLOUDWATCH.replace(REFERENCE_TRACE,job.traceId)} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewOutlined/>}>CloudWatch</Button></div>}
    </div>}
    <div className="chat-compose-area"><form className="chat-compose" onSubmit={e=>{e.preventDefault();void launch()}}><textarea aria-label="Message the customer service agent" placeholder="Describe the service issue…" rows={2} value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(!launching&&config?.enabled&&!isActive(job?.state))void launch()}}}/><div className="chat-compose-toolbar"><span><Orb variant="S4" size={18}/>Customer service <span className="chat-compose-mode">Guided investigation</span></span><button type="submit" aria-label="Start investigation" disabled={launching||!config?.enabled||!scenario||!prompt.trim()||isActive(job?.state)}><ArrowUpwardRounded/></button></div></form>
    {!job&&<div className="chat-suggestions">{['Investigate fronthaul degradation','Check customer impact','Review network and digital twin'].map(label=><button key={label} onClick={()=>setPrompt(`${label}. Use the approved ${scenario?.title||'fronthaul degradation'} scenario and report the supporting evidence.`)}>{label}</button>)}</div>}
    <p className="chat-compose-note">{scenario?`Runs the approved scenario: ${scenario.title}.`:'Connecting to the execution service…'} Evidence updates as it becomes available.</p></div>
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
