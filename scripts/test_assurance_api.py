import unittest,tempfile,json
from pathlib import Path
import assurance_api as api
class EvidenceTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.old=api.ROOT;api.ROOT=Path(self.tmp.name)
 def tearDown(self):api.ROOT=self.old;self.tmp.cleanup()
 def write(self,p,d):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d))
 def test_missing_report_not_promoted(self):
  p=api.ROOT/'run';self.write(p/'budget.json',{'committed':10,'events':[]});d=api.snapshot()['runs'][0];self.assertEqual(d['c16'],{});self.assertIsNone(d['workflow']['completedAt'])
 def test_malformed_run_is_visible(self):
  p=api.ROOT/'run';p.mkdir();(p/'budget.json').write_text('{');s=api.snapshot();self.assertEqual(len(s['errors']),1);self.assertEqual(s['runs'],[])
 def test_payloads_not_exported(self):
  p=api.ROOT/'run';self.write(p/'budget.json',{'events':[{'event_id':'1','ts':'2026-10-05T00:00:00Z','prompt':'secret','authorization_header':'secret','phase':'spend-decision'}]});e=api.load_run(p)['events'][0];self.assertNotIn('prompt',e);self.assertNotIn('authorization_header',e);self.assertEqual(e['source'],'budget.json:1')
if __name__=='__main__':unittest.main()
