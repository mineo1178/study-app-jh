/* global process */
import { spawn } from 'node:child_process';
import { appendFileSync,existsSync,readFileSync,writeFileSync } from 'node:fs';
const worker=Number(process.argv[2]),root='docs/reward-retry-fix',results=[];
if(![0,1].includes(worker))throw Error('WORKER_REQUIRED');
if(process.env.FIRESTORE_EMULATOR_HOST!==`127.0.0.1:${8087+worker}`)throw Error('ISOLATED_EMULATOR_REQUIRED');
const plan=[
 ...Array.from({length:50},(_,i)=>({id:`isolated-${i+1}`,group:'isolated',expected:2,args:['test/firestore/firestore.rules.test.js','--testNamePattern','keeps insufficient correction pending and retries its stored deduction once under contention']})),
 ...Array.from({length:20},(_,i)=>({id:`full-${i+1}`,group:'full',expected:71,args:['test/firestore/firestore.rules.test.js']})),
 ...Array.from({length:10},(_,i)=>({id:`shuffle-${i+1}`,group:'shuffle',expected:71,args:['test/firestore/firestore.rules.test.js','--sequence.shuffle','--sequence.seed',String(4101+i)]})),
 ...Array.from({length:6},(_,i)=>({id:`race-${i+1}`,group:'race',expected:8,args:['--config','test/firestore/reward-retry/vitest.config.mjs']})),
].filter((_,i)=>i%2===worker);
for(const entry of plan){
 const prefix=`${root}/logs/${entry.id}`,started=new Date().toISOString();
 const child=spawn(process.execPath,['node_modules/vitest/vitest.mjs','run',...entry.args,'--reporter=default','--reporter=json',`--outputFile=${prefix}.json`],{env:{...process.env,NO_COLOR:'1',AUDIT_TRACE_PATH:`${prefix}-trace.jsonl`,AUDIT_FINAL_PATH:`${prefix}-state.jsonl`},stdio:['ignore','pipe','pipe']});
 for(const output of [child.stdout,child.stderr])output.on('data',data=>appendFileSync(`${prefix}.log`,data));
 const exitCode=await new Promise(resolve=>child.on('close',resolve));
 const report=existsSync(prefix+'.json')?JSON.parse(readFileSync(prefix+'.json')):null;
 const row={...entry,started,ended:new Date().toISOString(),exitCode,passed:report?.numPassedTests,failed:report?.numFailedTests,skipped:report?.numPendingTests,failures:report?.testResults?.flatMap(s=>s.assertionResults.filter(a=>a.status==='failed').map(a=>({name:a.fullName,messages:a.failureMessages})))||[]};
 results.push(row);writeFileSync(`${root}/repeat-worker-${worker}.json`,JSON.stringify({head:'7649834c9e3c27f5eba07302bb30de2c30b73216',worker,emulator:process.env.FIRESTORE_EMULATOR_HOST,results},null,2)+'\n');
 console.log(worker,entry.id,'PASS',row.passed,'FAIL',row.failed,'exit',exitCode);
}
if(results.some(r=>r.exitCode!==0||r.passed!==r.expected))process.exitCode=1;
