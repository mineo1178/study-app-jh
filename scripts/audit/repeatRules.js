/* global process */
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
const root = 'docs/audit-v2913';
const results = [];
const plan = [
  ...Array.from({length:20},(_,i)=>({id:`isolated-${i+1}`,args:['--testNamePattern','keeps insufficient correction pending and retries its stored deduction once under contention'],expected:2})),
  ...Array.from({length:20},(_,i)=>({id:`full-${i+1}`,args:[],expected:71})),
  ...[1701,1702,1703,1704,1705].map(seed=>({id:`shuffle-${seed}`,args:['--sequence.shuffle','--sequence.seed',String(seed)],expected:71,seed})),
];
for(const entry of plan) {
 const started = new Date().toISOString(), jsonPath=`${root}/logs/${entry.id}.json`, logPath=`${root}/logs/${entry.id}.log`;
 console.log('START',entry.id,started);
 const args=['node_modules/vitest/vitest.mjs','run','test/firestore/firestore.rules.test.js','--reporter=default','--reporter=json',`--outputFile=${jsonPath}`,...entry.args];
 const child=spawn(process.execPath,args,{env:{...process.env,NO_COLOR:'1'},stdio:['ignore','pipe','pipe']});
 for(const stream of [child.stdout,child.stderr])stream.on('data',data=>appendFileSync(logPath,data));
 const code=await new Promise(resolve=>child.on('close',resolve));
 const data=existsSync(jsonPath)?JSON.parse(readFileSync(jsonPath)):null;
 const result={...entry,started,ended:new Date().toISOString(),exitCode:code,passed:data?.numPassedTests,failed:data?.numFailedTests,skipped:data?.numPendingTests,failures:data?.testResults?.flatMap(s=>s.assertionResults.filter(t=>t.status==='failed').map(t=>({name:t.fullName,messages:t.failureMessages})))||[]};
 results.push(result);
 writeFileSync(`${root}/repeat-summary.json`,JSON.stringify({base:'7649834c9e3c27f5eba07302bb30de2c30b73216',emulator:process.env.FIRESTORE_EMULATOR_HOST,results},null,2)+'\n');
 console.log('DONE',entry.id,'exit',code,'passed',result.passed,'failed',result.failed);
}

if(results.some(r=>r.exitCode!==0 || r.passed!==r.expected)) process.exitCode=1;
