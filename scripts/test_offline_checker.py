import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from zipfile import ZipFile
from build_offline_checker import build, ROOT


class OfflineCheckerTest(unittest.TestCase):
    def test_packaged_checker_matches_current_evaluator_and_rejects_tampering(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = build(root / 'checker.zip')
            with ZipFile(target) as archive:
                self.assertEqual(set(archive.namelist()), {
                    'controlQuery.ts', 'assuranceData.ts', 'reproduce.mjs', 'README.txt'})
                for name in ['controlQuery.ts', 'assuranceData.ts']:
                    self.assertEqual(archive.read(name), (ROOT / 'src' / name).read_bytes())
                archive.extractall(root)
            # Use current production code to create a bundle and expected results.
            script = """
import {readFile,writeFile} from 'node:fs/promises';
import {queryControl,makeBundle} from './src/controlQuery.ts';
const data=JSON.parse(await readFile('tests/fixtures/assurance-v2.json','utf8'));
data.runs=data.runs.slice(0,1);
Object.assign(data.runs[0],{
 qualityBaseline:{value:1,metric:'q',version:'b',frozen_at:'2026-10-01T00:00:00Z'},
 c9Threshold:{version:'v',metric:'q',declared_at:'2026-10-01T00:00:00Z',max_absolute_drift:0.1,allowed_exception_rate:0},
 qualityWindows:[{id:'w',value:0.95,metric:'q',baseline_version:'b',threshold_version:'v',start:'2026-10-05T00:00:00Z',end:'2026-10-05T00:01:00Z'}],
 expectedQualityWindowIds:['w']
});
await writeFile(process.argv[1],JSON.stringify(await makeBundle(data)));
await writeFile(process.argv[2],JSON.stringify(['7','9','16'].map(c=>queryControl(data.runs[0],c))));
"""
            bundle, expected, output = [root / name for name in ['bundle.json', 'expected.json', 'result.json']]
            subprocess.run(['node', '--experimental-strip-types', '--input-type=module', '-e', script,
                            str(bundle), str(expected)], cwd=ROOT, check=True, capture_output=True, text=True)
            command = ['node', '--experimental-strip-types', str(root / 'reproduce.mjs'), str(bundle), str(output)]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            evaluations = json.loads(output.read_text())['evaluations']
            self.assertEqual(evaluations, json.loads(expected.read_text()))
            self.assertEqual(evaluations[1]['verdict'], 'PASS')
            altered = json.loads(bundle.read_text())
            altered['payload']['assurance']['runs'][0]['id'] = 'tampered'
            bundle.write_text(json.dumps(altered))
            rejected = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn('checksum mismatch', rejected.stderr)


if __name__ == '__main__':
    unittest.main()
