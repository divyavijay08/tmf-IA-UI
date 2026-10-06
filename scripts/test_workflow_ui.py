"""Offline UI adapter → real coordinator → mocked runtimes → browser evidence."""
from copy import deepcopy
import json
import os
import shutil
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError

import assurance_api as api
from live_service import Handler, Runtime, read, save
from workflow_evidence import load_workflow

ROOT = Path(os.environ.get('HACKATHON_ROOT', Path(__file__).resolve().parents[2])).resolve()
if not (ROOT / 'tools/workflow/coordinator.py').is_file():
    raise unittest.SkipTest('Set HACKATHON_ROOT to a Hackathon checkout to run coordinator integration tests')
sys.path.insert(0, str(ROOT))
from tools.workflow.coordinator import run_workflow
from tools.workflow.test_workflow import RUNTIMES, ScriptedRuntime


class WorkflowIntegration(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name, value in (
            ('data', {'fault_scenarios': [{'id': 'scenario', 'title': 'Service impact', 'symptoms': {}}]}),
            ('threshold', {'version': 'C7-v1', 'declared_at': '2026-01-01T00:00:00Z'}),
            ('register', {}),
        ):
            save(self.root / name, value)
        self.config = dict(repository=str(ROOT), jobs=str(self.root / 'jobs'), evidence=str(self.root / 'evidence'),
                           data=str(self.root / 'data'), threshold=str(self.root / 'threshold'),
                           register=str(self.root / 'register'), actors=deepcopy(RUNTIMES), executionEnabled=True,
                           collector=['SHOULD_NOT_RUN', '{runId}'])
        self.runtime = Runtime(self.config)

    def queue(self):
        with patch.object(threading.Thread, 'start'):
            job = self.runtime.launch('scenario', 'a' * 16)
        return job, self.runtime.root / job['id']

    def execute(self, job, directory, scripted):
        calls = []
        def execute(argv, **kwargs):
            calls.append((argv, kwargs))
            self.assertEqual(argv[:3], ['python3', '-m', 'tools.workflow'])
            report = run_workflow('Service impact', runtimes=read(Path(argv[argv.index('--runtimes') + 1])),
                run_id=job['runId'], threshold_version='C7-v1', output_dir=argv[argv.index('--output') + 1],
                invoker=scripted)
            return subprocess.CompletedProcess(argv, 0 if report['status'] == 'completed' else 1)
        with patch('live_service.subprocess.run', side_effect=execute):
            self.runtime.execute(directory, job)
        self.assertEqual(len(calls), 1, 'Legacy collector must not run for workflow artifacts')
        return self.runtime.jobs()[0], calls

    def test_three_routes_to_public_answer_and_exact_stage_records(self):
        for route, count in (('customer', 1), ('it', 3), ('network', 4)):
            # Use one fresh job store per route, as the service would for independent requests.
            self.runtime = Runtime(dict(self.config, jobs=str(self.root / ('jobs-' + route))))
            with patch.object(threading.Thread, 'start'):
                job = self.runtime.launch('scenario', route + '-' + 'a' * 16)
            directory = self.runtime.root / job['id']
            job, calls = self.execute(job, directory, ScriptedRuntime(route))
            self.assertEqual(job['state'], 'completed')
            self.assertEqual(job['outcome'], 'answered')
            self.assertEqual(len(job['invokedAgents']), count)
            self.assertEqual(job['assessmentState'], 'not_assessed')
            root = Path(self.config['evidence']) / 'runs' / job['runId']
            exported = api.load_run(root)
            self.assertTrue(exported['workflow']['finalAnswer'])
            self.assertEqual(exported['c7'], {})
            self.assertEqual(exported['c16'], {})
            self.assertEqual(exported['c9'], {})
            self.assertEqual(len(exported['workflow']['stages']), 4)
            stages = exported['workflow']['stages']
            invoked = [s for s in stages if s['invoked']]
            self.assertEqual(len({s['invocation_id'] for s in invoked}), count)
            self.assertTrue(all(s['status'] == 'unnecessary' for s in stages if not s['invoked']))
            self.assertEqual((root / 'c7-threshold.json').read_bytes(), (directory / 'threshold').read_bytes())
            self.assertEqual(calls[0][1]['stdout'], subprocess.DEVNULL)

    def test_pins_agent_names_paths_mode_and_timeout_before_dispatch(self):
        self.config['invocationTimeout'] = 25
        job, directory = self.queue()
        self.config.update(actors={'customer': 'changed'}, repository='wrong', executionMode='legacy', invocationTimeout=420)
        job, calls = self.execute(job, directory, ScriptedRuntime('customer'))
        self.assertEqual(read(directory / 'actors.json'), RUNTIMES)
        self.assertEqual(calls[0][1]['cwd'], str(ROOT))
        self.assertEqual(calls[0][0][calls[0][0].index('--timeout') + 1], '25')

    def test_information_approval_and_failure_are_distinct_from_collection(self):
        for outcome in ('insufficient_information', 'human_approval_required', 'execution_failure'):
            job, directory = self.queue()
            job, _ = self.execute(job, directory, ScriptedRuntime('customer', outcome))
            self.assertEqual(job['outcome'], outcome)
            self.assertEqual(job['state'], 'failed' if outcome == 'execution_failure' else 'completed')
            self.assertEqual(job['collectionExitCode'], 0)
            # Same launch remains idempotent even after completion/failure.
            self.assertEqual(self.runtime.launch('scenario', 'a' * 16)['runId'], job['runId'])
            self.runtime = Runtime(dict(self.config, jobs=str(self.root / ('jobs-' + outcome))))

    def test_raw_requests_and_tool_payloads_are_not_public(self):
        def add_private(response, request):
            response.update(private_token='SECRET', arbitrary={'authorization': 'SECRET'})
            response['transport_attempts'] = [dict(kind='model', attempt_id=request['invocation_id'] + ':model:1',
                actor='fixture-customer', invocation_id=request['invocation_id'], run_id=request['run_id'],
                outcome='passed', ts='2026-10-06T00:00:00Z', request_body='SECRET', response_body='SECRET',
                usage={'input_tokens': 10, 'output_tokens': 4, 'secret': 'SECRET'})]
        job, directory = self.queue()
        public, _ = self.execute(job, directory, ScriptedRuntime('customer', mutate=add_private))
        root = Path(self.config['evidence']) / 'runs' / job['runId']
        raw = read(root / 'workflow.json')
        raw['stages'][0]['request']['workflow_request']['context']['private_token'] = 'SECRET'
        save(root / 'workflow.json', raw)
        exported = api.load_run(root)
        self.assertNotIn('SECRET', json.dumps(exported))
        self.assertNotIn('SECRET', json.dumps(public))
        self.assertEqual(exported['events'][0]['usage'], {'input_tokens': 10, 'output_tokens': 4})

    def test_progress_does_not_mark_undecided_stages_unnecessary_and_restart_is_visible(self):
        job, directory = self.queue()
        self.execute(job, directory, ScriptedRuntime('customer'))
        root = Path(self.config['evidence']) / 'runs' / job['runId']
        # Retain only pre-dispatch artifacts to emulate an interrupted first invocation.
        (root / 'workflow.json').unlink()
        (root / 'result-customer-triage.json').unlink()
        view = load_workflow(root)
        self.assertEqual([s['status'] for s in view['stages']], ['pending'] * 4)
        save(root / 'session-customer-triage.json', {'invocation_id': 'pending-call', 'started_at': '2026-10-06T00:00:00Z'})
        stored = read(directory / 'job.json');stored['state'] = 'running';save(directory / 'job.json', stored)
        restored = Runtime(self.config)
        self.assertEqual(restored.jobs()[0]['state'], 'interrupted')
        self.assertEqual(api.load_run(root)['workflow']['status'], 'interrupted')
        self.assertIsNone(api.load_run(root)['workflow']['outcome'])
        with self.assertRaises(RuntimeError):
            restored.launch('scenario', 'b' * 16)

    def test_invalid_map_and_future_threshold_do_not_queue_work(self):
        self.config['actors'] = {}
        with self.assertRaises(ValueError):
            self.runtime.launch('scenario', 'a' * 16)
        self.config['actors'] = RUNTIMES
        save(self.root / 'threshold', {'version': 'bad', 'declared_at': '2999-01-01T00:00:00Z'})
        with self.assertRaises(ValueError):
            self.runtime.launch('scenario', 'a' * 16)
        self.assertEqual(self.runtime.jobs(), [])

    def test_malformed_terminal_report_cannot_complete(self):
        job, directory = self.queue()
        def broken(*args, **kwargs):
            root = Path(self.config['evidence']) / 'runs' / job['runId']
            root.mkdir(parents=True)
            save(root / 'workflow.json', {'version': 'wrong', 'status': 'completed'})
            return subprocess.CompletedProcess(args[0], 0)
        with patch('live_service.subprocess.run', side_effect=broken):
            self.runtime.execute(directory, job)
        self.assertEqual(self.runtime.jobs()[0]['state'], 'failed')
        with self.assertRaises(ValueError):
            api.load_run(Path(self.config['evidence']) / 'runs' / job['runId'])

    def test_explicit_legacy_mode_preserves_old_runner_and_collector(self):
        self.config['executionMode'] = 'legacy'
        job, directory = self.queue()
        with patch('live_service.subprocess.run', return_value=subprocess.CompletedProcess([], 0)) as invoke:
            self.runtime.execute(directory, job)
        self.assertEqual(invoke.call_args_list[0].args[0][:3], ['python3', '-m', 'tools.control7.runner'])
        self.assertEqual(invoke.call_args_list[1].args[0], ['SHOULD_NOT_RUN', job['runId']])
        self.assertEqual(read(directory / 'job.json')['state'], 'completed')

    def test_outer_timeout_blocks_new_work_without_retry(self):
        job, directory = self.queue()
        with patch('live_service.subprocess.run', side_effect=subprocess.TimeoutExpired('workflow', 1200)) as invoke:
            self.runtime.execute(directory, job)
        self.assertEqual(invoke.call_count, 1)
        self.assertEqual(self.runtime.jobs()[0]['state'], 'interrupted')
        with self.assertRaises(RuntimeError):
            self.runtime.launch('scenario', 'b' * 16)

    def test_http_launch_keeps_runtime_mapping_server_side_and_is_idempotent(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        server.token = 't' * 40
        server.runtime = self.runtime
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(thread.join)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        def post(data):
            request = Request(f'http://127.0.0.1:{server.server_port}/api/executions',
                data=json.dumps(data).encode(), headers={'Authorization': 'Bearer ' + server.token, 'Content-Type': 'application/json'})
            with urlopen(request) as response:
                return json.load(response)
        launch = {'scenario': 'scenario', 'idempotencyKey': 'a' * 16}
        with self.assertRaises(HTTPError) as error:
            post(dict(launch, actors={'customer': 'browser-override'}))
        self.assertEqual(error.exception.code, 400)
        # Mock only dispatch; the HTTP server's own request threads must still run.
        with patch.object(self.runtime, 'execute') as invoke:
            first = post(launch)
            second = post(launch)
        self.assertEqual(first['runId'], second['runId'])
        self.assertEqual(invoke.call_count, 1)

    def test_malformed_artifact_becomes_visible_snapshot_error(self):
        job, directory = self.queue()
        self.execute(job, directory, ScriptedRuntime('customer'))
        root = Path(self.config['evidence']) / 'runs' / job['runId']
        report = read(root / 'workflow.json')
        report['stages'][0] = 'invalid'
        save(root / 'workflow.json', report)
        with patch.object(api, 'ROOT', root.parent):
            snapshot = api.snapshot()
        self.assertEqual(snapshot['runs'], [])
        self.assertEqual(snapshot['errors'][0]['run'], job['runId'])

    def test_existing_chat_api_uses_conditional_flow_and_retains_history(self):
        runtime = ScriptedRuntime('customer')
        def invoke(argv, **kwargs):
            self.assertEqual(argv[:3], ['python3', '-m', 'tools.workflow'])
            self.assertNotIn('--scenario', argv)
            report = run_workflow(argv[argv.index('--question') + 1], runtimes=RUNTIMES,
                context=read(argv[argv.index('--context') + 1]), run_id=argv[argv.index('--run-id') + 1],
                threshold_version='C7-v1', output_dir=argv[argv.index('--output') + 1], invoker=runtime)
            return subprocess.CompletedProcess(argv, 0)
        parent = None
        for key, message in (('a' * 16, 'Explain packet loss.'), ('b' * 16, 'Explain that more simply.')):
            with patch.object(threading.Thread, 'start'):
                job = self.runtime.chat(message, key, parent)
                self.assertEqual(self.runtime.chat(message, key, parent)['id'], job['id'])
                with self.assertRaises(ValueError):
                    self.runtime.chat('different message', key, parent)
            with patch('live_service.subprocess.run', side_effect=invoke) as command:
                self.runtime.execute(self.runtime.root / job['id'], job)
            self.assertEqual(command.call_count, 1)
            stored = next(j for j in self.runtime.jobs() if j['id'] == job['id'])
            self.assertEqual(stored['state'], 'completed')
            self.assertTrue(stored['answer'])
            self.assertEqual(len(stored['journey']), 4)
            self.assertEqual(stored['journey'][1]['state'], 'not-required')
            self.assertEqual(runtime.calls[-1]['workflow_request']['question'], message)
            if parent:
                history = runtime.calls[-1]['workflow_request']['context']['conversation_history']
                self.assertEqual(history[0]['content'], 'Explain packet loss.')
                self.assertTrue(history[1]['content'])
            parent = job['id']

    def test_chat_validates_parent_and_input_before_invocation(self):
        for message, parent in (('', None), ('x' * 3001, None), ('Question', 'missing'), ('Question', 'a' * 24)):
            with self.assertRaises(ValueError):
                self.runtime.chat(message, 'a' * 16, parent)
        self.config['chatEnabled'] = False
        with self.assertRaises(RuntimeError):
            self.runtime.chat('Question', 'a' * 16)
        self.assertEqual(self.runtime.jobs(), [])

    def test_real_projection_matches_current_chat_parser_and_failed_reply(self):
        # Exercise the Python-to-TypeScript boundary, using the existing UI parser.
        node = shutil.which('node')
        self.assertIsNotNone(node, 'Node is required for the UI contract check')
        parser = (Path(__file__).resolve().parents[1] / 'src/workflowJourney.ts').as_uri()
        for route, outcome in (('customer', 'answered'), ('it', 'answered'), ('network', 'answered'),
                               ('customer', 'execution_failure')):
            self.runtime = Runtime(dict(self.config, jobs=str(self.root / ('contract-' + route + outcome))))
            with patch.object(threading.Thread, 'start'):
                job = self.runtime.chat('Investigate the user-provided site.', 'a' * 16)
            job, _ = self.execute(job, self.runtime.root / job['id'], ScriptedRuntime(route, outcome))
            capture = self.root / 'projection.json'
            save(capture, job)
            script = f'''import {{readFileSync}} from 'node:fs';
import {{parseWorkflow,workflowAnswer}} from {json.dumps(parser)};
const job=JSON.parse(readFileSync(process.argv[1],'utf8'));
const workflow=parseWorkflow(job.workflow,job.traceId);
if(!workflow || workflowAnswer(workflow)!==job.answer)throw Error('Chat answer mismatch');
if(workflow.stages.filter(s=>s.invoked).length!==job.invokedAgents.length)throw Error('Stage count mismatch');'''
            subprocess.run([node, '--experimental-strip-types', '--input-type=module', '-e', script, str(capture)],
                           check=True, capture_output=True, text=True)

    def test_http_chat_dispatches_exact_message_once(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        server.token = 't' * 40
        server.runtime = self.runtime
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(thread.join)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        payload = {'message': 'Check SITE-ABC, not the default scenario.', 'idempotencyKey': 'c' * 16}
        def post(data):
            request = Request(f'http://127.0.0.1:{server.server_port}/api/messages', data=json.dumps(data).encode(),
                              headers={'Authorization': 'Bearer ' + server.token, 'Content-Type': 'application/json'})
            with urlopen(request) as response:
                return json.load(response)
        with patch.object(self.runtime, 'execute') as invoke:
            first = post(payload)
            second = post(payload)
        self.assertEqual(first['id'], second['id'])
        self.assertEqual(first['userMessage'], payload['message'])
        self.assertEqual(first['mode'], 'workflow')
        self.assertEqual(invoke.call_count, 1)
        with self.assertRaises(HTTPError) as error:
            post(dict(payload, actors={'customer': 'browser-override'}))
        self.assertEqual(error.exception.code, 400)


if __name__ == '__main__':
    unittest.main()
