"""Run a real customer conversation through governed Customer/IT/Network agents."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid
from agent_journey import STAGES, run_journey


def question_for(message, history):
    # Kept for clients/tests that display a conversation as text. Transport uses fields.
    return message if not history else ('Previous conversation (JSON):\n'+json.dumps(history,ensure_ascii=False)+'\n\nCurrent user message:\n'+message)


def save(path,value):
    path=Path(path);tmp=path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value,ensure_ascii=False));os.chmod(tmp,0o600);os.replace(tmp,path)


def main(argv=None):
    p=argparse.ArgumentParser()
    p.add_argument('request');p.add_argument('scenario')
    for flag in ('data','threshold','register','evidence','run-id','actors'):p.add_argument('--'+flag,required=True)
    p.add_argument('--budget-export',action='store_true')
    args=p.parse_args(argv)
    from tools.control7.runner import invoke_runtime, objects, now
    request=json.loads(Path(args.request).read_text())
    actors=dict(item.split('=',1) for item in args.actors.split(','))
    if any(not actors.get(role) for role in ('customer','it','network')):p.error('Three configured agents are required')
    cid=args.run_id;trace=uuid.uuid4().hex;started=now()
    threshold=json.loads(Path(args.threshold).read_text())
    if dt.datetime.fromisoformat(threshold['declared_at'].replace('Z','+00:00'))>dt.datetime.now(dt.timezone.utc):p.error('Future threshold')
    root=Path(args.evidence)/'runs'/cid;root.mkdir(parents=True,exist_ok=False,mode=0o700)
    participants=[dict(actor=actors[role],role=role,stage=stage,invocation_id=cid+':'+stage,trace_id=trace) for stage,role,_ in STAGES]
    manifest=dict(run_id=cid,started_at=started,scenario='chat-message',participants=participants,trace_id=trace,
                  threshold_version=threshold['version'],threshold_snapshot=threshold,attempts=[],attempt_starts=[],results=[],injection={})
    save(root/'runner-start.json',manifest);save(root/'c7-threshold.json',threshold)
    entry={};current=None
    for raw in Path(args.register).read_text().splitlines():
        line=raw.split(' #',1)[0].strip()
        if line.startswith('- control_id:'):current=line.split(':',1)[1].strip().strip('\"\'')
        elif current=='16' and ':' in line and not line.startswith('#'):
            k,v=line.split(':',1);entry[k.strip()]=v.strip().strip('\"\'')
    if not entry.get('observation_limit'):p.error('Missing declared control 16 policy')
    save(root/'threshold.json',dict(entry,control_id='16',pinned_at=started))
    progress=dict(traceId=trace,runId=cid,stages=[dict(id=s,role=r,title=t,state='pending') for s,r,t in STAGES])
    sessions=[]
    def record_session(actor,arn,session):
        sessions.append(dict(actor=actor,arn=arn,session=session,started_at=now()));save(root/'sessions.json',sessions)
    def emit(stage,role,title,state,response):
        step=next(s for s in progress['stages'] if s['id']==stage)
        step.update(state=state)
        if state=='running':step['startedAt']=now()
        else:step['finishedAt']=now()
        if response:
            if response.get('error'):step['error']=response['error']
            if response.get('answer'):
                step.update(answer=response.get('answer'),disposition=response.get('disposition'),invocationId=response.get('invocation_id'))
                records=response.get('call_records') or response.get('transport_attempts') or []
                step['toolCalls']=[{k:a[k] for k in ('tool_name','request_tool_name','outcome','event_id','attempt_id','http_status','duration_ms') if k in a} for a in records if a.get('kind')=='tool']
        if state=='not-required':
            manifest['results'].append(dict(invocation_id=cid+':'+stage,actor=actors[role],not_started=True,captured=False,disposition='not-started',refused_by={'reason':'Agent returned no pending negotiation proposal'}))
        save(root/'journey.json',progress)
    save(root/'journey.json',progress)
    def invoke(stage,role,body):
        iid=cid+':'+stage
        # Every stage has its own parent span, while sharing the conversation trace.
        tp=f'00-{trace}-{uuid.uuid4().hex[:16]}-01'
        payload=dict(body,correlation_id=cid,invocation_id=iid,traceparent=tp,threshold_version=threshold['version'])
        console=invoke_runtime(actors[role],payload,cid,tp,sessions=record_session,limit=180)
        (root/('console-'+stage+'.txt')).write_text(console)
        response=next((v for v in objects(console) if v.get('invocation_id')==iid and v.get('agent')==actors[role]),{})
        for line in console.splitlines():
            if line.startswith('C7_TRANSPORT '):
                event=json.loads(line[len('C7_TRANSPORT '):]);manifest['attempt_starts' if event.get('state')=='started' else 'attempts'].append(event)
        manifest['attempts'].extend(response.get('transport_attempts',[]))
        manifest['results'].append(dict(invocation_id=iid,actor=actors[role],captured=bool(response),returncode=0,
            completed_at=now(),evidence_errors=response.get('evidence_errors',[]),disposition=response.get('disposition'),
            injection=response.get('injection'),suppressed_event_ids=response.get('suppressed_event_ids')))
        save(root/('runner-after-'+stage+'.json'),manifest)
        return response
    result=1
    try:
        answer,findings=run_journey(request['message'],request.get('history',[]),actors,cid,trace,invoke,emit)
        save(root/'chat-answer.json',answer)
        result=0
    except Exception as error:
        progress['error']=str(error) if type(error).__name__=='JourneyStopped' else 'Journey interrupted: '+type(error).__name__
        for step in progress['stages']:
            if step['state']=='pending':step['state']='not-started'
        save(root/'journey.json',progress)
        manifest['abort_reason']=type(error).__name__
        recorded={r['invocation_id'] for r in manifest['results']}
        for stage in progress['stages']:
            if stage['state']=='not-started' and cid+':'+stage['id'] not in recorded:
                manifest['results'].append(dict(invocation_id=cid+':'+stage['id'],actor=actors[stage['role']],not_started=True,captured=False,disposition='not-started',refused_by={'reason':'upstream stage did not complete'}))
    finally:
        manifest.update(completed_at=now(),aborted=bool(result));save(root/'runner.json',manifest)
        if args.budget_export:
            code="import os,sys,urllib.request;r=urllib.request.Request('http://127.0.0.1:8080/export?run='+sys.argv[1],headers={'X-Audit-Token':os.environ['AUDIT_WRITE_TOKEN']});print(urllib.request.urlopen(r,timeout=10).read().decode())"
            try:
                out=subprocess.run(['kubectl','-n','components','exec','deploy/alpha-c16-budget','--','python3','-c',code,cid],capture_output=True,text=True,timeout=60,check=True).stdout
                save(root/'budget.json',json.loads(out))
            except (subprocess.SubprocessError,OSError,ValueError):pass
    return result

if __name__=='__main__':sys.exit(main())
