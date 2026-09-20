import { EQUIPMENT_CATALOG } from '../../rpg/equipmentCatalog.js';
import ShopItemCard from './ShopItemCard.jsx';

export default function RpgShop({ profile, onPurchaseRequest, pendingItemId }) {
  return <section><div className="mb-4"><p className="text-[10px] font-black tracking-widest text-slate-400">EQUIPMENT SHOP</p><h2 className="text-xl font-black text-slate-800">ショップ</h2></div><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{Object.values(EQUIPMENT_CATALOG).map((item) => <ShopItemCard key={item.id} item={item} profile={profile} purchasing={pendingItemId === item.id} onPurchase={onPurchaseRequest}/>)}</div></section>;
}
