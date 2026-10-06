import test from 'node:test';
import assert from 'node:assert/strict';
import {spanDetails,spanType,matchConversationRun,conversationControls,conversationReferences,elapsedSeconds} from './conversationEvidence.ts';
import type {AssuranceRun} from './assuranceData';
import type {CloudSpan} from './cloudwatchData';
const trace='a'.repeat(32),other='b'.repeat(32);
const span={traceId:trace,spanId:'c'.repeat(16),name:'POST /',kind:'CLIENT',startTime:'2026-10-06T06:00:00Z',endTime:'2026-10-06T06:00:01Z',durationMs:1000,httpStatus:200,status:'UNSET',sourceUrl:''} as CloudSpan;
const run=(id='run-1')=>({id,c7:{},c16:{},c9:{},workflow:{traceId:trace,mode:'workflow',results:[],failures:[]},events:[]} as unknown as AssuranceRun);
test('HTTP spans do not promise model metadata will arrive; UNSET is explained',()=>{
 const d=spanDetails(span);assert.equal(d.Model,'Not applicable to this span');assert.equal(d['Input tokens'],'Not applicable to this span');assert.match(String(d['Span status']),/no explicit span status/);assert.equal(d['HTTP status'],200);
});
test('model usage preserves zero and derives total only from both recorded counts',()=>{
 const d=spanDetails({...span,model:'model-a',inputTokens:0,outputTokens:17});assert.equal(d.Model,'model-a');assert.equal(d['Input tokens'],0);assert.equal(d['Total tokens (input + output)'],17);
 const missing=spanDetails({...span,model:'model-a',inputTokens:5});assert.equal(missing['Output tokens'],'Not recorded');assert.equal(missing['Total tokens'],'Not recorded');
});
test('tool and model operation metadata distinguish applicable missing fields',()=>{
 assert.equal(spanDetails({...span,operation:'execute_tool'}).Tool,'Not recorded');assert.equal(spanType({...span,operation:'embeddings'}),'Model request');assert.equal(spanType({...span,inputTokens:12}),'Model request');
});
test('run joins never substitute a same-trace run for an explicit missing run',()=>{
 const r=run();assert.equal(matchConversationRun([r],'missing',trace),undefined);assert.equal(matchConversationRun([r],r.id,other),undefined);assert.equal(matchConversationRun([r],r.id,trace),r);assert.equal(matchConversationRun([r,run('run-2')],undefined,trace),undefined);assert.equal(matchConversationRun([r],undefined,trace),r);assert.equal(matchConversationRun([r]),undefined);
});
test('workflow mode does not hide recorded control verdicts; gaps remain unassessed',()=>{
 const r=run();r.c7={verdict:'SATISFIED',run_id:r.id};r.c16={verdict:'BREACH',trace_id:trace};const c=conversationControls(r,trace);assert.deepEqual(c.map(x=>x.verdict),['SATISFIED','BREACH','Not assessed']);assert.match(c[2].detail,/baseline/);
});
test('control results with conflicting run or trace identities cannot be displayed as a pass',()=>{
 const r=run();r.c7={verdict:'PASS',run_id:'other'};r.c16={verdict:'PASS',trace_id:other};r.c9={verdict:'invented'};const c=conversationControls(r,trace);assert.ok(c.every(x=>!x.assessed));assert.match(c[0].detail,/does not match/);
});
test('finding references require explicit fields and reject cross-run or cross-trace events',()=>{
 const r=run();const e={id:'e',time:null,source:'record',run_id:r.id,trace_id:trace,servicenow_number:'FND001',servicenow_sys_id:'1'.repeat(32),finding_id:'f1'};r.events=[e,{...e,id:'e2'},{...e,id:'e3',run_id:'other',finding_id:'f2'},{...e,id:'e4',trace_id:other,finding_id:'f3'},{id:'e5',time:null,source:'log',message:'finding created'}];assert.equal(conversationReferences(r,trace).length,1);assert.equal(conversationReferences(r,trace)[0].number,'FND001');assert.deepEqual(conversationReferences(),[]);
});
test('runtime duration is based on valid recorded timestamps, not a savings estimate',()=>{
 assert.equal(elapsedSeconds('2026-10-06T06:00:00Z','2026-10-06T06:00:05Z'),5);assert.equal(elapsedSeconds(undefined,'2026-10-06T06:00:05Z'),null);assert.equal(elapsedSeconds('2026-10-06T06:00:06Z','2026-10-06T06:00:05Z'),null);
});
