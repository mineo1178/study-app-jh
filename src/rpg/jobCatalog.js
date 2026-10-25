export const JOB_RULES_VERSION = 1;
export const JOB_CATALOG = Object.freeze({
  adventurer: { id: 'adventurer', name: '冒険者', description: '攻撃・回復・防御を使い分けるバランス型。', hpPercent: 100, mpPercent: 100, attackPercent: 100, defenseBonus: 0, skills: { flame_slash: {}, aqua_edge: {}, thunder_strike: {}, healing_light: {}, guard_stance: {} } },
  warrior: { id: 'warrior', name: '戦士', description: '高い攻撃力と強力な炎斬りで単体を攻める。', hpPercent: 110, mpPercent: 75, attackPercent: 125, defenseBonus: 1, skills: { flame_slash: { powerPercent: 160, mpCost: 3 }, guard_stance: {} } },
  knight: { id: 'knight', name: '騎士', description: 'HP・防御力と強いガードで仲間を支える。', hpPercent: 125, mpPercent: 75, attackPercent: 95, defenseBonus: 4, skills: { aqua_edge: {}, guard_stance: { damageReductionPercent: 70 } } },
  mage: { id: 'mage', name: '魔法使い', description: '豊富なMPと3属性の強力な呪文で弱点を突く。', hpPercent: 85, mpPercent: 160, attackPercent: 90, defenseBonus: -1, skills: { flame_slash: { powerPercent: 165, mpCost: 3 }, aqua_edge: { powerPercent: 165, mpCost: 3 }, thunder_strike: { powerPercent: 165, mpCost: 3 } } },
  priest: { id: 'priest', name: '僧侶', description: 'MPと回復力を活かし、ヒール・ガードで支援する。', hpPercent: 100, mpPercent: 145, attackPercent: 90, defenseBonus: 1, skills: { aqua_edge: { powerPercent: 110 }, healing_light: { healPercent: 45 }, guard_stance: {} } },
  thief: { id: 'thief', name: '盗賊', description: '高めの攻撃力と低消費MPの技巧で攻め続ける。', hpPercent: 90, mpPercent: 100, attackPercent: 115, defenseBonus: 0, skills: { flame_slash: { powerPercent: 135 }, thunder_strike: { powerPercent: 145 } } },
});
export const playerJobId = profile => Object.hasOwn(JOB_CATALOG, profile?.jobId) ? profile.jobId : 'adventurer';
export const getPlayerJob = profile => JOB_CATALOG[playerJobId(profile)];
