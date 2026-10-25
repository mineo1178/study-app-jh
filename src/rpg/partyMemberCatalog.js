import { applyCompanionGrowth } from './companionGrowthSelectors.js';
import { COMPANION_GROWTH_RULES_VERSION } from './companionGrowthCatalog.js';
import { heroJobSnapshot } from './jobStats.js';
import { JOB_RULES_VERSION } from './jobCatalog.js';
import { calculatePlayerAttack, calculatePlayerDefense, BASE_PLAYER_MAX_HP } from './battleCalculator.js';
import { statAllocationStats, SKILL_MP_COSTS } from './statAllocation.js';
import { hasUnlimitedSkills, COMPANION_MAX_MP, COMPANION_SKILL_MP_COSTS } from './skillRules.js';
import { SKILL_CATALOG } from './skillCatalog.js';
import { GACHA_MEMBERS } from './gachaCatalog.js';

export const PARTY_MEMBER_CATALOG = Object.freeze({
  hero: { id: 'hero', name: '主人公', role: 'バランス型', tendency: 'バランス', skillIds: ['flame_slash', 'aqua_edge', 'thunder_strike', 'healing_light', 'guard_stance'] },
  guardian: { id: 'guardian', name: '守護戦士', role: '高HP・高防御', tendency: 'HP・防御', skillIds: ['guardian_wall'] },
  mage: { id: 'mage', name: '魔導士', role: '全体攻撃', tendency: '攻撃', skillIds: ['firestorm'] },
  healer: { id: 'healer', name: '僧侶', role: '回復', tendency: '回復', skillIds: ['healing_prayer'] },
  ...Object.fromEntries(Object.values(GACHA_MEMBERS).map((member) => [member.id, { ...member, tendency: `${member.rarity} ${member.element}属性` }])),
});

export const PARTY_SKILLS = Object.freeze({
  guardian_wall: { id: 'guardian_wall', name: '守護の壁', kind: 'guard', targetType: 'self', damageReductionPercent: 60, maxUses: 2 },
  firestorm: { id: 'firestorm', name: 'ファイアストーム', kind: 'attack', targetType: 'all_enemies', element: 'fire', powerPercent: 90, maxUses: 2 },
  healing_prayer: { id: 'healing_prayer', name: 'ヒーリングプレア', kind: 'heal', targetType: 'all_allies', healPercent: 20, maxUses: 2 },
});

export const partySkill = (id) => PARTY_SKILLS[id] || SKILL_CATALOG[id] || null;
export function validatePartyMemberIds(ids, unlockedIds = null) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 3) throw Object.assign(new Error('INVALID_PARTY_SIZE'), { code: 'INVALID_PARTY_SIZE' });
  if (!ids.includes('hero')) throw Object.assign(new Error('HERO_REQUIRED'), { code: 'HERO_REQUIRED' });
  if (new Set(ids).size !== ids.length) throw Object.assign(new Error('DUPLICATE_PARTY_MEMBER'), { code: 'DUPLICATE_PARTY_MEMBER' });
  if (ids.some((id) => !PARTY_MEMBER_CATALOG[id])) throw Object.assign(new Error('UNKNOWN_PARTY_MEMBER'), { code: 'UNKNOWN_PARTY_MEMBER' });
  if (Array.isArray(unlockedIds) && ids.some((id) => !unlockedIds.includes(id))) throw Object.assign(new Error('PARTY_MEMBER_LOCKED'), { code: 'PARTY_MEMBER_LOCKED' });
  return [...ids];
}
const integer = (value) => Math.max(0, Math.floor(Number(value) || 0));
const roleForMember = (memberId, member) => ({ guardian: 'Guardian', mage: 'Mage', healer: 'Healer' }[memberId] || member.role);
export function buildTowerPartySnapshot(profile, rules = {}) {
  const ids = validatePartyMemberIds(profile.partyMemberIds, profile.unlockedPartyMemberIds);
  const level = Math.max(1, integer(profile.level) || 1);
  const hero = {
    maxHp: BASE_PLAYER_MAX_HP + 2 * (level - 1),
    attack: calculatePlayerAttack(profile) + Math.floor((level - 1) / 2),
    defense: calculatePlayerDefense(profile) + Math.floor((level - 1) / 3),
  };
  const growth = statAllocationStats(profile);
  return ids.map((memberId) => {
    const member = PARTY_MEMBER_CATALOG[memberId];
    const job = memberId === 'hero' && rules.jobRulesVersion === JOB_RULES_VERSION ? heroJobSnapshot(profile, { party: true }) : null;
    const role = roleForMember(memberId, member);
    const stats = memberId === 'hero' ? hero : role === 'Guardian'
      ? { maxHp: hero.maxHp * 1.30, attack: hero.attack * .80, defense: hero.defense + 3 }
      : role === 'Mage'
        ? { maxHp: hero.maxHp * .85, attack: hero.attack * 1.15, defense: Math.max(0, hero.defense - 1) }
        : role === 'Attacker'
          ? { maxHp: hero.maxHp * .95, attack: hero.attack * 1.20, defense: Math.max(0, hero.defense - 1) }
          : { maxHp: hero.maxHp * .95, attack: hero.attack * .85, defense: hero.defense + 1 };
    const multiplier = member.multiplier || 1;
    if (job) return { memberId, name: member.name, role: job.jobName, ...job };
    const snapshot = { memberId, name: member.name, role: member.role, maxHp: Math.round(stats.maxHp * multiplier) + (memberId === 'hero' ? growth.hpBonus : 0), ...(memberId === 'hero' ? { maxMp: growth.maxMp } : hasUnlimitedSkills(rules) ? { maxMp: COMPANION_MAX_MP[role] } : {}), attack: Math.round(stats.attack * multiplier), defense: Math.round(stats.defense * multiplier), skills: member.skillIds.map((id) => ({ ...partySkill(id), ...(memberId === 'hero' || hasUnlimitedSkills(rules) ? { mpCost: SKILL_MP_COSTS[id] ?? COMPANION_SKILL_MP_COSTS[id] } : {}), targetType: partySkill(id).targetType || (id === 'healing_light' ? 'single_ally' : id === 'guard_stance' ? 'self' : 'single_enemy') })) };
    return memberId !== 'hero' && rules.companionGrowthRulesVersion === COMPANION_GROWTH_RULES_VERSION ? applyCompanionGrowth(profile, snapshot) : snapshot;
  });
}
