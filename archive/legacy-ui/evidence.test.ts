import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluate,runs} from './evidence.ts';
test('missing source evidence cannot pass',()=>assert.equal(evaluate(runs[3],'16').verdict,'Unknown'));
test('window selection changes verdict using actual window records',()=>{assert.equal(evaluate(runs[1],'9','first').verdict,'Pass');assert.equal(evaluate(runs[1],'9','last').verdict,'Breach')});
test('coverage uses independent expected count',()=>{const result=evaluate(runs[3],'7');assert.equal(result.verdict,'Breach');assert.equal(result.value,11/12*100)});
test('retest preserves original failure and binds threshold version',()=>{assert.equal(evaluate(runs[1],'9').verdict,'Breach');const result=evaluate(runs[2],'9');assert.equal(result.verdict,'Pass');assert.equal(result.retestOf,'alpha-002');assert.ok(result.records.every(r=>r.thresholdVersion===result.threshold.version))});

import {summarize,runStatus,sampleApi} from './evidenceApi.ts';
test('summary derives counts instead of trusting stored run status',()=>{const modified={...runs[0],status:'Breach' as const};assert.equal(runStatus(modified),'Pass');assert.deepEqual(summarize([modified]),{total:1,passing:1,breaching:0,incomplete:0,breachedControls:0})});
test('empty response produces zero metrics',()=>assert.equal(summarize([]).total,0));
test('adapter returns independent snapshots',async()=>{const a=await sampleApi.getSnapshot();a.runs.length=0;assert.equal((await sampleApi.getSnapshot()).runs.length,4)});
import {traceFor} from './traceData.ts';
test('sample spans link to valid parents and stay inside trace duration',()=>{for(const run of runs){const trace=traceFor(run.id);for(const span of trace.spans){assert.ok(!span.parent||trace.spans.some(p=>p.id===span.parent));assert.ok(span.start+span.duration<=trace.durationMs)}}});
test('trace usage agrees with last available cumulative sample measurement',()=>{for(const run of runs){const total=traceFor(run.id).spans.reduce((n,s)=>n+(s.tokens?.input??0)+(s.tokens?.output??0),0);assert.equal(total,run.values['16'].filter(v=>v!==null).at(-1))}});
