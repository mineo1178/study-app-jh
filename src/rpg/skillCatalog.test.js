import { describe, expect, it } from 'vitest';
import { SKILL_CATALOG } from './skillCatalog.js';
describe('starter skills', () => { it('defines three valid attack skills', () => { expect(Object.keys(SKILL_CATALOG)).toHaveLength(3); Object.values(SKILL_CATALOG).forEach((skill) => expect(skill).toMatchObject({ id: expect.any(String), name: expect.any(String), powerPercent: 125, maxUses: 2 })); }); });
