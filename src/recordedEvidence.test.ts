import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceFields,recordedModelUsage} from './recordedEvidence.ts';
import type {AssuranceEvent} from './assuranceData.ts';
const call=(id:string,input=10,output=3):AssuranceEvent=>({id,source:'record',time:null,phase:'invocation',attempt_id:id,usage:{input_tokens:input,output_tokens:output}});
test('missing fields are hidden but recorded zero and false remain',()=>assert.deepEqual(evidenceFields({a:null,b:'Unknown',c:'Not recorded',d:0,e:false,f:'model',g:[],h:{}}),[['d',0],['e',false],['f','model']]));
test('usage deduplicates attempts, preserves retries and excludes parent spans',()=>assert.deepEqual(recordedModelUsage([call('a'),call('a'),call('b'),{...call('parent'),phase:'agent'}]),{input:20,output:6,total:26,calls:2,excluded:0}));
test('conflicting and incomplete usage is excluded without inventing zero',()=>{assert.deepEqual(recordedModelUsage([call('a'),call('a',99),call('b'),{...call('c'),usage:{input_tokens:3}}]),{input:10,output:3,total:13,calls:1,excluded:2});assert.equal(recordedModelUsage([]),null)});
