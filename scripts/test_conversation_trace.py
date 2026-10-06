import unittest
from conversation_trace import collect, parameters

TRACE='a'*32
QUERY='from=2026-10-06T04:55:00Z&to=2026-10-06T04:59:00Z&traceId='+TRACE

def row(sid='1'*16):
 return dict(source={'logGroup':'aws/spans'},summary=dict(traceId=TRACE,spanId=sid,name='chat',kind='CLIENT',tokens={'input':None,'total':None}),span=dict(startTimeUnixNano=1000000000,endTimeUnixNano=2000000000,attributes={'prompt':'DO NOT EXPORT','gen_ai.operation.name':'chat'},events=[{'secret':'DO NOT EXPORT'}]))

class TraceTests(unittest.TestCase):
 def test_exact_trace_metadata_only_and_pagination(self):
  calls=[]
  def fetch(path,args=None):
   if path=='/api/sources':return {'region':'us-east-1','sources':[{'id':'gateway','logGroup':'aws/spans'}]}
   calls.append(args)
   return dict(spans=[row()],nextCursor='next' if len(calls)==1 else None,hasMore=len(calls)==1)
  data=collect(QUERY,fetch=fetch)
  self.assertTrue(data['complete']);self.assertEqual(len(data['spans']),1)
  self.assertEqual(calls[1]['cursor'],'next');self.assertEqual(calls[0]['traceId'],TRACE)
  self.assertNotIn('DO NOT EXPORT',str(data));self.assertNotIn('totalTokens',data['spans'][0])
 def test_other_trace_is_rejected_not_shown(self):
  def fetch(path,args=None):
   if path=='/api/sources':return {'sources':[{'id':'g','logGroup':'aws/spans'}]}
   r=row();r['summary']['traceId']='b'*32;return {'spans':[r]}
  data=collect(QUERY,fetch=fetch);self.assertFalse(data['complete']);self.assertEqual(data['spans'],[])
 def test_empty_page_with_cursor_still_continues(self):
  calls=[]
  def fetch(path,args=None):
   if path=='/api/sources':return {'sources':[{'id':'g','logGroup':'aws/spans'}]}
   calls.append(args)
   return {'spans':[],'nextCursor':'next','scanLimited':True} if len(calls)==1 else {'spans':[row()]}
  self.assertEqual(len(collect(QUERY,fetch=fetch)['spans']),1)
 def test_query_cannot_expand_scope(self):
  for query in (QUERY+'&source=secret',QUERY+'&traceId='+TRACE,QUERY.replace('04:59','04:54'),QUERY.replace('2026-10-06T04:59','2026-10-08T04:59')):
   with self.assertRaises(ValueError):parameters(query)

class ProxyBoundaryTests(unittest.TestCase):
 def test_unknown_trace_never_reaches_shared_span_service(self):
  import io,json
  from types import SimpleNamespace
  from unittest.mock import patch
  from judge_server import JudgeHandler
  handler=object.__new__(JudgeHandler);handler.path='/api/conversation-trace?'+QUERY
  handler.server=SimpleNamespace(target='http://127.0.0.1:8767',token='test-token',span_api='http://127.0.0.1:10196')
  sent=[];handler._send=lambda code,body:sent.append(code)
  with patch('judge_server.urllib.request.urlopen',return_value=io.BytesIO(json.dumps({'executions':[{'traceId':'b'*32}]}).encode())),patch('judge_server.collect_trace') as upstream:
   handler.do_GET();upstream.assert_not_called();self.assertEqual(sent,[404])

class RuntimeMetadataTests(unittest.TestCase):
 def test_agent_token_aliases_and_metadata_exclude_payloads(self):
  from conversation_trace import normalize
  r=row();r['summary'].update(name='invoke_agent Strands Agents',tokens={});r['span']['attributes'].pop('gen_ai.operation.name')
  r['source']['logStream']='spans'
  r['span']['attributes'].update({'aws.local.service':'alpha_customer.DEFAULT','gen_ai.agent.name':'Strands Agents','gen_ai.request.model':'nemotron-super-120b','gen_ai.usage.prompt_tokens':1099,'gen_ai.usage.completion_tokens':731,'gen_ai.usage.total_tokens':1830,'gen_ai.usage.cache_write_input_tokens':0,'gen_ai.input.messages':'SECRET PROMPT','aws.span.kind':'AGENT'})
  s=normalize(r,TRACE,'us-east-1')
  self.assertEqual((s['agent'],s['model'],s['operation']),('Strands Agents','nemotron-super-120b','invoke_agent'))
  self.assertEqual((s['inputTokens'],s['outputTokens'],s['totalTokens'],s['cacheWriteTokens']),(1099,731,1830,0))
  self.assertEqual(s['logStream'],'spans');self.assertNotIn('SECRET',str(s));self.assertNotIn('attributes',s)
 def test_reads_all_configured_runtime_sources_and_reports_counts(self):
  sources=[dict(id=str(i),logGroup='runtime'+str(i),logStream='spans') for i in range(4)]
  def fetch(path,args=None):
   if path=='/api/sources':return dict(sources=sources)
   r=row(str(int(args['source'])+1)*16);r['source']=sources[int(args['source'])];return dict(spans=[r])
  result=collect(QUERY,fetch=fetch)
  self.assertEqual(len(result['spans']),4);self.assertEqual([s['spans'] for s in result['sources']],[1,1,1,1]);self.assertTrue(result['complete'])
 def test_runtime_source_failure_preserves_other_sources_without_claiming_complete(self):
  def fetch(path,args=None):
   if path=='/api/sources':return dict(sources=[dict(id='g',logGroup='gateway'),dict(id='a',logGroup='agent')])
   if args['source']=='a':raise TimeoutError()
   return dict(spans=[row()])
  result=collect(QUERY,fetch=fetch);self.assertEqual(len(result['spans']),1);self.assertFalse(result['complete']);self.assertEqual(result['errors'][0]['logGroup'],'agent')
