import test from 'node:test';
import assert from 'node:assert/strict';
import {traceHierarchy} from './traceHierarchy.ts';
import type {CloudSpan} from './cloudwatchData';
const span=(id:string,parent?:string,trace='a'.repeat(32))=>({traceId:trace,spanId:id,parentSpanId:parent,startTime:'2026-10-06T00:00:00Z',endTime:'2026-10-06T00:00:01Z',durationMs:1000,name:id,kind:'INTERNAL',sourceUrl:''} as CloudSpan);
test('trajectory follows recorded ancestry even when API order is reversed',()=>{
 const nodes=traceHierarchy([span('3','2'),span('2','1'),span('1')]);assert.deepEqual(nodes.map(n=>n.span.spanId),['1','2','3']);assert.deepEqual(nodes[2].ancestors,['1','2']);assert.deepEqual(nodes[1].children,['3']);assert.equal(nodes[2].depth,2);
});
test('missing and foreign-trace parents remain detached instead of inventing relationships',()=>{
 const nodes=traceHierarchy([span('1'),span('2','absent'),span('3','1','b'.repeat(32))]);assert.ok(nodes.every(n=>n.depth===0));assert.equal(nodes[1].missingParent,true);assert.equal(nodes[2].missingParent,true);
});
test('duplicates, cycles and self-parent spans cannot repeat or hang the explorer',()=>{
 const nodes=traceHierarchy([span('1','2'),span('2','1'),span('3','3'),span('1','2')]);assert.equal(nodes.length,3);assert.equal(new Set(nodes.map(n=>n.span.spanId)).size,3);assert.ok(nodes.every(n=>!n.ancestors.includes(n.span.spanId)));
});
