import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseWorkshop} from './workshopEvidence.ts';
const snapshot=()=>JSON.parse(readFileSync(new URL('../public/data/workshop-evidence.json',import.meta.url),'utf8'));
test('real snapshot preserves missing verdict and held budget',()=>{const d=parseWorkshop(snapshot());assert.equal(d.runs[0].report.verdict,'SATISFIED');assert.equal(d.runs[2].report.verdict,null);assert.equal(d.runs[2].budget.reserved,9825)});
test('invalid source and version are rejected',()=>{const d=snapshot();d.schema=2;assert.throws(()=>parseWorkshop(d));d.schema=1;d.source='sample';assert.throws(()=>parseWorkshop(d))});
test('invalid usage and timestamps cannot become evidence',()=>{const d=snapshot();d.runs[0].report['evidence.refs'][0].input_tokens=-1;assert.throws(()=>parseWorkshop(d));const x=snapshot();x.capturedAt='today';assert.throws(()=>parseWorkshop(x))});
test('unknown evaluator verdict fails validation',()=>{const d=snapshot();d.runs[0].report.verdict='probably fine';assert.throws(()=>parseWorkshop(d))});
