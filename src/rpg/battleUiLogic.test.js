import { describe, expect, it } from 'vitest';
import {
  battleEnergyState,
  battleHpPercent,
  battleIsActive,
  buildBattleTurnFeedback,
  canUseBattleActions,
  resolvePartyBattleSelection,
} from './battleUiLogic.js';

const campaignBattle = (battleKind = 'normal', status = 'active') => ({
  schemaVersion: 7,
  battleKind,
  battleMode: 'campaign',
  status,
  playerHp: status === 'lost' ? 0 : 10,
  enemyHp: status === 'won' ? 0 : 10,
});

const partyBattle = (battleMode = 'tower', status = 'active') => ({
  schemaVersion: battleMode === 'weekly_boss' ? 9 : 8,
  battleKind: battleMode === 'weekly_boss' ? 'boss' : 'normal',
  battleMode,
  status,
  activePartyMemberId: 'hero',
  partyStates: [
    { memberId: 'hero', status: 'active' },
    { memberId: 'guardian', status: 'active' },
  ],
  enemyStates: [
    { enemyInstanceId: 'enemy-1', status: 'active' },
    { enemyInstanceId: 'enemy-2', status: 'active' },
  ],
});

describe('battle UI logic', () => {
  it('handles energy, hp and active state safely', () => {
    expect(battleEnergyState({ battleEnergy: 0 }, { energyCost: 1 }).sufficient).toBe(false);
    expect(battleEnergyState({ battleEnergy: 2 }, { energyCost: 1 }).sufficient).toBe(true);
    expect(battleHpPercent({ enemyHp: 10, enemySnapshot: { maxHp: 20 } })).toBe(50);
    expect(battleHpPercent(null)).toBe(0);
    expect(battleIsActive({ status: 'active' })).toBe(true);
  });

  it('enables player actions in active Campaign normal, Campaign Boss, Tower, and Weekly Boss battles', () => {
    expect(canUseBattleActions(campaignBattle('normal'))).toBe(true);
    expect(canUseBattleActions(campaignBattle('boss'))).toBe(true);
    expect(canUseBattleActions(partyBattle('tower'))).toBe(true);
    expect(canUseBattleActions(partyBattle('weekly_boss'))).toBe(true);
  });

  it('disables actions before battle, while processing, without a player turn, and after battle', () => {
    expect(canUseBattleActions(null)).toBe(false);
    expect(canUseBattleActions(campaignBattle('normal'), true)).toBe(false);
    expect(canUseBattleActions(partyBattle('tower'), true)).toBe(false);
    expect(canUseBattleActions({ ...partyBattle('tower'), activePartyMemberId: null })).toBe(false);
    expect(canUseBattleActions(campaignBattle('normal', 'won'))).toBe(false);
    expect(canUseBattleActions(campaignBattle('boss', 'lost'))).toBe(false);
    expect(canUseBattleActions({ ...partyBattle('tower', 'won'), enemyStates: [] })).toBe(false);
    expect(canUseBattleActions({ ...partyBattle('weekly_boss', 'lost'), partyStates: [] })).toBe(false);
  });

  it('moves stale Tower selections to active targets after an enemy or ally is defeated', () => {
    const battle = {
      ...partyBattle('tower'),
      activePartyMemberId: 'guardian',
      partyStates: [
        { memberId: 'hero', status: 'defeated' },
        { memberId: 'guardian', status: 'active' },
      ],
      enemyStates: [
        { enemyInstanceId: 'enemy-1', status: 'defeated' },
        { enemyInstanceId: 'enemy-2', status: 'active' },
      ],
    };

    expect(resolvePartyBattleSelection(battle, 'enemy-1', 'hero')).toEqual({ enemyId: 'enemy-2', allyId: 'guardian' });
  });
});

describe('enemy action feedback', () => {
  it('names normal and boss counter actions', () => {
    expect(buildBattleTurnFeedback({ damage: 5, enemyCounter: { actionName: '通常攻撃', damage: 3 } }, 'オークチーフ')).toEqual(['通常攻撃', '5 DAMAGE', 'オークチーフの通常攻撃！', '3 DAMAGE']);
    expect(buildBattleTurnFeedback({ skill: { kind: 'heal', name: 'ヒール' }, healing: { actualHeal: 14 }, enemyCounter: { actionName: '豪腕撃', damage: 6 } }, 'オークチーフ')).toEqual(['ヒール', 'HPを14回復した！', 'オークチーフの豪腕撃！', '6 DAMAGE']);
  });
});
