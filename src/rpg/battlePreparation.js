import { COMPANION_GROWTH_RULES_VERSION } from './companionGrowthCatalog.js';
import { SKILL_RULES_VERSION } from './skillRules.js';
import { heroJobSnapshot } from './jobStats.js';
import { JOB_RULES_VERSION } from './jobCatalog.js';
import { normalizePlayerProfile } from './playerProfile.js';
import { buildTowerPartySnapshot, validatePartyMemberIds } from './partyMemberCatalog.js';


import { EQUIPMENT_CATALOG, EQUIPMENT_SLOTS } from './equipmentCatalog.js';
import { getEnemyCatalogItem } from './enemyCatalog.js';
import { getBoss } from './bossCatalog.js';
import { buildTowerEncounter } from './towerCatalog.js';
import { normalizeTowerProgress } from './towerProgress.js';
import { getWeeklyBossDefinition } from './weeklyBossCatalog.js';
import { battleEnergyState } from './battleUiLogic.js';

export const playerStats = profile => { const { maxHp, attack, defense } = heroJobSnapshot(profile); return { maxHp, attack, defense }; };

export function equipmentPreview(profile, slot, itemId) {
  const safe = normalizePlayerProfile(profile || {});
  if (!EQUIPMENT_SLOTS.includes(slot)) return null;
  if (itemId && (!safe.ownedEquipment[itemId] || EQUIPMENT_CATALOG[itemId]?.slot !== slot)) return null;
  const candidate = { ...safe, equipped: { ...safe.equipped, [slot]: itemId || null } };
  return { before: playerStats(safe), after: playerStats(candidate) };
}

export function partyPreview(profile, ids) {
  const safe = normalizePlayerProfile(profile || {});
  validatePartyMemberIds(ids, safe.unlockedPartyMemberIds);
  return buildTowerPartySnapshot({ ...safe, partyMemberIds: ids }, { skillRulesVersion: SKILL_RULES_VERSION, jobRulesVersion: JOB_RULES_VERSION, companionGrowthRulesVersion: COMPANION_GROWTH_RULES_VERSION });
}

export function partySummary(members) {
  const skills = members.flatMap(member => member.skills || []);
  return {
    maxHp: members.reduce((sum, member) => sum + member.maxHp, 0),
    attack: members.reduce((sum, member) => sum + member.attack, 0),
    heal: skills.some(skill => skill.kind === 'heal' && skill.maxUses > 0),
    guard: skills.some(skill => skill.kind === 'guard' && skill.maxUses > 0),
    area: skills.some(skill => skill.kind === 'attack' && skill.targetType === 'all_enemies' && skill.maxUses > 0),
    elements: [...new Set(skills.filter(skill => skill.kind === 'attack' && skill.maxUses > 0).map(skill => skill.element).filter(element => element && element !== 'neutral'))],
  };
}

export function preparationHints({ solo, members, equipment, affinities }) {
  const hints = [];
  if (solo) hints.push('この戦闘では主人公だけが参加します。');
  if (!partySummary(members).heal) hints.push('回復スキルがありません。長期戦では回復スキルも役立ちます。');
  if (equipment.some(entry => !entry.item)) hints.push('装備していない部位があります。所持装備を確認できます。');
  if (affinities.some(enemy => enemy.weaknesses.some(entry => entry.available))) hints.push('敵の弱点を突けるスキルがあります。対象と属性を確認しましょう。');
  return hints.slice(0, 3);
}

export function enemySkillAffinities(enemies, members) {
  const elements = partySummary(members).elements;
  return enemies.map(enemy => ({
    name: enemy.name,
    weaknesses: (enemy.weaknesses || []).map(element => ({ element, available: elements.includes(element) })),
    resistances: enemy.resistances || [],
  }));
}

export const partyRoleLabel = role => ({ Attacker: '攻撃役', Guardian: '防御役', Mage: '魔法攻撃役', Healer: '回復役' }[role] || role);

export function refreshWeeklyBattleCandidate(candidate, timestamp) {
  if (!candidate?.isWeekly) return candidate;
  const boss = getWeeklyBossDefinition(timestamp);
  return candidate.weekId === boss.weekId ? candidate : { ...candidate, weekId: boss.weekId, name: boss.name, energyCost: boss.energyCost };
}

// Preview only. The existing start transaction reads the latest profile and encounter.
export function buildBattlePreparation({ profile, candidate, towerProgress }) {
  if (!candidate) return null;
  if (candidate.isWeekly && !candidate.weekId) return null;
  const safe = normalizePlayerProfile(profile || {});
  const solo = !candidate.isTower && !candidate.isWeekly;
  const encounter = candidate.isTower ? buildTowerEncounter({ floor: normalizeTowerProgress(towerProgress).currentFloor }) : null;
  const target = candidate.isWeekly ? getWeeklyBossDefinition(candidate.weekId) : candidate.isBoss ? getBoss(candidate.id) : getEnemyCatalogItem(candidate.id);
  const enemies = encounter?.enemies || (target ? [target] : []);
  if (!enemies.length) return null;
  const members = solo ? [{ memberId: 'hero', name: '主人公', role: 'バランス型', ...heroJobSnapshot(safe) }] : buildTowerPartySnapshot(safe, { skillRulesVersion: SKILL_RULES_VERSION, jobRulesVersion: JOB_RULES_VERSION, companionGrowthRulesVersion: COMPANION_GROWTH_RULES_VERSION });
  const affinities = enemySkillAffinities(enemies, members);
  const equipment = EQUIPMENT_SLOTS.map(slot => {
    const item = EQUIPMENT_CATALOG[safe.equipped[slot]];
    return { slot, item: item?.slot === slot && safe.ownedEquipment[item.id] ? item : null };
  });
  const energy = battleEnergyState(safe, encounter || target);
  const data = { solo, members, equipment, enemies, affinities, energy, isBoss: Boolean(encounter?.boss || candidate.isBoss || candidate.isWeekly), name: encounter ? `無限の塔 ${encounter.floor}F` : target.name };
  return { ...data, hints: preparationHints(data), blocked: Boolean(safe.activeBattleId) };
}
