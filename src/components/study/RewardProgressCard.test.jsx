import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import RewardProgressCard from './RewardProgressCard.jsx';
import { deriveRewardProgress } from '../../rpg/rewardProgress.js';

describe('RewardProgressCard', () => {
  it('explains confirmed balances, remaining study and the existing RPG destination', () => {
    const html = renderToStaticMarkup(<RewardProgressCard progress={deriveRewardProgress({ gold: 119 })}/>);
    expect(html).toContain('あと1分'); expect(html).toContain('計測中の時間は含みません');
    expect(html).toContain('RPGで報酬を使う'); expect(html).toContain('value="');
    expect(html).not.toContain('NaN');
  });
  it('shows available actions instead of zero-minute guidance', () => {
    const html = renderToStaticMarkup(<RewardProgressCard progress={deriveRewardProgress({ gold: 120 })}/>);
    expect(html).toContain('ガチャできます'); expect(html).not.toContain('あと0分');
  });
  it('has a helpful loading state and pending-correction explanation', () => {
    expect(renderToStaticMarkup(<RewardProgressCard progress={deriveRewardProgress(null)}/>)).toContain('報酬を確認しています');
    const html = renderToStaticMarkup(<RewardProgressCard progress={deriveRewardProgress({ gold: 120 }, { blocked: true })}/>);
    expect(html).toContain('購入・ガチャは利用できません'); expect(html).not.toContain('ガチャできます');
  });
});
