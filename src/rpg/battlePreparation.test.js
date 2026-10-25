import { describe, expect, it } from 'vitest';
import { buildBattlePreparation, equipmentPreview, partyPreview, partySummary, preparationHints, enemySkillAffinities, refreshWeeklyBattleCandidate } from './battlePreparation.js';
import { normalizePlayerProfile } from './playerProfile.js';
import { buildTowerEncounter } from './towerCatalog.js';
import { buildTowerPartySnapshot } from './partyMemberCatalog.js';
import { prepareBattleStart, preparePartyTowerStart, prepareWeeklyBossStart } from '../data/rpgBattleRepository.js';
import { ENEMY_CATALOG } from './enemyCatalog.js';
import { getWeeklyBossDefinition } from './weeklyBossCatalog.js';
import { totalExpForLevel } from './levelSystem.js';
import { createHash } from 'node:crypto';
import { measureBalance } from '../../scripts/simulateBattleBalance.js';

const profile = normalizePlayerProfile({ battleEnergy: 20, totalExp: totalExpForLevel(12), ownedEquipment: { iron_sword: true, scholar_blade: true }, equipped: { weapon: 'iron_sword' } });
const preparation = (candidate, extra = {}) => buildBattlePreparation({ profile, candidate, ...extra });

describe('battle preparation uses actual new-start data', () => {
  it('matches all 160 deterministic v2.9.1 balance results exactly', () => {
    // Verified v2.9.1 matrix against the preserved Before measurements: outcomes, turns, HP,
    // damage, enemy actions, healing/guard uses and both action policies.
    const results = measureBalance();
    expect(results).toHaveLength(160);
    expect(createHash('sha256').update(JSON.stringify(results)).digest('hex')).toBe('bbf8e9c3ba26dbd8450b71dcb851419472301dc280a74430995735124477353c');
  });
  it('shows only the solo Campaign hero with the Campaign calculator and skills', () => {
    const data = preparation({ id: 'slime', name: 'untrusted label', energyCost: 999 });
    const start = prepareBattleStart({ profile, enemy: ENEMY_CATALOG.slime, battleId: 'solo', now: 1 });
    expect(data.name).toBe('スライム');
    expect(data.enemies).toEqual([ENEMY_CATALOG.slime]);
    expect(data.energy.required).toBe(start.ledger.energySpent);
    expect(data.members).toHaveLength(1);
    expect(data.members[0]).toMatchObject({ memberId: 'hero', maxHp: start.battle.playerSnapshot.maxHp, attack: start.battle.playerSnapshot.attack, defense: start.battle.playerSnapshot.defense });
    expect(data.members[0].skills.map(skill => skill.name)).toEqual(Object.values(start.battle.playerSnapshot.skills).map(skill => skill.name));
    expect(data.hints).toContain('この戦闘では主人公だけが参加します。');
  });
  it.each([4, 7, 10, 20])('uses the live Tower %iF encounter, enemy count and exact party snapshot', floor => {
    const data = preparation({ id: 'tower', isTower: true }, { towerProgress: { currentFloor: floor } });
    const encounter = buildTowerEncounter({ floor });
    const start = preparePartyTowerStart({ profile, encounter, battleId: 'tower', now: 1 });
    expect(data.solo).toBe(false);
    expect(data.enemies).toEqual(encounter.enemies);
    expect(data.members).toEqual(start.battle.partySnapshot.members);
    expect(data.isBoss).toBe(encounter.boss);
    expect(data.energy.required).toBe(encounter.energyCost);
    expect(data.affinities).toEqual(encounter.enemies.map(enemy => ({ name: enemy.name, weaknesses: enemy.weaknesses.map(element => ({ element, available: true })), resistances: enemy.resistances })));
  });
  it('shows the Weekly Boss catalog and actual participating party', () => {
    const boss = getWeeklyBossDefinition('2026-W42');
    const data = preparation({ id: 'weekly', isWeekly: true, weekId: boss.weekId });
    const start = prepareWeeklyBossStart({ profile, boss, battleId: 'weekly', now: 1 });
    expect(data.name).toBe(boss.name);
    expect(data.enemies).toEqual([boss]);
    expect(data.members).toEqual(start.battle.partySnapshot.members);
    expect(data.isBoss).toBe(true);
    expect(data.energy).toEqual({ energy: 20, required: 3, sufficient: true });
  });
  it('requires fresh confirmation if a Weekly Boss changes across Monday JST', () => {
    const timestamp = Date.parse('2026-10-19T00:00:00+09:00');
    const boss = getWeeklyBossDefinition(timestamp - 1);
    const candidate = { id: 'weekly', isWeekly: true, weekId: boss.weekId, name: boss.name };
    expect(refreshWeeklyBattleCandidate(candidate, timestamp - 1)).toBe(candidate);
    const next = refreshWeeklyBattleCandidate(candidate, timestamp);
    expect(next).not.toBe(candidate);
    expect(next.weekId).toBe(getWeeklyBossDefinition(timestamp).weekId);
    expect(preparation(next).name).toBe(getWeeklyBossDefinition(timestamp).name);
    const solo = { id: 'slime' };
    expect(refreshWeeklyBattleCandidate(solo, timestamp)).toBe(solo);
  });
  it('matches skill elements rather than member element, and reports missing coverage', () => {
    const mage = { ...profile, partyMemberIds: ['hero', 'raika'], unlockedPartyMemberIds: [...profile.unlockedPartyMemberIds, 'raika'] };
    const summary = partySummary(partyPreview(mage, ['hero', 'raika']));
    expect(summary.elements).toContain('fire');
    expect(partySummary([partyPreview(mage, ['hero', 'raika'])[1]]).elements).toEqual(['fire']);
    const noAttack = [{ maxHp: 10, attack: 5, skills: [{ kind: 'heal', maxUses: 2 }] }];
    expect(partySummary(noAttack).elements).toEqual([]);
    const data = preparation({ id: 'slime' });
    expect(data.affinities[0]).toEqual({ name: 'スライム', weaknesses: [{ element: 'fire', available: true }], resistances: ['water'] });
  });
  it('limits guidance to three evidence-based hints and handles unknown targets', () => {
    const data = preparation({ id: 'tower', isTower: true });
    expect(data.hints.length).toBeLessThanOrEqual(3);
    const missing = preparationHints({ solo: false, members: [{ maxHp: 1, attack: 1, skills: [] }], equipment: [], affinities: [{ weaknesses: [{ available: false }] }] });
    expect(missing).toEqual(['回復スキルがありません。長期戦では回復スキルも役立ちます。']);
    expect(preparation({ id: 'unknown' })).toBeNull();
    expect(preparation(null)).toBeNull();
    expect(preparation({ id: 'weekly', isWeekly: true })).toBeNull();
  });
  it('keeps per-enemy weakness coverage separate, including missing skills and unknown affinities', () => {
    const members = [{ maxHp: 10, attack: 2, skills: [{ kind: 'attack', element: 'fire', maxUses: 2 }] }];
    const enemies = [{ name: '炎が弱点', weaknesses: ['fire'], resistances: ['water'] }, { name: '水が弱点', weaknesses: ['water'], resistances: ['fire'] }, { name: '不明' }];
    expect(enemySkillAffinities(enemies, members)).toEqual([
      { name: '炎が弱点', weaknesses: [{ element: 'fire', available: true }], resistances: ['water'] },
      { name: '水が弱点', weaknesses: [{ element: 'water', available: false }], resistances: ['fire'] },
      { name: '不明', weaknesses: [], resistances: [] },
    ]);
    expect(enemySkillAffinities(enemies, [])[0].weaknesses[0].available).toBe(false);
    members[0].skills[0].maxUses = 0;
    expect(enemySkillAffinities(enemies, members)[0].weaknesses[0].available).toBe(false);
  });
  it('detects insufficient Energy and a battle started on another device', () => {
    const data = buildBattlePreparation({ profile: { ...profile, battleEnergy: 0, activeBattleId: 'other-device' }, candidate: { id: 'slime' } });
    expect(data.energy.sufficient).toBe(false);
    expect(data.blocked).toBe(true);
  });
});

