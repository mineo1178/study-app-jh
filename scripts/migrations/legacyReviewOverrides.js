// Decisions from the 2026-09-20 legacy migration review. Keys must remain
// taskId:historyId so a second history on the same task is never overridden.
export const LEGACY_REVIEW_OVERRIDES = Object.freeze({
  'flJVhBXjOFpagHeFSCRs:flJVhBXjOFpagHeFSCRs-1789475926297': { validationStatus: 'invalid', reason: 'legacy_manual_review' },
  'iWBl3fbNfxa5BMSXr5Bx:recovered-iWBl3fbNfxa5BMSXr5Bx-1788568730271-1788610744149': { validationStatus: 'invalid', reason: 'legacy_manual_review' },
  'PDZbVzVBXO4rThP2zgnp:1777954827448': { validationStatus: 'invalid', reason: 'legacy_manual_review' },
  'DrGzY6gQyK5k74yQvBK4:1787532777443': { validationStatus: 'valid', reason: 'legacy_manual_review' },
  '8XmPF1TJGBs9W7RmP08D:1779504538581': { validationStatus: 'valid', reason: 'legacy_manual_review' },
  'pfZWoBZ5q8R0wzfguDpk:1779495844255': { validationStatus: 'valid', reason: 'legacy_manual_review' },
  'Y0KwtVcqolfo7wJL8G0F:1779584891129': { validationStatus: 'valid', reason: 'legacy_manual_review' },
  '2GwYrGO1a54jsFk2UrJq:1780712081487': { validationStatus: 'valid', reason: 'legacy_manual_review' },
  'CeGkY2wOZMi5Y9oxZ1de:1780735057554': { validationStatus: 'valid', reason: 'legacy_manual_review' },
  '9DrlDVFRraClkZ86WrJb:1781253673325': { validationStatus: 'valid', reason: 'legacy_manual_review' },
});

export function getLegacyReviewOverride(taskId, historyId) {
  return LEGACY_REVIEW_OVERRIDES[`${taskId}:${historyId}`] || null;
}
