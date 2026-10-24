import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import RpgShop from './RpgShop.jsx';
import MaterialExchange from './MaterialExchange.jsx';
import PurchaseConfirmModal from './PurchaseConfirmModal.jsx';
import MaterialExchangeConfirmModal from './MaterialExchangeConfirmModal.jsx';
import { RESOURCE_SHOP_CATALOG } from '../../rpg/resourceShopCatalog.js';
const profile={ gold: 1000, materials: { iron: 10 } };
describe('commerce rendering', () => {
  it('shows all three shop categories, six sale buttons, and 12 alchemy-only labels without 0 GOLD prices', () => {
    const html=renderToStaticMarkup(<RpgShop profile={profile}/>);
    expect(html).toContain('学習素材'); expect(html).toContain('錬金素材');
    expect((html.match(/>購入する</g)||[])).toHaveLength(6);
    expect((html.match(/>錬金専用</g)||[])).toHaveLength(12);
    expect(html).not.toMatch(/>0 GOLD</);
  });
  it('shows three exchange categories and disables an unselected recipe', () => {
    const html=renderToStaticMarkup(<MaterialExchange profile={profile}/>);
    expect(html).toContain('GOLDへ交換'); expect(html).toContain('錬金素材へ交換'); expect(html).toMatch(/disabled=""[^>]*>交換内容を確認する/);
  });
  it('shows authoritative price, quantity and before/after values in a named modal', () => {
    const html=renderToStaticMarkup(<PurchaseConfirmModal item={RESOURCE_SHOP_CATALOG.material_iron} profile={profile}/>);
    expect(html).toContain('role="dialog"'); expect(html).toContain('aria-labelledby="commerce-confirm-title"');
    expect(html).toContain('所持 1000 → 970'); expect(html).toContain('所持 10 → 11'); expect(html).toContain('消費 30 ／ 受取 0');
  });
  it('disables confirmation for insufficient funds and while pending, and displays errors', () => {
    const poor=renderToStaticMarkup(<PurchaseConfirmModal item={RESOURCE_SHOP_CATALOG.material_iron} profile={{ gold: 0 }}/>);
    expect(poor).toContain('あと30 GOLD不足'); expect(poor).toMatch(/disabled=""[^>]*>購入する/);
    const pending=renderToStaticMarkup(<MaterialExchangeConfirmModal exchange={{recipeId:'gold_iron'}} profile={profile} exchanging error="失敗しました"/>);
    expect((pending.match(/disabled=""/g)||[])).toHaveLength(2); expect(pending).toContain('失敗しました');
  });
  it('does not render a cancelled purchase or exchange', () => {
    expect(renderToStaticMarkup(<PurchaseConfirmModal item={null} profile={profile}/>)).toBe('');
    expect(renderToStaticMarkup(<MaterialExchangeConfirmModal exchange={null} profile={profile}/>)).toBe('');
  });
});
