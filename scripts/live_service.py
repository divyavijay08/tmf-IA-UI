"""Authenticated adapter for the existing Alpha runner and CloudWatch collector."""
import argparse, datetime as dt, hashlib, hmac, json, os, re, subprocess, threading, uuid
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
import assurance_api as evidence
from telemetry_service import query, millis

def now():return dt.datetime.now(dt.timezone.utc).isoformat()
def read(path):return json.loads(Path(path).read_text())
def save(path,data):
 path=Path(path);tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data));os.chmod(tmp,0o600);os.replace(tmp,path)

class Runtime:
 def __init__(self,config):
  self.config=config;self.root=Path(config['jobs']);self.root.mkdir(parents=True,exist_ok=True,mode=0o700);self.lock=threading.Lock()
  for path in self.root.glob('*/job.json'):
   job=read(path)
   if job['state'] in ('queued','running','collecting'):
    job.update(state='interrupted',message='Service restarted. Runtime sessions may still be active; inspect before launching again.',finishedAt=now());save(path,job)
 def catalog(self):
  config=self.config;data=read(config['data']);threshold=read(config['threshold'])
  return {'scenarios':[{'id':s['id'],'title':s.get('title',s['id'])} for s in data['fault_scenarios']], 'threshold':{'version':threshold.get('version'),'declaredAt':threshold.get('declared_at')},'actors':config['actors'],'enabled':bool(config.get('executionEnabled')),'chatEnabled':bool(config.get('executionEnabled'))}
 def jobs(self):
  result=[]
  for path in self.root.glob('*/job.json'):
   job=read(path);start=evidence.read(Path(self.config['evidence'])/'runs'/job['runId']/'runner-start.json');finish=evidence.read(Path(self.config['evidence'])/'runs'/job['runId']/'runner.json')
   sessions=evidence.read(Path(self.config['evidence'])/'runs'/job['runId']/'sessions.json') or [];job['invokedAgents']=[s.get('actor') for s in sessions if s.get('actor')];job['traceId']=start.get('trace_id');job['completedAgents']=len(finish.get('results',[]));job['workflowCompletedAt']=finish.get('completed_at');journey=evidence.read(Path(self.config['evidence'])/'runs'/job['runId']/'journey.json');job['journey']=journey.get('stages',[]);job['journeyError']=journey.get('error');result.append(job)
  return sorted(result,key=lambda j:j['createdAt'],reverse=True)[:100]
 def chat(self,message,key,parent=None):
  if not isinstance(message,str) or not message.strip() or len(message)>3000:raise ValueError('Message must contain 1–3000 characters')
  if parent is not None and (not isinstance(parent,str) or not re.fullmatch('[a-f0-9]{24}',parent)):raise ValueError('Invalid parent message')
  history=[]
  if parent:
   previous=next((j for j in self.jobs() if j['id']==parent),None)
   if not previous or previous.get('kind')!='chat' or previous['state']!='completed' or not previous.get('answer'):raise ValueError('Previous message has no completed answer')
   history=previous.get('history',[])+[{'role':'user','content':previous['userMessage']},{'role':'assistant','content':previous['answer']}]
   if len(json.dumps(history))+len(message)>20000:raise ValueError('Conversation is full; start a new chat')
  return self.launch('chat-message',key,{'kind':'chat','userMessage':message,'parentId':parent,'history':history})
 def launch(self,scenario,key,chat=None):
  if not isinstance(key,str) or not re.fullmatch('[a-zA-Z0-9_-]{16,80}',key):raise ValueError('A valid idempotency key is required')
  with self.lock:
   jobid=hashlib.sha256(key.encode()).hexdigest()[:24];directory=self.root/jobid;path=directory/'job.json'
   if path.exists():
    job=read(path)
    if job['scenario']!=scenario or job.get('userMessage')!=(chat or {}).get('userMessage') or job.get('parentId')!=(chat or {}).get('parentId'):raise ValueError('Launch key already belongs to another scenario')
    return job
   if not self.config.get('executionEnabled'):raise RuntimeError('Run execution is disabled')
   if any(j['state'] in ('queued','running','collecting','interrupted') for j in self.jobs()):raise RuntimeError('Another execution is active or requires review')
   if not chat and scenario not in [s['id'] for s in self.catalog()['scenarios']]:raise ValueError('Unknown scenario')
   directory.mkdir(mode=0o700);runid='ui-'+uuid.uuid4().hex
   # Copy the actual declared configuration before dispatch. Never synthesize thresholds.
   for keyname in ('data','threshold','register'):
    data=Path(self.config[keyname]).read_bytes();(directory/keyname).write_bytes(data)
   threshold=read(directory/'threshold')
   if millis(threshold['declared_at'])>millis(now()):raise ValueError('Threshold declaration is in the future')
   job={'id':jobid,'runId':runid,'scenario':scenario,'state':'queued','createdAt':now(),'thresholdVersion':threshold['version'],'thresholdDigest':hashlib.sha256((directory/'threshold').read_bytes()).hexdigest()}
   if chat:
    job.update(chat);save(directory/'chat-request.json',{'message':chat['userMessage'],'history':chat['history']});save(directory/'data',{'fault_scenarios':[{'id':'chat-message','title':'Customer message','symptoms':{}}]})
   save(path,job);threading.Thread(target=self.execute,args=(directory,job),daemon=True).start();return job
 def execute(self,directory,job):
  config=self.config;path=directory/'job.json'
  command=['python3','-m','tools.control7.runner',job['scenario'],'--data',str(directory/'data'),'--threshold',str(directory/'threshold'),'--register',str(directory/'register'),'--evidence',config['evidence'],'--run-id',job['runId'],'--actors',','.join(k+'='+v for k,v in config['actors'].items()),'--budget-export']
  if job.get('kind')=='chat':
   command=['python3',str(Path(__file__).with_name('chat_runner.py')),str(directory/'chat-request.json')]+command[3:]
  job.update(state='running',startedAt=now());save(path,job)
  try:
   with (directory/'runner.log').open('w') as log:
    result=subprocess.run(command,cwd=config['repository'],stdout=log,stderr=log,timeout=1800,env=dict(os.environ,PYTHONPATH=config['repository']))
   if job.get('kind')=='chat':
    response_path=Path(config['evidence'])/'runs'/job['runId']/'chat-answer.json'
    try:
     response=json.loads(response_path.read_text());job['answer']=response.get('answer','');job['disposition']=response.get('disposition');job['agentHttpStatus']=response.get('http_status')
    except (OSError,ValueError):job['answer']=''
   job['exitCode']=result.returncode;job.update(state='collecting')
   if job.get('kind')=='chat':
    answered=bool(job.get('answer')) and isinstance(job.get('agentHttpStatus'),int) and job['agentHttpStatus']<400 and result.returncode==0
    job.update(state='completed' if answered else 'failed',finishedAt=now(),message='Customer service combined the investigation results.' if answered else 'Investigation stopped before a final customer response. See the recorded stages.',evidenceState='collecting')
   save(path,job)
   # The configured collector is a fixed administrator-owned argv, never browser input.
   if config.get('collector'):
    command=[arg.replace('{runId}',job['runId']) for arg in config['collector']]
    with (directory/'collector.log').open('w') as log:
     collected=subprocess.run(command,cwd=config['repository'],stdout=log,stderr=log,timeout=600,env=dict(os.environ,ALPHA_EVIDENCE=config['evidence'],ALPHA_REGISTER=str(directory/'register')))
    job['collectionExitCode']=collected.returncode;job['evidenceState']='completed' if collected.returncode==0 else 'failed'
   job.update(state='completed' if result.returncode==0 and job.get('collectionExitCode',1)==0 else 'failed',message='Process outcomes recorded. Control results and business completion require evidence.',finishedAt=now())
   if job.get('kind')=='chat':
    answered=bool(job.get('answer')) and isinstance(job.get('agentHttpStatus'),int) and job['agentHttpStatus']<400 and result.returncode==0
    job.update(state='completed' if answered else 'failed',message=('Customer service combined the investigation results.'+(' Trace evidence collection failed.' if job.get('collectionExitCode',0)!=0 else '')) if answered else 'Investigation stopped before a final customer response. See the recorded stages.')
  except subprocess.TimeoutExpired:
   if job.get('kind')=='chat' and job.get('finishedAt'):job.update(evidenceState='failed',message='Agent response retained. Evidence collection timed out.')
   else:job.update(state='interrupted',message='Execution timed out. Remote session state needs review; it has not been declared stopped.',finishedAt=now())
  except Exception:job.update(state='failed',message='Runner or collector failed. Inspect server-side execution logs.',finishedAt=now())
  save(path,job)

