import { describe, expect, it } from 'vitest';
import { calculateStudyReward, isStudySessionRewardEligible } from './rewardCalculator.js';
import { REWARD_POLICY_VERSION, LEGACY_REWARD_POLICY_VERSION } from './rewardConfig.js';
import { buildActiveTimer, buildFinishedTimerSession, buildStaleTimerInvalidSession } from '../data/activeTimerRepository.js';
import { prepareRewardCorrection, preparePendingRewardCorrectionRetry } from '../data/rewardCorrectionRepository.js';
import { prepareStudyRewardReversal, prepareCanonicalStudySessionReward } from '../data/rewardLedgerRepository.js';
const policies=[[LEGACY_REWARD_POLICY_VERSION,1],[REWARD_POLICY_VERSION,100]];
const session=(policy,seconds=3600)=>({id:'policy',recordedSeconds:seconds,rewardPolicyVersion:policy,validation:{status:'valid',reasonCodes:[]},taskSnapshot:{subjectId:'s_math',activityType:'problem_solving'}});
const ledger=policy=>({studySessionId:'policy',rewardPolicyVersion:policy,status:'applied',rewards:calculateStudyReward(session(policy))});
const profile=()=>({gold:10000,battleEnergy:10,materials:{iron:10},custom:{keep:true}});
const correction={correctionId:'shorten',recordedSeconds:1200,validation:{status:'valid'},reason:'test'};
describe.each(policies)('reward policy %s', (policy,rate)=>{
  it.each([[59,0],[60,1],[90,1],[120,2],[600,10],[1800,30],[3600,60]])('%s seconds grants exactly %s complete minutes', (seconds,minutes)=>{
    expect(calculateStudyReward(session(policy,seconds))).toEqual({gold:minutes*rate,battleEnergy:Math.floor(seconds/900),material:{key:'iron',quantity:Math.floor(seconds/600)}});
    expect(isStudySessionRewardEligible(session(policy,seconds))).toBe(true);
  });
  it.each(['invalid','pending_review','pending'])('never rewards %s validation',status=>expect(prepareCanonicalStudySessionReward({...session(policy),validation:{status}}).eligible).toBe(false));
  it('corrects using captured ledger policy even if a caller provides a different session policy',()=>{
    const original=ledger(policy),change=prepareRewardCorrection({session:session(policy===REWARD_POLICY_VERSION?LEGACY_REWARD_POLICY_VERSION:REWARD_POLICY_VERSION),ledger:original,profile:profile(),correction,reviewerUid:'reviewer',now:1});
    expect(change.result.deduction.gold).toBe(40*rate);expect(change.ledger.rewards).toEqual(original.rewards);expect(change.ledger.effectiveRewards.gold).toBe(20*rate);expect(change.adjustment.rewardPolicyVersion).toBe(policy);
    const reversed=prepareStudyRewardReversal(change.ledger,change.profile,2);expect(reversed.profilePatch.gold).toBe(10000-60*rate);expect(reversed.ledgerPatch.reversal.rewards.gold).toBe(20*rate);
    expect(prepareStudyRewardReversal({...change.ledger,...reversed.ledgerPatch},change.profile,3)).toEqual({reversed:false,reason:'ALREADY_REVERSED'});
  });
  it('keeps insufficient corrections pending and retries the captured deduction without recalculation',()=>{
    const original=ledger(policy),pending=prepareRewardCorrection({session:session(policy),ledger:original,profile:{...profile(),gold:0},correction,reviewerUid:'reviewer',now:1});
    expect(pending.result.status).toBe('pending');expect(pending.ledger.rewards).toEqual(original.rewards);
    expect(()=>prepareStudyRewardReversal(pending.ledger,profile(),2)).toThrow('REWARD_CORRECTION_PENDING');
    const args={sessionId:'policy',ledger:pending.ledger,adjustment:pending.adjustment,profile:profile(),integrity:pending.integrity,reviewerUid:'reviewer',now:3};
    expect(preparePendingRewardCorrectionRetry({...args,profile:{...profile(),gold:0}}).applied).toBe(false);
    const retry=preparePendingRewardCorrectionRetry(args);expect(retry.applied).toBe(true);expect(retry.profile.gold).toBe(10000-40*rate);expect(retry.ledger.effectiveRewards.gold).toBe(20*rate);expect(retry.ledger.rewards).toEqual(original.rewards);
  });
});
describe('policy rollover and old data',()=>{
  const task={id:'math',subjectId:'s_math',activityType:'problem_solving'};
  it('captures v2 at start and retains v1 on old in-progress timers across version upgrades',()=>{
    const timer=buildActiveTimer({task,timerId:'rollover',ownerClientId:'a',now:1000000});expect(timer.rewardPolicyVersion).toBe(REWARD_POLICY_VERSION);
    for(const policy of [undefined,LEGACY_REWARD_POLICY_VERSION,REWARD_POLICY_VERSION]) {
      const saved=JSON.parse(JSON.stringify({...timer,rewardPolicyVersion:policy}));
      const finished=buildFinishedTimerSession(saved,task,{endAt:2800000,staleProof:null});
      expect(finished.rewardPolicyVersion).toBe(policy||LEGACY_REWARD_POLICY_VERSION);expect(finished.recordedSeconds).toBe(1800);
      expect(calculateStudyReward(finished).gold).toBe(policy===REWARD_POLICY_VERSION?3000:30);
      const invalid=buildStaleTimerInvalidSession(saved,task,2800000);expect(invalid.rewardPolicyVersion).toBe(policy||LEGACY_REWARD_POLICY_VERSION);expect(isStudySessionRewardEligible(invalid)).toBe(false);
    }
  });
  it('never rewards missing or unknown policy or migrated sessions',()=>{
    for(const patch of [{rewardPolicyVersion:undefined},{rewardPolicyVersion:'unknown'},{legacySource:{taskId:'old'}},{recordedSeconds:0}])expect(isStudySessionRewardEligible({...session(REWARD_POLICY_VERSION),...patch})).toBe(false);
    expect(()=>calculateStudyReward(session('unknown'))).toThrow('UNSUPPORTED_REWARD_POLICY');
  });
  it('keeps raw historical calculations without policy at v1',()=>expect(calculateStudyReward({recordedSeconds:1800}).gold).toBe(30));
  it('allows zero material cancellation without adding unrelated profile fields',()=>{
    const entry=ledger(LEGACY_REWARD_POLICY_VERSION);entry.rewards=calculateStudyReward(session(LEGACY_REWARD_POLICY_VERSION,60));const change=prepareStudyRewardReversal(entry,{gold:1,battleEnergy:0},1);expect(change.profilePatch).toMatchObject({gold:0,battleEnergy:0,'materials.iron':0});
    expect(()=>prepareStudyRewardReversal(entry,{gold:0,battleEnergy:0},1)).toThrow('REWARD_PROFILE_INCONSISTENT');
  });
});
