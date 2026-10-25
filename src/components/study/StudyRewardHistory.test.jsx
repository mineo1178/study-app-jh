import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LedgerRewardSummary } from './StudyRewardHistory.jsx';
import RewardResultModal from '../rpg/RewardResultModal.jsx';
import { studyFeedback } from '../../feedback/feedbackEvents.js';
describe('saved reward amounts',()=>{
  it.each([['rpg-reward-v1',30],['rpg-reward-v2',3000]])('renders saved %s values without recalculation', (rewardPolicyVersion,gold)=>{
    const rewards={gold,battleEnergy:2,material:{key:'iron',quantity:3}};
    const html=renderToStaticMarkup(<LedgerRewardSummary ledger={{rewardPolicyVersion,rewards,status:'applied',basis:{recordedSeconds:999999}}}/>);expect(html).toContain(gold.toLocaleString('ja-JP')+'G');
    const feedback=studyFeedback({session:{timerId:'done',recordedSeconds:1800,validation:{status:'valid'},rewardPolicyVersion}},'数学',{applied:true,rewards});expect(feedback[0].details.join()).toContain('GOLD +'+gold.toLocaleString('ja-JP'));
    expect(renderToStaticMarkup(<RewardResultModal result={{recordedSeconds:1800,rewards}} profile={{gold}}/>)).toContain('+'+gold.toLocaleString('ja-JP'));
  });
  it('prefers effective amounts, shows reversal and never invents a missing grant',()=>{
    expect(renderToStaticMarkup(<LedgerRewardSummary ledger={{rewards:{gold:6000},effectiveRewards:{gold:2000}}}/>)).toContain('確定報酬：GOLD 2,000G');
    expect(renderToStaticMarkup(<LedgerRewardSummary ledger={{status:'reversed',rewards:{gold:6000},effectiveRewards:{gold:2000}}}/>)).toContain('確定報酬：GOLD 0G');
    expect(renderToStaticMarkup(<LedgerRewardSummary ledger={null}/>)).toContain('まだありません');
  });
});
