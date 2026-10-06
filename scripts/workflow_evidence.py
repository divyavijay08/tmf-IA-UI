"""Allowlisted browser projection of coordinator artifacts, never a control verdict."""
import json
from pathlib import Path

VERSION = 'agent-workflow/v1'
STAGES = ('customer:triage', 'it:analysis', 'network:analysis', 'customer:response')
OUTCOMES = ('answered', 'insufficient_information', 'human_approval_required', 'execution_failure')
CONTENT = ('answer', 'findings', 'evidence_references', 'unresolved_issues', 'limitations', 'recommended_next_steps')
STAGE_FIELDS = ('stage', 'role', 'actor', 'status', 'reason', 'invoked', 'invocation_id',
                'routing_reason', 'started_at', 'completed_at', 'error_type')
CALL_FIELDS = ('actor', 'attempt_id', 'logical_call_id', 'invocation_id', 'run_id', 'trace_id',
               'action_id', 'kind', 'outcome', 'http_status', 'ts', 'started_at', 'error', 'authorization',
               'completed_at', 'request_tool_name', 'threshold_version', 'response_truncated')


# Never expose arbitrary runtime exception text, which may include prompts or secrets.
PUBLIC_PROTOCOL_ERRORS = {
    'formatting changed authoritative findings or outcome': (
        'formatting_changed_findings',
        'The customer reply changed validated specialist findings or the outcome. '
        'The response was rejected to preserve the recorded evidence.'),
    'model did not return workflow JSON': ('invalid_workflow_json', 'The agent did not return the required structured response.'),
    'result identity does not match request': ('response_identity_mismatch', 'The agent response did not match this invocation.'),
}


def stage_diagnostic(record, response):
    if record.get('status') != 'failed':
        return None
    raw = response.get('workflow_error')
    raw = raw if isinstance(raw, dict) else {}
    code, detail = PUBLIC_PROTOCOL_ERRORS.get(raw.get('detail') if isinstance(raw.get('detail'), str) else '',
        ('agent_execution_failure', 'The agent could not complete this stage. Review the runtime logs for further diagnostics.'))
    return dict(code=code, detail=detail,
                type=raw.get('type') if raw.get('type') in ('ProtocolError', 'RuntimeError', 'TimeoutError', 'ValueError') else record.get('error_type', 'ExecutionError'),
                source='result-' + record['stage'].replace(':', '-') + '.json:response.workflow_error' if raw else
                       'result-' + record['stage'].replace(':', '-') + '.json')


def read(path):
    return json.loads(path.read_text()) if path.exists() else {}


def content(value):
    """Answers and supported findings are deliberate UI output; requests are not."""
    if not isinstance(value, dict):
        raise ValueError('Malformed workflow content')
    result = {}
    for key in CONTENT:
        item = value.get(key, '' if key == 'answer' else [])
        if key == 'answer':
            if not isinstance(item, str):
                raise ValueError('Malformed workflow answer')
        elif not isinstance(item, list) or any(not isinstance(v, str) for v in item):
            raise ValueError('Malformed workflow findings')
        result[key] = item
    return result


