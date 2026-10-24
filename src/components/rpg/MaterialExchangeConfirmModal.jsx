import { getMaterialTrade, materialSwapId } from '../../rpg/materialTradeCatalog.js';
import CommerceConfirmModal from './CommerceConfirmModal.jsx';

export default function MaterialExchangeConfirmModal({ exchange, profile, exchanging, onCancel, onConfirm, error }) {
  const offer = getMaterialTrade(exchange?.recipeId || materialSwapId(exchange?.sourceMaterialKey, exchange?.targetMaterialKey));
  return <CommerceConfirmModal open={Boolean(exchange)} title="素材を交換しますか？" offer={offer} profile={profile} pending={exchanging} onCancel={onCancel} onConfirm={onConfirm} confirmLabel="交換する" error={error}/>;
}
