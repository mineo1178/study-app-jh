import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import RpgHub from '../../src/components/rpg/RpgHub.jsx';
import PurchaseConfirmModal from '../../src/components/rpg/PurchaseConfirmModal.jsx';
import MaterialExchangeConfirmModal from '../../src/components/rpg/MaterialExchangeConfirmModal.jsx';
import { normalizePlayerProfile } from '../../src/rpg/playerProfile.js';
import { MATERIAL_KEYS } from '../../src/rpg/rewardConfig.js';
import { getResourceShopItem } from '../../src/rpg/resourceShopCatalog.js';
import { preparePurchase, prepareResourcePurchase } from '../../src/data/rpgShopRepository.js';
import { prepareMaterialTrade } from '../../src/data/rpgMaterialExchangeRepository.js';

export default function Fixture() {
  const rich = () => normalizePlayerProfile({ gold: 3000, battleEnergy: 10, materials: Object.fromEntries(MATERIAL_KEYS.map(key => [key, 20])) });
  const [profile, setProfile] = useState(rich);
  const [candidate, setCandidate] = useState(null);
  const [exchange, setExchange] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [fail, setFail] = useState(false);
  const [count, setCount] = useState(0);
  const lock = useRef(false);
  const transact = async () => {
    if (lock.current) return;
    lock.current=true; setPending(true); setError(null);
    try {
      await new Promise(resolve=>setTimeout(resolve, 1200));
      if (fail) throw Error('検証用エラー：残高は変わりません');
      const base={ profile, actionId: 'fixture', now: 1 };
      const result=exchange ? prepareMaterialTrade({ ...base, ...exchange }) : getResourceShopItem(candidate.id) ? prepareResourcePurchase({ ...base, itemId: candidate.id }) : preparePurchase({ ...base, item: candidate });
      setProfile(result.profile); setCount(n=>n+1); setCandidate(null); setExchange(null);
    } catch(e) { setError(e.message); } finally { lock.current=false; setPending(false); }
  };
  return <main className="mx-auto max-w-6xl space-y-4 p-3 sm:p-6"><div className="space-y-2 rounded-xl bg-amber-50 p-3 text-xs"><p>画面検証専用：実コンポーネント・pure helperを使用、Firestore接続なし</p><p>確定回数：{count} ／ GOLD：{profile.gold}</p><button type="button" onClick={()=>setProfile(rich())} className="mr-3 rounded bg-white p-2">所持数をリセット</button><button type="button" onClick={()=>setProfile(normalizePlayerProfile({gold:0}))} className="mr-3 rounded bg-white p-2">不足状態</button><label><input type="checkbox" checked={fail} onChange={e=>setFail(e.target.checked)}/>失敗を再現</label></div><RpgHub profile={profile} progress={{}} towerProgress={{}} onPurchaseRequest={item=>{setError(null);setCandidate(item);}} onMaterialExchangeRequest={value=>{setError(null);setExchange(value);}} pendingItemId={pending&&candidate?.id} pendingMaterialExchange={pending&&Boolean(exchange)}/><PurchaseConfirmModal item={candidate} profile={profile} purchasing={pending} error={error} onCancel={()=>setCandidate(null)} onConfirm={transact}/><MaterialExchangeConfirmModal exchange={exchange} profile={profile} exchanging={pending} error={error} onCancel={()=>setExchange(null)} onConfirm={transact}/></main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
