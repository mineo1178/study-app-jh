/* global process */
import { readFileSync, appendFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { trace } from './transactionTrace.js';
import { buildActiveTimer, buildFinishedTimerSession } from '../../../src/data/activeTimerRepository.js';
import { applyStudySessionReward } from '../../../src/data/rewardLedgerRepository.js';
import { correctStudySessionReward, retryPendingRewardCorrection } from '../../../src/data/rewardCorrectionRepository.js';

let env;
const familyId='oomine-study-2026',sessionId='audit-session';
const path=(collection,id)=>['families',familyId,'apps','junior-high',collection,id];
const profilePath=path('rpg','playerProfile'), ledgerPath=path('rewardLedger',sessionId), integrityPath=path('rewardIntegrity','current');
const dbFor=uid=>env.authenticatedContext(uid).firestore();
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
beforeAll(async()=>{if(!/^127\.0\.0\.1:(8087|8088|8089)$/.test(process.env.FIRESTORE_EMULATOR_HOST || ''))throw Error('ISOLATED_AUDIT_EMULATOR_REQUIRED');env=await initializeTestEnvironment({projectId:'demo-study-app-jh',firestore:{host:'127.0.0.1',port:Number(process.env.FIRESTORE_EMULATOR_HOST.split(':')[1]),rules:readFileSync('firestore.rules','utf8')}});});
beforeEach(async()=>{trace.hooks=null;await env.clearFirestore();trace.operations.length=0;});
afterAll(async()=>{trace.hooks=null;await env.cleanup();});
async function seed(policy,rate){
 const task={id:'math',subjectId:'s_math',activityType:'problem_solving'};
 const session={...buildFinishedTimerSession({...buildActiveTimer({task,timerId:sessionId,ownerClientId:'audit-a',now:1000000}),rewardPolicyVersion:policy},task,{endAt:4600000,staleProof:null}),id:sessionId};
 await env.withSecurityRulesDisabled(async context=>setDoc(doc(context.firestore(),...path('studySessions',sessionId)),session));
 const db=dbFor('audit-a'),args={db,familyId,sessionId,reviewerUid:'audit-reviewer'};
 await applyStudySessionReward({db,familyId,session});
 await updateDoc(doc(db,...profilePath),{gold:0});
 const correction={correctionId:'audit-correction',recordedSeconds:1200,validation:{status:'valid'}};
 const pending=await correctStudySessionReward({...args,correction});
 expect(pending.status).toBe('pending');
 await updateDoc(doc(db,...profilePath),{gold:40*rate});
 return {args,correction,pending};
}
async function verifyFinal(args,pending,rate){
 const saved=(await getDoc(doc(args.db,...profilePath))).data(),ledger=(await getDoc(doc(args.db,...ledgerPath))).data();
 const adjustment=(await getDoc(doc(args.db,...path('rewardAdjustmentLedger',pending.adjustmentId)))).data();
 const integrity=(await getDoc(doc(args.db,...integrityPath))).data();
 const session=(await getDoc(doc(args.db,...path('studySessions',sessionId)))).data();
 expect(saved.gold).toBe(0);
 expect(ledger).toMatchObject({revision:1,correctionStatus:'applied',lastCorrectionId:'audit-correction',pendingCorrection:null,rewards:{gold:60*rate},effectiveRewards:{gold:20*rate}});
 expect(adjustment).toMatchObject({adjustmentId:pending.adjustmentId,revision:1,status:'applied',deduction:{gold:40*rate}});
 expect(integrity.pendingSessionIds).toEqual([]);
 expect(session.recordedSeconds).toBe(1200);
 if (process.env.AUDIT_FINAL_PATH) appendFileSync(process.env.AUDIT_FINAL_PATH,JSON.stringify({policy:ledger.rewardPolicyVersion,profile:saved,ledger,adjustment,integrity,session})+'\n');
 expect((await retryPendingRewardCorrection(args)).reason).toBe('NO_PENDING_CORRECTION');
 expect((await getDoc(doc(args.db,...profilePath))).data().gold).toBe(0);
 expect((await correctStudySessionReward({...args,correction:{correctionId:'audit-correction',recordedSeconds:1200,validation:{status:'valid'}}})).reason).toBe('ALREADY_APPLIED');
}
describe.each([['rpg-reward-v1',1],['rpg-reward-v2',100]])('real SDK read interleavings %s',(policy,rate)=>{
 it('retries read skew through SDK version validation, with one deduction',async()=>{
  const {args,pending}=await seed(policy,rate),reached=deferred(),release=deferred();
  const slowId=trace.nextId+1;
  trace.hooks={beforeGet:async event=>{if(event.id===slowId&&event.path.includes('/rewardAdjustmentLedger/')){reached.resolve();await release.promise;}}};
  const slow=retryPendingRewardCorrection(args).then(value=>({value}),error=>({error}));
  await reached.promise;
  const fast=await retryPendingRewardCorrection({...args,db:dbFor('audit-b')});
  expect(fast.applied).toBe(true);
  release.resolve();
  const result=await slow;trace.hooks=null;
  expect(result.error).toBeUndefined();
  expect(result.value.reason).toBe('NO_PENDING_CORRECTION');
  expect(trace.operations.find(op=>op.id===slowId).attempts).toBeGreaterThanOrEqual(2);
  await verifyFinal(args,pending,rate);
 });
 it('lets SDK commit validation retry when both reads happened before the competing commit',async()=>{
  const {args,pending}=await seed(policy,rate),reached=deferred(),release=deferred();
  const slowId=trace.nextId+1;
  trace.hooks={afterGet:async event=>{if(event.id===slowId&&event.attempt===1&&event.path.includes('/rewardAdjustmentLedger/')){reached.resolve();await release.promise;}}};
  const slow=retryPendingRewardCorrection(args);
  await reached.promise;
  expect((await retryPendingRewardCorrection({...args,db:dbFor('audit-b')})).applied).toBe(true);
  release.resolve();
  const result=await slow;trace.hooks=null;
  expect(result.reason).toBe('NO_PENDING_CORRECTION');
  expect(trace.operations.find(op=>op.id===slowId).attempts).toBeGreaterThanOrEqual(2);
  await verifyFinal(args,pending,rate);
 });
 it('preserves genuine inconsistent-record errors without retrying or deducting',async()=>{
  const {args,pending}=await seed(policy,rate);
  await updateDoc(doc(args.db,...path('rewardAdjustmentLedger',pending.adjustmentId)),{status:'applied'});
  const operationId=trace.nextId+1;
  await expect(retryPendingRewardCorrection(args)).rejects.toThrow('PENDING_CORRECTION_INVALID');
  expect(trace.operations.find(op=>op.id===operationId).attempts).toBe(1);
  expect((await getDoc(doc(args.db,...profilePath))).data().gold).toBe(40*rate);
  expect((await getDoc(doc(args.db,...ledgerPath))).data()).toMatchObject({revision:1,correctionStatus:'reversal_pending',pendingCorrection:{adjustmentId:pending.adjustmentId}});
 });
 it('settles eight concurrent retries once and preserves replay identity',async()=>{
  const {args,pending}=await seed(policy,rate);
  const results=await Promise.all(Array.from({length:8},(_,i)=>retryPendingRewardCorrection({...args,db:dbFor('audit-parallel-'+i)})));
  expect(results.filter(r=>r.applied)).toHaveLength(1);
  expect(results.filter(r=>r.reason==='NO_PENDING_CORRECTION')).toHaveLength(7);
  await verifyFinal(args,pending,rate);
 });

});
