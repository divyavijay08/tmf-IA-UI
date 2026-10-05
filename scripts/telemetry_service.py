"""Bounded CloudWatch queries. Only allowlisted metadata leaves the service."""
import datetime as dt, json, math, re, subprocess
from urllib.parse import quote

def iso(ms):
 return dt.datetime.fromtimestamp(ms/1000,dt.timezone.utc).isoformat()
def millis(value):
 if not isinstance(value,str): raise ValueError('UTC timestamp required')
 parsed=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
 if parsed.tzinfo is None: raise ValueError('Timezone required')
 return int(parsed.timestamp()*1000)
def aws(region,*args):
 result=subprocess.run(['aws',*args,'--region',region,'--output','json','--no-cli-pager','--no-paginate'],capture_output=True,text=True,timeout=35)
 if result.returncode: raise RuntimeError('AWS request failed; check service role permissions and region')
 return json.loads(result.stdout)
def attrs(v):
 if isinstance(v,dict): return v
 if isinstance(v,list): return {x['key']:next(iter(x.get('value',{}).values()),None) for x in v if isinstance(x,dict) and 'key' in x}
 return {}
def span_time(v):
 if isinstance(v,str) and not v.isdigit(): return iso(millis(v))
 if isinstance(v,(str,int,float)):
  n=float(v)
  if n>1e17:n/=1e6
  elif n>1e14:n/=1e3
  elif n<1e11:n*=1000
  return iso(n)
 raise ValueError('Span time missing')
def normalize(record,group,region):
 spans=[]; metrics=[]; logs=[]
 url='https://'+region+'.console.aws.amazon.com/cloudwatch/home?region='+region+'#logsV2:log-groups/log-group/'+quote(quote(group,safe=''),safe='')
 def walk(d,resource=None):
  if not isinstance(d,dict): return
  a=attrs(d.get('attributes')); r=attrs((d.get('resource') or {}).get('attributes')) or resource or {}; service=r.get('service.name') or a.get('service.name')
  if 'traceId' in d and 'spanId' in d and ('startTimeUnixNano' in d or 'startTime' in d):
   start=span_time(d.get('startTimeUnixNano',d.get('startTime')));end=span_time(d.get('endTimeUnixNano',d.get('endTime')))
   if not re.fullmatch('[a-fA-F0-9]{32}',d['traceId']) or not re.fullmatch('[a-fA-F0-9]{16}',d['spanId']) or millis(end)<millis(start):raise ValueError('Invalid span')
   span={k:d[k] for k in ('traceId','spanId','parentSpanId','name','kind') if k in d}
   span.update(startTime=start,endTime=end,durationMs=millis(end)-millis(start),service=service,logGroup=group,region=region,sourceUrl=url)
   status=d.get('status');span['status']=str(status.get('code')) if isinstance(status,dict) else status
   for target,key in {'model':'gen_ai.request.model','operation':'gen_ai.operation.name','tool':'gen_ai.tool.name','toolCallId':'gen_ai.tool.call.id','httpStatus':'http.response.status_code','inputTokens':'gen_ai.usage.input_tokens','outputTokens':'gen_ai.usage.output_tokens'}.items():
    if key in a:span[target]=a[key]
   for k in ('inputTokens','outputTokens'):
    if k in span:
     n=float(span[k])
     if not math.isfinite(n) or n<0 or not n.is_integer():raise ValueError('Invalid usage')
     span[k]=int(n)
   if 'inputTokens' in span and 'outputTokens' in span:span['totalTokens']=span['inputTokens']+span['outputTokens']
   spans.append(span);return
  if '_aws' in d:
   for definition in d['_aws'].get('CloudWatchMetrics',[]):
    defs=definition.get('Metrics',[]);values={m['Name']:d[m['Name']] for m in defs if isinstance(d.get(m.get('Name')),(int,float)) and math.isfinite(d[m['Name']])}
    for dimension in definition.get('Dimensions',[[]]):
     if values:metrics.append(dict(time=iso(d['_aws']['Timestamp']),service=service or d.get('service.name',''),logGroup=group,namespace=definition.get('Namespace',''),dimensions={k:str(d[k]) for k in dimension if k in d},measurements=values,definitions=[{k:m[k] for k in ('Name','Unit') if k in m} for m in defs],sourceUrl=url))
  if d.get('traceId') and ('body' in d or 'severityText' in d):
   logs.append(dict(time=span_time(d.get('timeUnixNano',record['timestamp'])),traceId=d.get('traceId'),spanId=d.get('spanId'),severity=d.get('severityText'),service=service,sourceUrl=url))
  for k in ('resourceSpans','scopeSpans','spans','resourceLogs','scopeLogs','logRecords'):
   for child in d.get(k,[]):walk(child,r)
 try:walk(json.loads(record['message']))
 except (ValueError,TypeError,KeyError,OverflowError): return [],[],[],1
 return spans,metrics,logs,0

def query(config,start,end,request=aws):
 a,b=millis(start),millis(end)
 if a>b or b-a>86400000:raise ValueError('Choose a time window of at most 24 hours')
 region=config['region'];groups=config.get('logGroups',[])
 if not groups:raise RuntimeError('CloudWatch log groups are not configured')
 output=dict(schema=1,source='AWS CloudWatch API',capturedAt=iso(dt.datetime.now(dt.timezone.utc).timestamp()*1000),region=region,spans=[],metrics=[],logs=[],omitted='Prompt bodies, tool payloads and non-allowlisted attributes are excluded.',window={'from':start,'to':end},errors=[],complete=True)
 count=0;invalid=0
 for group in groups:
  token=None;seen=set()
  try:
   for page in range(config.get('maxPagesPerGroup',20)):
    args=['logs','filter-log-events','--log-group-name',group,'--start-time',str(a),'--end-time',str(b),'--limit','1000']
    if token:args+=['--next-token',token]
    response=request(region,*args)
    for record in response.get('events',[]):
     count+=1;s,m,l,bad=normalize(record,group,region);output['spans']+=s;output['metrics']+=m;output['logs']+=l;invalid+=bad
    token=response.get('nextToken')
    if not token:break
    if token in seen:raise RuntimeError('CloudWatch pagination stalled')
    seen.add(token)
   else:
    if token:raise RuntimeError('Query limit reached; narrow the time window')
  except (RuntimeError,subprocess.TimeoutExpired,ValueError) as error:
   output['complete']=False;output['errors'].append({'logGroup':group,'error':str(error) if not isinstance(error,subprocess.TimeoutExpired) else 'AWS request timed out'})
 output['spans']=list({s['traceId']+':'+s['spanId']:s for s in output['spans']}.values())
 output['coverage']=f"Queried {len(groups)} configured log groups; {count} source records, {invalid} unsupported or malformed records. " + ('All query pages retrieved.' if output['complete'] else 'Partial query; inspect errors.')
 return output
