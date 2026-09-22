const integer = (value) => Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;

export const durationFieldsFromSeconds = (value = 0) => {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return { hours: Math.floor(seconds / 3600), minutes: Math.floor((seconds % 3600) / 60), seconds: seconds % 60 };
};

export const durationSecondsFromFields = ({ hours = 0, minutes = 0, seconds = 0 } = {}) => {
  const h = integer(hours); const m = integer(minutes); const s = integer(seconds);
  if (h === null || m === null || s === null || m > 59 || s > 59) return null;
  return h * 3600 + m * 60 + s;
};

export const isCanonicalHistoryCorrectionTarget = (session) => Boolean(session?.id && !session.isLive && !session.isVirtualLegacy);

export const buildReviewQueue = ({ studySessions = [], integrity = {} } = {}) => {
  const pendingReviewSessions = studySessions.filter((session) => session.validation?.status === 'pending_review');
  const pendingCorrectionSessionIds = [...new Set((integrity.pendingSessionIds || []).filter(Boolean))];
  return { pendingReviewSessions, pendingCorrectionSessionIds, badgeCount: pendingReviewSessions.length + pendingCorrectionSessionIds.length };
};

export const isDurationCorrectionAllowed = (currentSeconds, targetSeconds) => Number.isInteger(targetSeconds) && targetSeconds >= 0 && targetSeconds <= Math.max(0, Number(currentSeconds) || 0);

export const reviewErrorMessage = (code) => ({
  REVIEWER_NOT_AUTHORIZED: '確認操作の権限がありません。',
  CORRECTION_REWARD_INCREASE_NOT_ALLOWED: '学習時間を増やす訂正はできません。',
  CORRECTION_TRANSITION_NOT_SUPPORTED: 'この状態では選択した訂正を実行できません。',
  REWARD_CORRECTION_PENDING: '報酬訂正が保留中のため、先に回収を完了してください。',
  REWARD_PROFILE_INSUFFICIENT: 'まだ回収に必要な資産が不足しています。',
  SESSION_NOT_FOUND: '対象の学習記録が見つかりません。',
}[code] || '確認処理に失敗しました。');
