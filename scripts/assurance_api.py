"""Read-only, loopback evidence API. Reads collected evidence, never enforces or fabricates verdicts."""
from pathlib import Path
import json, datetime, argparse, os, mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
from workflow_evidence import load_workflow
STATIC = Path(__file__).parent / 'dist'
ROOT = Path(os.environ.get('ASSURANCE_EVIDENCE_ROOT', '/home/ec2-user/environment/evidence/runs'))
FIELDS = ('receipt_id','notification_id','finding_id','servicenow_sys_id','servicenow_number','servicenow_url','channel','delivered_at','response_status','threshold_digest','foundation_check_id','runtime_id','runtime_version','zone','principal','authority','owner','control_id','span_id','parent_span_id','event_id','phase','actor','ts','emitted_at','started_at','call_id','logical_call_id','action_id','trace_id','attempt_id','outcome','verdict','decision','reason','error','http_status','policy_id','policy_version','threshold_version','enforcement_point','committed','reserved','estimate','projected','recipient','delivery_status','asset','request_tool_name','attested_by')
def read(p):
 if not p.exists(): return {}
 return json.loads(p.read_text())
def rows(p):
 if not p.exists(): return []
 return [json.loads(x) for x in p.read_text().splitlines() if x.strip()]
def pick(d, keys): return {k:d[k] for k in keys if k in d}
def load_run(p):
 if (p/'workflow-start.json').exists() or (p/'workflow.json').exists():
  workflow=load_workflow(p);events=workflow.pop('events');metadata=read(p/'workflow-ui.json')
  return {'id':p.name,'scenario':metadata.get('scenario',p.name),'sources':{'workflow':{'source':'coordinator artifacts','independentControlAssessment':False}},
          'collectedAt':None,'window':[],'c7':{},'c16':{},'c9':{},'budget':{},
          'c7Threshold':read(p/'c7-threshold.json'),'workflow':workflow,'events':events}
 manifest=read(p/'manifest.json'); runner=read(p/'runner.json') or read(p/'runner-start.json'); budget=read(p/'budget.json'); c7=read(p/'reports/control-7.json'); c16=read(p/'control-16.json') or read(p/'control-16-inline.json')
 events=[]
 for source, records in [('ledger.jsonl',rows(p/'ledger.jsonl')),('decisions.jsonl',rows(p/'decisions.jsonl')),('budget.json',budget.get('events',[])),('runner.json',runner.get('attempts',[])),('notifications.jsonl',rows(p/'notifications.jsonl'))]:
  for i,e in enumerate(records):
   event=pick(e,FIELDS); event['id']=source+':'+str(i+1); event['source']=source+':'+str(i+1); event['time']=e.get('emitted_at') or e.get('ts'); events.append(event)
 c7keys=('verdict','threshold_version','expected_count','observed_count','coverage','missing_ids','unverified_ids','gap_violations','orphan_actions','findings','uncertainties','warnings','source_refs','coverage_verdict','timing_verdict','gap_limit_ms','gap_count','max_gap_ms','broken_links','assessment_kind','gateway_join_basis')
 c16keys=('verdict','threshold.version','threshold.value','measured.value','measurement.complete','over_by','failed.calls','findings','warnings','evidence.refs','window','measured.detail')
 return {'id':p.name,'scenario':runner.get('scenario') or manifest.get('scenario') or p.name,'sources':manifest.get('sources',{}),'collectedAt':manifest.get('pulled.at'),'window':manifest.get('window',[]),'c7':pick(c7,c7keys),'c7Threshold':read(p/'c7-threshold.json') or (read(p/'threshold.json') if c7 else {}),'c16Threshold':read(p/'c16-threshold.json') or (read(p/'threshold.json') if str(read(p/'threshold.json').get('control_id'))=='16' else budget.get('threshold',{})),'c9':read(p/'control-9.json'),'c9Threshold':read(p/'c9-threshold.json'),'qualityBaseline':read(p/'quality-baseline.json'),'qualityWindows':read(p/'quality-windows.json').get('windows',[]),'expectedQualityWindowIds':read(p/'expected-quality-windows.json').get('window_ids'),'expectedCallIds':read(p/'expected-calls.json').get('call_ids') or None,'expectedEvents':read(p/'expected-events.json').get('events') or None,'c16':pick(c16,c16keys),'budget':pick(budget,('committed','reserved','blocked','threshold','mode')),'workflow':{'aborted':runner.get('aborted'),'completedAt':runner.get('completed_at'),'results':[pick(r,('actor','returncode','completed_at','disposition','evidence_errors')) for r in runner.get('results',[])],'failures':[pick(a,('actor','attempt_id','http_status','outcome','error','request_tool_name','ts')) for a in runner.get('attempts',[]) if (a.get('http_status') or 0)>=400 or a.get('error')]},'events':events}
def snapshot():
 runs=[]; errors=[]
 for p in sorted(ROOT.iterdir()):
  if not p.is_dir() or not any((p/name).exists() for name in ('reports/control-7.json','control-16.json','budget.json','runner-start.json','workflow-start.json','workflow.json')): continue
  try: runs.append(load_run(p))
  except (ValueError,OSError,TypeError,KeyError) as e: errors.append({'run':p.name,'error':'Evidence unavailable or malformed: '+type(e).__name__})
 return {'schema':2,'source':'AWS collected evidence','readAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runs':runs,'errors':errors,'freshness':'Reads existing collector outputs; does not trigger CloudWatch collection','governance':{'mode':'browser','runCorrelation':'unverified'}}
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  path=urlparse(self.path).path
  if path.endswith('/api/assurance') or path=='/api/assurance':
   try: data=snapshot(); status=200
   except OSError: data={'error':'Evidence directory unavailable'}; status=503
  elif path.endswith('/health'): data={'status':'ok','readOnly':True}; status=200
  else:
   # Static files only inside the built UI; no directory listing or evidence file access.
   relative=path.split('/proxy/8766/',1)[-1].lstrip('/') or 'index.html'
   target=(STATIC/relative).resolve()
   if target.is_relative_to(STATIC.resolve()) and target.is_file():
    body=target.read_bytes(); self.send_response(200); self.send_header('Content-Type',mimetypes.guess_type(str(target))[0] or 'application/octet-stream'); self.send_header('Content-Length',str(len(body))); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(body); return
   data={'error':'Not found'}; status=404
  body=json.dumps(data).encode(); self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Cache-Control','no-store'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
 def log_message(self,*args): pass
if __name__=='__main__':
 parser=argparse.ArgumentParser(); parser.add_argument('--export'); parser.add_argument('--port',type=int,default=8766); args=parser.parse_args()
 if args.export: Path(args.export).write_text(json.dumps(snapshot()))
 else: ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