def load_workflow(root):
    root = Path(root)
    finished = (root / 'workflow.json').exists()
    report = read(root / ('workflow.json' if finished else 'workflow-start.json'))
    if not isinstance(report, dict) or report.get('version') != VERSION or report.get('run_id') != root.name:
        raise ValueError('Workflow identity/version mismatch')
    if report.get('status') not in ('running', 'completed', 'failed'):
        raise ValueError('Invalid workflow status')
    if finished and (report['status'] == 'running' or report.get('outcome') not in OUTCOMES):
        raise ValueError('Invalid terminal workflow outcome')
    interrupted = not finished and (root / 'workflow-interrupted.json').exists()
    records = report.get('stages')
    if not isinstance(records, list) or any(not isinstance(s, dict) for s in records) or [s.get('stage') for s in records] != list(STAGES):
        raise ValueError('Invalid workflow stages')
    stages, events, findings, failures = [], [], [], []
    for original in records:
        stage = original['stage']
        filename = 'result-' + stage.replace(':', '-') + '.json'
        record = original
        if not finished:
            # Writers use exclusive files; an incomplete write is retried on the next poll.
            try:
                saved = read(root / filename)
                session = read(root / ('session-' + stage.replace(':', '-') + '.json'))
            except json.JSONDecodeError:
                saved, session = {}, {}
            if not isinstance(saved, dict) or not isinstance(session, dict):
                raise ValueError('Invalid stage artifact')
            if saved:
                record = saved
            else:
                record = dict(original, status=('interrupted' if interrupted else 'running') if session else 'pending',
                              reason='Invocation in progress' if session else 'Awaiting routing decision',
                              invoked=bool(session), invocation_id=session.get('invocation_id'),
                              started_at=session.get('started_at'))
        if record.get('stage') != stage or record.get('status') not in ('pending', 'running', 'interrupted', 'completed', 'failed', 'unnecessary'):
            raise ValueError('Invalid stage record')
        if record.get('role') != stage.split(':')[0] or not isinstance(record.get('actor'), str) or type(record.get('invoked')) is not bool:
            raise ValueError('Invalid stage identity')
        projected = {k: record[k] for k in STAGE_FIELDS if k in record}
        response = record.get('response') or {}
        if not isinstance(response, dict):
            raise ValueError('Invalid stage response')
        projected['evidence_errors'] = response.get('evidence_errors', [])
        if not isinstance(projected['evidence_errors'], list) or any(not isinstance(v, str) for v in projected['evidence_errors']):
            raise ValueError('Invalid recording errors')
        result = record.get('result')
        if result:
            if (not isinstance(result, dict) or result.get('version') != VERSION or result.get('role') != record['role']
                    or result.get('run_id') != root.name or result.get('invocation_id') != record.get('invocation_id')
                    or result.get('stage') != stage or result.get('outcome') not in OUTCOMES):
                raise ValueError('Invalid stage result identity')
            allowed = ('finish', 'request_it') if stage == 'customer:triage' else ('finish', 'request_network') if stage == 'it:analysis' else ('finish',)
            if result.get('routing') not in allowed:
                raise ValueError('Invalid stage routing')
            projected.update(outcome=result['outcome'], routing=result['routing'])
            if stage != 'customer:response':
                findings.append(dict(stage=stage, invocation_id=record['invocation_id'], **content(result['content'])))
        diagnostic = stage_diagnostic(record, response)
        if diagnostic:
            projected['diagnostic'] = diagnostic
        stages.append(projected)
        if record.get('status') == 'failed':
            failures.append(dict(actor=record.get('actor'), stage=stage, invocation_id=record.get('invocation_id'),
                                 outcome='execution_failure', error=record.get('reason'), trace_id=report.get('trace_id'),
                                 error_type=record.get('error_type'), diagnostic=diagnostic))
        attempts = response.get('transport_attempts', [])
        if not isinstance(attempts, list) or any(not isinstance(a, dict) for a in attempts):
            raise ValueError('Invalid transport records')
        for index, attempt in enumerate(attempts):
            event = {k: attempt[k] for k in CALL_FIELDS if k in attempt}
            asset = attempt.get('asset')
            if isinstance(asset, dict):
                event['asset'] = {k: asset[k] for k in ('kind', 'alias') if isinstance(asset.get(k), str)}
            usage = attempt.get('usage', {})
            if not isinstance(usage, dict):
                raise ValueError('Invalid transport usage')
            event['usage'] = {k: usage[k] for k in ('input_tokens', 'output_tokens')
                              if type(usage.get(k)) is int and usage[k] >= 0}
            event.update(id=f'{stage}:{attempt.get("attempt_id", index)}', source=f'{filename}:transport_attempts:{index}',
                         time=attempt.get('ts') or attempt.get('completed_at') or attempt.get('started_at'),
                         stage=stage, phase='tool-outcome' if attempt.get('kind') == 'tool' else
                         'invocation' if attempt.get('kind') == 'model' else 'tool-setup')
            events.append(event)
            if attempt.get('outcome') in ('error', 'refused', 'blocked', 'unknown') or (attempt.get('http_status') or 0) >= 400:
                failures.append({k: event[k] for k in CALL_FIELDS + ('stage',) if k in event})
    answer = report.get('final_answer', '')
    if not isinstance(answer, str):
        raise ValueError('Invalid final answer')
    return dict(mode='workflow', version=VERSION, status='interrupted' if interrupted else report['status'],
                outcome=report.get('outcome'), finalAnswer=answer,
                traceId=report.get('trace_id'), startedAt=report.get('started_at'),
                completedAt=report.get('completed_at'), aborted=report['status'] == 'failed',
                stages=stages, findings=findings, results=stages, failures=failures,
                executedStages=[s['stage'] for s in stages if s.get('invoked')],
                events=events, assessmentStatus='not_assessed')
