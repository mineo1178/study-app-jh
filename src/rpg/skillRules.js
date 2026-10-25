// Separate from mpRulesVersion: old MP battles still enforce captured maxUses.
export const SKILL_RULES_VERSION = 2;
export const hasUnlimitedSkills = battle => battle?.skillRulesVersion === SKILL_RULES_VERSION;
export const COMPANION_MAX_MP = Object.freeze({ Guardian: 8, Mage: 12, Healer: 12, Attacker: 8 });
export const COMPANION_SKILL_MP_COSTS = Object.freeze({ guardian_wall: 2, firestorm: 4, healing_prayer: 4 });
