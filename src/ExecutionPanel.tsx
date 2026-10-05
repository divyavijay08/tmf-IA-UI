import {formatUTCDateTime} from './dateTime';
import PlayArrowOutlined from '@mui/icons-material/PlayArrowOutlined';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import PlaylistPlayOutlined from '@mui/icons-material/PlaylistPlayOutlined';
import {PaginatedTable} from './PaginatedTable';
import {useEffect,useRef,useState} from 'react';
import {Alert,Button,MenuItem,TextField} from '@mui/material';
type Job={id:string;runId:string;scenario:string;state:string;createdAt:string;message?:string;traceId?:string;thresholdVersion?:string;exitCode?:number;collectionExitCode?:number;invokedAgents?:string[]};
async function response(r:Response){
 const d=await r.json().catch(()=>null);
 if(!r.ok)throw Error(d?.error||`Execution service unavailable (HTTP ${r.status}).`);
 if(!d)throw Error('Execution service returned an empty response. Please refresh.');
 return d;
}
export function ExecutionPanel({onInspect,onRefresh}:{onInspect:(id:string)=>void;onRefresh:()=>void}){
 const [config,setConfig]=useState<any>(null),[jobs,setJobs]=useState<Job[]>([]),[scenario,setScenario]=useState(''),[error,setError]=useState(''),[launching,setLaunching]=useState(false),[uncertain,setUncertain]=useState(false);
 const request=useRef<{scenario:string;idempotencyKey:string}|null>(null),states=useRef('');
 async function load(){try{const [c,j]=await Promise.all([fetch('api/execution-config',{cache:'no-store'}).then(response),fetch('api/executions',{cache:'no-store'}).then(response)]);setConfig(c);setJobs(j.executions);setScenario(s=>s||c.scenarios[0]?.id||'');const next=JSON.stringify(j.executions.map((x:Job)=>[x.id,x.state]));if(states.current&&next!==states.current)onRefresh();states.current=next;setError('')}catch(e){setError((e as Error).message)}}
 useEffect(()=>{void load();const t=setInterval(()=>{if(!document.hidden)void load()},5000);return()=>clearInterval(t)},[]);
 async function launch(){if(!request.current)request.current={scenario,idempotencyKey:crypto.randomUUID()};setLaunching(true);try{const r=await fetch('api/executions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request.current),signal:AbortSignal.timeout(15000)});if(!r.ok){const d=await r.json();if(r.status<500){request.current=null;setUncertain(false)}throw Error(d.error||'Launch rejected')}await response(r);request.current=null;setUncertain(false);await load()}catch(e){setError((e as Error).message);setUncertain(!!request.current)}finally{setLaunching(false)}}
 const active=jobs.some(j=>['queued','running','collecting','interrupted'].includes(j.state));
 const utc=formatUTCDateTime;
 return <section className="wa-panel execution-panel">
  <header><div className="execution-heading"><h2>Run execution</h2><span>Deployed runner</span></div><Button variant="outlined" startIcon={<RefreshOutlined/>} onClick={load}>Refresh executions</Button></header>
  {error&&<Alert className="execution-alert" severity="warning">{error}</Alert>}
  <div className="execution-setup">
   <div className="execution-launchbar"><TextField select size="small" label="Scenario" value={scenario} disabled={!config||launching||uncertain} onChange={e=>setScenario(e.target.value)}>{config?.scenarios.map((s:any)=><MenuItem key={s.id} value={s.id}>{s.title}</MenuItem>)}</TextField><Button variant="contained" startIcon={<PlayArrowOutlined/>} onClick={launch} disabled={launching||!config?.enabled||!scenario||(active&&!uncertain)}>{launching?'Submitting…':uncertain?'Check / retry same launch':'Start run'}</Button></div>
   {config&&<div className="execution-config"><span className="execution-threshold">Threshold <strong>{config.threshold.version??'Unavailable'}</strong></span><span>Declared {config.threshold.declaredAt?<time dateTime={config.threshold.declaredAt} title={`${utc(config.threshold.declaredAt)} UTC`}>{utc(config.threshold.declaredAt)} UTC</time>:'Unavailable'}</span><span>Configuration is pinned before agents start.</span></div>}
  </div>
  {uncertain&&<Alert className="execution-alert" severity="info">The launch response was not received. Retrying uses the same request ID to prevent a duplicate execution.</Alert>}
  {jobs.length>0?<>
   <div className="execution-list-heading"><h3>Execution history</h3><span>{jobs.length} recorded {jobs.length===1?'execution':'executions'}</span></div>
   <PaginatedTable label="Execution history" scrollStyle={{maxHeight:'min(440px,60dvh)'}}><table><thead><tr><th>Run / scenario</th><th>Execution state</th><th>Created · UTC</th><th>Evidence</th></tr></thead><tbody>{jobs.map(j=><tr key={j.id}><td><strong className="execution-run-id">{j.runId}</strong><small>{j.scenario}</small></td><td><span className="execution-state" data-state={j.state}>{j.state}</span><small>{j.invokedAgents?.length?`Invoked: ${j.invokedAgents.join(', ')}`:''}</small><small>{j.message}</small></td><td><time dateTime={j.createdAt} title={`${utc(j.createdAt)} UTC`}>{utc(j.createdAt)}</time></td><td><Button size="small" onClick={()=>onInspect(j.runId)}>Inspect collected evidence</Button></td></tr>)}</tbody></table></PaginatedTable>
  </>:<div className="execution-empty"><span className="execution-empty-icon" aria-hidden="true"><PlaylistPlayOutlined/></span><div><strong>{config?'No executions yet':error?'Execution history unavailable':'Loading executions…'}</strong><p>{config?'Runs submitted through this service will appear here with their progress and collected evidence.':error?'Refresh executions to try loading the service again.':'Checking the runner configuration and recent executions.'}</p></div></div>}
  <footer>Execution completion, evidence collection and control validation are separate results.</footer>
 </section>;
}
