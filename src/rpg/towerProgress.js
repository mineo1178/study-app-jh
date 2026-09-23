export const RPG_TOWER_PROGRESS_SCHEMA_VERSION = 1;
export const createEmptyTowerProgress = () => ({ schemaVersion: RPG_TOWER_PROGRESS_SCHEMA_VERSION, unlocked: true, currentFloor: 1, highestFloor: 0, totalWins: 0, bossWins: 0 });
export const normalizeTowerProgress = (progress = {}) => ({ ...createEmptyTowerProgress(), ...progress, schemaVersion: RPG_TOWER_PROGRESS_SCHEMA_VERSION, unlocked: true, currentFloor: Math.max(1, Math.floor(Number(progress.currentFloor) || 1)), highestFloor: Math.max(0, Math.floor(Number(progress.highestFloor) || 0)), totalWins: Math.max(0, Math.floor(Number(progress.totalWins) || 0)), bossWins: Math.max(0, Math.floor(Number(progress.bossWins) || 0)) });
export function applyTowerVictory(progress, { floor, boss, now }) {
  const current = normalizeTowerProgress(progress);
  if (current.currentFloor !== floor) throw Object.assign(new Error('TOWER_FLOOR_MISMATCH'), { code: 'TOWER_FLOOR_MISMATCH' });
  return { ...current, currentFloor: floor + 1, highestFloor: Math.max(current.highestFloor, floor), totalWins: current.totalWins + 1, bossWins: current.bossWins + (boss ? 1 : 0), updatedAt: now };
}
