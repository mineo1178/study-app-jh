export const isTerminalBattle = (battle) => battle?.status === 'won' || battle?.status === 'lost';

export const resolveBattleWatchSnapshot = (battle, battleWatchId) => {
  if (isTerminalBattle(battle)) {
    return { activeBattle: null, lastBattle: battle, battleWatchId: null };
  }
  return { activeBattle: battle || null, lastBattle: null, battleWatchId };
};
