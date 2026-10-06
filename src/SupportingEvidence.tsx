import {evidenceFields,assessmentLabel} from './recordedEvidence';
import {MetricCard,type MetricIcon} from './MetricCard';
import {statusClass} from './controlQuery';
import type {AssuranceRun} from './assuranceData';

const display=(value:unknown)=>value==null?'Not recorded':typeof value==='number'?value.toLocaleString():typeof value==='object'?JSON.stringify(value):String(value);

export function SupportingEvidence({run,control}:{run:AssuranceRun;control:string}){
 const report=control==='7'?run.c7:control==='16'?run.c16:run.c9??{};
 const fields=control==='7'?{'Recorded transport events':run.c7.recorded_event_count,'Expected events':run.c7.expected_count,'Observed events':run.c7.observed_count,'Threshold version':run.c7.threshold_version,'Missing IDs':run.c7.missing_ids}:control==='9'?{'Baseline version':run.qualityBaseline?.version,'Comparison windows':run.qualityWindows?.length,'Metric':run.c9?.metric,'Threshold version':run.c9?.['threshold.version']}:{'Measured tokens':run.c16['measured.value'],'Threshold tokens':run.c16['threshold.value'],'Threshold version':run.c16['threshold.version'],'Reserved tokens':run.budget.reserved};
 const notes=[...(report.warnings??[]),...(report.findings??[])];
 return <section className="wa-panel supporting-evidence">
  <header><h2>Control {control} · Supporting evidence</h2><span className={`wa-badge ${statusClass(report.verdict)}`}>{statusClass(report.verdict)==='good'?'✓ ':''}{assessmentLabel(report)}</span></header>
  {<div className="supporting-body">
   {!evidenceFields(fields).length&&<p>No assessed measurements are attached to this run. See the independent query for available records and evidence gaps.</p>}
   <div className="wa-statstrip supporting-metrics">{evidenceFields(fields).map(([label,value],index)=><MetricCard key={label} label={label} value={display(value)} icon={(['records','budget','verified','records'] as MetricIcon[])[index]}/>)}</div>
   {notes.length>0&&<div className="supporting-notes"><h3>{report.assessment_kind==='evidence_readiness'?'Evidence gaps':'Evaluator notes'} <span>{notes.length}</span></h3><ul>{notes.map((note,index)=><li key={index}>{display(note)}</li>)}</ul></div>}
   <div className="evidence-disclosures"><details><summary>{report.assessment_kind==='evidence_readiness'?'Evidence readiness report':'Evaluator report'} <span>JSON</span></summary><pre>{JSON.stringify(report,null,2)}</pre></details></div>
  </div>}
  <footer>{report.assessment_kind==='evidence_readiness'?'Recorded measurements and missing assessment inputs; this is an evidence readiness check.':'Saved evaluation · Independent query results are shown separately.'}</footer>
 </section>;
}
