import { calculatePlayerAttack, calculatePlayerDefense, calculatePlayerMaxHp } from './battleCalculator.js';
import { SKILL_CATALOG } from './skillCatalog.js';

export const PARTY_MEMBER_CATALOG = Object.freeze({
  hero: { id: 'hero', name: '主人公', role: 'バランス型', tendency: 'バランス', skillIds: ['flame_slash', 'aqua_edge', 'thunder_strike', 'healing_light', 'guard_stance'] },
  guardian: { id: 'guardian', name: '守護戦士', role: '高HP・高防御', tendency: 'HP・防御', skillIds: ['guardian_wall'] },
  mage: { id: 'mage', name: '魔導士', role: '全体攻撃', tendency: '攻撃', skillIds: ['firestorm'] },
  healer: { id: 'healer', name: '僧侶', role: '回復', tendency: '回復', skillIds: ['healing_prayer'] },
});

export const PARTY_SKILLS = Object.freeze({
  guardian_wall: { id: 'guardian_wall', name: '守護の壁', kind: 'guard', targetType: 'self', damageReductionPercent: 60, maxUses: 2 },
  firestorm: { id: 'firestorm', name: 'ファイアストーム', kind: 'attack', targetType: 'all_enemies', element: 'fire', powerPercent: 90, maxUses: 2 },
  healing_prayer: { id: 'healing_prayer', name: 'ヒーリングプレア', kind: 'heal', targetType: 'all_allies', healPercent: 20, maxUses: 2 },
});

export const partySkill = (id) => PARTY_SKILLS[id] || SKILL_CATALOG[id] || null;
export function validatePartyMemberIds(ids) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 3) throw Object.assign(new Error('INVALID_PARTY_SIZE'), { code: 'INVALID_PARTY_SIZE' });
  if (!ids.includes('hero')) throw Object.assign(new Error('HERO_REQUIRED'), { code: 'HERO_REQUIRED' });
  if (new Set(ids).size !== ids.length) throw Object.assign(new Error('DUPLICATE_PARTY_MEMBER'), { code: 'DUPLICATE_PARTY_MEMBER' });
  if (ids.some((id) => !PARTY_MEMBER_CATALOG[id])) throw Object.assign(new Error('UNKNOWN_PARTY_MEMBER'), { code: 'UNKNOWN_PARTY_MEMBER' });
  return [...ids];
}
const integer = (value) => Math.max(0, Math.floor(Number(value) || 0));
export function buildTowerPartySnapshot(profile) {
  const ids = validatePartyMemberIds(profile.partyMemberIds);
  const level = Math.max(1, integer(profile.level) || 1);
  const hero = {
    maxHp: calculatePlayerMaxHp(profile) + 2 * (level - 1),
    attack: calculatePlayerAttack(profile) + Math.floor((level - 1) / 2),
    defense: calculatePlayerDefense(profile) + Math.floor((level - 1) / 3),
  };
  return ids.map((memberId) => {
    const member = PARTY_MEMBER_CATALOG[memberId];
    const stats = memberId === 'hero' ? hero : memberId === 'guardian'
      ? { maxHp: Math.round(hero.maxHp * 1.30), attack: Math.round(hero.attack * .80), defense: hero.defense + 3 }
      : memberId === 'mage'
        ? { maxHp: Math.round(hero.maxHp * .85), attack: Math.round(hero.attack * 1.15), defense: Math.max(0, hero.defense - 1) }
        : { maxHp: Math.round(hero.maxHp * .95), attack: Math.round(hero.attack * .85), defense: hero.defense + 1 };
    return { memberId, name: member.name, role: member.role, ...stats, skills: member.skillIds.map((id) => ({ ...partySkill(id), targetType: partySkill(id).targetType || (id === 'healing_light' ? 'single_ally' : id === 'guard_stance' ? 'self' : 'single_enemy') })) };
  });
}
