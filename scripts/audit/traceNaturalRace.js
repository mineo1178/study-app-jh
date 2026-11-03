/* global process */
import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const results=[];
for(let run=1;run<=20;run++) {
 const prefix=`docs/audit-v2913/logs/natural-trace-${run}`;
 const child=spawn(process.execPath,['node_modules/vitest/vitest.mjs','run','test/firestore/firestore.rules.test.js','--config','test/firestore/audit/trace.config.mjs','--testNamePattern','keeps insufficient correction pending and retries its stored deduction once under contention','--reporter=default','--reporter=json',`--outputFile=${prefix}.json`],{env:{...process.env,AUDIT_TRACE_PATH:`${prefix}.jsonl`,NO_COLOR:'1'},stdio:['ignore','pipe','pipe']});
 for(const output of [child.stdout,child.stderr])output.on('data',data=>appendFileSync(`${prefix}.log`,data));
 const code=await new Promise(resolve=>child.on('close',resolve)),data=JSON.parse(readFileSync(`${prefix}.json`));
 results.push({run,code,passed:data.numPassedTests,failed:data.numFailedTests});
 writeFileSync('docs/audit-v2913/natural-trace-summary.json',JSON.stringify(results,null,2)+'\n');
 console.log('natural trace',run,'exit',code,'passed',data.numPassedTests,'failed',data.numFailedTests);
 if(data.numFailedTests) break;
}
