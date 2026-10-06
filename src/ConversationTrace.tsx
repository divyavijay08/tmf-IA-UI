import {useMemo,useState} from 'react';
import type {CloudSpan} from './cloudwatchData';
import {spanDetails,spanType} from './conversationEvidence';
import {traceHierarchy} from './traceHierarchy';

export function ConversationTrace({spans,visibleIds,selected,onSelect}:{spans:CloudSpan[];visibleIds:Set<string>;selected?:string;onSelect:(id:string)=>void}){
 const [view,setView]=useState<'Tree'|'Timeline'>('Timeline'),[format,setFormat]=useState<'Form'|'JSON'>('Form'),[collapsed,setCollapsed]=useState<Set<string>>(new Set());
 const nodes=useMemo(()=>traceHierarchy(spans),[spans]);
 const chosen=nodes.find(n=>n.span.spanId===selected);
 const nodeById=new Map(nodes.map(n=>[n.span.spanId,n]));
 const path=chosen?[...chosen.ancestors.map(id=>nodeById.get(id)!).filter(Boolean),chosen]:[];
 const children=chosen?.children.map(id=>nodeById.get(id)!).filter(Boolean)||[];
 const start=spans.length?Math.min(...spans.map(s=>Date.parse(s.startTime))):0,end=spans.length?Math.max(...spans.map(s=>Date.parse(s.endTime))):0,duration=Math.max(1,end-start);
 const rows=nodes.filter(n=>visibleIds.has(n.span.spanId)&&(visibleIds.size!==spans.length||!n.ancestors.some(id=>collapsed.has(id))));
 function toggle(id:string){setCollapsed(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});}
 const nodeButton=(n:typeof nodes[number])=><button key={n.span.spanId} aria-pressed={n.span.spanId===selected} onClick={()=>onSelect(n.span.spanId)} title={n.span.spanId}><b>{n.span.name}</b><small>{n.span.service||spanType(n.span)}</small><small>{n.span.durationMs.toFixed(1)} ms</small></button>;
 return <div className="conversation-trace-grid">
  <div className="conversation-trace-charts">
   <section className="wa-panel trace-timeline"><header><h2>Spans ({spans.length})</h2><div className="trace-switch" aria-label="Trace view">{(['Tree','Timeline'] as const).map(v=><button key={v} aria-pressed={view===v} onClick={()=>setView(v)}>{v}</button>)}</div></header>
    <div className="trace-axis"><span>Span / service</span><span>{view==='Timeline'?`0 – ${(duration/1000).toFixed(2)} s`:'Parent / child hierarchy'}</span><span>Duration</span></div>
    <div className="trace-rows" aria-label={`${view} spans`}>
     {rows.map(n=>{const s=n.span;return <div key={s.spanId} className={`trace-row ${view==='Tree'?'trace-tree-row':''}`} data-selected={selected===s.spanId}>
      <div className="trace-row-label" style={{paddingLeft:8+Math.min(n.depth,7)*12}}>{n.children.length>0?<button className="trace-toggle" aria-label={`${collapsed.has(s.spanId)?'Expand':'Collapse'} children of ${s.name} ${s.spanId}`} aria-expanded={!collapsed.has(s.spanId)} onClick={()=>toggle(s.spanId)}>{collapsed.has(s.spanId)?'▸':'▾'}</button>:<span className="trace-toggle"/>}<button className="trace-name" aria-pressed={selected===s.spanId} onClick={()=>onSelect(s.spanId)} title={`${s.name} · ${s.spanId}`}><b>{s.name}</b><small>{s.service||spanType(s)}{n.missingParent?' · parent not loaded':''}</small></button></div>
      <button className="trace-bar" aria-label={`Select ${s.name} ${s.spanId}`} aria-pressed={selected===s.spanId} onClick={()=>onSelect(s.spanId)}>{view==='Timeline'?<i data-error={s.status?.toUpperCase()==='ERROR'||Number(s.httpStatus)>=400} style={{left:`${(Date.parse(s.startTime)-start)/duration*100}%`,width:`${Math.max(.5,s.durationMs/duration*100)}%`}}/>:<small>{spanType(s)}</small>}</button>
      <button className="trace-duration" aria-label={`Inspect ${s.spanId}`} onClick={()=>onSelect(s.spanId)}>{s.durationMs>=1000?`${(s.durationMs/1000).toFixed(2)} s`:`${s.durationMs.toFixed(1)} ms`}</button>
     </div>})}
     {!rows.length&&<p className="chat-evidence-note">No spans match this category.</p>}
    </div><footer>Click a span to inspect it. Arrows expand child spans. Nested durations and repeated token counts must not be added together.</footer>
   </section>
   <section className="wa-panel trace-trajectory"><header><h2>Trajectory</h2><span>Recorded parent → child links</span></header><div className="trace-path">{path.map(n=><div className="trace-path-step" key={n.span.spanId}>{nodeButton(n)}</div>)}{children.length>0&&<div className="trace-path-children">{children.map(nodeButton)}</div>}{!chosen&&<p>Select a span to view its trajectory.</p>}</div><footer>{chosen?.missingParent?'The selected span’s parent was not present in the loaded trace.':'Select any node to follow its branch and inspect its details.'}</footer></section>
  </div>
  <section className="wa-panel journey-span-detail trace-selected"><header><div aria-live="polite"><h2>{chosen?.span.name||'Selected span'}</h2><small>{chosen?.span.service}</small></div><div className="trace-switch" aria-label="Span details format">{(['Form','JSON'] as const).map(v=><button key={v} aria-pressed={format===v} onClick={()=>setFormat(v)}>{v}</button>)}</div></header><div className="trace-detail-scroll">{chosen?(format==='JSON'?<pre>{JSON.stringify(chosen.span,null,2)}</pre>:<><dl>{Object.entries(spanDetails(chosen.span)).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{typeof v==='number'?v.toLocaleString():v}</dd></div>)}</dl><p className="chat-evidence-note">Metadata for this span. Agent/cycle token counts can repeat model usage. UNSET means no explicit span status was recorded. Raw prompts, session payloads and message bodies are excluded.</p></>):<p className="chat-evidence-note">Select a span to inspect its metadata.</p>}</div></section>
 </div>;
}
