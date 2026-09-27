import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import EncyclopediaPanel from './EncyclopediaPanel.jsx';

describe('EncyclopediaPanel', () => {
  it('does not render undiscovered member details', () => {
    const html = renderToStaticMarkup(<EncyclopediaPanel profile={{}} ledgers={{ actionLedgers: [], battleLedgers: [] }} loading={false} error={null}/>);
    expect(html).toContain('主人公');
    expect(html).toContain('???');
    expect(html).not.toContain('アカネ');
  });
});
