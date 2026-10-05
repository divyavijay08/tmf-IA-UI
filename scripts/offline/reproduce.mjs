import {readFile,writeFile} from 'node:fs/promises';
import {queryControl,readBundle} from './controlQuery.ts';
import {parseAssurance} from './assuranceData.ts';

const [input,output='reproduced-controls.json']=process.argv.slice(2);
if(!input){
 console.error('Usage: node --experimental-strip-types reproduce.mjs audit-bundle.json [output.json]');
 process.exit(2);
}
try {
 const payload=await readBundle(JSON.parse(await readFile(input,'utf8')));
 const data=parseAssurance(payload.assurance);
 const evaluations=data.runs.flatMap(run=>['7','9','16'].map(control=>queryControl(run,control)));
 await writeFile(output,JSON.stringify({reproducedAt:new Date().toISOString(),algorithms:[...new Set(evaluations.map(e=>e.algorithm))],input,source:data.source,readAt:data.readAt,evaluations},null,2));
 console.log(`${data.runs.length} runs recomputed across C7, C9 and C16. Output: ${output}`);
} catch(error) {
 console.error(error.message);
 process.exit(1);
}
