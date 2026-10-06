import {test} from 'node:test';
import assert from 'node:assert/strict';
import {traceHierarchy} from './traceHierarchy.ts';
import {traceTopology} from './traceTopology.ts';
import type {CloudSpan} from './cloudwatchData.ts';
const span=(id:string,parent?:string)=>({spanId:id,parentSpanId:parent,traceId:'trace',name:id,startTime:'2026-10-06T00:00:00Z',endTime:'2026-10-06T00:00:01Z',durationMs:1000}) as CloudSpan;
test('branch includes the ancestry and actual direct children, not unrelated spans',()=>{
 const h=traceHierarchy([span('a'),span('b','a'),span('c','b'),span('d','b'),span('other')]);
 const g=traceTopology(h,'b');assert.deepEqual(g.nodes.map(n=>n.node.span.spanId),['a','b','c','d']);
 assert.deepEqual(g.edges,[{source:'a',target:'b'},{source:'b',target:'c'},{source:'b',target:'d'}]);
 const pos=Object.fromEntries(g.nodes.map(n=>[n.node.span.spanId,n.position]));assert.equal(pos.c.x,pos.d.x);assert.ok(Math.abs(pos.c.y-pos.d.y)>=156);assert.ok(pos.b.x<pos.c.x);
});
test('full trace keeps orphan spans separate and never invents missing-parent edges',()=>{
 const g=traceTopology(traceHierarchy([span('a','missing'),span('b','a'),span('c')]),'b',true);
 assert.equal(g.nodes.length,3);assert.deepEqual(g.edges,[{source:'a',target:'b'}]);
 assert.equal(new Set(g.nodes.map(n=>`${n.position.x},${n.position.y}`)).size,3);
});
test('broken cycles remain finite using the sanitized hierarchy',()=>{
 const g=traceTopology(traceHierarchy([span('a','b'),span('b','a')]),'a',true);
 assert.equal(g.nodes.length,2);assert.equal(g.edges.length,1);assert.ok(g.nodes.every(n=>Number.isFinite(n.position.x)&&Number.isFinite(n.position.y)));
});
