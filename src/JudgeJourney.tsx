import {useEffect,useMemo,useRef,useState} from 'react';
import {Alert,Button,Chip,LinearProgress,TextField} from '@mui/material';
import SendRounded from '@mui/icons-material/SendRounded';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
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
 const [config,setConfig]=useState<Config|null>(null),[jobs,setJobs]=useState<Job[]>([]),[prompt,setPrompt]=useState(DEFAULT_PROMPT),[submittedPrompt,setSubmittedPrompt]=useState(DEFAULT_PROMPT),[jobId,setJobId]=useState(''),[spans,setSpans]=useState<CloudSpan[]>(referenceSpans),[selectedSpan,setSelectedSpan]=useState(referenceSpans[0].spanId),[error,setError]=useState(''),[launching,setLaunching]=useState(false),[tab,setTab]=useState<'Conversation'|'Trace & controls'>('Conversation');
 const request=useRef<{scenario:string;idempotencyKey:string}|null>(null);
 const job=jobs.find(x=>x.id===jobId)??jobs[0],traceId=job?.traceId||REFERENCE_TRACE;
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
  try{const r=await fetch('api/executions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request.current),signal:AbortSignal.timeout(15000)});const body=await r.json();if(!r.ok)throw Error(body.error||'Run launch rejected');setJobId(body.id);setSpans([]);request.current=null;await load()}
  catch(e){setError((e as Error).message)}finally{setLaunching(false)}
 }
 const visible=spans.filter(s=>s.traceId===traceId||(!job&&s.traceId===REFERENCE_TRACE));
 const toolSpans=visible.filter(s=>s.operation==='execute_tool'||s.tool);
 const state=job?.state??'reference trace';
 return <section className="judge-journey">
  <div className="journey-hero">
   <div><Chip size="small" label="Judge journey · one scenario"/><h2>Investigate fronthaul degradation</h2><p>Start with a customer report, watch the agents delegate and use tools, then inspect the exact trace and control evidence.</p></div>
   <div className="journey-hero-status"><span>Execution</span><strong>{state}</strong><small>{job?.runId||'CloudWatch reference trace'}</small></div>
  </div>
  <div className="journey-steps" aria-label="Demo journey">
   {['Customer request','Customer context','IT runbook','Network + twin','Decision','Trace','C7 · C16 · C9','Finding','Outcome'].map((step,index)=><span key={step} className={index<6?'done':''}><b>{index+1}</b>{step}</span>)}
  </div>
  <div className="journey-tabs" role="tablist" aria-label="Journey view"><button role="tab" aria-selected={tab==='Conversation'} onClick={()=>setTab('Conversation')}>Conversation</button><button role="tab" aria-selected={tab==='Trace & controls'} onClick={()=>setTab('Trace & controls')}>Trace & controls</button></div>
  {error&&<Alert severity="warning" sx={{mb:2}}>{error}. The observed CloudWatch reference remains available below.</Alert>}
  {tab==='Conversation'?<div className="journey-grid">
   <section className="journey-chat wa-panel">
    <header><div><h2>Customer service conversation</h2><span>Approved scenario launch · live execution status</span></div><Orb variant={isActive(job?.state)?'C3':'G5'} size={28} label={isActive(job?.state)?'Agents working':'Ready'} pill/></header>
    <div className="journey-chat-scroll">
     <div className="journey-message user"><span>Judge</span><p>{submittedPrompt}</p></div>
     <div className="journey-message agent"><div className="journey-agent-name"><Orb variant="S4" size={24}/><span>Customer service agent</span></div>{job?<StreamingText text={isActive(job.state)?`Run ${job.runId} is ${job.state}. I am collecting customer, runbook, network and digital-twin evidence before producing a response.`:`Run ${job.runId} is ${job.state}. Open the collected evidence to verify the response, controls and trace linkage.`}/>:<StreamingText text="I found the regulated customer impact and delegated the investigation. The evidence supports investigation, but a traffic-affecting change requires named approval and the maintenance freeze must be respected."/>}</div>
     <div className="journey-reasoning"><AccountTreeOutlined/><div><strong>Reasoning summary</strong><p>Evidence and decisions only. Private model reasoning is not displayed.</p></div></div>
     <div className="journey-events">{toolSpans.length?toolSpans.map(s=><AgentEvent key={s.traceId+s.spanId} span={s}/>):<div className="journey-wait"><Orb variant="C1" size={24}/><span>{job?'Waiting for trace-linked tool spans…':'Observed tool activity is shown in the reference trace.'}</span></div>}</div>
     {!job&&<div className="journey-message agent decision"><span>Decision</span><h3>Investigate and hold the change</h3><p>Packet loss is 6.8% with 44 ms p95 latency for Cascade Health. The proposed corrective action remains blocked until a maintenance exception and named human approval are recorded.</p></div>}
    </div>
    <div className="journey-composer"><TextField multiline maxRows={4} fullWidth label="Message the customer service agent" value={prompt} onChange={e=>setPrompt(e.target.value)} helperText={scenario?`Launches approved scenario: ${scenario.title}`:'Loading approved scenarios…'}/><Button variant="contained" endIcon={<SendRounded/>} disabled={launching||!config?.enabled||!scenario||!prompt.trim()||isActive(job?.state)} onClick={launch}>{launching?'Starting…':'Start guided run'}</Button></div>
   </section>
   <aside className="journey-side">
    <section className="wa-panel journey-live"><header><h2>Live agent activity</h2><span>{visible.length?`${visible.length} displayed spans`:'Awaiting spans'}</span></header>{isActive(job?.state)&&<LinearProgress/>}<div className="journey-agent-list">{[['Customer service agent','customer-records___customer_lookup'],['IT resolution agent','runbook-lookup___lookup'],['Network agent','network-twin___predict_rsrp'],['Digital twin','predict_rsrp result']].map(([name,tool])=>{const found=toolSpans.some(s=>(s.tool||s.name).includes(tool.split('___').at(-1)!));return <div key={name}><Orb variant={found?'G5':'C1'} size={20}/><span><b>{name}</b><small>{tool}</small></span><em>{found?'Recorded':'Waiting'}</em></div>})}</div></section>
    <section className="wa-panel journey-reference"><header><h2>Exact CloudWatch trace</h2><span>Observed 5 Oct 2026</span></header><dl><div><dt>Trace ID</dt><dd>{traceId}</dd></div><div><dt>CloudWatch total</dt><dd>{job?'Live query':'84 spans · 5.96 s'}</dd></div><div><dt>Model</dt><dd>nemotron-super-120b</dd></div><div><dt>Errors</dt><dd>0 system · 0 client · 0 throttles</dd></div></dl><Button component="a" href={job?.traceId?CLOUDWATCH.replace(REFERENCE_TRACE,job.traceId):CLOUDWATCH} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewOutlined/>}>Open exact trace</Button></section>
   </aside>
  </div>:<TraceControls spans={visible.length?visible:referenceSpans} selected={selectedSpan} onSelected={setSelectedSpan} run={matchedRun} job={job} onOpenRun={onOpenRun} onOpenControls={onOpenControls} onOpenTelemetry={onOpenTelemetry}/>}
 </section>;
}

