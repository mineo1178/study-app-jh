import { getResourceShopItem } from '../../rpg/resourceShopCatalog.js';
import { getShopItemState } from '../../rpg/shopUiLogic.js';
import { getEquipmentDisplayStats } from '../../rpg/equipmentDisplay.js';
import CommerceConfirmModal from './CommerceConfirmModal.jsx';

export default function PurchaseConfirmModal({ item, profile, onCancel, onConfirm, purchasing, error }) {
  const resource = getResourceShopItem(item?.id);
  const offer = resource || (item ? { name: item.name, cost: { gold: item.cost?.gold || 0, materials: item.cost?.materials || {} }, receive: { gold: 0, materials: {}, alchemyItems: {} } } : null);
  const equipmentState = !resource ? getShopItemState(profile, item) : null;
  const stats = getEquipmentDisplayStats(item);
  return <CommerceConfirmModal open={Boolean(item)} title={(item?.name || '') + 'を購入しますか？'} offer={offer} profile={profile} pending={purchasing} allowed={Boolean(resource || equipmentState?.purchasable)} onCancel={onCancel} onConfirm={onConfirm} confirmLabel="購入する" error={error}>{!resource && item && <div className="space-y-2 text-xs font-bold text-slate-600"><p>受取：{item.name} ×1（所持 {equipmentState.owned ? 1 : 0} → 1）</p><p>攻撃力 +{stats.attack} ／ 防御力 +{stats.defense}</p><p>特殊能力：{stats.specialAbilityLabel}</p><p>購入後は装備画面から装備できます。</p></div>}</CommerceConfirmModal>;
}
