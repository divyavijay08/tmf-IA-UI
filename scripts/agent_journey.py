"""Bounded, server-mediated customer journey over the existing governed agents.

No scenario is substituted. Agent outputs are evidence for subsequent stages, not
application instructions. The existing runtime enforces model/tool governance.
"""
import json

STAGES = (
 ('customer-intake', 'customer', 'Customer context'),
 ('it-investigation', 'it', 'IT investigation'),
 ('network-analysis', 'network', 'Network & digital twin'),
 ('it-review', 'it', 'IT proposal review'),
 ('network-finalisation', 'network', 'Network decision'),
 ('customer-reply', 'customer', 'Customer response'),
)

class JourneyStopped(RuntimeError):
    """A governed invocation failed or refused; downstream calls must not run."""


def evidence_view(response):
    return {k: response[k] for k in ('agent','role','answer','disposition','proposal','negotiation','action_assessment','trace_id','invocation_id') if k in response}


def check_response(response, actor, cid, iid, trace):
    if not isinstance(response, dict):
        raise JourneyStopped('Agent returned no structured response')
    for key, expected in [('agent',actor),('correlation_id',cid),('invocation_id',iid),('trace_id',trace)]:
        if response.get(key) != expected:
            raise JourneyStopped('Agent response identity mismatch: '+key)
    status=response.get('http_status')
    if not isinstance(status,int) or status >= 400 or status < 200:
        raise JourneyStopped('Agent invocation failed')
    if response.get('disposition') in ('blocked','refused-budget','incomplete','failed','refused','error'):
        raise JourneyStopped('Agent stopped: '+response['disposition'])
    if response.get('evidence_errors'):
        raise JourneyStopped('Agent evidence could not be recorded')
    if not isinstance(response.get('answer'),str) or not response['answer'].strip():
        raise JourneyStopped('Agent returned no answer')


def run_journey(message, history, actors, cid, trace, invoke, emit):
    """invoke(stage, role, body) owns transport, identity binding and evidence writes."""
    findings={}
    network=None
    for stage, role, title in STAGES:
        if stage in ('it-review','network-finalisation') and network and network.get('disposition')!='pending-negotiation':
            emit(stage,role,title,'not-required',None)
            continue
        emit(stage,role,title,'running',None)
        context={'phase':stage,'customer_request':message,'conversation_history':history,
                 'upstream_evidence':{k:evidence_view(v) for k,v in findings.items()}}
        # Existing deployed agents read only question; carry the full data envelope
        # there. Role behavior remains in each agent's configured system prompt.
        context['question']=json.dumps(context,ensure_ascii=False)
        if stage=='customer-intake':
            context['question']=message if not history else json.dumps({'history':history,'user_message':message},ensure_ascii=False)
        body={'context':context}
        if stage=='it-review' and network and network.get('disposition')=='pending-negotiation':
            body={'negotiate':{'proposal_id':network['proposal_id'],'proposal':network['proposal'],
                              'context':network['proposal_context'],'from_agent':actors['network'],'to_agent':actors['it']}}
        if stage=='network-finalisation' and network and network.get('disposition')=='pending-negotiation':
            review=findings['it-review'].get('negotiation',{})
            if review.get('proposal_id')!=network.get('proposal_id') or review.get('from_agent')!=actors['it'] or review.get('to_agent')!=actors['network']:
                emit(stage,role,title,'failed',{'error':'IT review does not match the network proposal'})
                raise JourneyStopped('IT review does not match the network proposal')
            body={'finalize':{'network_result':network,'it_result':findings['it-review']}}
        response=None
        try:
            response=invoke(stage,role,body)
            check_response(response,actors[role],cid,cid+':'+stage,trace)
            if stage=='network-analysis':
                network=response
                if network.get('disposition')=='pending-negotiation' and not all(k in network for k in ('proposal_id','proposal','proposal_context')):
                    raise JourneyStopped('Network proposal is incomplete')
            if stage=='network-finalisation' and response.get('disposition')=='pending-negotiation':
                raise JourneyStopped('Network consultation remains incomplete')
            findings[stage]=response
            emit(stage,role,title,'completed',response)
        except Exception as error:
            detail={'error':str(error) if isinstance(error,JourneyStopped) else 'Agent invocation failed: '+type(error).__name__}
            if isinstance(response,dict) and response.get('invocation_id')==cid+':'+stage and response.get('trace_id')==trace:
                detail.update(response)
            emit(stage,role,title,'failed',detail)
            raise
    return findings['customer-reply'],findings