describe('pure party and equipment comparison', () => {
  it.each([['guardian'], ['hero', 'mage', 'guardian', 'healer'], ['hero', 'mage', 'mage'], ['hero', 'homura']])('rejects an invalid party %j', (...ids) => {
    expect(() => partyPreview(profile, ids)).toThrow();
  });
  it('compares actual HP, attack, healing, guarding, area attacks and elements without mutating the profile', () => {
    const original = structuredClone(profile);
    expect(partyPreview(profile, profile.partyMemberIds)).toEqual(buildTowerPartySnapshot(profile, { skillRulesVersion: 2, jobRulesVersion: 1 }));
    const before = partySummary(partyPreview(profile, profile.partyMemberIds));
    const after = partySummary(partyPreview(profile, ['hero', 'healer']));
    expect(before.area).toBe(true);
    expect(after.area).toBe(false);
    expect(after.heal).toBe(true);
    expect(after.guard).toBe(true);
    expect(after.maxHp).toBeLessThan(before.maxHp);
    expect(profile).toEqual(original);
  });
  it('compares complete player stats for owned equipment and unequip before any save', () => {
    const original = structuredClone(profile);
    expect(equipmentPreview(profile, 'weapon', 'scholar_blade')).toEqual({ before: { maxHp: 40, attack: 10, defense: 0 }, after: { maxHp: 40, attack: 13, defense: 0 } });
    expect(equipmentPreview(profile, 'weapon', null).after.attack).toBe(5);
    expect(equipmentPreview(profile, 'weapon', 'dragon_star_blade')).toBeNull();
    expect(equipmentPreview(profile, 'armor', 'iron_sword')).toBeNull();
    expect(equipmentPreview(profile, 'missing', null)).toBeNull();
    expect(equipmentPreview({ ...profile, ownedEquipment: { scholar_blade: false } }, 'weapon', 'scholar_blade')).toBeNull();
    expect(profile).toEqual(original);
  });
  it('rebuilds only new-start previews after a remote profile change, preserving saved battle snapshots', () => {
    const encounter = buildTowerEncounter({ floor: 4 });
    const battle = preparePartyTowerStart({ profile, encounter, battleId: 'existing', now: 1 }).battle;
    const saved = JSON.stringify(battle);
    const updated = { ...profile, equipped: { weapon: 'scholar_blade' }, partyMemberIds: ['hero', 'healer'] };
    const data = buildBattlePreparation({ profile: updated, candidate: { id: 'tower', isTower: true }, towerProgress: { currentFloor: 4 } });
    expect(data.members).toEqual(buildTowerPartySnapshot(updated, { skillRulesVersion: 2, jobRulesVersion: 1 }));
    expect(data.members).not.toEqual(battle.partySnapshot.members);
    expect(JSON.stringify(battle)).toBe(saved);
  });
});
