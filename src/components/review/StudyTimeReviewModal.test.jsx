import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import StudyTimeReviewModal from './StudyTimeReviewModal.jsx';
import ManualReviewPanel from './ManualReviewPanel.jsx';

const session = { id: 's', date: '2026-10-10', recordedSeconds: 900, taskSnapshot: { title: '数学の問題集' }, validation: { status: 'pending_review' },
  timeReview: { status: 'pending', reasons: ['idle_auto_stop', 'background_5_minutes'], measuredSeconds: 900, originalSegments: [{ startedAt: 1791594000000, endedAt: 1791594900000, durationSeconds: 900 }] } };
describe('student time review UI', () => {
  it('shows measured limits, intervals, self-report explanation and all four choices without technical language', () => {
    const html = renderToStaticMarkup(<StudyTimeReviewModal session={session} subjectLabel="数学"/>);
    for (const label of ['学習時間の確認', '数学の問題集', '00:15:00', '入力範囲', '対象の学習区間', '申告', '計測時間のまま確定', '入力した短い時間で確定', '0分で確定', '後で確認', '他のアプリで何をしていたかは確認できません']) expect(html).toContain(label);
    expect(html).not.toMatch(/pending_review|idle_auto_stop|background_5_minutes|Firestore|transaction/);
    expect(html).toContain('max-h-[90dvh]');
  });
  it('disables repeated submissions and deferral while saving and shows failure', () => {
    const html = renderToStaticMarkup(<StudyTimeReviewModal session={session} busy error="保存に失敗しました"/>);
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(4);
    expect(html).toContain('role="alert"'); expect(html).toContain('保存に失敗しました');
  });
  it('shows a deferred/reloaded record in the existing queue using student wording', () => {
    const html = renderToStaticMarkup(<ManualReviewPanel queue={{ pendingReviewSessions: [session], pendingCorrectionSessionIds: [] }} profile={{}} subjectLabel={() => '数学'}/>);
    expect(html).toContain('学習時間の確認待ち'); expect(html).toContain('学習時間を確認');
    expect(html).not.toMatch(/pending_review|idle_auto_stop|background_5_minutes|Reviewer/);
  });
  it('does not open a confirmation for a missing session', () => {
    expect(renderToStaticMarkup(<StudyTimeReviewModal session={null}/>)).toBe('');
  });
});
