import {formatUTCDateTime} from './dateTime';
import {Drawer,Button,IconButton} from '@mui/material';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import type {WorkspaceRecord} from './workspaceModel';
import {exportJson} from './exportJson';
const present=(v:unknown)=>v!==null&&v!==undefined&&v!=='';
const show=(v:unknown)=>typeof v==='object'?JSON.stringify(v):String(v);
export function RecordDrawer({event,related,onClose,onSelect,onRun}:{event?:WorkspaceRecord;related:WorkspaceRecord[];onClose:()=>void;onSelect:(key:string)=>void;onRun:(id:string)=>void}){
 const notification=event?.phase?.startsWith('notification');
 const fields=event?Object.entries({Run:event.runId,Actor:event.actor,Action:event.phase,'Time UTC':present(event.time)?formatUTCDateTime(event.time):event.time,'Event ID':event.event_id,Outcome:event.verdict??event.outcome??event.decision,'Recipient':event.recipient,'Delivery status':event.delivery_status,'Receipt ID':event.receipt_id,'Notification ID':event.notification_id,'Finding ID':event.finding_id,Channel:event.channel,'Delivered at (UTC)':present(event.delivered_at)?formatUTCDateTime(event.delivered_at):event.delivered_at,'Zone':event.zone,Principal:event.principal,Authority:event.authority,'Policy version':event.policy_version,'Threshold version':event.threshold_version,'Threshold digest':event.threshold_digest,'Enforcement point':event.enforcement_point,'Trace ID':event.trace_id,'Span ID':event.span_id,'Parent span':event.parent_span_id,'Call ID':event.call_id,'Logical call ID':event.logical_call_id,'Action ID':event.action_id,'Attempt ID':event.attempt_id,'HTTP status':event.http_status,Asset:event.asset,'ServiceNow number':event.servicenow_number,'ServiceNow record ID':event.servicenow_sys_id}):[];
 const populated=fields.filter(([,v])=>present(v));
 const missing=fields.filter(([,v])=>!present(v));
 return <Drawer anchor="right" open={!!event} onClose={onClose} slotProps={{paper:{className:'wa-record-drawer',role:'dialog','aria-modal':true,'aria-labelledby':'record-drawer-title',sx:{width:{xs:'100%',sm:560},maxWidth:'100vw'}}}}>
 <header className="wa-drawer-header"><div><h2 id="record-drawer-title">Record details</h2><span>{event?.source}</span></div><IconButton aria-label="Close record details" onClick={onClose}><CloseOutlined/></IconButton></header>
 {event&&<><div className="wa-drawer-body"><h3>{event.phase??'Evidence record'}</h3><p className="wa-drawer-note">{notification?'Notification fields shown where supplied by the source. Delivery status is separate from a verified provider receipt.':'Showing values supplied by this record. Absent fields are listed separately below.'}</p><dl>{populated.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{show(value)}</dd></div>)}</dl>
 {missing.length>0&&<details><summary>{missing.length} fields absent from this source record</summary><p>Some fields apply only to other event types. Values are not inferred from unrelated records.</p><p>{missing.map(([label])=>label).join(', ')}</p></details>}
 <details><summary>{related.length} related records with matching identifiers</summary>{related.length?related.map(r=><Button key={r.key} onClick={()=>onSelect(r.key)}>{r.source} / {r.phase}</Button>):<p>No exact identifier matches in this run.</p>}</details>
 <details><summary>Inspect source record</summary><pre>{JSON.stringify(event,null,2)}</pre></details></div><footer className="wa-drawer-footer"><Button variant="outlined" onClick={()=>onRun(event.runId)}>Inspect run & controls</Button><Button onClick={()=>exportJson(`${event.runId}-record.json`,event)}>Export record</Button></footer></>}
 </Drawer>
}
