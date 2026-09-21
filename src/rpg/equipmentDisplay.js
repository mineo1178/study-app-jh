export const getEquipmentDisplayStats = (item) => ({ attack: Math.max(0, Number(item?.stats?.attack) || 0), defense: Math.max(0, Number(item?.stats?.defense) || 0), specialAbilityLabel: 'なし' });
