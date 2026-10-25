import { levelForTotalExp } from './levelSystem.js';
import { COMPANION_GROWTH_CATALOG, COMPANION_GROWTH_RULES_VERSION, COMPANION_POINT_CAPS, EMPTY_COMPANION_ALLOCATION } from './companionGrowthCatalog.js';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const record = value => value && typeof value === 'object' && !Array.isArray(value);
export const earnedCompanionPoints = profile => Math.min(20, levelForTotalExp(profile.totalExp || 0) - 1);
export function companionDefinition(memberId) {
  if (!Object.hasOwn(COMPANION_GROWTH_CATALOG, memberId)) fail('INVALID_COMPANION');
  return COMPANION_GROWTH_CATALOG[memberId];
}
export function validateCompanionState(profile, memberId, state) {
  const catalog = companionDefinition(memberId);
  if (!record(state) || !Number.isSafeInteger(state.revision) || state.revision < 0 || !record(state.allocation)) fail('INVALID_COMPANION_GROWTH');
  const keys = Object.keys(COMPANION_POINT_CAPS), allocation = state.allocation;
  if (Object.keys(allocation).length !== keys.length || keys.some(key => !Number.isSafeInteger(allocation[key]) || allocation[key] < 0 || allocation[key] > COMPANION_POINT_CAPS[key])) fail('INVALID_COMPANION_ALLOCATION');
  const earned = earnedCompanionPoints(profile), used = keys.reduce((sum, key) => sum + allocation[key], 0);
  if (used > earned) fail('COMPANION_POINTS_EXCEEDED');
  const ids = state.unlockedNodeIds;
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !catalog.nodes.some(node => node.id === id))) fail('INVALID_COMPANION_NODES');
  const reached = new Set(), remaining = new Set(ids);
  for (let changed = true; changed;) {
    changed = false;
    for (const id of remaining) {
      const node = catalog.nodes.find(node => node.id === id);
      if (!node.parents.length || node.parents.some(parent => reached.has(parent))) { reached.add(id); remaining.delete(id); changed = true; }
    }
  }
  if (remaining.size) fail('COMPANION_NODE_DISCONNECTED');
  const usedSp = catalog.nodes.filter(node => reached.has(node.id)).reduce((sum, node) => sum + node.cost, 0);
  if (usedSp > earned) fail('COMPANION_SP_EXCEEDED');
  return { allocation: { ...allocation }, unlockedNodeIds: [...ids], revision: state.revision, earned, used, remaining: earned - used, usedSp, remainingSp: earned - usedSp };
}
export function readCompanionGrowth(profile, memberId) {
  companionDefinition(memberId);
  const map = profile.companionGrowth;
  if (map !== undefined && (!record(map) || Object.keys(map).some(id => !Object.hasOwn(COMPANION_GROWTH_CATALOG, id)))) fail('INVALID_COMPANION_GROWTH');
  return validateCompanionState(profile, memberId, map === undefined || !Object.hasOwn(map, memberId) ? { allocation: { ...EMPTY_COMPANION_ALLOCATION }, unlockedNodeIds: [], revision: 0 } : map[memberId]);
}
export function companionNodeState(profile, memberId, nodeId) {
  const node = companionDefinition(memberId).nodes.find(node => node.id === nodeId), state = readCompanionGrowth(profile, memberId);
  const owned = state.unlockedNodeIds.includes(nodeId);
  const connected = node && (!node.parents.length || node.parents.some(id => state.unlockedNodeIds.includes(id)));
  return { owned, unlockable: Boolean(node && !owned && connected && node.cost <= state.remainingSp && !profile.activeBattleId && profile.unlockedPartyMemberIds?.includes(memberId)) };
}
export function applyCompanionGrowth(profile, snapshot) {
  const state = readCompanionGrowth(profile, snapshot.memberId), catalog = companionDefinition(snapshot.memberId), effects = {};
  for (const node of catalog.nodes.filter(node => state.unlockedNodeIds.includes(node.id))) for (const [key, value] of Object.entries(node.effects)) effects[key] = typeof value === 'number' ? (effects[key] || 0) + value : value;
  const baseStats = Object.fromEntries(['maxHp', 'maxMp', 'attack', 'defense'].map(key => [key, snapshot[key]]));
  return { ...snapshot,
    maxHp: snapshot.maxHp + state.allocation.hp * 3 + (effects.maxHp || 0),
    maxMp: snapshot.maxMp + state.allocation.mp * 2 + (effects.maxMp || 0),
    attack: snapshot.attack + state.allocation.attack + (effects.attack || 0),
    defense: snapshot.defense + state.allocation.defense + (effects.defense || 0),
    skills: snapshot.skills.map(skill => ({ ...skill, mpCost: Math.max(1, skill.mpCost - (effects.mpReduction || 0)),
      ...(skill.kind === 'attack' ? { powerPercent: Math.floor(skill.powerPercent * (100 + Math.min(25, effects.powerPercent || 0)) / 100), ...(effects.element ? { element: effects.element } : {}) } : {}),
      ...(skill.kind === 'heal' ? { healPercent: Math.min(60, skill.healPercent + (effects.healPercent || 0)) } : {}),
      ...(skill.kind === 'guard' ? { damageReductionPercent: Math.min(80, skill.damageReductionPercent + (effects.guardPoints || 0)) } : {}),
    })),
    companionGrowthSnapshot: { rulesVersion: COMPANION_GROWTH_RULES_VERSION, memberId: snapshot.memberId, baseStats, allocation: state.allocation, unlockedNodeIds: state.unlockedNodeIds, revision: state.revision, effects },
  };
}
