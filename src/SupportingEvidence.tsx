import {MetricCard,type MetricIcon} from './MetricCard';
import {statusClass} from './controlQuery';
import type {AssuranceRun} from './assuranceData';

const display=(value:unknown)=>value==null?'Not recorded':typeof value==='number'?value.toLocaleString():typeof value==='object'?JSON.stringify(value):String(value);

export function SupportingEvidence({run,control}:{run:AssuranceRun;control:string}){
 const report=control==='7'?run.c7:control==='16'?run.c16:{};
 const fields=control==='7'?{'Expected events':run.c7.expected_count,'Observed events':run.c7.observed_count,'Threshold version':run.c7.threshold_version,'Missing IDs':run.c7.missing_ids}:{'Measured tokens':run.c16['measured.value'],'Threshold tokens':run.c16['threshold.value'],'Threshold version':run.c16['threshold.version'],'Reserved tokens':run.budget.reserved};
 const notes=[...(report.warnings??[]),...(report.findings??[])];
 return <section className="wa-panel supporting-evidence">
  <header><h2>Control {control} · Supporting evidence</h2><span className={`wa-badge ${statusClass(report.verdict)}`}>{statusClass(report.verdict)==='good'?'✓ ':''}{report.verdict??'Not assessed'}</span></header>
  {control==='9'?<div className="supporting-empty"><strong>No workshop evaluation</strong><p>A verdict for Control 9 cannot be established from this evidence.</p></div>:<div className="supporting-body">
   <div className="wa-statstrip supporting-metrics">{Object.entries(fields).map(([label,value],index)=><MetricCard key={label} label={label} value={display(value)} icon={(['records','budget','verified','records'] as MetricIcon[])[index]}/>)}</div>
   {notes.length>0&&<div className="supporting-notes"><h3>Evaluator notes <span>{notes.length}</span></h3><ul>{notes.map((note,index)=><li key={index}>{display(note)}</li>)}</ul></div>}
   <div className="evidence-disclosures"><details><summary>Evaluator report <span>JSON</span></summary><pre>{JSON.stringify(report,null,2)}</pre></details></div>
  </div>}
  <footer>Saved evaluation · Independent query results are shown separately.</footer>
 </section>;
}
