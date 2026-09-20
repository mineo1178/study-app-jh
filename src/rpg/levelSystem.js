const safeExp = (value) => Math.max(0, Number(value) || 0);

export const totalExpForLevel = (level) => {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  return safeLevel <= 1 ? 0 : 25 * (safeLevel - 1) * (safeLevel + 2);
};

export const levelForTotalExp = (totalExp) => {
  const exp = safeExp(totalExp);
  let level = 1;
  while (totalExpForLevel(level + 1) <= exp) level += 1;
  return level;
};

export const expToNextLevel = (totalExp) => totalExpForLevel(levelForTotalExp(totalExp) + 1) - safeExp(totalExp);
