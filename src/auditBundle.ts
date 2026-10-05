import type {AssuranceData} from './assuranceData';
import type {CloudCapture} from './cloudwatchData';
import {makeBundle} from './controlQuery.ts';

// Only caller-supplied session evidence belongs in an export. Never fetch a fixture.
export function makeSessionBundle(data:AssuranceData,telemetry:CloudCapture|null,findingHistory:unknown[]){
 return makeBundle(data,{telemetry,findingHistory,attachments:{
  telemetry:telemetry?'Included; see capture source and timestamp':'Not loaded',
  foundation:'Not included',
  governanceObservation:'Not included',
 }});
}
