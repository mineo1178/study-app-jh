import { describe, expect, it } from 'vitest';
import { resolveBattleWatchSnapshot } from './battleLifecycle.js';
import { battleHeadingLabel } from './battleUiLogic.js';

describe('battle lifecycle snapshots', () => {
  it('keeps an active battle watch until a terminal battle snapshot is received', () => {
    const active = resolveBattleWatchSnapshot({ id: 'battle-1', status: 'active' }, 'battle-1');
    expect(active).toEqual({ activeBattle: { id: 'battle-1', status: 'active' }, lastBattle: null, battleWatchId: 'battle-1' });

    // The profile may already have cleared activeBattleId, but this retained watch
    // still receives the terminal Battle document and shows the result exactly once.
    const terminal = resolveBattleWatchSnapshot({ id: 'battle-1', status: 'won' }, active.battleWatchId);
    expect(terminal).toEqual({ activeBattle: null, lastBattle: { id: 'battle-1', status: 'won' }, battleWatchId: null });
  });

  it('keeps a lost result for display and distinguishes boss battle labeling', () => {
    const terminal = resolveBattleWatchSnapshot({ id: 'battle-2', status: 'lost' }, 'battle-2');
    expect(terminal.lastBattle?.status).toBe('lost');
    expect(terminal.battleWatchId).toBeNull();
    expect(battleHeadingLabel({ battleKind: 'boss' })).toBe('BOSS BATTLE');
    expect(battleHeadingLabel({ battleKind: 'normal' })).toBe('BATTLE');
  });
});
