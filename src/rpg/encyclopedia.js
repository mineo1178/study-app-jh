import { ALCHEMY_RECIPES } from './alchemyCatalog.js';
import { BOSS_CATALOG } from './bossCatalog.js';
import { ENEMY_CATALOG } from './enemyCatalog.js';
import { EQUIPMENT_CATALOG } from './equipmentCatalog.js';
import { ALCHEMY_ITEMS } from './gachaCatalog.js';
import { PARTY_MEMBER_CATALOG } from './partyMemberCatalog.js';
import { normalizePlayerProfile } from './playerProfile.js';
import { getWeeklyBossDefinition, WEEKLY_BOSSES } from './weeklyBossCatalog.js';

export const ENCYCLOPEDIA_CATEGORIES = Object.freeze(['members', 'enemies', 'equipment', 'alchemyItems']);

const knownActionSchema = (ledger) => Number(ledger?.schemaVersion) === 1;
const knownBattleSchema = (ledger) => [1, 2].includes(Number(ledger?.schemaVersion));
const positive = (value) => Number(value) > 0;
const addKnownId = (set, catalog, id) => { if (typeof id === 'string' && catalog[id]) set.add(id); };

const weeklyBosses = () => {
  const byId = new Map();
  for (let week = 1; week <= WEEKLY_BOSSES.length; week += 1) {
    const definition = getWeeklyBossDefinition(`2024-W${String(week).padStart(2, '0')}`);
    byId.set(definition.id, definition);
  }
  return WEEKLY_BOSSES.map((boss) => byId.get(boss.id) || boss);
};

export function getEncyclopediaCatalog() {
  const recipes = new Map(ALCHEMY_RECIPES.map((recipe) => [recipe.equipmentId, recipe]));
  return {
    members: Object.values(PARTY_MEMBER_CATALOG),
    enemies: [
      ...Object.values(ENEMY_CATALOG).map((enemy) => ({ ...enemy, encyclopediaKind: 'normal' })),
      ...Object.values(BOSS_CATALOG).map((enemy) => ({ ...enemy, encyclopediaKind: 'boss' })),
      ...weeklyBosses().map((enemy) => ({ ...enemy, encyclopediaKind: 'weekly' })),
    ],
    equipment: Object.values(EQUIPMENT_CATALOG).map((item) => ({ ...item, recipe: recipes.get(item.id) || null })),
    alchemyItems: Object.values(ALCHEMY_ITEMS),
  };
}

export function deriveEncyclopediaDiscovery({ profile = {}, actionLedgers = [], battleLedgers = [] } = {}) {
  const catalog = getEncyclopediaCatalog();
  const safeProfile = normalizePlayerProfile(profile);
  const memberIds = new Set(safeProfile.unlockedPartyMemberIds.filter((id) => PARTY_MEMBER_CATALOG[id]));
  const enemyCatalog = Object.fromEntries(catalog.enemies.map((enemy) => [enemy.id, enemy]));
  const enemyIds = new Set();
  const equipmentIds = new Set(Object.keys(safeProfile.ownedEquipment).filter((id) => EQUIPMENT_CATALOG[id]));
  const alchemyItemIds = new Set(Object.entries(safeProfile.gacha.alchemyItems).filter(([, quantity]) => positive(quantity)).map(([id]) => id).filter((id) => ALCHEMY_ITEMS[id]));

  for (const ledger of Array.isArray(battleLedgers) ? battleLedgers : []) {
    if (!knownBattleSchema(ledger)) continue;
    if (ledger.type === 'battle_start' && ledger.battleMode === 'campaign') addKnownId(enemyIds, enemyCatalog, ledger.enemyId);
    if (ledger.type === 'battle_start' && ledger.battleMode === 'tower' && Array.isArray(ledger.encounterSnapshot?.enemies)) {
      ledger.encounterSnapshot.enemies.forEach((enemy) => addKnownId(enemyIds, enemyCatalog, enemy?.enemyId));
    }
    if (ledger.type === 'battle_start' && ledger.battleMode === 'weekly_boss') addKnownId(enemyIds, enemyCatalog, ledger.weeklyBossSnapshot?.bossId);
    if (ledger.type === 'weekly_boss_clear' && positive(ledger.reward?.alchemyItemQuantity)) addKnownId(alchemyItemIds, ALCHEMY_ITEMS, ledger.reward?.alchemyItemId);
  }

  for (const ledger of Array.isArray(actionLedgers) ? actionLedgers : []) {
    if (!knownActionSchema(ledger)) continue;
    if (ledger.type === 'gacha_draw' && ledger.resultType === 'item') addKnownId(alchemyItemIds, ALCHEMY_ITEMS, ledger.itemId);
    if (ledger.type === 'gacha_fragment_exchange' && ledger.kind === 'item') addKnownId(alchemyItemIds, ALCHEMY_ITEMS, ledger.targetId);
    if (ledger.type === 'alchemy_craft' && ledger.alchemyItemsSpent && typeof ledger.alchemyItemsSpent === 'object') {
      Object.entries(ledger.alchemyItemsSpent).forEach(([id, quantity]) => { if (positive(quantity)) addKnownId(alchemyItemIds, ALCHEMY_ITEMS, id); });
    }
  }

  return { memberIds, enemyIds, equipmentIds, alchemyItemIds };
}

export function buildEncyclopedia({ profile = {}, actionLedgers = [], battleLedgers = [] } = {}) {
  const catalog = getEncyclopediaCatalog();
  const discovered = deriveEncyclopediaDiscovery({ profile, actionLedgers, battleLedgers });
  return {
    members: catalog.members.map((item) => ({ item, discovered: discovered.memberIds.has(item.id) })),
    enemies: catalog.enemies.map((item) => ({ item, discovered: discovered.enemyIds.has(item.id) })),
    equipment: catalog.equipment.map((item) => ({ item, discovered: discovered.equipmentIds.has(item.id) })),
    alchemyItems: catalog.alchemyItems.map((item) => ({ item, discovered: discovered.alchemyItemIds.has(item.id) })),
  };
}
