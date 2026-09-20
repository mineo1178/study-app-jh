import { normalizePlayerProfile } from './playerProfile.js';
export const battleEnergyState = (profile, enemy) => { const energy = Number(normalizePlayerProfile(profile || {}).battleEnergy) || 0; const required = Number(enemy?.energyCost) || 0; return { energy, required, sufficient: energy >= required }; };
export const battleHpPercent = (battle) => { const maxHp = Number(battle?.enemySnapshot?.maxHp) || 0; return maxHp ? Math.max(0, Math.min(100, ((Number(battle?.enemyHp) || 0) / maxHp) * 100)) : 0; };
export const battleIsActive = (battle) => battle?.status === 'active';
