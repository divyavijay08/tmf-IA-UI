import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSessionBundle} from './auditBundle.ts';
import {readBundle} from './controlQuery.ts';
import type {AssuranceData} from './assuranceData';
import type {CloudCapture} from './cloudwatchData';

const data:AssuranceData={schema:2,source:'AWS collected evidence',readAt:'2026-10-05T12:00:00Z',runs:[],errors:[],freshness:'Test collection'};
test('export without telemetry never retrieves or substitutes historical attachments',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>{assert.fail('Export must not fetch fallback evidence')};
 try {
  const payload=await readBundle(await makeSessionBundle(data,null,[]));
  assert.deepEqual(payload.assurance,data);
  assert.equal(payload.telemetry,null);
  assert.equal(payload.attachments.telemetry,'Not loaded');
  assert.equal(payload.foundation,undefined);
  assert.equal(payload.governanceObservation,undefined);
 } finally {globalThis.fetch=original}
});
test('export preserves supplied capture provenance and local notes',async()=>{
 const capture={schema:1,source:'AWS CloudWatch browser capture',capturedAt:'2026-10-05T11:00:00Z',spans:[],metrics:[],logs:[]} as unknown as CloudCapture;
 const notes=[{findingId:'run:C7',note:'Investigating'}];
 const bundle=await makeSessionBundle(data,capture,notes);
 const payload=await readBundle(bundle);
 assert.deepEqual(payload.telemetry,capture);
 assert.deepEqual(payload.findingHistory,notes);
 bundle.payload.telemetry.capturedAt='2026-10-06T11:00:00Z';
 await assert.rejects(()=>readBundle(bundle),/checksum/);
});
