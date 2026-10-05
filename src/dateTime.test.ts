import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatUTCDate,formatUTCTime,formatUTCDateTime} from './dateTime.ts';

test('timestamps use MM/DD/YYYY and a 24-hour UTC clock',()=>{
 assert.equal(formatUTCDateTime('2026-10-05T08:45:38Z'),'10/05/2026 08:45:38');
 assert.equal(formatUTCTime('2026-10-05T00:00:00Z'),'00:00:00');
 assert.equal(formatUTCDateTime('2026-10-05T19:04:08Z',false),'10/05/2026 19:04');
});

test('timezone offsets convert across UTC date and year boundaries',()=>{
 assert.equal(formatUTCDateTime('2026-01-01T00:30:00+05:30'),'12/31/2025 19:00:00');
 assert.equal(formatUTCDateTime('2026-12-31T23:30:00-04:00'),'01/01/2027 03:30:00');
});

test('calendar wall times and date-only values are UTC regardless of browser timezone',()=>{
 assert.equal(formatUTCDateTime('2026-10-05T08:45'),'10/05/2026 08:45:00');
 assert.equal(formatUTCDate('2024-02-29'),'02/29/2024');
 assert.equal(formatUTCDateTime(0),'01/01/1970 00:00:00');
});

test('missing and invalid timestamps do not display a fabricated date',()=>{
 for(const value of [null,undefined,'','invalid',NaN]){
  assert.equal(formatUTCDateTime(value),'Not recorded');
  assert.equal(formatUTCDate(value),'Not recorded');
  assert.equal(formatUTCTime(value),'Not recorded');
 }
});
