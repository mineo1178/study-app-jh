import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import PartyBattleArena from './PartyBattleArena.jsx';
import BattlePanel from './BattlePanel.jsx';
import { createPartyBattle, preparePartyBattleAction } from '../../rpg/partyBattleEngine.js';
import { battleSkillAvailability, battleDefeatHints, buildBattleActionFeedback, resolvePartyBattleSelection, canUseBattleActions } from '../../rpg/battleUiLogic.js';
import { normalizeBattle } from '../../rpg/battleState.js';
import { prepareBattleAttack, prepareBattleStart } from '../../data/rpgBattleRepository.js';
import { SKILL_CATALOG } from '../../rpg/skillCatalog.js';

const guard = { id: 'guard', name: '防御', kind: 'guard', targetType: 'self', damageReductionPercent: 50, maxUses: 2 };
const heal = { id: 'heal', name: '回復', kind: 'heal', targetType: 'single_ally', healPercent: 35, maxUses: 2 };
const area = { id: 'area', name: '全体炎攻撃', kind: 'attack', targetType: 'all_enemies', powerPercent: 100, element: 'fire', maxUses: 2 };
const fixture = (mode = 'tower') => createPartyBattle({ battleId: 'ui', battleMode: mode, schemaVersion: mode === 'weekly_boss' ? 9 : 8, floor: 4, now: 1,
  weeklyBossSnapshot: mode === 'weekly_boss' ? { name: '週間ボス', reward: { expReward: 25, goldTicket: 1, starFragments: 4 } } : null,
  encounter: { rulesVersion: 2, energyCost: 1, expReward: 10, enemies: [1, 2].map(id => ({ enemyInstanceId: `e${id}`, name: `敵${id}`, maxHp: 100, attack: 10, element: 'neutral' })) },
  members: [1, 2].map(id => ({ memberId: `m${id}`, name: `仲間${id}`, maxHp: 100, attack: 12, defense: 0, skills: [guard, heal, area] })),
});
const markup = battle => renderToStaticMarkup(<PartyBattleArena battle={battle}/>);
const action = (battle, args) => preparePartyBattleAction({ battle, action: { actionId: 'ui-action', ...args }, now: 2 });

