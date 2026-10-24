import { battleMpCost, hasMpRules } from './statAllocation.js';
import { normalizePlayerProfile } from './playerProfile.js';
import { ELEMENT_LABELS } from './elementConfig.js';
export const battleEnergyState = (profile, enemy) => { const energy = Number(normalizePlayerProfile(profile || {}).battleEnergy) || 0; const required = Number(enemy?.energyCost) || 0; return { energy, required, sufficient: energy >= required }; };
export const battleHpPercent = (battle) => { const maxHp = Number(battle?.enemySnapshot?.maxHp) || 0; return maxHp ? Math.max(0, Math.min(100, ((Number(battle?.enemyHp) || 0) / maxHp) * 100)) : 0; };
export const battleIsActive = (battle) => battle?.status === 'active';
export const canUseBattleActions = (battle, pending = false) => {
  if (pending || !battleIsActive(battle)) return false;
  if (!(Number(battle?.schemaVersion) >= 8)) return Number(battle?.playerHp) > 0 && Number(battle?.enemyHp) > 0;
  const actor = (battle?.partyStates || []).find((state) => state.memberId === battle?.activePartyMemberId);
  return actor?.status === 'active' && (battle?.enemyStates || []).some((state) => state.status === 'active');
};
export const resolvePartyBattleSelection = (battle, enemyId, allyId) => {
  const activeEnemyIds = (battle?.enemyStates || []).filter((state) => state.status === 'active').map((state) => state.enemyInstanceId);
  const activeAllyIds = (battle?.partyStates || []).filter((state) => state.status === 'active').map((state) => state.memberId);
  const activeActorId = activeAllyIds.includes(battle?.activePartyMemberId) ? battle.activePartyMemberId : null;
  return {
    enemyId: activeEnemyIds.includes(enemyId) ? enemyId : activeEnemyIds[0] || null,
    allyId: activeAllyIds.includes(allyId) ? allyId : activeActorId || activeAllyIds[0] || null,
  };
};
export const battleHeadingLabel = (battle) => battle?.battleKind === 'boss' ? 'BOSS BATTLE' : 'BATTLE';
export const getRemainingSkillUses = (skill, used) => Math.max(0, Math.max(0, Number(skill?.maxUses) || 0) - Math.max(0, Number(used) || 0));
export const getBattleSkillEntries = (battle) => Object.values(battle?.playerSnapshot?.skills || {});
export const buildBattleTurnFeedback = (result, enemyName = '敵') => { if (!result) return null; const lines = [result.skill?.name || '通常攻撃']; if (result.skill?.kind === 'heal') lines.push(`HPを${result.healing?.actualHeal || 0}回復した！`); else if (result.skill?.kind === 'guard') lines.push(`ダメージを${result.guard?.reductionPercent || 0}%軽減！`); else { if (result.elementResult?.type === 'weak') lines.push('弱点を突いた！'); if (result.elementResult?.type === 'resist') lines.push('効果はいまひとつ'); lines.push(`${result.damage} DAMAGE`); } if (result.outcome === 'won') lines.push('敵を倒した！'); else if (result.enemyCounter) { lines.push(`${enemyName}の${result.enemyCounter.actionName || '通常攻撃'}！`); lines.push(`${result.enemyCounter.damage} DAMAGE`); } return lines; };

export const skillTargetLabel = (skill, party = false) => ({ single_enemy: '選択中の敵1体', all_enemies: '生存している敵全体', self: '自分', single_ally: '選択中の仲間1人', all_allies: '生存している仲間全体' }[skill.targetType] || (party ? '対象不明' : skill.kind === 'heal' || skill.kind === 'guard' ? '自分' : '敵1体'));
export const battleSkillDescription = (skill) => skill.kind === 'heal'
  ? `対象の最大HPの${Number(skill.healPercent) || 0}%を回復`
  : skill.kind === 'guard'
    ? `受けるダメージを${Number(skill.damageReductionPercent) || 0}%軽減`
    : `${ELEMENT_LABELS[skill.element] || '無'}属性で攻撃・威力${Number(skill.powerPercent) || 0}%`;

