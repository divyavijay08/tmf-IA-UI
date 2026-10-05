import json
import unittest
from agent_journey import STAGES, JourneyStopped, run_journey

class JourneyTests(unittest.TestCase):
 def setUp(self):
  self.actors={'customer':'customer-A','it':'it-A','network':'network-A'};self.calls=[];self.events=[]
 def response(self,stage,role,**extra):
  return dict(agent=self.actors[role],correlation_id='run',invocation_id='run:'+stage,trace_id='trace',http_status=200,answer='Evidence from '+stage,disposition='gather-evidence',evidence_errors=[],**extra)
 def invoke(self,stage,role,body):
  self.calls.append((stage,role,body));return self.response(stage,role)
 def run_flow(self,invoke=None):
  return run_journey('Check SITE-DEN-12',[{'role':'user','content':'A prior question'}],self.actors,'run','trace',invoke or self.invoke,lambda *event:self.events.append(event))
 def test_full_journey_passes_evidence_and_returns_customer_synthesis(self):
  answer,findings=self.run_flow()
  self.assertEqual([c[1] for c in self.calls],['customer','it','network','it','network','customer'])
  for i,(stage,role,body) in enumerate(self.calls):
   context=body['context'];self.assertIn('Check SITE-DEN-12',context['question'])
   self.assertEqual(len(context['upstream_evidence']),i)
   for prior in list(findings)[:i]:self.assertIn('Evidence from '+prior,context['question'])
  self.assertEqual(answer['answer'],'Evidence from customer-reply')
  self.assertEqual([e[3] for e in self.events],['running','completed']*6)
 def test_initial_user_message_is_not_rewritten(self):
  run_journey('Exact customer request',[],self.actors,'run','trace',self.invoke,lambda *e:None)
  self.assertEqual(self.calls[0][2]['context']['question'],'Exact customer request')
 def test_governed_failure_stops_downstream_calls(self):
  def invoke(stage,role,body):
   r=self.invoke(stage,role,body)
   if role=='it':r.update(disposition='blocked')
   return r
  with self.assertRaises(JourneyStopped):self.run_flow(invoke)
  self.assertEqual(len(self.calls),2)
  self.assertEqual(self.events[-1][3],'failed')
 def test_wrong_trace_and_missing_audit_stop_flow(self):
  for change in ({'trace_id':'other'},{'invocation_id':'other'},{'evidence_errors':['audit unavailable']},{'http_status':429},{'answer':''}):
   with self.subTest(change=change):
    def invoke(stage,role,body):
     r=self.response(stage,role);r.update(change);return r
    with self.assertRaises(JourneyStopped):self.run_flow(invoke)
 def test_existing_network_negotiation_is_preserved(self):
  def invoke(stage,role,body):
   r=self.invoke(stage,role,body)
   if stage=='network-analysis':r.update(disposition='pending-negotiation',proposal_id='proposal-1',proposal={'action':'review'},proposal_context={'constraints':['approval required']})
   if stage=='it-review':
    self.assertEqual(body['negotiate']['proposal_id'],'proposal-1')
    r['negotiation']={'proposal_id':'proposal-1','from_agent':'it-A','to_agent':'network-A','status':'completed'}
   if stage=='network-finalisation':self.assertIn('it_result',body['finalize'])
   return r
  self.run_flow(invoke)
 def test_mismatched_review_does_not_finalize(self):
  def invoke(stage,role,body):
   r=self.invoke(stage,role,body)
   if stage=='network-analysis':r.update(disposition='pending-negotiation',proposal_id='p',proposal={},proposal_context={})
   if stage=='it-review':r['negotiation']={'proposal_id':'wrong'}
   return r
  with self.assertRaises(JourneyStopped):self.run_flow(invoke)
  self.assertEqual(len(self.calls),4)

if __name__=='__main__':unittest.main()
