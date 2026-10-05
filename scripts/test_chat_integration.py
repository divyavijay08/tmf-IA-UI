import json
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from live_service import Runtime, read, save
from chat_runner import question_for

class MessageIntegrationTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
  for name,data in [('data',{'fault_scenarios':[{'id':'S1','symptoms':{'element':'SHOULD-NOT-BE-SENT'}}]}),('threshold',{'version':'v1','declared_at':'2026-01-01T00:00:00Z'}),('register',{})]:
   (self.root/name).write_text(json.dumps(data))
  self.runtime=Runtime(dict(jobs=str(self.root/'jobs'),data=str(self.root/'data'),threshold=str(self.root/'threshold'),register=str(self.root/'register'),evidence=str(self.root/'evidence'),actors={'customer':'alpha-c716-customer'},executionEnabled=True,repository=str(self.root)))
 def tearDown(self):self.temp.cleanup()
 def create(self,message='My service ABC-987 is down',key='a'*16,parent=None):
  with patch.object(threading.Thread,'start'):return self.runtime.chat(message,key,parent)
 def test_exact_message_and_no_scenario_substitution(self):
  message='Check ABC-987, not fronthaul.\nQuoted: "hello"'
  job=self.create(message);request=read(self.root/'jobs'/job['id']/'chat-request.json')
  self.assertEqual(question_for(request['message'],request['history']),message)
  self.assertNotIn('SHOULD-NOT-BE-SENT',str(request))
  self.assertEqual(self.create(message)['id'],job['id'])
  with self.assertRaises(ValueError):self.create('Different message')
 def test_invalid_and_oversized_messages(self):
  for message in ('','  ',None,123,'a'*3001):
   with self.assertRaises(ValueError):self.create(message)
 def test_follow_up_keeps_server_owned_history(self):
  job=self.create();job.update(state='completed',answer='Which site?');save(self.root/'jobs'/job['id']/'job.json',job)
  follow=self.create('SITE-123','b'*16,job['id'])
  self.assertEqual(follow['history'],[{'role':'user','content':'My service ABC-987 is down'},{'role':'assistant','content':'Which site?'}])
  self.assertIn('Current user message:\nSITE-123',question_for(follow['userMessage'],follow['history']))
 def test_customer_dispatch_and_actual_answer(self):
  job=self.create();directory=self.root/'jobs'/job['id']
  def run(command,**kwargs):
   self.assertTrue(command[1].endswith('chat_runner.py'))
   self.assertNotIn('--roles',command)
   self.assertEqual(read(command[2])['message'],job['userMessage'])
   answer_path=self.root/'evidence'/'runs'/job['runId'];answer_path.mkdir(parents=True)
   (answer_path/'chat-answer.json').write_text(json.dumps({'answer':'Actual response about ABC-987','http_status':200,'disposition':'undetermined'}))
   return SimpleNamespace(returncode=0)
  with patch('live_service.subprocess.run',side_effect=run):self.runtime.execute(directory,job)
  saved=read(directory/'job.json');self.assertEqual(saved['answer'],'Actual response about ABC-987');self.assertEqual(saved['state'],'completed')
 def test_missing_answer_is_failure_even_when_process_exits_zero(self):
  job=self.create();directory=self.root/'jobs'/job['id']
  with patch('live_service.subprocess.run',return_value=SimpleNamespace(returncode=0)):self.runtime.execute(directory,job)
  self.assertEqual(read(directory/'job.json')['state'],'failed')

if __name__=='__main__':unittest.main()