function TraceControls({spans,selected,onSelected,run,job,onOpenRun,onOpenControls,onOpenTelemetry}:{spans:CloudSpan[];selected:string;onSelected:(id:string)=>void;run?:AssuranceRun;job?:Job;onOpenRun:(id:string)=>void;onOpenControls:(id:string)=>void;onOpenTelemetry:(id:string)=>void}){
 const chosen=spans.find(s=>s.spanId===selected)??spans[0],controls=[['7','Event recording',run?.c7],['16','Spend cap',run?.c16],['9','Performance drift',run?.c9]] as const;
 return <div className="journey-trace-layout">
  <div><SpanWaterfall spans={spans} selected={chosen?.spanId} onSelect={onSelected}/><section className="wa-panel journey-trajectory"><header><h2>Multi-agent trajectory</h2><span>Tool and delegation evidence</span></header><div className="trajectory-flow"><span>Customer service</span><b>→ customer records →</b><span>IT resolution</span><b>→ runbook →</b><span>Network</span><b>→ digital twin →</b><span>Decision</span></div><footer>{spans.length} representative displayed spans · CloudWatch reference contains 84 spans</footer></section></div>
  <aside>
   <section className="wa-panel journey-span-detail"><header><h2>Selected span</h2><span>{chosen?.service}</span></header>{chosen&&<dl>{Object.entries({'Operation':chosen.name,'Trace ID':chosen.traceId,'Span ID':chosen.spanId,'Parent':chosen.parentSpanId,'Duration':`${chosen.durationMs.toFixed(1)} ms`,'Tool':chosen.tool,'Model':chosen.model,'Tokens':chosen.totalTokens}).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{display(v)}</dd></div>)}</dl>}</section>
   <section className="wa-panel journey-controls"><header><h2>Control evidence</h2><span>{run?.id||'No collected run match'}</span></header>{controls.map(([id,name,result])=><div key={id}><span><b>C{id}</b><small>{name}</small></span><em className={`wa-badge ${verdictClass(result?.verdict)}`}>{verdict(result?.verdict)}</em></div>)}{run?<div className="journey-control-actions"><Button onClick={()=>onOpenControls(run.id)}>Inspect controls</Button><Button onClick={()=>onOpenTelemetry(run.id)}>Open trace explorer</Button></div>:<Alert severity="info">The supplied CloudWatch trace is verified as telemetry, but no collected run/control record is linked in the current evidence response.</Alert>}</section>
   <section className="wa-panel journey-outcome"><header><h2>Finding & outcome</h2><span>Judge close-out</span></header><p><b>Workflow:</b> {run?workflowStatus(run):'Reference trace shows a safe refusal pending approval.'}</p><p><b>ServiceNow:</b> {run&&[run.c7,run.c16,run.c9].some(x=>['BREACH','NOT SATISFIED'].includes(String(x?.verdict)))?'A failed control needs a matching finding reference.':'No verified run-to-finding link is available.'}</p><p><b>Business outcome:</b> Investigation evidence is available; time saved and prevented loss still require a measured baseline.</p><div className="journey-control-actions">{run&&<Button onClick={()=>onOpenRun(run.id)}>Open run evidence</Button>}<Button component="a" href={workshopLinks.servicenow} target="_blank" rel="noopener noreferrer">Open Team Alpha ServiceNow ↗</Button></div></section>
  </aside>
 </div>;
}
