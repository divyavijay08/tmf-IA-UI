"""Exact-trace metadata adapter for the teammate's existing loopback span API.

Raw prompts, attributes, events and log messages are never returned to the browser.
"""
import datetime as dt
import json
import math
import re
import time
import urllib.parse
import urllib.request


def timestamp(value):
    date = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if date.tzinfo is None:
        raise ValueError('Use a timezone-qualified timestamp')
    return date


def parameters(query):
    values = urllib.parse.parse_qs(query, keep_blank_values=True)
    if set(values) != {'from', 'to', 'traceId'} or any(len(v) != 1 for v in values.values()):
        raise ValueError('An exact trace ID and time window are required')
    start, end, trace = (values[k][0] for k in ('from', 'to', 'traceId'))
    if not re.fullmatch(r'[a-fA-F0-9]{32}', trace) or int(trace, 16) == 0:
        raise ValueError('Invalid trace ID')
    seconds = (timestamp(end) - timestamp(start)).total_seconds()
    if not 0 < seconds <= 86400:
        raise ValueError('Trace window must be positive and at most 24 hours')
    return start, end, trace.lower()


def normalize(row, trace, region):
    summary, native = row.get('summary', {}), row.get('span', {})
    if summary.get('traceId', '').lower() != trace:
        raise ValueError('Trace mismatch')
    sid = summary.get('spanId', '')
    if not re.fullmatch(r'[a-fA-F0-9]{16}', sid) or int(sid, 16) == 0:
        raise ValueError('Invalid span ID')
    start, end = (int(native[k]) / 1e9 for k in ('startTimeUnixNano', 'endTimeUnixNano'))
    if not math.isfinite(start + end) or end < start:
        raise ValueError('Invalid span duration')
    iso = lambda n: dt.datetime.fromtimestamp(n, dt.timezone.utc).isoformat()
    result = dict(traceId=trace, spanId=sid.lower(), name=str(summary.get('name') or 'Span'),
                  kind=str(summary.get('kind') or ''), startTime=iso(start), endTime=iso(end),
                  durationMs=(end-start)*1000, region=region,
                  sourceUrl=f'https://{region}.console.aws.amazon.com/cloudwatch/home?region={region}#/gen-ai-observability/spans?traceId={trace}')
    for key in ('parentSpanId', 'status', 'service', 'model', 'httpStatus'):
        if summary.get(key) is not None:
            result[key] = summary[key]
    result['logGroup'] = row.get('source', {}).get('logGroup', '')
    attrs = native.get('attributes', {})
    for key, choices in {'tool': ('gen_ai.tool.name', 'tool.name'), 'operation': ('gen_ai.operation.name',)}.items():
        for attr in choices:
            if isinstance(attrs.get(attr), str):
                result[key] = attrs[attr]
                break
    for source, dest in (('input', 'inputTokens'), ('output', 'outputTokens'), ('total', 'totalTokens')):
        value = summary.get('tokens', {}).get(source)
        if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0:
            result[dest] = value
    return result


def collect(query, target='http://127.0.0.1:10196', fetch=None):
    start, end, trace = parameters(query)
    def get(path, params=None):
        url = target.rstrip('/') + path + ('?' + urllib.parse.urlencode(params) if params else '')
        with urllib.request.urlopen(url, timeout=10) as response:
            payload = response.read(8*1024*1024+1)
            if len(payload) > 8*1024*1024:
                raise ValueError('Span response exceeds the metadata adapter limit')
            return json.loads(payload)
    fetch = fetch or get
    sources = fetch('/api/sources')
    region = sources.get('region', 'us-east-1')
    rows, errors, groups = {}, [], []
    deadline = time.monotonic() + 22
    for source in sources['sources']:
        groups.append(source['logGroup'])
        cursor = None
        for page in range(4):
            if time.monotonic() >= deadline:
                errors.append(dict(logGroup=source['logGroup'], error='Trace query time limit reached'))
                break
            args = dict(source=source['id'], startTime=start, endTime=end, traceId=trace, limit=200)
            if cursor:
                args['cursor'] = cursor
            try:
                data = fetch('/api/spans', args)
                for row in data['spans']:
                    try:
                        span = normalize(row, trace, region)
                        rows[span['spanId']] = span
                    except (ValueError, TypeError, KeyError, OverflowError):
                        errors.append(dict(logGroup=source['logGroup'], error='Invalid span metadata omitted'))
                next_cursor = data.get('nextCursor')
                if not next_cursor:
                    if data.get('hasMore') or data.get('scanLimited'):
                        errors.append(dict(logGroup=source['logGroup'], error='Source scan is incomplete'))
                    break
                if next_cursor == cursor or page == 3:
                    errors.append(dict(logGroup=source['logGroup'], error='Source pagination limit reached'))
                    break
                cursor = next_cursor
            except Exception:
                errors.append(dict(logGroup=source['logGroup'], error='Configured span source is unavailable'))
                break
    coverage = 'Source coverage: ' + ', '.join(dict.fromkeys(groups)) + '. Only configured sources are included; other runtime spans may be absent.'
    return dict(schema=1, source='AWS CloudWatch API', complete=not errors, errors=errors,
                capturedAt=dt.datetime.now(dt.timezone.utc).isoformat(), region=region,
                coverage=coverage, omitted='Prompts, tool payloads, raw attributes and log messages excluded.',
                spans=sorted(rows.values(), key=lambda s: s['startTime']), metrics=[], logs=[])
