import { getPlayerJob, JOB_RULES_VERSION } from './jobCatalog.js';
import { calculatePlayerAttack, calculatePlayerDefense } from './battleCalculator.js';
import { statAllocationStats, SKILL_MP_COSTS, BASE_PLAYER_MAX_HP, BASE_PLAYER_MAX_MP } from './statAllocation.js';
import { SKILL_CATALOG } from './skillCatalog.js';
import { normalizePlayerProfile } from './playerProfile.js';
export function heroJobSnapshot(profile, { party = false } = {}) {
  const safe = normalizePlayerProfile(profile || {}), job = getPlayerJob(safe), growth = statAllocationStats(safe);
  const levelHp = party ? 2 * (safe.level - 1) : 0;
  const base = { maxHp: BASE_PLAYER_MAX_HP + levelHp, maxMp: BASE_PLAYER_MAX_MP, attack: calculatePlayerAttack(safe) + (party ? Math.floor((safe.level - 1) / 2) : 0), defense: calculatePlayerDefense(safe) + (party ? Math.floor((safe.level - 1) / 3) : 0) };
  const stats = { maxHp: Math.max(1, Math.round(base.maxHp * job.hpPercent / 100)) + growth.hpBonus, maxMp: Math.max(1, Math.round(base.maxMp * job.mpPercent / 100)) + growth.allocation.mp * 2, attack: Math.max(1, Math.round(base.attack * job.attackPercent / 100)), defense: Math.max(0, base.defense + job.defenseBonus) };
  const skills = Object.entries(job.skills).map(([id, overrides]) => ({ ...SKILL_CATALOG[id], mpCost: SKILL_MP_COSTS[id], ...overrides, targetType: id === 'healing_light' ? 'single_ally' : id === 'guard_stance' ? 'self' : 'single_enemy' }));
  return { jobId: job.id, jobName: job.name, jobRulesVersion: JOB_RULES_VERSION, jobModifiers: { hpPercent: job.hpPercent, mpPercent: job.mpPercent, attackPercent: job.attackPercent, defenseBonus: job.defenseBonus }, ...stats, skills };
}
