import {MetricCard} from './MetricCard';
import {PaginatedTable} from './PaginatedTable';
import {Button} from '@mui/material';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import BuildOutlined from '@mui/icons-material/BuildOutlined';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';
import NotificationsOutlined from '@mui/icons-material/NotificationsOutlined';
import {categories,category,type AssuranceEvent,type AssuranceRun} from './assuranceData';
import type {WorkspaceRecord} from './workspaceModel';

export function RecentActivity({runs,onInspect}:{runs:AssuranceRun[];onInspect:(id:string)=>void}){
 const records:(AssuranceEvent & {runId:string})[]=runs.flatMap(run=>run.events.map(event=>({...event,runId:run.id}))).filter(e=>e.time).sort((a,b)=>Date.parse(b.time!)-Date.parse(a.time!)).slice(0,25);
 return <section className="wa-panel wa-recent-activity"><header><h2>Recent execution activity</h2><span>Latest 25 timestamped source records · refresh follows connection status</span></header><PaginatedTable label="Recent execution activity" scrollClassName="wa-table-wrap"><table><thead><tr><th>Time · UTC</th><th>Run</th><th>Agent / principal</th><th>Activity</th><th>Recorded outcome</th></tr></thead><tbody>{records.map(e=><tr key={`${e.runId}/${e.id}`}><td>{new Date(e.time!).toLocaleString('en-GB',{timeZone:'UTC'})}</td><td><button className="wa-link" onClick={()=>onInspect(e.runId)}>{e.runId}</button></td><td>{e.actor??'Not recorded'}</td><td>{category(e)} · {e.phase??'Transport'}</td><td>{String(e.delivery_status??e.verdict??e.outcome??e.decision??'Not recorded')}</td></tr>)}</tbody></table>{!records.length&&<p className="wa-empty">No timestamped records collected.</p>}</PaginatedTable><footer>Ordered by source timestamp, not arrival time. Open a run for its detailed event timeline.</footer></section>
}

const categoryIcons=[SmartToyOutlined,AutoAwesomeOutlined,BuildOutlined,VerifiedUserOutlined,AccountBalanceWalletOutlined,NotificationsOutlined];
export function EvidenceIndex({records,onCategory,selectedCategory}:{records:WorkspaceRecord[];onCategory:(value:string)=>void;selectedCategory:string}){
 return <section className="wa-evidence-index" aria-label="Evidence index">
  <header><h2>Evidence index</h2><span>Category counts in the current search · select to filter</span></header>
  <div className="wa-category-index">{categories.map((name,index)=>{
   const count=records.filter(event=>category(event)===name).length;
   const Icon=categoryIcons[index];
   const selected=selectedCategory===name;
   return <Button key={name} className="wa-category-card" disabled={!count} aria-pressed={selected}
    aria-label={`${name}: ${count.toLocaleString()} records`} onClick={()=>onCategory(selected?'':name)}>
    <span className="wa-category-content"><span className="wa-category-card-heading">{name}</span>
     <span className="wa-category-card-count"><b>{count.toLocaleString()}</b><span>records</span></span>
    </span>
    <span className="wa-category-icon" aria-hidden="true"><Icon/></span>
   </Button>;
  })}</div>
 </section>;
}

export function NotificationSummary({records}:{records:WorkspaceRecord[]}){
 const queued=records.filter(e=>e.phase==='notification-queued').length;
 const receipts=records.filter(e=>e.phase==='notification-receipt').length;
 const delivered=records.filter(e=>['delivered','sent','success'].includes(String(e.delivery_status).toLowerCase())).length;
 const recipients=new Set(records.map(e=>e.recipient).filter(Boolean)).size;
 return <section className="wa-panel"><header><h2>Delivery tracking</h2><span>Recorded notification evidence in the current scope</span></header><div className="wa-statstrip wa-delivery-counts">{[['Queued records',queued],['Receipt records',receipts],['Delivered / sent status',delivered],['Named recipients',recipients]].map(([name,value])=><MetricCard key={name} label={String(name)} value={value} icon="notification"/>)}</div><footer>Source counts may include duplicates. Receipt records and delivered statuses do not independently prove provider delivery.</footer></section>
}