export function battleSkillAvailability(battle, skill, selected = {}, pending = false) {
  const party = Number(battle.schemaVersion) >= 8;
  const key = party ? `${battle.activePartyMemberId}:${skill.id}` : skill.id;
  const remaining = getRemainingSkillUses(skill, battle.skillUses?.[key]);
  let reason = '';
  if (pending) reason = '行動を処理中です';
  else if (!canUseBattleActions(battle)) reason = '現在は行動できません';
  else if (!remaining) reason = '使用回数を使い切りました';
  else if (hasMpRules(battle) && (!party || battle.activePartyMemberId === 'hero') && battle.playerMp < battleMpCost(battle, skill)) reason = 'MPが不足しています';
  else if (party) {
    const target = skill.targetType;
    const enemies = battle.enemyStates || [];
    const allies = battle.partyStates || [];
    const targets = target === 'all_allies' ? allies.filter(state => state.status === 'active') : allies.filter(state => state.memberId === selected.allyId && state.status === 'active');
    if (!['single_enemy', 'all_enemies', 'self', 'single_ally', 'all_allies'].includes(target)) reason = '対象を確認できません';
    else if (target === 'single_enemy' && !enemies.some(state => state.enemyInstanceId === selected.enemyId && state.status === 'active') || target === 'all_enemies' && !enemies.some(state => state.status === 'active')) reason = '攻撃できる敵がいません';
    else if (['single_ally', 'all_allies'].includes(target)) {
      if (!targets.length) reason = '回復できる仲間がいません';
      else if (targets.every(state => state.hp >= battle.partySnapshot.members.find(member => member.memberId === state.memberId)?.maxHp)) reason = '対象のHPは満タンです';
    }
  } else if (skill.kind === 'heal' && battle.playerHp >= battle.playerSnapshot?.maxHp) reason = 'HPは満タンです';
  return { remaining, reason, available: !reason };
}

export function battleDefeatHints(battle) {
  const party = Number(battle?.schemaVersion) >= 8;
  const skills = party ? (battle.partySnapshot?.members || []).flatMap(member => member.skills || []) : getBattleSkillEntries(battle);
  const hints = [];
  if (skills.some(skill => skill.kind === 'heal' && Number(skill.maxUses) > 0)) hints.push('HPが減ったら、回復スキルと残り使用回数を確認してみよう。');
  if (skills.some(skill => skill.kind === 'guard' && Number(skill.maxUses) > 0)) hints.push(party ? '防御は敵の反撃中のダメージを軽減します。仲間の行動順も確認してみよう。' : '防御を使うと、その行動に続く敵の反撃ダメージを軽減できます。');
  if ((party ? battle.enemySnapshots : [battle.enemySnapshot])?.some(enemy => enemy?.weaknesses?.length) && skills.some(skill => skill.kind === 'attack')) hints.push('敵の弱点と、攻撃スキルの属性を確認してみよう。');
  hints.push('装備やレベルを強化して、再挑戦できます。');
  return hints;
}

// Values below come from the committed transaction's calculations, never predictions.
export function buildBattleActionFeedback(response, before) {
  if (!response?.applied) return null;
  const result = response.result || response;
  if (!result.event) return buildBattleTurnFeedback({ ...result, outcome: response.victory ? 'won' : response.defeat ? 'lost' : result.outcome }, before?.enemySnapshot?.name);
  const memberName = id => before.partySnapshot.members.find(member => member.memberId === id)?.name || '仲間';
  const enemyName = id => before.enemySnapshots.find(enemy => enemy.enemyInstanceId === id)?.name || '敵';
  const actor = before.partySnapshot.members.find(member => member.memberId === result.event.actorId);
  const skill = actor?.skills?.find(item => item.id === result.event.skillId);
  const lines = [`${actor?.name || '仲間'}：${skill?.name || '通常攻撃'}`];
  for (const effect of result.actionEffects || []) {
    if (effect.kind === 'attack') lines.push(`${enemyName(effect.targetId)}に${effect.damage}ダメージ${effect.defeated ? '・撃破！' : ''}`);
    if (effect.kind === 'heal') lines.push(`${memberName(effect.targetId)}のHPを${effect.actualHeal}回復`);
    if (effect.kind === 'guard') lines.push(`${memberName(effect.targetId)}は防御・被ダメージ${effect.guardPercent}%軽減`);
  }
  for (const event of result.enemyEvents || []) {
    const guarded = before.partyStates.find(state => state.memberId === event.targetMemberId)?.guardPercent > 0 || result.actionEffects?.some(effect => effect.kind === 'guard' && effect.targetId === event.targetMemberId && effect.guardPercent > 0);
    lines.push(`${enemyName(event.enemyInstanceId)}の反撃：${memberName(event.targetMemberId)}に${event.damage}ダメージ${guarded ? '（防御効果あり）' : ''}`);
  }
  if (result.battle.status === 'won') lines.push('勝利！');
  if (result.battle.status === 'lost') lines.push('敗北。次の戦いに向けて戦略を見直そう。');
  return lines;
}
