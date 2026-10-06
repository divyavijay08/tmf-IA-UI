import {hasEvidence,recordedModelUsage,controlSpendSeries} from './recordedEvidence';
import {makeSessionBundle} from './auditBundle';
import {formatUTCDate,formatUTCDateTime} from './dateTime';
import {DateTimeField} from './DateTimeField';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import FileUploadOutlined from '@mui/icons-material/FileUploadOutlined';
import TerminalOutlined from '@mui/icons-material/TerminalOutlined';
import ManageSearchOutlined from '@mui/icons-material/ManageSearchOutlined';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import {MetricCard} from './MetricCard';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import IntegrationInstructionsOutlined from '@mui/icons-material/IntegrationInstructionsOutlined';
import {PaginatedTable} from './PaginatedTable';
import {useState} from 'react';
import {Alert,Button,TextField,MenuItem} from '@mui/material';
import {queryControl,statusClass,readBundle} from './controlQuery';
import {parseAssurance,type AssuranceRun,type AssuranceData} from './assuranceData';
import {exportJson} from './exportJson';
import {workshopLinks} from './workshopLinks';
import {parseCloudCapture,type CloudCapture} from './cloudwatchData';
const fmt=(v:any)=>v==null?'Not recorded':typeof v==='object'?JSON.stringify(v):String(v);
export function QueryPanel({run,control='16',window}:{run:AssuranceRun;control?:string;window?:[number,number]}){
 const [result,setResult]=useState<ReturnType<typeof queryControl>|null>(null);const key=JSON.stringify([run,control,window]);const [checked,setChecked]=useState('');const current=checked===key?result:null;
 const usage=recordedModelUsage(run.events);
 const display=(v:unknown)=>typeof v==='number'?v.toLocaleString():fmt(v);
 return <section className="wa-panel hx-query query-panel">
  <header><div className="query-heading"><h2>Independent control query</h2><span>{run.id} · Control {control}</span></div><Button variant="contained" startIcon={<ManageSearchOutlined/>} onClick={()=>{setResult(queryControl(run,control,window));setChecked(key)}}>Recompute evidence</Button></header>
  {current?<>
   <div className="query-body">
    <div className="query-verdict"><span className={`wa-badge ${statusClass(current.verdict)}`}>{current.verdict}</span><span>Recomputed from exported evidence</span></div>
    <div className="wa-statstrip query-metrics">
     {hasEvidence(current.measurement)&&<MetricCard label={control==='16'?'Measured tokens':'Measured'} value={display(current.measurement)} icon="records"/>}
     {hasEvidence(current.limit)&&<MetricCard label={control==='16'?'Token limit':'Limit'} value={display(current.limit)} icon="budget"/>}
     {current.coverage!=null&&<MetricCard label="Coverage" value={`${(current.coverage*100).toFixed(1)}%`} icon="verified"/>}
     {current.exceptionRate!=null&&<MetricCard label="Exception rate" value={`${current.exceptionRate*100}%`} icon="failures"/>}
    </div>
    {control==='16'&&current.measurement==null&&usage&&<div className="query-recorded-usage"><strong>Recorded model usage · {usage.total.toLocaleString()} tokens</strong><p>{usage.calls} unique model attempts · {usage.input.toLocaleString()} input · {usage.output.toLocaleString()} output. Saved transport usage; completeness and spend-cap compliance have not been established.{usage.excluded>0&&` ${usage.excluded} incomplete or conflicting records excluded.`}</p></div>}
    <div className="query-context"><div><h3>Evaluation scope</h3><p>{current.scope}{current.windowMeasurement!=null&&` · ${control==='16'?'Window usage':'Maximum eligible gap'}: ${display(current.windowMeasurement)} ${control==='16'?'tokens':'ms'}.`}</p></div><div><h3>Enforcement evidence</h3><p>{current.enforcement}</p></div></div>
    <div className="evidence-disclosures">
     {current.gaps.length>0&&<details><summary>Evidence gaps <span>{current.gaps.length}</span></summary><ul>{current.gaps.map(g=><li key={g}>{g}</li>)}</ul></details>}
     <details><summary>Supporting record IDs <span>{current.refs.length}</span></summary><pre>{JSON.stringify(current.refs,null,2)}</pre></details>
    </div>
   </div>
   <footer className="query-footer"><span>Query version · {current.algorithm}</span><Button startIcon={<FileDownloadOutlined/>} onClick={()=>exportJson(`${run.id}-recomputed-C${control}.json`,current)}>Export query result</Button></footer>
  </>:<div className="query-empty"><span className="audit-action-icon" aria-hidden="true"><ManageSearchOutlined/></span><div><strong>Ready to recompute</strong><p>Calculate from the exported records. Saved verdicts are not used as the query result.</p></div></div>}
 </section>;
}
export function RegisterPanel({run,control}:{run:AssuranceRun;control:string}){
 const t=control==='7'?run.c7Threshold:control==='16'?run.c16Threshold??run.budget.threshold??{}:run.c9Threshold??{};
 const statement=control==='7'?'Required actions are recorded and eligible recording gaps remain within the declared tolerance':control==='16'?'Input and output tokens across agents and retries stay within the declared per-run cap':'Quality drift remains within a frozen baseline tolerance';
 const objective=control==='7'?'Accountable, complete event recording':control==='16'?'Bound model spend':'Detect quality degradation';
 const procedure=control==='7'?'Reconcile expected actions; measure gaps between unique eligible event timestamps':control==='16'?'Deduplicate leaf calls and retries; reconcile expected inventory; sum input + output tokens':'Compare scored windows to dated baseline';
 const groups:[string,[string,unknown][]][]=[
  ['Ownership & scope', [['Owner',t.owner],['Applicable scope',t.scope??t.metric],['Instrument / obligation',t.instrument??t.obligation]]],
  ['Version & timing', [['Version',t.version],['Effective / declared at (UTC)',(t.effective_at??t.declared_at)==null?null:formatUTCDateTime(t.effective_at??t.declared_at)],['Version date',t.version_date==null?null:formatUTCDate(t.version_date)],['Test frequency',t.frequency]]],
  ['Enforcement & tolerance', [['Allowed exception rate',t.exception_tolerance??t.allowed_exception_rate],['Enforcement point',t.enforcement_point],['Declared budget mode',run.budget.mode],['Rationale',t.why_this_value]]]
 ];
 const populated=groups.map(([title,fields])=>[title,fields.filter(([,v])=>hasEvidence(v))] as [string,[string,unknown][]]).filter(([,fields])=>fields.length);
 const missing=groups.flatMap(([,fields])=>fields).filter(([,v])=>!hasEvidence(v)).length;
 return <section className="wa-panel hx-control-definition">
  <header><h2>Control definition & ownership</h2><span>{populated.flatMap(([,fields])=>fields).length} recorded fields</span></header>
  <div className="control-intro"><span className="control-number">Control {control}</span><div><h3>{objective}</h3><p>{statement}</p></div></div>
  {missing>0&&<p className="control-field-note" style={{padding:"0 20px"}}>{populated.length?'Only recorded metadata is shown.':'No versioned control definition is attached to this run.'} Assessment requirements are listed under Evidence gaps.</p>}
  <div className="control-field-groups">{populated.map(([title,fields])=><section key={title}><h3>{title}</h3><dl>{fields.map(([label,v])=><div key={label}><dt>{label}</dt><dd className={v==null?'is-missing':undefined}>{fmt(v)}</dd></div>)}</dl>{title==='Version & timing'&&<p className="control-field-note">Version date is not an exact effective time.</p>}{title==='Enforcement & tolerance'&&<p className="control-field-note">Declared mode does not prove enforcement.</p>}</section>)}</div>
  <div className="control-procedure"><span>Procedure</span><p>{procedure}</p></div>
 {control==='7'&&<div className="hx-result"><span>Eligible gaps <b>{fmt(run.c7.gap_count)}</b></span><span>Max gap <b>{fmt(run.c7.max_gap_ms)} ms</b></span><span>Gap limit <b>{fmt(run.c7.gap_limit_ms)} ms</b></span><span>Violations <b>{fmt(run.c7.gap_violations?.length)}</b></span><span>Timing result <b>{fmt(run.c7.timing_verdict)}</b></span></div>}</section>
}
export function SpendChart({run}:{run:AssuranceRun}){
 const series=controlSpendSeries(run),calls=series.calls;let total=0;const rows=calls.map((c:any)=>{const valid=Number.isInteger(c.input_tokens)&&Number.isInteger(c.output_tokens)&&c.input_tokens>=0&&c.output_tokens>=0;total+=valid?c.input_tokens+c.output_tokens:0;return {...c,total,valid}});const cap=run.c16['threshold.value']==null?NaN:Number(run.c16['threshold.value']),max=Math.max(1,Number.isFinite(cap)?cap:0,total)*1.1;const points=rows.flatMap((r:any,i:number)=>{const x=45+(i+1)/Math.max(1,rows.length)*900,y=170-r.total/max*140,previous=i?rows[i-1].total:0;return [`${x},${170-previous/max*140}`,`${x},${y}`]}).join(' ');
 return <section className="wa-panel"><header><h2>{series.basis==='gateway'?'Gateway token accumulation':'Recorded model token accumulation'}</h2><span>{series.basis==='gateway'?'Gateway records':'Agent transport records'} · {rows.length} calls</span></header>{rows.length?<><svg className="hx-spend" viewBox="0 0 980 220" role="img" aria-label={`Cumulative recorded usage ${total} tokens; limit ${Number.isFinite(cap)?cap:'unknown'}`}><line x1="45" x2="945" y1="170" y2="170" stroke="var(--border)"/>{Number.isFinite(cap)&&<><line x1="45" x2="945" y1={170-cap/max*140} y2={170-cap/max*140} stroke="var(--chart-budget)" strokeDasharray="5 4"/><text x="45" y={160-cap/max*140}>Cap {cap.toLocaleString()}</text></>}<polyline points={`45,170 ${points}`} fill="none" stroke="var(--primary)" strokeWidth="2"/>{rows.map((r:any,i:number)=><circle key={i} cx={45+(i+1)/rows.length*900} cy={170-r.total/max*140} r="4" fill={r.total>cap?'var(--chart-failure)':'var(--primary)'}><title>{r.call_id}: {r.total} cumulative tokens</title></circle>)}<text x="45" y="205">First call</text><text x="945" y="205" textAnchor="end">{rows.length} calls · {total.toLocaleString()} tokens</text></svg><details><summary>Per-call input / output and cumulative usage</summary><PaginatedTable label="Gateway token accumulation" scrollClassName="wa-table-wrap" resetKey={run.id}><table><thead><tr><th>Call ID</th><th>Time UTC</th><th>Input</th><th>Output</th><th>Cumulative</th></tr></thead><tbody>{rows.map((r:any,i:number)=><tr key={i}><td>{r.call_id}</td><td>{formatUTCDateTime(r.at)}</td><td>{r.input_tokens}</td><td>{r.output_tokens}</td><td>{r.valid?r.total:'Usage missing'}</td></tr>)}</tbody></table></PaginatedTable></details><p>{series.basis==='gateway'?'Gateway usage records.':'Per-call usage reported by the agents; the gateway watcher independently supplies the aggregate above.'} Missing expected inventory and assessment inputs keep the verdict inconclusive. {series.excluded>0&&`${series.excluded} invalid or conflicting records excluded.`}</p></>:<p>No correlated per-call model usage is supplied for this run.</p>}</section>
}
export function JudgeControlSummary({run}:{run:AssuranceRun}){
 const series=controlSpendSeries(run),usage=recordedModelUsage(run.events);
 const measured=run.c16['measured.value'],cap=run.c16['threshold.value'];
 return <section className="wa-panel"><header><h2>Conversation evidence</h2><span>{run.id}</span></header>
  <div className="wa-statstrip">
   <MetricCard label="Recorded activity" value={`${run.events.length} records`} icon="records"/>
   <MetricCard label="Recorded model calls" value={series.calls.length} icon="model"/>
   <MetricCard label="Observed model usage" value={typeof measured==='number'?`${measured.toLocaleString()} tokens`:usage?`${usage.total.toLocaleString()} tokens`:'Not recorded'} icon="budget"/>
   <MetricCard label="Declared spend cap" value={typeof cap==='number'?`${cap.toLocaleString()} tokens`:'Not declared'} icon="budget"/>
  </div>
  <footer>These are recorded measurements. Completed control assessments are shown below; assessment inputs and original verdicts remain available under Inspect and in exports.</footer>
 </section>;
}
export function ReadinessPanel({data,onRun}:{data:AssuranceData;onRun:(id:string)=>void}){
 const [checked,setChecked]=useState(false);const assessments=data.runs.map(run=>({run,c7:queryControl(run,'7'),c16:queryControl(run,'16')}));
 return <section className="wa-panel hx-readiness"><header><h2>Control assurance across the workspace</h2><span>Saved evaluations and independent checks are separate</span><Button onClick={()=>setChecked(true)}>Check all runs</Button></header><PaginatedTable label="Control assurance" scrollClassName="wa-table-wrap" scrollStyle={{maxHeight:'min(480px, 65dvh)'}}><table><thead><tr><th>Run</th><th>C7 · recording</th><th>C16 · spend</th><th>Independent C7</th><th>Independent C16</th></tr></thead><tbody>{assessments.map(({run,c7,c16})=><tr key={run.id}><td><button className="wa-link" onClick={()=>onRun(run.id)}>{run.id}</button></td><td><span className={`wa-badge ${statusClass(run.c7.verdict)}`}>{statusClass(run.c7.verdict)==='good'?'✓ ':''}{run.c7.verdict??'Not assessed'}</span></td><td><span className={`wa-badge ${statusClass(run.c16.verdict)}`}>{statusClass(run.c16.verdict)==='good'?'✓ ':''}{run.c16.verdict??'Not assessed'}</span></td><td>{checked?c7.verdict:'Not checked'}</td><td>{checked?c16.verdict:'Not checked'}</td></tr>)}</tbody></table></PaginatedTable><footer>Independent checks recompute exported evidence and require the declared threshold and expected inventory. Open a run to inspect its exact query gaps.</footer></section>
}
export function OfflinePanel({data,onImport,telemetry}:{data:AssuranceData;telemetry?:CloudCapture|null;onImport:(data:AssuranceData,telemetry?:CloudCapture)=>void}){
 const [message,setMessage]=useState(''),[error,setError]=useState('');
 return <section className="wa-panel audit-bundle"><header><h2>Portable audit bundle</h2><span>Independent browser recomputation · no API required</span></header><div className="audit-bundle-grid"><div className="audit-bundle-action"><div className="audit-action-heading"><h3>Export evidence</h3><span className="audit-action-icon" aria-hidden="true"><FileDownloadOutlined/></span></div><p>Save loaded evidence, available telemetry and local finding history. Unloaded sources are not substituted.</p><Button variant="outlined" onClick={async()=>{try{const findingHistory=JSON.parse(localStorage.getItem('alpha-finding-history')??'[]');exportJson('alpha-audit-bundle.json',await makeSessionBundle(data,telemetry??null,findingHistory));setError('');setMessage(telemetry?'Bundle exported with loaded evidence, telemetry and local finding history.':'Bundle exported with loaded evidence and local finding history. Telemetry was not loaded; foundation and governance observations are not included.');}catch(e){setError((e as Error).message)}}}>Export audit bundle</Button></div><div className="audit-bundle-action"><div className="audit-action-heading"><h3>Import & verify</h3><span className="audit-action-icon" aria-hidden="true"><FileUploadOutlined/></span></div><p>Load a saved JSON bundle and verify its checksum.</p><Button variant="outlined" component="label">Import & verify bundle<input hidden type="file" accept=".json" onChange={async e=>{try{const f=e.target.files?.[0];if(!f)return;if(f.size>20000000)throw Error('Bundle exceeds 20 MB');const p=await readBundle(JSON.parse(await f.text()));const importedData=parseAssurance(p.assurance);const importedTelemetry=p.telemetry?parseCloudCapture(p.telemetry):undefined;if(Array.isArray(p.findingHistory)){const existing=JSON.parse(localStorage.getItem('alpha-finding-history')??'[]');const merged=[...existing];for(const entry of p.findingHistory)if(entry&&typeof entry.findingId==='string'&&!merged.some(x=>JSON.stringify(x)===JSON.stringify(entry)))merged.push(entry);localStorage.setItem('alpha-finding-history',JSON.stringify(merged))}onImport(importedData,importedTelemetry);setMessage('Checksum matches. Imported evidence can be recomputed locally. Origin and authenticity are not verified.');setError('')}catch(err){setError((err as Error).message)}finally{e.target.value=''}}}/></Button></div><div className="audit-bundle-action"><div className="audit-action-heading"><h3>Check offline</h3><span className="audit-action-icon" aria-hidden="true"><TerminalOutlined/></span></div><p>Download the checker to reproduce the evaluation locally.</p><Button variant="outlined" component="a" href="downloads/alpha-independent-reproduction.zip" download>Download offline checker</Button></div></div>{message&&<Alert severity="info">{message}</Alert>}{error&&<Alert severity="error">{error}</Alert>}<footer><strong>Checksum verification</strong><span>SHA-256 detects changes relative to the bundle checksum; it does not authenticate the source or prove completeness. Keep the original bundle and declared threshold records.</span></footer></section>
}
export function ServiceNowPanel(){
 const [embed,setEmbed]=useState(false),[view,setView]=useState('Control Tower');
 const links:Record<string,string>={'Control Tower':workshopLinks.servicenow,'Agent Studio':workshopLinks.studio};
 const url=links[view];
 return <section className="wa-panel hx-servicenow sn-import">
  <header>
   <div className="sn-heading"><span className="sn-icon" aria-hidden="true"><IntegrationInstructionsOutlined/></span><div><h2>ServiceNow workspace</h2><p>Governance and agent configuration</p></div></div>
   <div className="sn-actions"><Button aria-expanded={embed} aria-controls="servicenow-embedded-view" onClick={()=>setEmbed(!embed)}>{embed?'Hide embedded view':'Show embedded view'}</Button><Button variant="outlined" component="a" href={url} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewOutlined/>}>Open in browser</Button></div>
  </header>
  <div className="sn-body">
   <div className="sn-browser-toolbar"><TextField select size="small" label="ServiceNow view" value={view} onChange={e=>setView(e.target.value)}>{Object.keys(links).map(v=><MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField><span>Browser access available · Embedded view may be unavailable</span></div>
   <div className="sn-result"><div><div className="sn-result-title"><strong>Current import status unavailable</strong><span className="sn-status">Browser access</span></div><p>Open ServiceNow to inspect current import and transform results. No live governance connector is configured in this console.</p></div></div>
  </div>
  <footer className="sn-observation"><span>Per-run linkage and notification delivery are unverified.</span></footer>
  {embed&&<div id="servicenow-embedded-view" className="sn-embedded"><Alert severity="info">Use your existing ServiceNow login. If this instance blocks framing or third-party cookies, open the record in the browser. The app cannot inspect cross-origin content or infer success from iframe load.</Alert><iframe title="ServiceNow workspace" src={url} referrerPolicy="no-referrer" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"/><Button component="a" href={url} target="_blank" rel="noopener noreferrer">Embedded view unavailable? Open ServiceNow ↗</Button></div>}
 </section>;
}
export function FindingLifecycle({run}:{run:AssuranceRun}){
 const originals=['7','16'].filter(c=>statusClass((c==='7'?run.c7:run.c16).verdict)==='bad').map(c=>({id:`${run.id}:C${c}`,control:c,original:(c==='7'?run.c7:run.c16)}));
 const [history,setHistory]=useState<any[]>(()=>{try{return JSON.parse(localStorage.getItem('alpha-finding-history')??'[]')}catch{return []}}),[owner,setOwner]=useState(''),[action,setAction]=useState('Remediate'),[note,setNote]=useState(''),[expiry,setExpiry]=useState(''),[retest,setRetest]=useState(''),[error,setError]=useState('');
 return <section className="wa-panel hx-disposition"><header><h2>Control findings & disposition</h2><span>Local audit notes · no external notification sent</span></header>{originals.length?originals.map(f=><div className="hx-finding" key={f.id}><b>{f.id}</b><details><summary>Original breach evidence (preserved)</summary><pre>{JSON.stringify(f.original,null,2)}</pre></details><div className="wa-toolbar"><TextField label="Accountable person" value={owner} onChange={e=>setOwner(e.target.value)}/><TextField select label="Disposition" value={action} onChange={e=>setAction(e.target.value)}>{['Remediate','Temporary compensation','Accept risk'].map(v=><MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField><TextField label="Action / evidence reference" value={note} onChange={e=>setNote(e.target.value)}/><DateTimeField label="Expiry (UTC)" prompt="MM/DD/YYYY HH:mm" value={expiry} onChange={setExpiry}/><TextField label="Retest run reference" value={retest} onChange={e=>setRetest(e.target.value)}/><Button onClick={()=>{if(!owner.trim()||!note.trim()||(action!=='Remediate'&&(!Number.isFinite(Date.parse(expiry+'Z'))||Date.parse(expiry+'Z')<=Date.now()))){setError('Person and action are required; compensation/risk acceptance needs a future expiry.');return}const next=[...history,{findingId:f.id,owner,action,note,expiry:expiry?`${expiry}Z`:null,retest:retest||null,at:new Date().toISOString(),status:'Recorded local disposition; action and retest not verified'}];setHistory(next);localStorage.setItem('alpha-finding-history',JSON.stringify(next));setError('')}}>Record disposition</Button></div>{history.filter(h=>h.findingId===f.id).map((h,i)=><p key={i}>{formatUTCDateTime(h.at)} UTC · {h.owner} · {h.action} · {h.note} · expiry {h.expiry?`${formatUTCDateTime(h.expiry)} UTC`:'—'} · retest {h.retest??'not supplied'} · {h.status}</p>)}</div>):<div className="disposition-empty"><span className="disposition-icon" aria-hidden="true"><VerifiedUserOutlined/></span><div><strong>No saved control breach</strong><p>Workflow failures are tracked separately below.</p></div><span className="disposition-count">0 control findings</span></div>}{error&&<Alert severity="error">{error}</Alert>}</section>
}
