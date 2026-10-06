"""Read-only control evidence overlay for workflow API responses.

Existing assessors remain authoritative. This adapter never treats a runtime
watcher's ALLOW decision, partial usage, or a finished workflow as a control PASS.
It supplies evidence-readiness results when no saved assessment is available.
"""
from datetime import datetime, timezone
from functools import wraps
import hashlib
import json
import math

VERDICTS = {'SATISFIED', 'NOT SATISFIED', 'PASS', 'BREACH', 'NO EVIDENCE', 'INCONCLUSIVE'}
REPORT_KEYS = ('verdict', 'threshold_version', 'expected_count', 'observed_count', 'coverage',
    'missing_ids', 'unverified_ids', 'gap_violations', 'orphan_actions', 'findings', 'uncertainties',
    'warnings', 'source_refs', 'coverage_verdict', 'timing_verdict', 'gap_limit_ms', 'gap_count',
    'max_gap_ms', 'broken_links', 'assessment_kind', 'gateway_join_basis', 'threshold.version',
    'threshold.value', 'measured.value', 'measurement.complete', 'over_by', 'failed.calls',
    'evidence.refs', 'window', 'measured.detail', 'baseline_version', 'metric', 'run_id', 'trace_id',
    'runId', 'traceId', 'assessed_at', 'evaluated_at', 'algorithm', 'exceptions', 'exception_rate')
THRESHOLD_KEYS = ('control_id', 'name', 'metric', 'scope', 'instrument', 'obligation', 'owner',
    'version', 'version_date', 'declared_at', 'effective_at', 'pinned_at', 'frequency',
    'exception_tolerance', 'allowed_exception_rate', 'enforcement_point', 'why_this_value',
    'measurement_basis', 'observation_limit', 'alert_point', 'refusal_point', 'max_total_tokens',
    'cap', 'coverage_target', 'linkage_target', 'orphan_limit', 'gap_limit_ms', 'max_absolute_drift')
WATCH_KEYS = ('control.id', 'run.id', 'trace.id', 'enforcement.point', 'threshold.version',
    'verdict.at.end', 'measured.value', 'model.calls', 'calls.usage.unknown', 'log.reads.ok',
    'log.reads.failed', 'log.target')


def pick(value, keys):
    return {k: value[k] for k in keys if k in value}


def number(value):
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (ValueError, TypeError):
        return None
    return result if math.isfinite(result) and result >= 0 else None


