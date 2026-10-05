import {test} from 'node:test';import assert from 'node:assert/strict';
import {recordsOf,filterWorkspace,relatedRecords,actorMetrics,coverageRows} from './workspaceModel.ts';
const data={runs:[{id:'a',scenario:'S1',events:[{id:'ledger:1',source:'ledger:1',time:'2026-10-05T01:00:00Z',actor:'customer',action_id:'x',phase:'tool-outcome',started_at:'2026-10-05T00:59:59Z',outcome:'passed'},{id:'ledger:2',source:'ledger:2',time:'2026-10-05T01:00:01Z',actor:'it',action_id:'x',phase:'error',outcome:'error'}]},{id:'b',scenario:'S2',events:[{id:'ledger:1',source:'ledger:1',time:null,actor:'network',action_id:'x',phase:'notification',recipient:'owner',delivery_status:'queued'}]}]} as any;
test('workspace IDs cannot collide between runs',()=>assert.equal(new Set(recordsOf(data).map(e=>e.key)).size,3));
test('related evidence does not cross runs on a reused action ID',()=>{const r=recordsOf(data);assert.deepEqual(relatedRecords(r[0],r).map(e=>e.key),['a/ledger:2'])});
test('window excludes untimed records and respects UTC boundaries',()=>assert.equal(filterWorkspace(recordsOf(data),{search:'',actor:'',kind:'',run:'',failures:false,from:'2026-10-05T01:00:01',to:'2026-10-05T01:00:01'}).length,1));
test('only failures and actor filters compose',()=>assert.equal(filterWorkspace(recordsOf(data),{search:'',actor:'it',kind:'Agent',run:'a',failures:true,from:'',to:''}).length,1));
test('duration uses actual start and end and queued is not delivered',()=>{assert.equal(actorMetrics(recordsOf(data))[0].p95,1000);assert.equal(coverageRows(data.runs)[1].receipts,0)});
