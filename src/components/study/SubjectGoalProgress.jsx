import { dashboardDuration as duration } from '../../data/dashboardSelectors.js';

export default function SubjectGoalProgress({ goals }) {
  return <ul className="mt-3 space-y-4">{goals.map(goal => <li key={goal.id} className="min-w-0">
    <h3 className="break-words text-sm font-bold">{goal.name}</h3>
    <p className="mt-1 break-words text-sm">{duration(goal.seconds)} / {duration(goal.targetSeconds)}</p>
    <progress aria-label={`${goal.name}の週間目標達成率`} value={goal.barPercent} max="100" className="mt-2 block h-2 w-full max-w-full accent-blue-600"/>
    <p className="mt-1 text-xs font-bold">{goal.achieved ? '達成' : `あと${duration(goal.remaining)}`} ・ {goal.percent}%</p>
  </li>)}</ul>;
}
