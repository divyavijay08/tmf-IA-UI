"""Public workflow evidence retains useful metadata without exposing requests."""
import json
from pathlib import Path
import tempfile
import unittest
from workflow_evidence import load_workflow, STAGES, VERSION

class WorkflowProjection(unittest.TestCase):
    def test_projects_asset_usage_and_transport_metadata_without_payloads(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            attempt = dict(kind='model', attempt_id='attempt-1', invocation_id='inv-1',
                asset={'kind':'Model', 'alias':'nemotron-super-120b', 'credentials':'secret'},
                authorization='reached', error=None, request_tool_args={'private':'payload'},
                usage={'input_tokens':1099, 'output_tokens':731, 'prompt':'private'})
            stages = [dict(stage=s, role=s.split(':')[0], actor=s.split(':')[0],
                status='completed' if i == 0 else 'unnecessary', invoked=i == 0,
                response={'transport_attempts':[attempt] if i == 0 else []})
                for i,s in enumerate(STAGES)]
            (root/'workflow.json').write_text(json.dumps(dict(version=VERSION, run_id=root.name,
                status='completed', outcome='answered', stages=stages)))
            event = load_workflow(root)['events'][0]
            self.assertEqual(event['asset'], {'kind':'Model','alias':'nemotron-super-120b'})
            self.assertEqual(event['usage'], {'input_tokens':1099,'output_tokens':731})
            self.assertEqual(event['authorization'], 'reached')
            self.assertEqual(event['invocation_id'], 'inv-1')
            self.assertNotIn('request_tool_args', event)
            self.assertNotIn('private', json.dumps(event))

if __name__ == '__main__': unittest.main()

class FailureDiagnostics(unittest.TestCase):
    def project(self, error):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            stages = [dict(stage=s, role=s.split(':')[0], actor=s.split(':')[0], invocation_id=f'inv-{i}',
                status='failed' if i == 3 else 'completed', invoked=True, error_type='RuntimeError',
                reason='execution_failure' if i == 3 else 'finish',
                response={'workflow_error':error} if i == 3 else {'transport_attempts':[
                    dict(kind='other', outcome='error', http_status=405, invocation_id=f'inv-{i}') ]})
                for i,s in enumerate(STAGES)]
            (root/'workflow.json').write_text(json.dumps(dict(version=VERSION, run_id=root.name,
                trace_id='a'*32,status='failed',outcome='execution_failure',stages=stages)))
            return load_workflow(root)

    def test_failed_formatter_has_diagnostic_without_failed_model_span(self):
        w=self.project({'type':'ProtocolError','detail':'formatting changed authoritative findings or outcome'})
        self.assertEqual(w['stages'][3]['diagnostic']['code'],'formatting_changed_findings')
        self.assertEqual(w['stages'][3]['diagnostic']['type'],'ProtocolError')
        self.assertEqual(len(w['failures']),4)
        self.assertEqual(w['failures'][-1]['trace_id'],'a'*32)
        self.assertEqual(w['stages'][0]['status'],'completed')
        self.assertNotIn('diagnostic',w['stages'][0])

    def test_unknown_exception_payload_is_not_exposed(self):
        w=self.project({'type':'SecretCustomException','detail':'private prompt bearer secret'})
        self.assertNotIn('secret',json.dumps(w).lower())
        self.assertEqual(w['stages'][3]['diagnostic']['code'],'agent_execution_failure')
