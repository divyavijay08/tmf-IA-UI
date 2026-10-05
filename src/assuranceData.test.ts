import test from 'node:test';
import assert from 'node:assert/strict';
import {filterEvents,histogram,timeBuckets,parseAssurance,workflowStatus,type AssuranceEvent,type AssuranceRun} from './assuranceData.ts';
const events:AssuranceEvent[]=[{id:'a',source:'ledger:1',actor:'customer',phase:'invocation',time:'2026-10-05T05:00:00Z'},{id:'b',source:'ledger:2',actor:'it',phase:'tool-outcome',outcome:'refused',time:'2026-10-05T05:00:01Z'},{id:'c',source:'ledger:3',actor:'it',time:null}];
test('window is inclusive and unknown timestamps never masquerade as inside it',()=>{assert.deepEqual(filterEvents(events,'','','',false,[Date.parse(events[0].time!),Date.parse(events[1].time!)]).map(e=>e.id),['a','b']);assert.equal(filterEvents(events,'','','',false).length,3)});
test('actor, category, search and failure filters compose',()=>assert.deepEqual(filterEvents(events,'refused','it','Tool',true).map(e=>e.id),['b']));
test('histogram retains end-boundary events without inventing unknown-time events',()=>assert.deepEqual(histogram(events,Date.parse(events[0].time!),Date.parse(events[1].time!),2),[1,1]));
test('process exit success is not business completion',()=>assert.equal(workflowStatus({workflow:{aborted:false,completedAt:'2026-10-05',results:[{returncode:0,disposition:'undetermined'}],failures:[]}} as unknown as AssuranceRun),'Outcome undetermined'));
test('invalid source and invented verdict rejected',()=>{assert.throws(()=>parseAssurance({schema:2,source:'demo',readAt:'2026-10-05',runs:[]}));assert.throws(()=>parseAssurance({schema:2,source:'AWS collected evidence',readAt:'2026-10-05',runs:[{id:'r',c7:{verdict:'SUCCESS'},c16:{},budget:{},events:[],workflow:{results:[],failures:[]}}]}))});

test('time buckets count each boundary record once and preserve failure evidence',()=>{const start=Date.parse(events[0].time!);const b=timeBuckets(events,start,start+1000,1000);assert.equal(b.length,1);assert.deepEqual(b[0].events.map(e=>e.id),['a','b']);assert.equal(b[0].events[1].outcome,'refused');assert.deepEqual(timeBuckets(events,start,start,1000)[0].events.map(e=>e.id),['a']);assert.deepEqual(timeBuckets(events,start,start+1000,0),[])});
