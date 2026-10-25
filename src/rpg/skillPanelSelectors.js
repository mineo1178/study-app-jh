import { levelForTotalExp } from './levelSystem.js';
import { playerJobId } from './jobCatalog.js';
import { SKILL_PANEL_CATALOG, SKILL_PANEL_MAX_SP, PANEL_EFFECT_LIMITS, SKILL_PANEL_RULES_VERSION } from './skillPanelCatalog.js';
const fail = code => { throw Object.assign(new Error(code),{code}); };
const count = value => Number.isFinite(Number(value)) ? Math.max(0,Math.floor(Number(value))) : 0;
export function readSkillPanel(profile={}) {
 const state=profile.skillPanel===undefined?{unlockedNodeIds:[],revision:0}:profile.skillPanel;
 if(!state||!Array.isArray(state.unlockedNodeIds)||!Number.isSafeInteger(state.revision)||state.revision<0||new Set(state.unlockedNodeIds).size!==state.unlockedNodeIds.length||state.unlockedNodeIds.some(id=>typeof id!=='string'||id==='start'||!Object.hasOwn(SKILL_PANEL_CATALOG,id))) fail('INVALID_SKILL_PANEL_STATE');
 const reached=new Set(['start']),remaining=new Set(state.unlockedNodeIds);
 for(let changed=true;changed;){changed=false;for(const id of remaining){const node=SKILL_PANEL_CATALOG[id];if(node.neighbors.some(parent=>reached.has(parent))&&(node.requiresAll||[]).every(parent=>reached.has(parent))){reached.add(id);remaining.delete(id);changed=true;}}}
 if(remaining.size) fail('INVALID_SKILL_PANEL_STATE');
 return {unlockedNodeIds:[...state.unlockedNodeIds],revision:state.revision};
}
export function earnedSkillSp(profile={},progress={},towerProgress={}) {
 const level=levelForTotalExp(profile.totalExp||0);
 const campaign=new Set((progress.completedChapterIds||[]).filter(id=>['chapter_1','chapter_2'].includes(id))).size;
 const tower=Math.min(6,Math.floor(count(towerProgress.highestFloor)/10));
 const weeks=new Set((profile.weeklyBoss?.clearedWeekIds||[]).filter(id=>/^\d{4}-W\d{2}$/.test(id))).size;
 const weekly=Math.min(10,Math.max(count(profile.weeklyBoss?.totalClears),weeks));
 const sources={level:Math.max(0,level-1)*2,campaign:campaign*2,tower:tower*2,weekly};
 return {level,earned:Math.min(SKILL_PANEL_MAX_SP,Object.values(sources).reduce((sum,value)=>sum+value,0)),sources};
}
export function skillPanelStats(profile={},progress={},towerProgress={}) {
 const state=readSkillPanel(profile),sp=earnedSkillSp(profile,progress,towerProgress);
 const used=state.unlockedNodeIds.reduce((sum,id)=>sum+SKILL_PANEL_CATALOG[id].cost,0);
 return {...state,...sp,used,remaining:sp.earned-used};
}
export const skillPanelNodes = (profile={},scope='common') => Object.values(SKILL_PANEL_CATALOG).filter(node=>node.id==='start'||(scope==='job'?node.jobId===playerJobId(profile):!node.jobId));
export function panelNodeState(nodeId,profile={},progress={},towerProgress={}) {
 if(!Object.hasOwn(SKILL_PANEL_CATALOG,nodeId))return {status:'locked',visible:false,unlockable:false,reason:'不正なパネルです'};
 const node=SKILL_PANEL_CATALOG[nodeId],stats=skillPanelStats(profile,progress,towerProgress),owned=new Set(['start',...stats.unlockedNodeIds]);
 const visible=!node.secret||(node.requiresAll||[]).every(id=>owned.has(id));
 let reason='';
 if(owned.has(nodeId))reason='取得済みです';
 else if(profile.activeBattleId)reason='戦闘中は解放できません';
 else if(node.jobId&&node.jobId!==playerJobId(profile))reason='現在の職業の専用パネルではありません';
 else if(!visible)reason='指定された隣接パネルを両方取得すると公開されます';
 else if(!node.neighbors.some(id=>owned.has(id)))reason='隣接パネルを先に取得してください';
 else if(!(node.requiresAll||[]).every(id=>owned.has(id)))reason='必要な隣接パネルが不足しています';
 else if(stats.level<node.minLevel)reason='Lv'+node.minLevel+'が必要です';
 else if(stats.remaining<node.cost)reason='SP不足：必要'+node.cost+'／残り'+stats.remaining;
 return {status:owned.has(nodeId)?'owned':reason?'locked':'available',visible,unlockable:!reason,reason,node,stats};
}
export function skillPanelEffects(profile={}) {
 const state=readSkillPanel(profile),effects=Object.fromEntries(Object.keys(PANEL_EFFECT_LIMITS).map(key=>[key,0]));
 for(const id of state.unlockedNodeIds){const node=SKILL_PANEL_CATALOG[id];if(node.jobId&&node.jobId!==playerJobId(profile))continue;for(const [key,value]of Object.entries(node.effects))effects[key]+=value;}
 for(const key of Object.keys(effects))effects[key]=Math.min(PANEL_EFFECT_LIMITS[key],effects[key]);
 return effects;
}
export function applySkillPanelEffects(profile,snapshot) {
 const effects=skillPanelEffects(profile),state=readSkillPanel(profile);
 const skills=snapshot.skills.map(skill=>{const copy={...skill,mpCost:Math.max(1,skill.mpCost-effects.mpReduction)};
 if(skill.kind==='attack'){const specific=effects[{flame_slash:'flamePowerPercent',aqua_edge:'aquaPowerPercent',thunder_strike:'thunderPowerPercent'}[skill.id]]||0;const bonus=Math.min(25,specific+effects.skillPowerPercent+(skill.element&&skill.element!=='neutral'?effects.elementPowerPercent:0));copy.powerPercent=Math.floor(skill.powerPercent*(100+bonus)/100);}
 if(skill.kind==='heal')copy.healPercent=Math.min(60,Math.floor(skill.healPercent*(100+effects.healPowerPercent)/100));
 if(skill.kind==='guard')copy.damageReductionPercent=Math.min(80,skill.damageReductionPercent+effects.guardPoints);
 return copy;});
 return {...snapshot,maxHp:snapshot.maxHp+effects.maxHp,maxMp:snapshot.maxMp+effects.maxMp,attack:snapshot.attack+effects.attack,defense:snapshot.defense+effects.defense,skills,skillPanelSnapshot:{rulesVersion:SKILL_PANEL_RULES_VERSION,revision:state.revision,unlockedNodeIds:state.unlockedNodeIds,effects}};
}
