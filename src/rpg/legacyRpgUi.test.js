import { describe, expect, it } from 'vitest';
import { shouldUseLegacyRpgUi } from './legacyRpgUi.js';
describe('legacy RPG UI boundary', () => { it('keeps old adventure and result UI sample-only', () => { expect(shouldUseLegacyRpgUi(false)).toBe(false); expect(shouldUseLegacyRpgUi(true)).toBe(true); }); });
