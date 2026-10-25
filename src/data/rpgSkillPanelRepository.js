import { runTransaction } from 'firebase/firestore';
import { playerProfileRef } from './rewardLedgerRepository.js';
import { rpgProgressRef } from './rpgProgressRepository.js';
import { rpgTowerProgressRef } from './rpgTowerProgressRepository.js';
import { rpgActionLedgerRef, RPG_ACTION_LEDGER_SCHEMA_VERSION } from './rpgShopRepository.js';
import { rewardIntegrityRef, assertNoPendingRewardCorrections } from './rewardCorrectionRepository.js';
import { SKILL_PANEL_CATALOG, SKILL_PANEL_RESET_GOLD } from '../rpg/skillPanelCatalog.js';
import { skillPanelStats, panelNodeState } from '../rpg/skillPanelSelectors.js';
import { playerJobId } from '../rpg/jobCatalog.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function prepareSkillPanelAction({profile={},progress={},towerProgress={},nodeId,kind='unlock',expectedRevision,expectedJobId,actionId,now}) {
 if(!['unlock','reset'].includes(kind))fail('INVALID_PANEL_ACTION');
 if(profile.activeBattleId)fail('PANEL_CHANGE_DURING_BATTLE');
 const stats=skillPanelStats(profile,progress,towerProgress);
 if(expectedRevision!==stats.revision||expectedJobId!==playerJobId(profile))fail('PANEL_PROFILE_CHANGED');
 let unlockedNodeIds,cost=0;
 if(kind==='reset') {if(!stats.unlockedNodeIds.length)fail('PANEL_EMPTY');cost=SKILL_PANEL_RESET_GOLD;if(!Number.isFinite(profile.gold)||profile.gold<cost)fail('INSUFFICIENT_GOLD');unlockedNodeIds=[];}
 else {
  if(typeof nodeId!=='string'||nodeId==='start'||!Object.hasOwn(SKILL_PANEL_CATALOG,nodeId))fail('INVALID_PANEL_NODE');
  const state=panelNodeState(nodeId,profile,progress,towerProgress);
  if(state.status==='owned')fail('PANEL_ALREADY_UNLOCKED');
  if(!state.unlockable)fail('PANEL_NOT_AVAILABLE');
  unlockedNodeIds=[...stats.unlockedNodeIds,nodeId];
 }
 const patch={skillPanel:{...(profile.skillPanel||{}),unlockedNodeIds,revision:stats.revision+1},...(cost?{gold:profile.gold-cost}:{}),updatedAt:now};
 return {patch,profile:{...profile,...patch},ledger:{schemaVersion:RPG_ACTION_LEDGER_SCHEMA_VERSION,actionId,type:kind==='reset'?'skill_panel_reset':'skill_panel_unlock',status:'applied',...(nodeId?{nodeId}:{}),beforeNodeIds:stats.unlockedNodeIds,afterNodeIds:unlockedNodeIds,revision:stats.revision+1,spCost:kind==='unlock'?SKILL_PANEL_CATALOG[nodeId].cost:0,cost:{gold:cost},appliedAt:now}};
}
export async function saveSkillPanel({db,familyId,actionId,nodeId,kind='unlock',expectedRevision,expectedJobId}) {
 if(typeof actionId!=='string'||!actionId||actionId.includes('/'))fail('INVALID_ACTION_ID');
 const profileRef=playerProfileRef(db,familyId),progressRef=rpgProgressRef(db,familyId),towerRef=rpgTowerProgressRef(db,familyId),ledgerRef=rpgActionLedgerRef(db,familyId,actionId),integrityRef=rewardIntegrityRef(db,familyId),now=Date.now();
 return runTransaction(db,async transaction=>{
  const [profile,progress,tower,ledger,integrity]=await Promise.all([transaction.get(profileRef),transaction.get(progressRef),transaction.get(towerRef),transaction.get(ledgerRef),transaction.get(integrityRef)]);
  if(ledger.exists())return {applied:false,reason:'ALREADY_APPLIED'};
  const change=prepareSkillPanelAction({profile:profile.exists()?profile.data():{},progress:progress.exists()?progress.data():{},towerProgress:tower.exists()?tower.data():{},nodeId,kind,expectedRevision,expectedJobId,actionId,now});
  if(change.ledger.cost.gold)assertNoPendingRewardCorrections(integrity.exists()?integrity.data():{});
  transaction.set(profileRef,change.patch,{merge:true});transaction.set(ledgerRef,change.ledger);
  return {applied:true,profile:change.profile};
 });
}
