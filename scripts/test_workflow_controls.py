import json
from pathlib import Path
import tempfile
import unittest
from workflow_controls import overlay

class WorkflowControlsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.run = {'id': 'run-a', 'workflow': {'mode':'workflow', 'status':'failed', 'traceId':'trace-a'},
                    'events':[{'id':'event-1'}], 'sources':{}, 'incidents':[{'number':'INC1'}]}

    def write(self, name, value):
        path = self.root/name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value))

    def watch(self, **extra):
        self.write('c16-threshold.json', {'control_id':'16','version':'G-FM-v1','observation_limit':'60000','alert_point':'48000','refusal_point':'55000','owner':'Owner','secret':'hidden'})
        self.write('watch.json', {'run.id':'run-a','threshold.version':'G-FM-v1','verdict.at.end':'ALLOW','measured.value':6087,'model.calls':1, 'log.reads.failed':0, 'credentials':'hidden', **extra})

    def test_failed_run_exposes_watcher_without_promoting_allow_to_pass(self):
        self.watch()
        out=overlay(self.root,self.run)
        self.assertEqual(out['c16']['verdict'],'INCONCLUSIVE')
        self.assertFalse(out['c16']['measurement.complete'])
        self.assertEqual(out['c16']['measured.value'],6087)
        self.assertEqual(out['c16']['threshold.value'],60000)
        self.assertEqual(out['control16Watch']['verdict.at.end'],'ALLOW')
        self.assertEqual(out['c16Threshold']['refusal_point'],'55000')
        self.assertNotIn('committed',out['budget'])
        self.assertNotIn('hidden',json.dumps(out))
        self.assertEqual(out['incidents'],self.run['incidents'])
        self.assertEqual(out['c9']['verdict'],'NO EVIDENCE')

    def test_saved_assessments_take_precedence_over_readiness(self):
        self.watch()
        self.write('control-16.json',{'run_id':'run-a','trace_id':'trace-a','verdict':'BREACH','measured.value':70000,'prompt':'hidden'})
        out=overlay(self.root,self.run)
        self.assertEqual(out['c16']['verdict'],'BREACH')
        self.assertEqual(out['c16']['measured.value'],70000)
        self.assertEqual(out['c16']['evidence_origin'],'saved_assessment')
        self.assertNotIn('prompt',out['c16'])

    def test_wrong_run_trace_and_threshold_cannot_supply_results(self):
        self.watch(**{'run.id':'other'})
        self.write('reports/control-7.json',{'verdict':'PASS','trace_id':'other'})
        out=overlay(self.root,self.run)
        self.assertEqual(out['control16Watch'],{})
        self.assertNotEqual(out['c7']['verdict'],'PASS')
        self.assertTrue(out['sources']['controls']['rejectedSources'])
        self.watch(**{'threshold.version':'other'})
        self.assertEqual(overlay(self.root,self.run)['control16Watch'],{})

    def test_in_progress_run_has_no_premature_verdict(self):
        self.run['workflow']['status']='running'
        self.watch()
        out=overlay(self.root,self.run)
        self.assertTrue(out['control16Watch'])
        self.assertEqual([out[k] for k in ['c7','c16','c9']],[{},{},{}])

    def test_zero_usage_is_preserved_missing_usage_is_not_zero(self):
        self.watch(**{'measured.value':0})
        self.assertEqual(overlay(self.root,self.run)['c16']['measured.value'],0)
        self.watch(**{'measured.value':None})
        self.assertIsNone(overlay(self.root,self.run)['c16']['measured.value'])

    def test_malformed_optional_report_does_not_hide_workflow(self):
        (self.root/'control-9.json').write_text('{bad')
        self.write('control-16.json',{'verdict':{'invalid':True}})
        out=overlay(self.root,self.run)
        self.assertEqual(out['c9']['verdict'],'NO EVIDENCE')
        self.assertEqual(out['workflow'],self.run['workflow'])
        self.assertEqual(len(out['sources']['controls']['rejectedSources']),2)

    def test_public_api_loader_attaches_controls_without_changing_workflow(self):
        from workflow_evidence import STAGES, VERSION
        import assurance_api
        run_id=self.root.name
        stages=[dict(stage=stage,role=stage.split(':')[0],actor='agent',status='unnecessary',invoked=False,response={}) for stage in STAGES]
        self.write('workflow.json',dict(version=VERSION,run_id=run_id,status='failed',outcome='execution_failure',trace_id='trace-a',stages=stages))
        self.write('c16-threshold.json',{'version':'v1','observation_limit':100})
        self.write('watch.json',{'run.id':run_id,'threshold.version':'v1','measured.value':10,'verdict.at.end':'ALLOW'})
        out=assurance_api.load_run(self.root)
        self.assertEqual(out['workflow']['status'],'failed')
        self.assertEqual(out['c16']['measured.value'],10)
        self.assertEqual(out['c16']['verdict'],'INCONCLUSIVE')
        self.assertEqual(out['c16Threshold']['max_total_tokens'],100)

    def test_overlay_is_read_only_and_reports_source_digests(self):
        self.watch()
        before={p.name:p.read_bytes() for p in self.root.iterdir()}
        out=overlay(self.root,self.run)
        self.assertEqual(before,{p.name:p.read_bytes() for p in self.root.iterdir()})
        self.assertEqual(len(out['sources']['controls']['inputDigests']['watch.json']),64)

if __name__=='__main__': unittest.main()
