import { describe, expect, it } from 'vitest';
import { DESKTOP_SIDEBAR_SCROLL_CLASS } from './sidebarLayout';

describe('desktop sidebar layout', () => {
  it('uses an independently scrollable dynamic viewport-height sidebar', () => {
    expect(DESKTOP_SIDEBAR_SCROLL_CLASS).toContain('h-dvh');
    expect(DESKTOP_SIDEBAR_SCROLL_CLASS).toContain('min-h-0');
    expect(DESKTOP_SIDEBAR_SCROLL_CLASS).toContain('overflow-y-auto');
    expect(DESKTOP_SIDEBAR_SCROLL_CLASS).toContain('overflow-x-hidden');
  });
});