def overlay(root, run):
    run_id = run['id']
    trace_id = run['workflow'].get('traceId')
    terminal = run['workflow'].get('status') in ('completed', 'failed', 'interrupted')
    evaluated_at = datetime.now(timezone.utc).isoformat()
    digests, rejected = {}, []

    def read(name):
        path = root / name
        if not path.exists():
            return {}
        try:
            raw = path.read_bytes()
            value = json.loads(raw)
            if not isinstance(value, dict):
                raise ValueError('not an object')
            digests[name] = hashlib.sha256(raw).hexdigest()
            return value if matches(value, name) else {}
        except (OSError, ValueError):
            rejected.append(name + ': unreadable or malformed')
            return {}

    def matches(value, filename):
        for key in ('run_id', 'runId', 'run.id'):
            if value.get(key) and value[key] != run_id:
                rejected.append(filename + ': run identity mismatch')
                return False
        for key in ('trace_id', 'traceId', 'trace.id'):
            if value.get(key) and (not trace_id or value[key] != trace_id):
                rejected.append(filename + ': trace identity mismatch')
                return False
        return True

    def saved(control):
        names = {'7': ('reports/control-7.json',), '16': ('control-16.json', 'control-16-inline.json'),
                 '9': ('control-9.json',)}[control]
        for name in names:
            value = read(name)
            if not value or not matches(value, name):
                continue
            if not isinstance(value.get('verdict'), str) or value['verdict'] not in VERDICTS:
                rejected.append(name + ': unsupported verdict')
                continue
            report = pick(value, REPORT_KEYS)
            report.update(run_id=run_id, trace_id=trace_id, evidence_origin='saved_assessment', source_file=name)
            return report
        return None

    c7_threshold = pick(read('c7-threshold.json'), THRESHOLD_KEYS)
    c16_threshold = pick(read('c16-threshold.json'), THRESHOLD_KEYS)
    c9_threshold = pick(read('c9-threshold.json'), THRESHOLD_KEYS)
    budget = read('budget.json')
    if budget and not matches(budget, 'budget.json'):
        budget = {}
    if not c16_threshold and isinstance(budget.get('threshold'), dict):
        c16_threshold = pick(budget['threshold'], THRESHOLD_KEYS)
    # Existing UI expects max_total_tokens; retain the original observation_limit too.
    limit = number(c16_threshold.get('max_total_tokens', c16_threshold.get('cap', c16_threshold.get('observation_limit'))))
    if limit is not None:
        c16_threshold.setdefault('max_total_tokens', limit)
    raw_watch = read('watch.json')
    watch = pick(raw_watch, WATCH_KEYS) if raw_watch and raw_watch.get('run.id') == run_id and matches(raw_watch, 'watch.json') else {}
    if raw_watch and not watch and not any('watch.json' in r for r in rejected):
        rejected.append('watch.json: missing run identity')
    if watch and c16_threshold.get('version') != watch.get('threshold.version'):
        rejected.append('watch.json: threshold version mismatch')
        watch = {}

    reports = {control: saved(control) for control in ('7', '16', '9')}
    expected = read('expected-events.json')
    expected_calls = read('expected-calls.json')
    baseline = read('quality-baseline.json')
    windows = read('quality-windows.json')

    def readiness(control, gaps, measured=False, **values):
        return dict(verdict='INCONCLUSIVE' if measured else 'NO EVIDENCE',
                    run_id=run_id, trace_id=trace_id, evaluated_at=evaluated_at,
                    assessment_kind='evidence_readiness', algorithm='workflow-control-overlay-v1',
                    evidence_origin='api_evidence_check', warnings=gaps, findings=[], **values)

    if terminal:
        if reports['7'] is None:
            gaps = ['No saved C7 assessment for this workflow. Recorded transport events alone do not prove complete audit-event recording.']
            if not expected.get('events'):
                gaps.append('Independent expected-event inventory is missing; recording coverage cannot be established.')
            reports['7'] = readiness('7', gaps, bool(run['events']),
                recorded_event_count=len(run['events']), threshold_version=c7_threshold.get('version'))
        if reports['16'] is None:
            measured = number(watch.get('measured.value'))
            gaps = ['No saved C16 assessment for this workflow. A watcher decision is not a full control verdict.']
            if limit is None:
                gaps.append('A run-pinned spend threshold is missing.')
            if not expected_calls.get('call_ids'):
                gaps.append('Independent expected model-call inventory is missing; completeness is not established.')
            if measured is None:
                gaps.append('No validated gateway watcher measurement is available for this run.')
            else:
                gaps.append(f'Gateway watcher recorded {measured:,.0f} tokens across {watch.get("model.calls", "unrecorded")} model calls; runtime decision: {watch.get("verdict.at.end", "unrecorded")}.')
            reports['16'] = readiness('16', gaps, measured is not None, **{
                'measured.value': measured, 'threshold.value': limit,
                'threshold.version': c16_threshold.get('version'), 'measurement.complete': False,
                'runtime_decision': watch.get('verdict.at.end'),
                'measured.detail': {'source': 'watch.json' if watch else None,
                    'model_calls': watch.get('model.calls'), 'usage_unknown_calls': watch.get('calls.usage.unknown'),
                    'log_reads_failed': watch.get('log.reads.failed'),
                    'observed_threshold_exceeded': measured > limit if measured is not None and limit is not None else None}})
        if reports['9'] is None:
            gaps = ['No saved C9 assessment linked to this workflow. Latency samples alone are not a drift verdict.']
            if not baseline:
                gaps.append('A run-linked frozen baseline is missing.')
            if not windows.get('windows'):
                gaps.append('Run-linked scored comparison windows are missing.')
            reports['9'] = readiness('9', gaps, bool(baseline and windows))

    sources = dict(run.get('sources', {}))
    sources['controls'] = dict(source='run-local control artifacts',
        savedAssessments=[key for key, report in reports.items() if report and report.get('evidence_origin') == 'saved_assessment'],
        readinessChecks=[key for key, report in reports.items() if report and report.get('assessment_kind') == 'evidence_readiness'],
        runtimeWatcher=bool(watch), inputDigests=digests, rejectedSources=rejected,
        mutatesAgentExecution=False)
    result = {**run, 'sources': sources, 'c7': reports['7'] or {}, 'c16': reports['16'] or {}, 'c9': reports['9'] or {},
              'c7Threshold': c7_threshold, 'c16Threshold': c16_threshold, 'c9Threshold': c9_threshold,
              'control16Watch': watch,
              'budget': pick(budget, ('committed', 'reserved', 'blocked', 'mode'))}
    if c16_threshold:
        result['budget']['threshold'] = c16_threshold
    # Missing inputs stay missing. Do not synthesize inventories or historical policy bindings.
    if expected.get('events'):
        result['expectedEvents'] = [pick(v, ('id', 'source', 'time', 'phase', 'actor')) for v in expected['events'] if isinstance(v, dict)]
    if expected_calls.get('call_ids'):
        result['expectedCallIds'] = [v for v in expected_calls['call_ids'] if isinstance(v, str)]
    if baseline:
        result['qualityBaseline'] = pick(baseline, ('version', 'metric', 'value', 'frozen_at'))
    if windows.get('windows'):
        result['qualityWindows'] = [pick(v, ('id', 'start', 'end', 'value', 'baseline_version', 'threshold_version', 'metric')) for v in windows['windows'] if isinstance(v, dict)]
    return result


def with_controls(loader):
    @wraps(loader)
    def wrapped(root):
        run = loader(root)
        return overlay(root, run) if run.get('workflow', {}).get('mode') == 'workflow' else run
    return wrapped