describe('battle presentation', () => {
  it.each(['tower', 'weekly_boss'])('shows enemy and ally HP, targets and skills in %s', mode => {
    const text = markup(fixture(mode));
    expect(text).toContain('HP 100/100');
    expect(text.match(/role="progressbar"/g)).toHaveLength(4);
    expect(text).toContain('攻撃対象');
    expect(text).toContain('行動可能・今回の行動者');
    expect(text).toContain('防御効果なし');
    expect(text).toContain('生存している敵全体');
    expect(text).toContain('受けるダメージを50%軽減');
    expect(text).toContain('1回使用を消費');
  });
  it('disables defeated targets and chooses the next living enemy after reload', () => {
    const battle = fixture(); battle.enemyStates[0] = { ...battle.enemyStates[0], hp: 0, status: 'defeated' };
    const restored = normalizeBattle(JSON.parse(JSON.stringify(battle)));
    expect(resolvePartyBattleSelection(restored, 'e1', 'm1').enemyId).toBe('e2');
    const text = markup(restored);
    expect(text).toMatch(/<button[^>]*disabled=""[^>]*><b>敵1/);
    expect(text).toContain('撃破済み');
    expect(text).toMatch(/aria-pressed="true"[^>]*><b>敵2/);
    restored.enemyStates[1].status = 'defeated';
    expect(canUseBattleActions(restored)).toBe(false);
    expect(battleSkillAvailability(restored, area).available).toBe(false);
  });
  it('restores guard from snapshot and removes it after enemy phase', () => {
    const initial = fixture(); const guarded = action(initial, { skillId: 'guard' });
    expect(markup(normalizeBattle(JSON.parse(JSON.stringify(guarded.battle))))).toContain('防御中・被ダメージ50%軽減');
    const next = action(guarded.battle, { targetEnemyInstanceId: 'e1' });
    expect(next.battle.partyStates.every(state => state.guardPercent === 0)).toBe(true);
    expect(markup(next.battle)).not.toContain('防御中');
    const lines = buildBattleActionFeedback({ applied: true, result: next }, guarded.battle);
    expect(lines.some(line => line.includes('防御効果あり'))).toBe(true);
  });
  it('explains uses, full HP, missing targets and pending actions without spending Energy', () => {
    const battle = fixture(); const selected = { enemyId: 'e1', allyId: 'm1' };
    expect(battleSkillAvailability(battle, guard, selected).available).toBe(true);
    expect(battleSkillAvailability(battle, heal, selected).reason).toContain('満タン');
    battle.partyStates[0].hp = 40;
    expect(battleSkillAvailability(battle, heal, selected).available).toBe(true);
    expect(battleSkillAvailability(battle, heal, {}).reason).toContain('仲間がいません');
    battle.skillUses['m1:heal'] = 2;
    expect(battleSkillAvailability(battle, heal, selected).reason).toContain('使い切り');
    expect(battleSkillAvailability(battle, guard, selected, true).reason).toContain('処理中');
    expect(battleSkillAvailability(battle, { ...area, targetType: 'single_enemy' }, {}).available).toBe(false);
    expect(battleSkillAvailability(battle, { ...heal, id: 'all-heal', targetType: 'all_allies' }).available).toBe(true);
    expect(markup(battle)).toContain('使用できません');
    const pending = renderToStaticMarkup(<PartyBattleArena battle={battle} attacking/>);
    expect(pending.match(/<button/g)?.length).toBe(pending.match(/<button[^>]*disabled=""/g)?.length);
    expect(canUseBattleActions(battle, false)).toBe(true);
  });
  it('reports committed damage, overkill, area effects, healing and counters without mutation', () => {
    const battle = fixture(); battle.enemyStates[0].hp = 1;
    const saved = structuredClone(battle);
    const attack = action(battle, { targetEnemyInstanceId: 'e1' });
    expect(buildBattleActionFeedback({ applied: true, result: attack }, battle)).toContain('敵1に12ダメージ・撃破！');
    expect(attack.enemyEvents).toEqual([]);
    expect(battle).toEqual(saved);
    const aoe = action(battle, { skillId: 'area' });
    expect(aoe.actionEffects.map(effect => effect.damage)).toEqual([12, 12]);
    const injured = fixture(); injured.partyStates[0].hp = 90; injured.actedMemberIds = ['m2'];
    const healed = action(injured, { skillId: 'heal', targetMemberId: 'm1' });
    expect(healed.actionEffects).toEqual([{ kind: 'heal', targetId: 'm1', actualHeal: 10 }]);
    const lines = buildBattleActionFeedback({ applied: true, result: healed }, injured);
    expect(lines).toContain('仲間1のHPを10回復');
    expect(lines.filter(line => line.includes('反撃'))).toHaveLength(2);
    expect(lines.join()).not.toContain('undefined');
    expect(buildBattleActionFeedback({ applied: false }, injured)).toBeNull();
  });
  it('keeps final results and feedback visible with snapshot-based defeat guidance', () => {
    const battle = fixture('weekly_boss');
    const lost = renderToStaticMarkup(<BattlePanel battle={{ ...battle, status: 'lost' }} feedback={['仲間1に10ダメージ']}/>);
    expect(lost).toContain('次の戦いのヒント'); expect(lost).toContain('回復スキル'); expect(lost).toContain('仲間1に10ダメージ');
    const won = renderToStaticMarkup(<BattlePanel battle={{ ...battle, status: 'won', victory: {} }} feedback={['勝利！']}/>);
    expect(won).toContain('EXP +25'); expect(won).toContain('直前の行動結果');
    expect(battleDefeatHints({ playerSnapshot: { skills: {} } }).join()).not.toMatch(/回復|防御/);
  });
  it('reports the final killing action and defeat without undefined damage', () => {
    const winning = fixture(); winning.enemyStates.forEach(state => { state.hp = 1; });
    const won = action(winning, { skillId: 'area' });
    expect(won.battle.status).toBe('won');
    expect(buildBattleActionFeedback({ applied: true, result: won }, winning)).toContain('勝利！');
    const losing = fixture(); losing.partyStates.forEach(state => { state.hp = 1; }); losing.actedMemberIds = ['m2'];
    const lost = action(losing, { targetEnemyInstanceId: 'e1' });
    expect(lost.battle.status).toBe('lost');
    expect(buildBattleActionFeedback({ applied: true, result: lost }, losing).join()).toContain('敗北。');
  });
  it('supports old Campaign snapshots, normal attacks and guard/heal feedback', () => {
    const start = prepareBattleStart({ profile: { battleEnergy: 10, equipped: {} }, enemy: { id: 'slime', name: 'スライム', weaknesses: [], resistances: [], maxHp: 20, attack: 5, energyCost: 1, expReward: 5 }, battleId: 'old', now: 1 });
    const battle = normalizeBattle({ ...start.battle, schemaVersion: 1 });
    expect(renderToStaticMarkup(<BattlePanel battle={battle}/>)).toContain('あなた HP');
    const result = prepareBattleAttack({ battle, profile: start.profile, actionId: 'old-hit', now: 2 });
    const lines = buildBattleActionFeedback({ applied: true, battle: result.battle, result: result.result }, battle);
    expect(lines.join()).not.toContain('undefined');
    const winning = prepareBattleAttack({ battle: { ...battle, enemyHp: 1 }, profile: start.profile, actionId: 'win', now: 2 });
    expect(buildBattleActionFeedback({ applied: true, result: winning.result, victory: true }, battle)).toContain('敵を倒した！');
    expect(buildBattleActionFeedback({ applied: true, skill: SKILL_CATALOG.healing_light, healing: { actualHeal: 7 }, enemyCounter: { damage: 2 } }, battle)).toContain('HPを7回復した！');
    expect(buildBattleActionFeedback({ applied: true, skill: SKILL_CATALOG.guard_stance, guard: { reductionPercent: 50 }, enemyCounter: { damage: 2 } }, battle)).toContain('ダメージを50%軽減！');
  });
});
