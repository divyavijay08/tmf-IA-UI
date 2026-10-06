"""Run against the patched deployment module: python3 test_customer_response.py PATH."""
import importlib.util
import json
import sys
import unittest
from copy import deepcopy

spec = importlib.util.spec_from_file_location('protocol', sys.argv.pop(1))
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)

def request(outcome='answered'):
    prior=[]
    for stage,route in [('customer:triage','request_it'),('it:analysis','finish')]:
        prior.append(dict(version=p.VERSION,run_id='test-run',invocation_id='test-'+stage,stage=stage,
            role=stage.split(':')[0],routing=route,outcome=outcome if route=='finish' else 'answered',escalation_reason='Needs IT',
            content=dict(answer='Evidence remains incomplete.',findings=['Reported packet loss'],evidence_references=['incident-1'],
                         unresolved_issues=['Cause unknown'],limitations=['No repair approval'],recommended_next_steps=['Review evidence'])))
    return dict(version=p.VERSION,run_id='test-run',invocation_id='test-final',stage='customer:response',role='customer',
        question='Investigate the loss',context={},operational_constraints=['Do not execute repairs'],
        prior_results=prior,escalation_reason='Present findings')

class FormatterContract(unittest.TestCase):
    def test_copy_all_validated_arrays_and_outcomes_without_mutating_input(self):
        for outcome in ('answered','insufficient_information','human_approval_required'):
            req=request(outcome);before=deepcopy(req)
            result,disposition=p.parse_model_result(json.dumps({'answer':'The cause remains unknown; no repairs executed.','disposition':'gather-evidence'}),req)
            self.assertEqual(result['outcome'],outcome)
            self.assertEqual(result['invocation_id'],'test-final')
            for key in p.CONTENT_LISTS:self.assertEqual(result['content'][key],req['prior_results'][-1]['content'][key])
            self.assertEqual(req,before)
            result['content']['findings'].append('changed')
            self.assertEqual(req,before)

    def test_rejects_extra_findings_and_keeps_preservation_guard(self):
        req=request()
        for extra in ({'outcome':'answered'},{'content':{'findings':[]}},{'workflow_result':{}}):
            with self.assertRaises(p.ProtocolError):p.parse_model_result(json.dumps(dict(answer='Reply',disposition='gather-evidence',**extra)),req)
        result,_=p.parse_model_result('{"answer":"Reply","disposition":"gather-evidence"}',req)
        result['content']['limitations']=[]
        with self.assertRaises(p.ProtocolError):p.validate_result(result,req)

    def test_schema_only_allows_reply_and_disposition(self):
        schema=p.response_format(request())['json_schema']['schema']
        self.assertEqual(set(schema['properties']),{'answer','disposition'})
        self.assertFalse(schema['additionalProperties'])
        req=request();req['stage']='it:analysis';req['role']='it'
        self.assertIn('workflow_result',p.response_format(req)['json_schema']['schema']['properties'])

    def test_refusals_preserved_and_invalid_json_rejected(self):
        _,d=p.parse_model_result('{"answer":"Blocked","disposition":"refused"}',request())
        self.assertEqual(d,'refused')
        for text in ('bad','{}','{"answer":"","disposition":"gather-evidence"}'):
            with self.assertRaises(p.ProtocolError):p.parse_model_result(text,request())

unittest.main()
