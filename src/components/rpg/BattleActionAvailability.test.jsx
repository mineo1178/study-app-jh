import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BattleArena from './BattleArena.jsx';
import BattlePanel from './BattlePanel.jsx';
import PartyBattleArena from './PartyBattleArena.jsx';

const campaignBattle = (battleKind = 'normal', status = 'active') => ({
  schemaVersion: 7,
  battleKind,
  battleMode: 'campaign',
  status,
  playerHp: status === 'lost' ? 0 : 10,
  enemyHp: status === 'won' ? 0 : 10,
  playerSnapshot: { maxHp: 10, attack: 5, defense: 2, skills: {} },
  enemySnapshot: { name: '敵', maxHp: 10, attack: 2, weaknesses: [], resistances: [] },
  skillUses: {},
});

const partyBattle = (battleMode = 'tower', status = 'active') => ({
  schemaVersion: battleMode === 'weekly_boss' ? 9 : 8,
  battleMode,
  status,
  towerFloor: 4,
  roundNumber: 1,
  activePartyMemberId: 'hero',
  weeklyBossSnapshot: { name: '週間ボス' },
  partySnapshot: { members: [{ memberId: 'hero', name: '主人公', role: '勇者', maxHp: 10, skills: [] }] },
  partyStates: [{ memberId: 'hero', hp: 10, status: 'active' }],
  enemySnapshots: [{ enemyInstanceId: 'enemy-1', name: '敵', element: 'neutral', maxHp: 10 }],
  enemyStates: [{ enemyInstanceId: 'enemy-1', hp: 10, status: status === 'won' ? 'defeated' : 'active' }],
  skillUses: {},
});

const normalAttackButton = (markup) => markup.match(/<button type="button"[^>]*>通常攻撃<\/button>/)?.[0] || '';
const isDisabled = (button) => / disabled(?:=""|(?=>))/.test(button);

describe('Battle action buttons', () => {
  it('does not render actions before battle starts', () => {
    const markup = renderToStaticMarkup(<BattlePanel profile={{ battleEnergy: 0 }} progress={{}} towerProgress={{}} battle={null}/>);
    expect(markup).not.toContain('通常攻撃');
  });

  it.each([
    ['Campaign normal', campaignBattle('normal')],
    ['Campaign Boss', campaignBattle('boss')],
    ['Tower', partyBattle('tower')],
    ['Weekly Boss', partyBattle('weekly_boss')],
  ])('enables normal attack during an active player turn in %s', (_label, battle) => {
    const Component = Number(battle.schemaVersion) >= 8 ? PartyBattleArena : BattleArena;
    const button = normalAttackButton(renderToStaticMarkup(<Component battle={battle} attacking={false}/>));
    expect(isDisabled(button)).toBe(false);
  });

  it('disables normal attack while an action and enemy response transaction is processing', () => {
    const button = normalAttackButton(renderToStaticMarkup(<PartyBattleArena battle={partyBattle('tower')} attacking/>));
    expect(isDisabled(button)).toBe(true);
  });

  it('disables normal attack without an active player actor and after battle completion', () => {
    const enemyTurn = normalAttackButton(renderToStaticMarkup(<PartyBattleArena battle={{ ...partyBattle('tower'), activePartyMemberId: null }} attacking={false}/>));
    const completed = normalAttackButton(renderToStaticMarkup(<BattleArena battle={campaignBattle('normal', 'won')} attacking={false}/>));
    expect(isDisabled(enemyTurn)).toBe(true);
    expect(isDisabled(completed)).toBe(true);
  });
});
