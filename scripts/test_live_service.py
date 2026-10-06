import unittest,tempfile,json,threading
from pathlib import Path
from unittest.mock import patch
from live_service import Runtime,Handler
from http.server import ThreadingHTTPServer
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from types import SimpleNamespace
from telemetry_service import query,normalize
class LiveTests(unittest.TestCase):
 def test_pagination_including_empty_page_and_dedup(self):
  record={'message':json.dumps({'traceId':'a'*32,'spanId':'b'*16,'name':'chat','startTimeUnixNano':1791178130000000000,'endTimeUnixNano':1791178131000000000,'attributes':{'gen_ai.operation.name':'chat','gen_ai.usage.input_tokens':3,'gen_ai.usage.output_tokens':2,'prompt':'secret'}}),'timestamp':1791178130000}
  pages=iter([{'events':[],'nextToken':'a'},{'events':[record],'nextToken':'b'},{'events':[record]}])
  d=query({'region':'us-east-1','logGroups':['test']},'2026-10-05T00:00:00Z','2026-10-05T01:00:00Z',lambda *args:next(pages));self.assertTrue(d['complete']);self.assertEqual(len(d['spans']),1);self.assertEqual(d['spans'][0]['totalTokens'],5);self.assertNotIn('secret',str(d))
 def test_query_limit_and_aws_failure_not_empty_success(self):
  d=query({'region':'x','logGroups':['test'],'maxPagesPerGroup':1},'2026-10-05T00:00:00Z','2026-10-05T01:00:00Z',lambda *args:{'events':[],'nextToken':'a'});self.assertFalse(d['complete']);self.assertTrue(d['errors'])
 def test_invalid_window(self):
  with self.assertRaises(ValueError):query({'region':'x','logGroups':['test']},'2026-10-03T00:00:00Z','2026-10-05T00:00:00Z')
 def test_launch_idempotency_pinning_and_concurrency(self):
  with tempfile.TemporaryDirectory() as directory:
   p=Path(directory)
   for name,data in [('data',{'fault_scenarios':[{'id':'scenario'}]}),('threshold',{'declared_at':'2026-01-01T00:00:00Z','version':'v1'}),('register',{})]:(p/name).write_text(json.dumps(data))
   r=Runtime({'jobs':str(p/'jobs'),'data':str(p/'data'),'threshold':str(p/'threshold'),'register':str(p/'register'),'evidence':str(p/'evidence'),'actors':{'customer':'wf-customer','it':'wf-it','network':'wf-network'},'executionEnabled':True})
   with patch.object(threading.Thread,'start'):
    first=r.launch('scenario','a'*16);self.assertEqual(r.launch('scenario','a'*16)['runId'],first['runId'])
    with self.assertRaises(RuntimeError):r.launch('scenario','b'*16)
    with self.assertRaises(ValueError):r.launch('other','a'*16)
   self.assertEqual(json.loads((p/'jobs'/first['id']/'threshold').read_text())['version'],'v1')
   restored=Runtime(r.config);self.assertEqual(restored.jobs()[0]['state'],'interrupted')
class AuthenticationTests(unittest.TestCase):
 def test_authentication_and_cross_origin_posts(self):
  server=ThreadingHTTPServer(('127.0.0.1',0),Handler);server.token='t'*40;server.runtime=SimpleNamespace(config={'origins':['http://localhost:5174']},catalog=lambda:{'enabled':False})
  thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();url='http://127.0.0.1:'+str(server.server_port)
  try:
   with self.assertRaises(HTTPError) as rejected:urlopen(url+'/api/execution-config')
   self.assertEqual(rejected.exception.code,401)
   req=Request(url+'/api/execution-config',headers={'Authorization':'Bearer '+'t'*40})
   self.assertFalse(json.load(urlopen(req))['enabled'])
   req=Request(url+'/api/executions',data=b'{}',headers={'Authorization':'Bearer '+'t'*40,'Origin':'https://untrusted.invalid','Content-Type':'application/json'})
   with self.assertRaises(HTTPError) as rejected:urlopen(req)
   self.assertEqual(rejected.exception.code,403)
  finally:server.shutdown();server.server_close();thread.join()

if __name__=='__main__':unittest.main()
