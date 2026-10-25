import { useRef, useState } from 'react';
import { JOB_CATALOG, getPlayerJob } from '../../rpg/jobCatalog.js';
import { heroJobSnapshot } from '../../rpg/jobStats.js';
import { createRpgActionId } from '../../data/rpgShopRepository.js';
const message = error => ({ INVALID_JOB_ID: '選択した職業を確認できません。', JOB_CHANGE_DURING_BATTLE: '戦闘中は転職できません。', JOB_PROFILE_CHANGED: '別の操作で職業が変わりました。最新の職業を確認してください。', JOB_UNCHANGED: '現在の職業と同じです。' }[error?.code || error?.message] || '転職の保存に失敗しました。もう一度お試しください。');
export default function JobPanel({ profile, onSave, locked, onPendingChange }) {
  const current = getPlayerJob(profile);
  const [selected, setSelected] = useState(current.id), [pending, setPending] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
  const lock = useRef(false), request = useRef(null);
  const before = heroJobSnapshot(profile), after = heroJobSnapshot({ ...profile, jobId: selected });
  const disabled = pending || locked || Boolean(profile?.activeBattleId);
  const save = async () => {
    if (lock.current || disabled || selected === current.id || !onSave) return;
    lock.current = true; setPending(true); onPendingChange?.(true); setError(''); setSuccess('');
    request.current ||= createRpgActionId('job-change');
    try {
      const result = await onSave({ jobId: selected, expected: { jobId: current.id, revision: profile?.jobRevision || 0 }, actionId: request.current });
      if (!result.applied && result.reason !== 'ALREADY_APPLIED') throw Error(result.reason);
      setSuccess(JOB_CATALOG[selected].name + 'に転職しました。'); request.current = null;
    } catch (failure) { setError(message(failure)); request.current = null; }
    finally { lock.current = false; setPending(false); onPendingChange?.(false); }
  };
  return <section className="min-w-0 space-y-4 rounded-2xl bg-white p-4 text-slate-800 shadow-sm">
    <h2 className="text-xl font-black">転職</h2><p className="font-bold">現在の職業：{current.name}</p><p className="text-sm">全6職業から無料で転職できます。レベル・育成配分・装備・所持品・進捗は維持されます。</p>
    <div className="grid gap-3 sm:grid-cols-2">{Object.values(JOB_CATALOG).map(job => <button type="button" key={job.id} aria-pressed={selected === job.id} disabled={disabled} onClick={() => { setSelected(job.id); setError(''); setSuccess(''); request.current = null; }} className={'min-w-0 break-words rounded-xl border-2 p-3 text-left disabled:opacity-50 ' + (selected === job.id ? 'border-violet-500 bg-violet-50' : 'border-slate-100')}><b>{job.name}</b><p className="mt-1 text-sm">{job.description}</p></button>)}</div>
    <p className="text-xs">単独戦の能力（装備・育成配分を含む）。塔・Weeklyではレベル成長も加算されます。</p>
    <dl aria-label="転職前後の能力" className="space-y-2 text-sm">{[['maxHp','最大HP'],['maxMp','最大MP'],['attack','攻撃力'],['defense','防御力']].map(([key,label]) => <div key={key} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-2"><dt>{label}</dt><dd>{before[key]} → {after[key]}</dd></div>)}</dl>
    <div className="space-y-2 text-sm"><p className="font-bold">{JOB_CATALOG[selected].name}の使用可能スキル</p>{after.skills.map(skill => <p key={skill.id}>{skill.name}：{skill.kind === 'attack' ? '威力' + skill.powerPercent + '%' : skill.kind === 'heal' ? '最大HPの' + skill.healPercent + '%回復' : 'ダメージ' + skill.damageReductionPercent + '%軽減'} ／ 消費MP {skill.mpCost}</p>)}</div>
    {disabled && !pending && <p role="alert">戦闘中は転職できません。</p>}{error && <p role="alert" className="text-rose-700">{error}</p>}{success && <p role="status" className="text-emerald-700">{success}</p>}
    <button type="button" onClick={save} disabled={disabled || selected === current.id || !onSave} className="min-h-11 w-full rounded-xl bg-violet-600 px-4 py-3 font-black text-white disabled:bg-slate-300">{pending ? '転職中…' : JOB_CATALOG[selected].name + 'に転職する（無料）'}</button>
  </section>;
}
