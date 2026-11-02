import { ArrowRight, BarChart3, BookOpen, CalendarDays, CheckCircle2, ChevronRight, Clock3, Flag, GraduationCap, Sparkles, Trophy } from 'lucide-react';
import SubjectGoalProgress from './SubjectGoalProgress.jsx';
import StudyGoalEditor from './StudyGoalEditor.jsx';
import { dashboardDuration as duration } from '../../data/dashboardSelectors.js';

const fmt = (value) => duration(value ?? 0);

function SectionCard({ title, kicker, children, icon: Icon }) {
  return <section className="jh-card">
    <header className="jh-card__header">
      <div><p className="jh-eyebrow">{kicker}</p><h2>{title}</h2></div>
      {Icon && <Icon size={22} aria-hidden="true" className="jh-card__icon"/>}
    </header>
    {children}
  </section>;
}

function TextLink({ children, onClick }) {
  return <button type="button" className="jh-text-link" onClick={onClick}>{children}<ArrowRight size={17} aria-hidden="true"/></button>;
}

export default function LearningDashboard({ summary, onNavigate, studyGoals, onSaveGoals }) {
  if (summary.status === 'loading') return <section className="jh-card" role="status">学習状況を読み込んでいます…</section>;
  const s = summary;
  const progress = Math.max(0, Math.min(100, Number(s.percent) || 0));
  const actions = Array.isArray(s.actions) ? s.actions : [];
  const plans = Array.isArray(s.todayPlan) ? s.todayPlan : [];

  return <section aria-label="学習ダッシュボード" className="jh-dashboard">
    <header className="jh-hero">
      <div className="jh-hero__content">
        <p className="jh-hero__eyebrow"><BookOpen size={16} aria-hidden="true"/> TODAY'S STUDY</p>
        <h1>今日の学習を、ここから。</h1>
        <p className="jh-hero__lead">まずは学習項目を選ぼう。勉強した時間は毎日の記録に残ります。</p>
        <div className="jh-hero__stats" aria-label="今日の学習進捗">
          <div><span>確定した学習時間</span><strong>{fmt(s.todaySeconds)}</strong></div>
          <div><span>今日の目標</span><strong>{fmt(s.target)}</strong></div>
          <div><span>達成率</span><strong>{progress}%</strong></div>
        </div>
        <div className="jh-hero__progress"><div role="progressbar" aria-label="今日の目標達成率" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100" style={{ width: `${progress}%` }}/></div>
        <div className="jh-hero__footer">
          <p>{s.remaining ? `目標まであと ${fmt(s.remaining)}` : '今日の目標を達成しました'}</p>
          <button type="button" className="jh-button jh-button--light" onClick={() => onNavigate('study')}>
            <BookOpen size={19} aria-hidden="true"/> 学習項目を開く <ArrowRight size={17} aria-hidden="true"/>
          </button>
        </div>
      </div>
      <div className="jh-hero__ornament" aria-hidden="true"><div className="jh-hero__circle"/><div className="jh-hero__circle jh-hero__circle--second"/></div>
    </header>

    <div className="jh-dashboard__grid">
      <SectionCard title="今日の予定" kicker="TODAY'S PLAN" icon={CalendarDays}>
        {plans.length ? <ul className="jh-plan-list">
          {plans.slice(0, 3).map(goal => <li key={goal.id}>
            <div className="jh-plan-list__line"><strong>{goal.name}</strong><span>{fmt(goal.seconds)} / {fmt(goal.targetSeconds)}</span></div>
            <progress aria-label={`${goal.name}の達成率`} value={goal.barPercent} max="100"/>
            <span className="jh-plan-list__sub">{goal.achieved ? '完了' : `あと ${fmt(goal.remaining)}`}</span>
          </li>)}
        </ul> : <p className="jh-empty">今日の予定は未設定です。学習項目から始められます。</p>}
        {plans.length > 3 && <p className="jh-muted">ほか{plans.length - 3}科目は目標設定で確認できます。</p>}
        {onSaveGoals && <details className="jh-details"><summary>目標と週間プランを編集 <ChevronRight size={16}/></summary><div className="jh-details__body"><StudyGoalEditor studyGoals={studyGoals} onSave={onSaveGoals}/></div></details>}
      </SectionCard>

      <SectionCard title="次にやること" kicker="NEXT ACTION" icon={Flag}>
        {actions.length ? <ul className="jh-action-list">{actions.map(item => <li key={item.id}>
          <div><strong>{item.title}</strong><p>{item.detail}</p></div>
          <button type="button" className="jh-button jh-button--subtle" onClick={() => onNavigate(item.tab)}>{item.action}<ChevronRight size={16}/></button>
        </li>)}</ul> : <p className="jh-empty"><CheckCircle2 size={19}/> おすすめ項目はありません。</p>}
      </SectionCard>

      <SectionCard title="今週の積み重ね" kicker="WEEKLY PROGRESS" icon={BarChart3}>
        <div className="jh-stat-row">
          <div><strong>{s.weekDays}<small> / {s.weeklyStudyDays}日</small></strong><span>学習した日数</span></div>
          <div><strong>{s.weekSubjects}<small>教科</small></strong><span>取り組んだ教科</span></div>
        </div>
        <p className="jh-weekly-text">学習時間：<strong>{fmt(s.weekSeconds)}</strong> / {fmt(s.weeklyTargetSeconds)}</p>
        {s.achievement && <p className="jh-muted">次の実績：{s.achievement.name}（{s.achievement.progressText}）</p>}
        <div className="jh-link-row"><TextLink onClick={() => onNavigate('weekly-report')}>週間レポート</TextLink><TextLink onClick={() => onNavigate('study-analytics')}>学習分析</TextLink></div>
      </SectionCard>

      <SectionCard title="次の報酬" kicker="YOUR REWARDS" icon={Trophy}>
        {s.rewardProgress?.status === 'loading' ? <p role="status">報酬を確認しています…</p> :
          s.rewardProgress?.status === 'blocked' ? <p className="jh-alert">報酬の訂正が確認待ちです。確認画面をご覧ください。</p> :
          s.rewardProgress?.goals?.length ? <ul className="jh-reward-list">{s.rewardProgress.goals.map(goal =>
            <li key={goal.id}><Sparkles size={17} aria-hidden="true"/><span><strong>{goal.name}</strong>：{goal.available ? goal.id === 'gacha' ? 'ガチャできます' : '装備を入手できます' : goal.requirements.filter(r => r.remaining > 0).map(r => `あと${r.remaining}${r.unit}`).join('・')}</span></li>
          )}</ul> : <p className="jh-empty">次の報酬はありません。</p>}
        <TextLink onClick={() => onNavigate('rpg')}>RPGで詳細を見る</TextLink>
      </SectionCard>

      <SectionCard title="科目別の目標" kicker="SUBJECT GOALS" icon={BookOpen}>
        {s.subjectGoals?.length ? <SubjectGoalProgress goals={s.subjectGoals}/> : <p className="jh-empty">科目別目標はまだありません。</p>}
        <TextLink onClick={() => onNavigate('weekly-report')}>科目別目標を確認</TextLink>
      </SectionCard>

      <SectionCard title="最近の成果" kicker="STUDY RESULTS" icon={GraduationCap}>
        {s.latestGrade === undefined ? <p role="status">成績を確認しています…</p> : s.latestGrade ?
          <div className="jh-grade-summary"><strong>{s.latestGrade.name || 'テスト'}</strong><span>{s.latestGrade.date}</span><div>総合偏差値 <b>{Number.isFinite(s.latestGrade.average) ? s.latestGrade.average : '未登録'}</b></div></div> :
          <p className="jh-empty">成績データはまだありません。</p>}
        <TextLink onClick={() => onNavigate('tests')}>成績推移を見る</TextLink>
      </SectionCard>
    </div>
    <footer className="jh-dashboard__footer">
      <span><Clock3 size={16} aria-hidden="true"/> 有効な学習記録：今日 {s.todayCount}回 ／ {s.todaySubjects}教科</span>
      <TextLink onClick={() => onNavigate('monthly-calendar')}>月間カレンダー</TextLink>
    </footer>
  </section>;
}