class Handler(BaseHTTPRequestHandler):
 def respond(self,code,value):
  body=json.dumps(value).encode();self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def authorized(self):
  if not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+self.server.token):self.respond(401,{'error':'Authentication required'});return False
  return True
 def do_GET(self):
  if not self.authorized():return
  url=urlparse(self.path);path=url.path;runtime=self.server.runtime
  try:
   if path.endswith('/api/assurance'):result=evidence.snapshot()
   elif path.endswith('/api/execution-config'):result=runtime.catalog()
   elif path.endswith('/api/executions'):result={'executions':runtime.jobs()}
   elif path.endswith('/api/telemetry'):
    params=parse_qs(url.query);result=query(runtime.config['cloudwatch'],params['from'][0],params['to'][0])
   elif path.endswith('/health'):result={'status':'ok','executionEnabled':bool(runtime.config.get('executionEnabled'))}
   else:self.respond(404,{'error':'Endpoint unavailable'});return
   self.respond(200,result)
  except (ValueError,KeyError):self.respond(400,{'error':'Invalid request or configuration'})
  except (OSError,RuntimeError):self.respond(503,{'error':'Source unavailable; check service configuration and permissions'})
 def do_POST(self):
  if not self.authorized():return
  origin=self.headers.get('Origin')
  if origin and origin not in self.server.runtime.config.get('origins',[]):self.respond(403,{'error':'Origin not allowed'});return
  if self.headers.get('Content-Type','').split(';')[0]!='application/json':self.respond(415,{'error':'JSON required'});return
  if not urlparse(self.path).path.endswith(('/api/executions','/api/messages')):self.respond(404,{'error':'Endpoint unavailable'});return
  try:
   size=int(self.headers.get('Content-Length','0'))
   if size<1 or size>16384:raise ValueError('Invalid request size')
   data=json.loads(self.rfile.read(size))
   if not isinstance(data,dict):raise ValueError('JSON object required')
   job=self.server.runtime.chat(data.get('message'),data.get('idempotencyKey'),data.get('parentId')) if urlparse(self.path).path.endswith('/api/messages') else self.server.runtime.launch(data.get('scenario'),data.get('idempotencyKey'))
   self.respond(202,job)
  except (ValueError,TypeError) as e:self.respond(400,{'error':str(e) or 'Invalid request'})
  except RuntimeError as e:self.respond(409,{'error':str(e)})
  except OSError:self.respond(503,{'error':'Execution configuration unavailable'})
 def log_message(self,*args):pass
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--config',required=True);parser.add_argument('--token-file',required=True);parser.add_argument('--port',type=int,default=8767);args=parser.parse_args()
 token=Path(args.token_file).read_text().strip()
 if len(token)<32:raise SystemExit('A strong service token is required')
 config=read(args.config);evidence.ROOT=Path(config['evidence'])/'runs'
 # Prevent two adapters from dispatching against the same job store.
 import fcntl
 Path(config['jobs']).mkdir(parents=True,exist_ok=True,mode=0o700);lock=open(Path(config['jobs'])/'service.lock','w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler);server.token=token;server.runtime=Runtime(config);server.serve_forever()
