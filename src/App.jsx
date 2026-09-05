import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Play, Pause, Trash2, X, Zap, History, TrendingUp, Calendar as CalendarIcon, PieChart as PieChartIcon, BarChart2, RefreshCw, FlaskConical, LogOut, ChevronRight, BookOpen, GraduationCap, Laptop, Trophy, Save, ChevronLeft, Search, PlusCircle, Edit3, Eye, EyeOff, CheckSquare, Square, ListFilter, Award, Smartphone, Monitor, Clock } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, getDocs, updateDoc, deleteDoc, enableIndexedDbPersistence, addDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { HIGH_RISK_SESSION_MINUTES, LONG_SESSION_MINUTES, REVIEW_SESSION_MINUTES, damageForRecord, elapsedSeconds, gameProgress, getCreditedStudySeconds, getLastHeartbeatTime, getStaleSessionRecoveryDuration, isStaleRunningTask, recordIntegrity, taskStateAfterStaleRecovery, timerStateAfterContinueRunning, timerStateAfterPause, timerStateAfterStart, totalSecondsForFinish, validateStaleRecoveryEndTime } from './gameLogic';
// ==========================================
// Firebase Initialization (Vite/Vercel Dedicated)
// ==========================================
let env = {};
try {
    // @ts-ignore
    env = import.meta.env || {};
}
catch {
    console.warn("Preview environment detected: Using dummy Firebase config.");
}
const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY || "dummy-api-key",
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "dummy.firebaseapp.com",
    projectId: env.VITE_FIREBASE_PROJECT_ID || "dummy-project",
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "dummy.appspot.com",
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "000000000000",
    appId: env.VITE_FIREBASE_APP_ID || "1:000000000000:web:dummy",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
try {
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code !== 'failed-precondition')
            console.warn("Offline persistence disabled");
    });
}
catch { console.warn('Offline persistence setup could not start.'); }
const FAMILY_ID = 'oomine-study-2026';
const getTasksCol = () => collection(db, 'families', FAMILY_ID, 'apps', 'junior-high', 'tasks');
const getTestsCol = () => collection(db, 'families', FAMILY_ID, 'apps', 'junior-high', 'tests');
const APP_VERSION = 'v1.66';
const TIMER_HEARTBEAT_MS = 30 * 1000;
const DAILY_TARGET_SECONDS = 2 * 60 * 60;
const isDocumentHidden = () => typeof document !== 'undefined' && document.hidden;
// ==========================================
// Constants & Master Data
// ==========================================
const CATEGORIES = {
    SCHOOL: { id: 'school', label: '中学校', icon: GraduationCap, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', hex: '#3b82f6' },
    JUKU: { id: 'juku', label: '塾', icon: BookOpen, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', hex: '#10b981' },
    ETC: { id: 'etc', label: 'その他', icon: Laptop, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100', hex: '#a855f7' }
};
const SUBJECT_DEFS = {
    school: [
        { id: 's_math', label: '数学', hex: '#3b82f6', isMajor: true },
        { id: 's_japanese', label: '国語', hex: '#f43f5e', isMajor: true },
        { id: 's_social', label: '社会', hex: '#10b981', isMajor: true },
        { id: 's_science', label: '理科', hex: '#f59e0b', isMajor: true },
        { id: 's_english', label: '英語', hex: '#8b5cf6', isMajor: true },
        { id: 's_pe', label: '体育', hex: '#fb923c', isMajor: false },
        { id: 's_tech', label: '技術', hex: '#64748b', isMajor: false },
        { id: 's_music', label: '音楽', hex: '#ec4899', isMajor: false },
        { id: 's_home', label: '家庭科', hex: '#06b6d4', isMajor: false }
    ],
    juku: [
        { id: 'j_math', label: '数学', hex: '#2563eb' },
        { id: 'j_japanese', label: '国語', hex: '#e11d48' },
        { id: 'j_science', label: '理科', hex: '#d97706' },
        { id: 'j_social', label: '社会', hex: '#059669' },
        { id: 'j_english', label: '英語', hex: '#7c3aed' }
    ],
    etc: [
        { id: 'e_news', label: '新聞', hex: '#475569' },
        { id: 'e_manga', label: '歴史マンガ', hex: '#ea580c' },
        { id: 'e_duolingo', label: 'Duolingo', hex: '#84cc16' },
        { id: 'e_programming', label: 'プログラミング', hex: '#0ea5e9' }
    ]
};
// ==========================================
// Helper Functions
// ==========================================
const formatDuration = (seconds) => {
    if (!seconds || seconds < 0)
        return "0分";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
};
const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
};
const getHalfYearAgoStr = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
};
const getDateStrFromTimestamp = (timestamp) => {
    if (!timestamp)
        return null;
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime()))
        return null;
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
};
const getHistoryMonth = (historyItem) => {
    if (!historyItem?.date)
        return null;
    const parsed = new Date(historyItem.date);
    if (!Number.isNaN(parsed.getTime()))
        return parsed.getMonth() + 1;
    const parts = String(historyItem.date).split('-');
    return Number(parts[1]) || null;
};
const getMonthlyHistories = (task, selectedMonth) => {
    return (task.history || []).filter((h) => getHistoryMonth(h) === selectedMonth);
};
const getMonthlyDuration = (task, selectedMonth) => {
    return getMonthlyHistories(task, selectedMonth).reduce((sum, h) => sum + (h.duration || 0), 0);
};
const getLatestMonthlyTimestamp = (task, selectedMonth) => {
    const histories = getMonthlyHistories(task, selectedMonth);
    if (histories.length === 0)
        return 0;
    return Math.max(...histories.map((h) => h.endedAt || h.startedAt || new Date(h.date).getTime() || 0));
};
const shouldShowTaskInMonth = (task, selectedMonth) => {
    if (task.isRunning)
        return true;
    if (getMonthlyHistories(task, selectedMonth).length > 0)
        return true;
    const hasAnyHistory = (task.history || []).length > 0;
    if (hasAnyHistory)
        return false;
    if (!task.createdAt)
        return false;
    return getDateStrFromTimestamp(task.createdAt) === getTodayStr() && new Date(task.createdAt).getMonth() + 1 === selectedMonth;
};
const formatRecordDate = (timestamp) => {
    if (!timestamp)
        return '今月の記録なし';
    return new Date(timestamp).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const formatClockTime = (ms) => {
    if (!ms)
        return '--:--';
    const d = new Date(ms);
    return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
};
const getTaskMeta = (task) => {
    const categoryInfo = Object.values(CATEGORIES).find(c => c.id === task?.categoryId);
    const subjectInfo = SUBJECT_DEFS[task?.categoryId]?.find(s => s.id === task?.subjectId);
    return {
        categoryLabel: categoryInfo?.label || '学習',
        subjectLabel: subjectInfo?.label || categoryInfo?.label || '学習',
        color: subjectInfo?.hex || categoryInfo?.hex || '#94a3b8',
        typeLabel: task?.type === 'homework' ? '宿題' : '自習'
    };
};
const generateSampleData = () => {
    const tasks = [];
    const tests = [];
    const now = new Date();
    const startDate = new Date(2026, 0, 1);
    let seed = 16520260905;
    const seededRandom = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
    };
    const baseTasks = [
        { catId: 'school', subId: 's_math', type: 'homework', title: '数学ワーク' },
        { catId: 'school', subId: 's_english', type: 'homework', title: '英語ワーク' },
        { catId: 'school', subId: 's_japanese', type: 'self', title: '漢字ドリル' },
        { catId: 'juku', subId: 'j_math', type: 'homework', title: '塾演習' },
        { catId: 'etc', subId: 'e_duolingo', type: 'self', title: 'Duolingo' },
        { catId: 'etc', subId: 'e_programming', type: 'self', title: 'プログラミング' },
        { catId: 'school', subId: 's_social', type: 'self', title: '歴史まとめ' }
    ];
    baseTasks.forEach((base, idx) => {
        const history = [];
        let loopDate = new Date(startDate);
        while (loopDate <= now) {
            if (seededRandom() > 0.3) {
                const dStr = `${loopDate.getFullYear()}-${(loopDate.getMonth() + 1).toString().padStart(2, '0')}-${loopDate.getDate().toString().padStart(2, '0')}`;
                const duration = (Math.floor(seededRandom() * 60) + 15) * 60;
                const dummyStart = loopDate.getTime() + 1000 * 60 * 60 * 15; // ダミー:15時
                history.push({
                    id: `h-${dStr}-${idx}`,
                    date: dStr,
                    duration: duration,
                    memo: "演習と復習",
                    startedAt: dummyStart,
                    endedAt: dummyStart + (duration * 1000)
                });
            }
            loopDate.setDate(loopDate.getDate() + 1);
        }
        const lastUpdate = new Date(now.getTime() - seededRandom() * 100000000).getTime();
        tasks.push({
            id: `sample-${idx}`, categoryId: base.catId, subjectId: base.subId, type: base.type, title: base.title,
            history, currentDuration: 0, isRunning: false, sessionStartTime: null, lastUpdatedAt: lastUpdate
        });
    });
    const testNames = ["1月実力", "3学期末", "3月模試", "4月診断", "1学期中間"];
    const dates = ["2026-01-15", "2026-02-22", "2026-03-12", "2026-04-05", "2026-05-10"];
    dates.forEach((date, i) => {
        tests.push({
            id: `st-${i}`,
            category: i % 2 === 0 ? 'school' : 'juku',
            subType: 'normal',
            name: testNames[i],
            date: date,
            scores: {
                s_math: 60 + (i * 8),
                s_japanese: 70 + (i * 4),
                s_english: 65 + (i * 7),
                j_math: 55 + (i * 9),
                j_english: 60 + (i * 6)
            },
            average: 65 + (i * 3),
            rank: `${20 - i}位`
        });
    });
    return { tasks, tests };
};
// ==========================================
// Component: TodayTimeline (当日の学習タイムライン)
// ==========================================
const TodayTimeline = ({ tasks }) => {
    const [selectedHistory, setSelectedHistory] = useState(null);
    const [nowTick, setNowTick] = useState(() => Date.now());

    useEffect(() => {
        const hasRunning = tasks.some(t => t.isRunning && t.sessionStartTime);
        if (!hasRunning)
            return;
        const interval = setInterval(() => setNowTick(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [tasks]);

    const todayHistories = useMemo(() => {
        const todayStr = getTodayStr();
        const histories = [];
        tasks.forEach(t => {
            const meta = getTaskMeta(t);
            (t.history || []).forEach(h => {
                if (h.date === todayStr && h.startedAt && h.endedAt) {
                    histories.push({
                        ...h,
                        integrity: recordIntegrity(h),
                        color: meta.color,
                        subjectLabel: meta.subjectLabel,
                        categoryLabel: meta.categoryLabel,
                        typeLabel: meta.typeLabel,
                        taskTitle: t.title || 'Untitled',
                        isLive: false
                    });
                }
            });
            if (t.isRunning && t.sessionStartTime) {
                const start = Number(t.sessionStartTime);
                const stale = isStaleRunningTask(t, nowTick);
                const lastHeartbeat = getLastHeartbeatTime(t) || start;
                const startDate = new Date(start);
                const startStr = `${startDate.getFullYear()}-${(startDate.getMonth() + 1).toString().padStart(2, '0')}-${startDate.getDate().toString().padStart(2, '0')}`;
                if (startStr === todayStr) {
                    const displayEnd = stale ? Math.max(start, lastHeartbeat) : nowTick;
                    const elapsed = stale ? getStaleSessionRecoveryDuration(t, displayEnd) : Math.max(0, Math.floor((nowTick - start) / 1000));
                    histories.push({
                        id: `live-${t.id}`,
                        date: todayStr,
                        duration: elapsed,
                        memo: stale ? '計測内容を確認してください' : '現在計測中',
                        startedAt: start,
                        endedAt: displayEnd,
                        integrity: recordIntegrity({ duration: elapsed, startedAt: start, endedAt: displayEnd }),
                        color: meta.color,
                        subjectLabel: meta.subjectLabel,
                        categoryLabel: meta.categoryLabel,
                        typeLabel: meta.typeLabel,
                        taskTitle: t.title || 'Untitled',
                        isLive: !stale,
                        isStale: stale,
                        currentDuration: 0
                    });
                }
            }
        });
        return histories.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
    }, [tasks, nowTick]);

    const completedTodaySeconds = useMemo(() => {
        const todayStr = getTodayStr();
        return tasks.reduce((sum, t) => {
            return sum + (t.history || []).filter(h => h.date === todayStr).reduce((acc, h) => acc + (h.duration || 0), 0);
        }, 0);
    }, [tasks]);

    const runningTodaySeconds = useMemo(() => {
        const todayStr = getTodayStr();
        return tasks.reduce((sum, t) => {
            if (!t.isRunning || !t.sessionStartTime)
                return sum;
            const start = Number(t.sessionStartTime);
            const d = new Date(start);
            const startStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
            if (startStr !== todayStr)
                return sum;
            if (isStaleRunningTask(t, nowTick))
                return sum;
            return sum + (t.currentDuration || 0) + Math.max(0, Math.floor((nowTick - start) / 1000));
        }, 0);
    }, [tasks, nowTick]);

    const totalTodaySeconds = completedTodaySeconds + runningTodaySeconds;
    const remainingSeconds = Math.max(0, DAILY_TARGET_SECONDS - totalTodaySeconds);
    const goalPercent = Math.min(100, Math.round((totalTodaySeconds / DAILY_TARGET_SECONDS) * 100));
    const runningTask = tasks.find(t => t.isRunning);
    const goalMessage = remainingSeconds === 0
        ? '今日の2時間目標は達成済みです。追加するなら苦手科目を短く積み増し。'
        : runningTask
            ? `このまま継続すると、残り ${formatDuration(remainingSeconds)} で2時間に到達します。`
            : `2時間まで残り ${formatDuration(remainingSeconds)}。30分単位ならあと${Math.ceil(remainingSeconds / 1800)}コマです。`;

    const minTime = todayHistories.length > 0 ? Math.min(...todayHistories.map(h => h.startedAt)) : nowTick - (60 * 60 * 1000);
    const maxTime = todayHistories.length > 0 ? Math.max(...todayHistories.map(h => h.endedAt)) : nowTick + (60 * 60 * 1000);
    const paddingMs = 15 * 60 * 1000;
    const displayMinTime = minTime - paddingMs;
    const displayMaxTime = maxTime + paddingMs;
    const totalDurationMs = Math.max(1, displayMaxTime - displayMinTime);

    const taskSummary = todayHistories.reduce((acc, h) => {
        const key = `${h.categoryLabel}-${h.subjectLabel}-${h.taskTitle}`;
        if (!acc[key]) {
            acc[key] = { ...h, duration: 0, count: 0, latestAt: 0, hasLive: false };
        }
        acc[key].duration += (h.duration || 0) + (h.currentDuration || 0);
        acc[key].count += h.isLive ? 0 : 1;
        acc[key].latestAt = Math.max(acc[key].latestAt, h.endedAt || 0);
        acc[key].hasLive = acc[key].hasLive || h.isLive;
        acc[key].hasStale = acc[key].hasStale || h.isStale;
        return acc;
    }, {});
    const taskSummaryList = Object.values(taskSummary).sort((a, b) => b.latestAt - a.latestAt);

    return (<div className="bg-white p-4 sm:p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden text-left mb-6">
      <div className="flex flex-col gap-4 mb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xs sm:text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Clock size={16}/> Today's Timeline
          </h3>
          <p className="mt-2 text-[10px] sm:text-xs font-bold text-slate-400">今日やったタスクと、2時間目標までの残りを表示</p>
        </div>
        <div className="text-xs sm:text-sm font-black font-mono text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full shadow-sm flex items-center gap-1 self-start">
          Total: {formatDuration(totalTodaySeconds)} / 2h
        </div>
      </div>

      <div className="mb-5 rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-100">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Daily Goal</div>
          <div className="text-xs font-black text-slate-700">{goalPercent}%</div>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-white shadow-inner ring-1 ring-slate-100">
          <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${goalPercent}%` }}/>
        </div>
        <div className={`mt-3 text-xs font-black ${remainingSeconds === 0 ? 'text-emerald-600' : 'text-slate-600'}`}>{goalMessage}</div>
      </div>

      {todayHistories.length === 0 ? (<div className="rounded-[1.5rem] border-2 border-dashed border-slate-200 py-8 text-center">
        <p className="text-sm font-black text-slate-300">今日はまだ保存済みの学習記録がありません</p>
        <p className="mt-2 text-[10px] font-bold text-slate-300">START後、FINISHで保存するとここにタスクが出ます。</p>
      </div>) : (<>
        <div className="relative w-full h-9 sm:h-11 bg-slate-50 rounded-full overflow-hidden flex items-center border border-slate-100 shadow-inner">
          {todayHistories.map((h, i) => {
              const leftPercent = Math.max(0, ((h.startedAt - displayMinTime) / totalDurationMs) * 100);
              const widthPercent = Math.max(2, Math.min(100 - leftPercent, ((h.endedAt - h.startedAt) / totalDurationMs) * 100));
              return (<button key={`${h.id}-${i}`} type="button" onClick={() => setSelectedHistory(h)} className={`absolute h-full opacity-85 hover:opacity-100 active:scale-y-95 transition-all rounded-md border-r border-white/30 cursor-pointer ${h.isLive ? 'animate-pulse ring-2 ring-white/60' : ''}`} style={{
                      left: `${leftPercent}%`,
                      width: `${widthPercent}%`,
                      backgroundColor: h.color,
                  }} title={`${h.subjectLabel} / ${h.taskTitle}: ${formatClockTime(h.startedAt)} ~ ${h.isLive ? '計測中' : formatClockTime(h.endedAt)}`}/>);
          })}
        </div>
        <div className="flex justify-between text-[10px] font-black text-slate-400 mt-2 px-1">
          <span>{formatClockTime(displayMinTime)}</span>
          <span>{formatClockTime(displayMaxTime)}</span>
        </div>

        <div className="mt-5 space-y-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">今日やったタスク</div>
          {taskSummaryList.map((item, i) => (<button key={`${item.taskTitle}-${i}`} type="button" onClick={() => setSelectedHistory(item)} className="w-full rounded-2xl border border-slate-100 bg-white px-4 py-3 text-left shadow-sm hover:bg-slate-50 transition">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[9px] font-black text-slate-400">{item.categoryLabel}</span>
                  <span className="rounded-full px-2 py-0.5 text-[9px] font-black text-white" style={{ backgroundColor: item.color }}>{item.subjectLabel}</span>
                  {item.hasLive && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black text-blue-600 ring-1 ring-blue-100">LIVE</span>}
                  {item.hasStale && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black text-amber-600 ring-1 ring-amber-100">要確認</span>}
                  {item.integrity?.needsReview && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black text-amber-600 ring-1 ring-amber-100">要確認</span>}
                </div>
                <div className="truncate text-sm font-black text-slate-800">{item.taskTitle}</div>
                <div className="mt-1 text-[10px] font-bold text-slate-400">{item.hasStale ? '計測内容を確認してください' : item.count > 0 ? `${item.count}回保存` : '現在計測中'} ・ 最終 {formatClockTime(item.latestAt)}</div>
              </div>
              <div className="shrink-0 text-right font-mono text-lg font-black tracking-tighter text-blue-600">{formatDuration(item.duration)}</div>
            </div>
          </button>))}
        </div>
      </>)}

      {selectedHistory && (<div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onClick={() => setSelectedHistory(null)}>
        <div className="w-full max-w-md rounded-t-[2rem] bg-white p-6 shadow-2xl sm:rounded-[2rem]" onClick={(e) => e.stopPropagation()}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-500">{selectedHistory.categoryLabel}</span>
                <span className="rounded-full px-2.5 py-1 text-[10px] font-black text-white" style={{ backgroundColor: selectedHistory.color }}>{selectedHistory.subjectLabel}</span>
                {selectedHistory.isLive && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-600">LIVE</span>}
                {selectedHistory.isStale && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-600">要確認</span>}
                {selectedHistory.integrity?.needsReview && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-600">要確認</span>}
              </div>
              <h4 className="text-xl font-black leading-tight text-slate-800">{selectedHistory.taskTitle}</h4>
            </div>
            <button type="button" aria-label="履歴詳細を閉じる" title="閉じる" onClick={() => setSelectedHistory(null)} className="rounded-2xl bg-slate-50 p-3 text-slate-400"><X size={20}/></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="mb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">時間</div>
              <div className="text-sm font-black text-slate-700">{formatClockTime(selectedHistory.startedAt)}〜{selectedHistory.isLive ? '計測中' : formatClockTime(selectedHistory.endedAt)}</div>
            </div>
            <div className="rounded-2xl bg-blue-50 p-4">
              <div className="mb-1 text-[9px] font-black uppercase tracking-widest text-blue-300">学習時間</div>
              <div className="font-mono text-lg font-black tracking-tighter text-blue-700">{formatDuration((selectedHistory.duration || 0) + (selectedHistory.currentDuration || 0))}</div>
            </div>
          </div>
          <div className="mt-3 rounded-2xl bg-slate-50 p-4">
            <div className="mb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">内容</div>
            <div className="text-sm font-bold leading-relaxed text-slate-600">{selectedHistory.memo || '詳細なし'}</div>
          </div>
          {selectedHistory.integrity?.needsReview && <div className="mt-3 rounded-2xl bg-amber-50 p-4 text-xs font-bold leading-relaxed text-amber-700">
            長時間または時刻の整合性を確認したい記録です。学習履歴は残し、RPG報酬だけ上限・除外で扱います。
          </div>}
          {selectedHistory.isStale && <div className="mt-3 rounded-2xl bg-amber-50 p-4 text-xs font-bold leading-relaxed text-amber-700">
            長時間 heartbeat が止まっているため、現在までの時間はまだ確定していません。タスク詳細で計測内容を確認してください。
          </div>}
        </div>
      </div>)}
    </div>);
};
const StrictTimer = ({ task, isAnyOtherRunning, isSaving, onUpdate, onSave, onRequestRecovery }) => {
    const [sessionElapsed, setSessionElapsed] = useState(0);
    const timerRef = useRef(null);

    const getAccurateElapsed = useCallback(() => {
        if (!task.isRunning || !task.sessionStartTime)
            return 0;
        if (isStaleRunningTask(task))
            return getStaleSessionRecoveryDuration(task, getLastHeartbeatTime(task));
        return elapsedSeconds(task.sessionStartTime);
    }, [task]);

    const getAccurateTotal = useCallback(() => {
        return (task.currentDuration || 0) + getAccurateElapsed();
    }, [task.currentDuration, getAccurateElapsed]);

    const stopTimer = useCallback(() => {
        if (!task.isRunning || !task.sessionStartTime)
            return;
        if (isStaleRunningTask(task)) {
            onRequestRecovery(task);
            return;
        }
        const now = Date.now();
        const nextTask = timerStateAfterPause(task, now);
        onUpdate(task.id, {
            isRunning: nextTask.isRunning,
            currentDuration: nextTask.currentDuration,
            sessionStartTime: nextTask.sessionStartTime,
            lastUpdatedAt: nextTask.lastUpdatedAt,
            lastHeartbeatAt: nextTask.lastHeartbeatAt
        }, true);
        setSessionElapsed(0);
    }, [task, onUpdate, onRequestRecovery]);

    useEffect(() => {
        if (timerRef.current)
            clearInterval(timerRef.current);
        if (task.isRunning && task.sessionStartTime) {
            queueMicrotask(() => setSessionElapsed(getAccurateElapsed()));
            timerRef.current = setInterval(() => {
                const elapsed = getAccurateElapsed();
                setSessionElapsed(elapsed);
            }, 1000);
        }
        else {
            queueMicrotask(() => setSessionElapsed(0));
        }
        return () => {
            if (timerRef.current)
                clearInterval(timerRef.current);
        };
    }, [task.isRunning, task.sessionStartTime, getAccurateElapsed]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (!isDocumentHidden() && task.isRunning && task.sessionStartTime) {
                // タブ・スリープ復帰時も、開始時刻との差分で即座に表示を補正する。
                setSessionElapsed(getAccurateElapsed());
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [task.isRunning, task.sessionStartTime, getAccurateElapsed]);

    const handleStart = () => {
        if (task.isRunning)
            return;
        if (isAnyOtherRunning) {
            alert("他の教科を計測中です。一度終了させてください。");
            return;
        }
        const now = Date.now();
        const nextTask = timerStateAfterStart(task, now, isAnyOtherRunning);
        onUpdate(task.id, {
            isRunning: nextTask.isRunning,
            sessionStartTime: nextTask.sessionStartTime,
            lastUpdatedAt: nextTask.lastUpdatedAt,
            lastHeartbeatAt: nextTask.lastHeartbeatAt
        }, true);
    };

    const handleSaveClick = () => {
        if (isSaving)
            return;
        if (isStaleRunningTask(task)) {
            onRequestRecovery(task);
            return;
        }
        const totalToSave = totalSecondsForFinish(task, Date.now());
        if (totalToSave < 10) {
            alert("学習時間が短すぎます（10秒以上必要です）。");
            return;
        }
        onSave({ ...task, currentDuration: totalToSave, isRunning: false, sessionStartTime: null }, totalToSave);
    };

    const totalSeconds = getAccurateTotal();
    const stale = isStaleRunningTask(task);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const longSessionMessage = !stale && task.isRunning && totalMinutes > HIGH_RISK_SESSION_MINUTES
        ? '3時間以上続いています。計測内容を強く確認してください。'
        : !stale && task.isRunning && totalMinutes > REVIEW_SESSION_MINUTES
            ? '2時間以上続いています。休憩または計測内容を確認してください。'
            : !stale && task.isRunning && totalMinutes > LONG_SESSION_MINUTES
                ? '長時間学習中です。疲れたら休憩してください。'
                : null;
    return (<div className="bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 rounded-[2rem] p-6 sm:p-10 text-center shadow-2xl relative overflow-hidden border border-white/10 flex flex-col items-center justify-center">
      <div className="absolute -top-24 -right-24 w-56 h-56 bg-blue-500/20 rounded-full blur-3xl"/>
      <div className="absolute -bottom-28 -left-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl"/>
      <div className="mb-8 flex flex-col items-center justify-center w-full relative z-10">
        {task.isRunning && stale ? (<>
            <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-300/10 border border-amber-200/20 text-amber-100 text-[10px] sm:text-xs font-black uppercase tracking-widest">
              <span className="w-2 h-2 rounded-full bg-amber-300"/> 要確認
            </div>
            <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest mb-2">計測内容の確認が必要です</span>
            <div className="max-w-sm text-sm font-bold leading-relaxed text-white/90">
              長時間 heartbeat が止まっています。現在までの時間を通常の学習時間としては扱わず、確認後に履歴へ保存します。
            </div>
            <div className="mt-4 px-4 py-2 bg-amber-300/10 border border-amber-200/20 rounded-full text-xs sm:text-sm font-bold text-amber-100 flex items-center gap-2 shadow-sm">
              <History size={14}/> 最後の確認: {formatClockTime(getLastHeartbeatTime(task))}
            </div>
          </>) : task.isRunning ? (<>
            <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-400/10 border border-blue-300/20 text-blue-200 text-[10px] sm:text-xs font-black uppercase tracking-widest">
              <span className="w-2 h-2 rounded-full bg-blue-300 animate-pulse"/> Live Sync
            </div>
            <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest mb-2">現在の計測</span>
            <div className="text-5xl sm:text-7xl font-mono font-black tracking-tighter text-white leading-none drop-shadow-sm">
              {formatDuration(sessionElapsed)}
            </div>
            <div className="mt-3 text-[10px] sm:text-xs font-black tracking-widest flex items-center gap-1.5 text-blue-200">
                <Clock size={12}/> PAUSE または FINISH まで計測継続
            </div>
            <div className="mt-4 px-4 py-2 bg-white/10 border border-white/10 rounded-full text-xs sm:text-sm font-bold text-white/90 flex items-center gap-2 shadow-sm">
              <History size={14}/> 累計: {formatDuration(totalSeconds)}
            </div>
            {longSessionMessage && <div className="mt-4 rounded-2xl bg-amber-300/10 px-4 py-3 text-xs font-bold leading-relaxed text-amber-100 ring-1 ring-amber-200/20">{longSessionMessage}</div>}
          </>) : (<>
            <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest mb-2">累計学習時間</span>
            <div className="text-4xl sm:text-6xl font-mono font-black tracking-tighter text-white leading-none">
              {formatDuration(task.currentDuration || 0)}
            </div>
          </>)}
      </div>

      <div className="flex gap-3 w-full max-w-sm relative z-10">
        {!task.isRunning ? (<button type="button" onClick={handleStart} disabled={isSaving} className="flex-1 bg-white text-slate-950 font-black py-4 sm:py-5 rounded-xl sm:rounded-2xl shadow-lg active:scale-95 transition flex items-center justify-center gap-2 text-sm sm:text-lg uppercase leading-none hover:bg-blue-50 disabled:opacity-60">
            <Play size={20} fill="currentColor"/> START
          </button>) : stale ? (<button type="button" onClick={() => onRequestRecovery(task)} disabled={isSaving} className="flex-1 bg-amber-400 text-slate-950 font-black py-4 sm:py-5 rounded-xl sm:rounded-2xl shadow-lg active:scale-95 transition flex items-center justify-center gap-2 text-sm sm:text-lg uppercase leading-none hover:bg-amber-300 disabled:opacity-60">
            <Clock size={20}/> 確認する
          </button>) : (<button type="button" onClick={stopTimer} disabled={isSaving} className="flex-1 bg-amber-400 text-slate-950 font-black py-4 sm:py-5 rounded-xl sm:rounded-2xl shadow-lg active:scale-95 transition flex items-center justify-center gap-2 text-sm sm:text-lg uppercase leading-none hover:bg-amber-300 disabled:opacity-60">
            <Pause size={20} fill="currentColor"/> PAUSE
          </button>)}
        <button type="button" onClick={handleSaveClick} disabled={isSaving} className="flex-1 bg-blue-600 text-white font-black py-4 sm:py-5 rounded-xl sm:rounded-2xl hover:bg-blue-500 transition flex items-center justify-center gap-2 text-sm sm:text-lg uppercase leading-none shadow-lg disabled:opacity-60">
          <Save size={20}/> {isSaving ? 'SAVING' : 'FINISH'}
        </button>
      </div>
    </div>);
};

const ActiveTimerSummary = ({ task, onHeartbeat, onRequestRecovery }) => {
    const [sessionElapsed, setSessionElapsed] = useState(0);
    const timerRef = useRef(null);
    const heartbeatRef = useRef(0);

    const getAccurateElapsed = useCallback(() => {
        if (!task?.isRunning || !task?.sessionStartTime)
            return 0;
        if (isStaleRunningTask(task))
            return getStaleSessionRecoveryDuration(task, getLastHeartbeatTime(task));
        return elapsedSeconds(task.sessionStartTime);
    }, [task]);

    useEffect(() => {
        if (timerRef.current)
            clearInterval(timerRef.current);
        if (task?.isRunning && task?.sessionStartTime) {
            queueMicrotask(() => setSessionElapsed(getAccurateElapsed()));
            timerRef.current = setInterval(() => {
                const now = Date.now();
                setSessionElapsed(getAccurateElapsed());
                if (now - heartbeatRef.current >= TIMER_HEARTBEAT_MS) {
                    heartbeatRef.current = now;
                    if (!isStaleRunningTask(task, now))
                        onHeartbeat(task.id, { lastUpdatedAt: now, lastHeartbeatAt: now }, true);
                }
            }, 1000);
        }
        else {
            queueMicrotask(() => setSessionElapsed(0));
        }
        return () => {
            if (timerRef.current)
                clearInterval(timerRef.current);
        };
    }, [task, getAccurateElapsed, onHeartbeat]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (!task?.isRunning || !task?.sessionStartTime)
                return;
            const now = Date.now();
            if (isDocumentHidden() && !isStaleRunningTask(task, now)) {
                heartbeatRef.current = now;
                onHeartbeat(task.id, { lastUpdatedAt: now, lastHeartbeatAt: now }, true);
                return;
            }
            if (!isDocumentHidden()) {
                setSessionElapsed(getAccurateElapsed());
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [task, getAccurateElapsed, onHeartbeat]);

    if (!task?.isRunning || !task?.sessionStartTime)
        return null;

    const totalSeconds = (task.currentDuration || 0) + sessionElapsed;
    const stale = isStaleRunningTask(task);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const longSessionMessage = !stale && totalMinutes > HIGH_RISK_SESSION_MINUTES
        ? '3時間以上続いています。計測内容を強く確認してください。'
        : !stale && totalMinutes > REVIEW_SESSION_MINUTES
            ? '2時間以上続いています。休憩または計測内容を確認してください。'
            : !stale && totalMinutes > LONG_SESSION_MINUTES
                ? '長時間学習中です。疲れたら休憩してください。'
                : null;
    const categoryInfo = Object.values(CATEGORIES).find(c => c.id === task.categoryId);
    const subjectInfo = SUBJECT_DEFS[task.categoryId]?.find(s => s.id === task.subjectId);
    const subjectLabel = subjectInfo?.label || categoryInfo?.label || '学習';
    const startedTime = new Date(Number(task.sessionStartTime)).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    return (<div className="relative overflow-hidden rounded-[2rem] sm:rounded-[2.5rem] bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-950 p-5 sm:p-6 text-left text-white shadow-2xl shadow-blue-200/50 ring-1 ring-white/20">
      <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-white/10 blur-2xl"/>
      <div className="absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-cyan-300/20 blur-2xl"/>
      <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-blue-50 ring-1 ring-white/20">
              <span className={`h-2 w-2 rounded-full ${stale ? 'bg-amber-300' : 'bg-emerald-300 animate-pulse'}`}/> {stale ? '要確認' : 'LIVE TIMER'}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black text-blue-50 ring-1 ring-white/15">他端末同期中</span>
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black text-blue-50 ring-1 ring-white/15">{APP_VERSION}</span>
          </div>
          <div className="text-xs font-black uppercase tracking-widest text-blue-100/80">{stale ? '計測内容の確認が必要です' : '現在計測中'}</div>
          <div className="mt-1 truncate text-2xl sm:text-3xl font-black tracking-tight">{subjectLabel} / {task.title || 'Untitled'}</div>
          <div className="mt-2 text-xs font-bold text-blue-100/80">開始 {startedTime} ・ 最後の確認 {formatClockTime(getLastHeartbeatTime(task))}</div>
          {stale && <button type="button" onClick={() => onRequestRecovery(task)} className="mt-4 rounded-2xl bg-amber-300 px-4 py-3 text-xs font-black text-slate-950 shadow-lg active:scale-95">計測内容を確認する</button>}
          {longSessionMessage && <div className="mt-3 rounded-2xl bg-amber-300/10 px-4 py-3 text-xs font-bold leading-relaxed text-amber-100 ring-1 ring-amber-200/20">{longSessionMessage}</div>}
        </div>

        <div className={`grid gap-2 sm:gap-3 lg:min-w-[300px] ${stale ? 'grid-cols-1' : 'grid-cols-2'}`}>
          <div className="rounded-3xl bg-white/15 p-4 text-center ring-1 ring-white/20 backdrop-blur-xl">
            <div className="mb-2 text-[9px] font-black uppercase tracking-widest text-blue-100/80">{stale ? '確認候補' : '今回'}</div>
            <div className="font-mono text-2xl sm:text-3xl font-black tracking-tighter">{stale ? '要確認' : formatDuration(sessionElapsed)}</div>
          </div>
          {!stale && <div className="rounded-3xl bg-white/10 p-4 text-center ring-1 ring-white/15 backdrop-blur-xl">
            <div className="mb-2 text-[9px] font-black uppercase tracking-widest text-blue-100/80">累計</div>
            <div className="font-mono text-2xl sm:text-3xl font-black tracking-tighter">{formatDuration(totalSeconds)}</div>
          </div>}
        </div>
      </div>
    </div>);
};
const formatDateTimeLocalValue = (ms) => {
    if (!ms)
        return '';
    const d = new Date(ms);
    const yyyy = d.getFullYear();
    const mm = `${d.getMonth() + 1}`.padStart(2, '0');
    const dd = `${d.getDate()}`.padStart(2, '0');
    const hh = `${d.getHours()}`.padStart(2, '0');
    const mi = `${d.getMinutes()}`.padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

const AdventureStatus = ({ adventure }) => {
    const { levelInfo, boss, daily, weekly, weeklyMissions, items, skills, chests, reviewRecords, balance } = adventure;
    const weaknessNames = (boss.boss?.weaknesses || []).map((id) => {
        const category = id.startsWith('j_') ? 'juku' : id.startsWith('s_') ? 'school' : 'etc';
        return SUBJECT_DEFS[category]?.find((subject) => subject.id === id)?.label;
    }).filter(Boolean);
    const nextQuest = daily.quests.find((quest) => !quest.achieved);
    return (<section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-violet-700 via-indigo-700 to-slate-900 p-5 sm:p-7 text-white shadow-xl shadow-indigo-200/50 ring-1 ring-indigo-300/30">
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-fuchsia-300/15 blur-3xl"/>
      <div className="relative z-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.2em] text-indigo-100"><Trophy size={14}/> ADVENTURE STATUS</div>
            <h2 className="mt-1 text-2xl font-black tracking-tight">勇者 Lv.{levelInfo.level}</h2>
            <p className="mt-1 text-xs font-bold text-indigo-100">次のレベルまであと {levelInfo.expToNext} EXP（約{levelInfo.expToNext}分）</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-3 text-right ring-1 ring-white/15">
            <div className="text-[9px] font-black tracking-widest text-indigo-100">今週の冒険</div>
            <div className="mt-1 text-lg font-black">{weekly.days} / {weekly.target} 日</div>
          </div>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-950/40 ring-1 ring-white/10"><div className="h-full rounded-full bg-amber-300 transition-all" style={{ width: `${(levelInfo.expIntoLevel / levelInfo.expForNext) * 100}%` }}/></div>
        <div className="mt-2 text-right text-[10px] font-black text-indigo-100">EXP {levelInfo.expIntoLevel} / {levelInfo.expForNext}</div>
        {boss.boss ? <div className="mt-5 rounded-2xl bg-slate-950/25 p-4 ring-1 ring-white/10">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><span className="text-[10px] font-black tracking-widest text-indigo-100">第{boss.boss.chapter}章</span><h3 className="text-lg font-black">{boss.boss.name}</h3></div><span className="rounded-full bg-rose-400/20 px-3 py-1 text-[10px] font-black text-rose-100">弱点: {weaknessNames.join(' / ')}</span></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-950/50"><div className="h-full rounded-full bg-rose-300" style={{ width: `${(boss.hpRemaining / boss.boss.hp) * 100}%` }}/></div>
          <div className="mt-2 text-right text-[10px] font-black text-indigo-100">HP {boss.hpRemaining} / {boss.boss.hp} ・撃破まであと{boss.hpRemaining} DAMAGE</div>
        </div> : <div className="mt-5 rounded-2xl bg-amber-300/15 p-4 text-sm font-black text-amber-100">魔王撃破！伝説の冒険者です。</div>}
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><div className="text-[10px] font-black tracking-widest text-indigo-100">今日のクエスト {daily.completedCount}/{daily.quests.length}</div><div className="mt-2 space-y-1.5 text-xs font-bold">{daily.quests.map((quest) => <div key={quest.id} className={quest.achieved ? 'text-emerald-200' : 'text-white'}>{quest.achieved ? '✓' : '□'} {quest.label} <span className="text-indigo-200">{quest.reward}</span></div>)}</div></div>
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><div className="text-[10px] font-black tracking-widest text-indigo-100">次の小さな目標</div><p className="mt-2 text-sm font-black">{nextQuest ? `${nextQuest.label}まであと${nextQuest.remaining}${nextQuest.id === 'subjects' ? '教科' : '分'}` : weekly.remaining > 0 ? `あと${weekly.remaining}日で週間宝箱` : '今週の宝箱を獲得！'}</p><p className="mt-2 text-[10px] font-bold text-indigo-100">宝箱 {chests} ・装備 {items.length} ・スキル {skills.length}</p></div>
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><div className="text-[10px] font-black tracking-widest text-indigo-100">バランスボーナス</div><p className="mt-2 text-xs font-bold text-indigo-50">今日 {balance.subjectCount}教科 ・EXP x{balance.expMultiplier} ・ダメージ x{balance.damageMultiplier}</p><p className="mt-2 text-[10px] font-bold text-indigo-100">1教科長時間より、短めに区切って教科を変えると有利です。</p></div>
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><div className="text-[10px] font-black tracking-widest text-indigo-100">週間ミッション</div><div className="mt-2 space-y-1.5 text-xs font-bold">{weeklyMissions.map((mission) => <div key={mission.id} className={mission.achieved ? 'text-emerald-200' : 'text-white'}>{mission.achieved ? '✓' : '□'} {mission.label}{!mission.achieved && <span className="text-indigo-200"> あと{mission.remaining}</span>}</div>)}</div></div>
        </div>
        {reviewRecords.length > 0 && <div className="mt-4 rounded-2xl bg-amber-300/15 px-4 py-3 text-xs font-bold text-amber-100 ring-1 ring-amber-200/20">要確認セッション {reviewRecords.length}件。履歴は残したまま、RPG報酬は上限または重複除外で計算します。</div>}
      </div>
    </section>);
};

// ==========================================
// Main Application Component
// ==========================================
export default function App() {
    const [user, setUser] = useState(null);
    const [isSampleMode, setIsSampleMode] = useState(false);
    const [isMobileView, setIsMobileView] = useState(false);
    const [activeTab, setActiveTab] = useState('daily');
    const [activeCategory, setActiveCategory] = useState('school');
    // カテゴリ連動用の選択中の教科State
    const [selectedSubjectId, setSelectedSubjectId] = useState('s_math');
    const [tasks, setTasks] = useState([]);
    const [tests, setTests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTaskId, setSelectedTaskId] = useState(null);
    const [isAddingTask, setIsAddingTask] = useState(false);
    const [isAddingTest, setIsAddingTest] = useState(false);
    const [editingTest, setEditingTest] = useState(null);
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [testStartDate, setTestStartDate] = useState(getHalfYearAgoStr);
    const [testEndDate, setTestEndDate] = useState(getTodayStr);
    const [visibleSubjects, setVisibleSubjects] = useState(['s_math', 's_english', 'j_math', 'average']);
    const [questResult, setQuestResult] = useState(null);
    const [recoveryTaskId, setRecoveryTaskId] = useState(null);
    const [manualRecoveryEnd, setManualRecoveryEnd] = useState('');
    const [staleCheckNow, setStaleCheckNow] = useState(() => Date.now());
    const [isSavingRecord, setIsSavingRecord] = useState(false);
    const savingRecordRef = useRef(false);
    const recoverySavingRef = useRef(false);
    const isAnyTaskRunning = useMemo(() => tasks.some(t => t.isRunning), [tasks]);
    const runningTask = useMemo(() => tasks.find(t => t.isRunning) || null, [tasks]);
    const staleRunningTasks = useMemo(() => tasks.filter(t => isStaleRunningTask(t, staleCheckNow)), [tasks, staleCheckNow]);
    const recoveryTask = useMemo(() => tasks.find(t => t.id === recoveryTaskId) || null, [tasks, recoveryTaskId]);
    const adventure = useMemo(() => gameProgress(tasks, getTodayStr()), [tasks]);
    const todayTaskSummaries = useMemo(() => {
        const todayStr = getTodayStr();
        return tasks.flatMap(task => {
            const meta = getTaskMeta(task);
            const todayHistories = (task.history || []).filter(h => h.date === todayStr);
            const totalDuration = todayHistories.reduce((sum, h) => sum + (h.duration || 0), 0);
            const latestTimestamp = todayHistories.length > 0
                ? Math.max(...todayHistories.map(h => h.endedAt || h.startedAt || 0))
                : 0;
            if (todayHistories.length === 0 && !task.isRunning)
                return [];
            return [{
                    task,
                    ...meta,
                    count: todayHistories.length,
                    totalDuration,
                    latestTimestamp,
                    isRunning: task.isRunning,
                    isStale: isStaleRunningTask(task, staleCheckNow)
                }];
        }).sort((a, b) => {
            if (a.isRunning !== b.isRunning)
                return a.isRunning ? -1 : 1;
            return (b.latestTimestamp || 0) - (a.latestTimestamp || 0);
        });
    }, [tasks, staleCheckNow]);
    useEffect(() => {
        if (!isAnyTaskRunning)
            return;
        const interval = setInterval(() => setStaleCheckNow(Date.now()), 30 * 1000);
        return () => clearInterval(interval);
    }, [isAnyTaskRunning]);
    useEffect(() => {
        if (!recoveryTaskId && staleRunningTasks.length > 0) {
            const task = staleRunningTasks[0];
            queueMicrotask(() => {
                setRecoveryTaskId(task.id);
                setManualRecoveryEnd(formatDateTimeLocalValue(getLastHeartbeatTime(task)));
            });
        }
    }, [recoveryTaskId, staleRunningTasks]);
    useEffect(() => {
        if (recoveryTask)
            queueMicrotask(() => setManualRecoveryEnd(formatDateTimeLocalValue(getLastHeartbeatTime(recoveryTask))));
    }, [recoveryTask]);
    const handleCategoryChange = (categoryId) => {
        setActiveCategory(categoryId);
        setSelectedSubjectId(SUBJECT_DEFS[categoryId]?.[0]?.id || '');
    };
    const fetchData = useCallback(async (silent = false) => {
        if (isSampleMode || !auth.currentUser)
            return;
        if (!silent)
            setLoading(true);
        try {
            const taskSnap = await getDocs(getTasksCol());
            const testSnap = await getDocs(getTestsCol());
            setTasks(taskSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setTests(testSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
        }
        catch (err) {
            console.error("Fetch Error:", err);
        }
        finally {
            if (!silent)
                setLoading(false);
        }
    }, [isSampleMode]);
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => {
            if (!isSampleMode) {
                setUser(u);
                if (u)
                    fetchData();
                else
                    setLoading(false);
            }
        });
        return () => unsub();
    }, [isSampleMode, fetchData]);
    useEffect(() => {
        if (user && !isSampleMode)
            queueMicrotask(() => fetchData(true));
    }, [user, isSampleMode, fetchData]);

    // 他端末で開始・停止されたタイマーを即時反映するため、Firestoreをリアルタイム購読する。
    useEffect(() => {
        if (!user || isSampleMode)
            return;
        const unsubTasks = onSnapshot(getTasksCol(), (snap) => {
            setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (err) => {
            console.error("Task realtime sync error:", err);
        });
        const unsubTests = onSnapshot(getTestsCol(), (snap) => {
            setTests(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
        }, (err) => {
            console.error("Test realtime sync error:", err);
        });
        return () => {
            unsubTasks();
            unsubTests();
        };
    }, [user, isSampleMode]);
    const handleLogin = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        try {
            setLoading(true);
            await signInWithEmailAndPassword(auth, fd.get('email'), fd.get('password'));
        }
        catch {
            alert("ログイン失敗。");
        }
        finally {
            setLoading(false);
        }
    };
    const toggleSampleMode = () => {
        if (!isSampleMode) {
            const { tasks: sTasks, tests: sTests } = generateSampleData();
            setTasks(sTasks);
            setTests(sTests);
            setIsSampleMode(true);
            setLoading(false);
        }
        else {
            setIsSampleMode(false);
            setIsMobileView(false);
            setTasks([]);
            setTests([]);
            setLoading(true);
            fetchData();
        }
    };
    const handleUpdateLocalTask = useCallback(async (id, updates, syncToCloud = false) => {
        const updatesWithTimestamp = { ...updates };
        setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updatesWithTimestamp } : t));
        if (syncToCloud && !isSampleMode && user) {
            try {
                await updateDoc(doc(getTasksCol(), id), updatesWithTimestamp);
            }
            catch (err) {
                console.error("Task sync failed:", err);
            }
        }
    }, [isSampleMode, user]);
    const handleSaveRecord = async (task, totalSeconds) => {
        if (savingRecordRef.current)
            return;
        savingRecordRef.current = true;
        setIsSavingRecord(true);
        try {
            const memo = prompt("学習内容：") || "";
            const now = Date.now();
            const today = getTodayStr();
            const beforeAdventure = gameProgress(tasks, today);
            const startedAt = task.sessionStartTime || (now - (totalSeconds * 1000));
            const endedAt = now;
            const historyItem = {
                id: `${task.id}-${now}`,
                date: today,
                duration: totalSeconds,
                memo,
                startedAt,
                endedAt
            };
            const updatedHistory = [...(task.history || []), historyItem];
            const updates = { history: updatedHistory, currentDuration: 0, isRunning: false, sessionStartTime: null, lastUpdatedAt: now };
            const projectedTasks = tasks.map((item) => item.id === task.id ? { ...item, ...updates } : item);
            const afterAdventure = gameProgress(projectedTasks, today);
            const savedRecord = afterAdventure.records.find((record) => record.id === historyItem.id);
            const credited = getCreditedStudySeconds({ ...historyItem, subjectId: task.subjectId }, beforeAdventure.records.map((record) => record.startedAt && record.creditedDuration > 0 ? { start: Number(record.startedAt), end: Number(record.startedAt) + record.creditedDuration * 1000 } : null).filter(Boolean));
            const resultRecord = savedRecord || { ...historyItem, subjectId: task.subjectId, creditedDuration: credited.creditedDuration, integrity: credited.integrity };
            const newItems = afterAdventure.items.filter((item) => !beforeAdventure.items.some((previous) => previous.id === item.id));
            const newSkills = afterAdventure.skills.filter((skill) => !beforeAdventure.skills.some((previous) => previous.id === skill.id));

            if (!isSampleMode && user) {
                await updateDoc(doc(getTasksCol(), task.id), updates);
            }
            handleUpdateLocalTask(task.id, updates);
            setQuestResult({
                exp: Math.max(0, afterAdventure.levelInfo.totalExp - beforeAdventure.levelInfo.totalExp),
                recordedDuration: historyItem.duration,
                creditedDuration: resultRecord.creditedDuration,
                damage: damageForRecord(resultRecord, beforeAdventure.boss.boss),
                levelUp: afterAdventure.levelInfo.level > beforeAdventure.levelInfo.level,
                newItems,
                newSkills,
                chest: afterAdventure.chests > beforeAdventure.chests,
                needsReview: resultRecord.integrity?.needsReview,
                flags: resultRecord.integrity?.flags || [],
            });
            setSelectedTaskId(null);
        }
        catch (err) {
            console.error("Record save failed:", err);
            alert("保存に失敗しました。");
        }
        finally {
            savingRecordRef.current = false;
            setIsSavingRecord(false);
        }
    };
    const openRecoveryModal = useCallback((task) => {
        if (!task)
            return;
        setRecoveryTaskId(task.id);
        setManualRecoveryEnd(formatDateTimeLocalValue(getLastHeartbeatTime(task)));
    }, []);
    const handleContinueStaleTask = async () => {
        if (!recoveryTask || recoverySavingRef.current)
            return;
        recoverySavingRef.current = true;
        setIsSavingRecord(true);
        try {
            const now = Date.now();
            const nextTask = timerStateAfterContinueRunning(recoveryTask, now);
            const updates = { lastUpdatedAt: nextTask.lastUpdatedAt, lastHeartbeatAt: nextTask.lastHeartbeatAt };
            if (!isSampleMode && user) {
                await updateDoc(doc(getTasksCol(), recoveryTask.id), updates);
            }
            handleUpdateLocalTask(recoveryTask.id, updates);
            setRecoveryTaskId(null);
            setStaleCheckNow(now);
        }
        catch (err) {
            console.error("Stale recovery continue failed:", err);
            alert("復旧に失敗しました。");
        }
        finally {
            recoverySavingRef.current = false;
            setIsSavingRecord(false);
        }
    };
    const handleFinishStaleTask = async (endTime, reasonLabel) => {
        if (!recoveryTask || recoverySavingRef.current)
            return;
        recoverySavingRef.current = true;
        setIsSavingRecord(true);
        try {
            const now = Date.now();
            const validation = validateStaleRecoveryEndTime(recoveryTask, endTime, now);
            if (!validation.valid) {
                alert(validation.reason === 'beforeStart' ? "終了時刻は開始時刻より後にしてください。" : validation.reason === 'future' ? "未来の時刻は指定できません。" : "終了時刻を確認してください。");
                return;
            }
            const totalSeconds = getStaleSessionRecoveryDuration(recoveryTask, validation.endTime);
            if (totalSeconds < 10) {
                alert("学習時間が短すぎます（10秒以上必要です）。");
                return;
            }
            const beforeAdventure = gameProgress(tasks, getTodayStr());
            const memo = `復旧確認: ${reasonLabel}`;
            const result = taskStateAfterStaleRecovery(recoveryTask, validation.endTime, memo, now);
            if (!result.valid)
                return;
            const updates = {
                history: result.task.history,
                currentDuration: result.task.currentDuration,
                isRunning: result.task.isRunning,
                sessionStartTime: result.task.sessionStartTime,
                lastUpdatedAt: result.task.lastUpdatedAt,
                lastHeartbeatAt: result.task.lastHeartbeatAt
            };
            if (!isSampleMode && user) {
                await updateDoc(doc(getTasksCol(), recoveryTask.id), updates);
            }
            handleUpdateLocalTask(recoveryTask.id, updates);
            setRecoveryTaskId(null);
            setStaleCheckNow(now);
            if (!result.alreadySaved) {
                const projectedTasks = tasks.map((item) => item.id === recoveryTask.id ? { ...item, ...updates } : item);
                const afterAdventure = gameProgress(projectedTasks, getTodayStr());
                const savedRecord = afterAdventure.records.find((record) => record.id === result.historyItem.id);
                const previousIntervals = beforeAdventure.records.map((record) => record.startedAt && record.creditedDuration > 0 ? { start: Number(record.startedAt), end: Number(record.startedAt) + record.creditedDuration * 1000 } : null).filter(Boolean);
                const credited = getCreditedStudySeconds({ ...result.historyItem, subjectId: recoveryTask.subjectId }, previousIntervals);
                const resultRecord = savedRecord || { ...result.historyItem, subjectId: recoveryTask.subjectId, creditedDuration: credited.creditedDuration, integrity: credited.integrity };
                setQuestResult({
                    exp: Math.max(0, afterAdventure.levelInfo.totalExp - beforeAdventure.levelInfo.totalExp),
                    recordedDuration: result.historyItem.duration,
                    creditedDuration: resultRecord.creditedDuration,
                    damage: damageForRecord(resultRecord, beforeAdventure.boss.boss),
                    levelUp: afterAdventure.levelInfo.level > beforeAdventure.levelInfo.level,
                    newItems: afterAdventure.items.filter((item) => !beforeAdventure.items.some((previous) => previous.id === item.id)),
                    newSkills: afterAdventure.skills.filter((skill) => !beforeAdventure.skills.some((previous) => previous.id === skill.id)),
                    chest: afterAdventure.chests > beforeAdventure.chests,
                    needsReview: resultRecord.integrity?.needsReview,
                    flags: resultRecord.integrity?.flags || [],
                });
            }
        }
        catch (err) {
            console.error("Stale recovery finish failed:", err);
            alert("復旧に失敗しました。");
        }
        finally {
            recoverySavingRef.current = false;
            setIsSavingRecord(false);
        }
    };
    const handleAddTask = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const newTask = {
            categoryId: activeCategory,
            subjectId: selectedSubjectId, // Stateを使用して教科をセット
            type: fd.get('type'),
            title: fd.get('detail'),
            history: [], currentDuration: 0, isRunning: false, sessionStartTime: null,
            createdAt: Date.now(), lastUpdatedAt: Date.now()
        };
        if (isSampleMode) {
            setTasks(prev => [{ id: `s-${Date.now()}`, ...newTask }, ...prev]);
        }
        else {
            try {
                await addDoc(getTasksCol(), newTask);
                fetchData(true);
            }
            catch {
                alert("追加に失敗しました。");
            }
        }
        setIsAddingTask(false);
    };
    const handleSaveTest = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const testCat = fd.get('testCategory');
        const subType = fd.get('testSubType');
        const scores = {};
        const relevantSubjects = [...SUBJECT_DEFS.school, ...SUBJECT_DEFS.juku];
        relevantSubjects.forEach(s => {
            const val = fd.get(`score_${s.id}`);
            if (val !== null && val !== "")
                scores[s.id] = Number(val);
        });
        const testData = {
            name: fd.get('name'), date: fd.get('date'),
            category: testCat, subType, scores,
            average: Number(fd.get('average')), rank: fd.get('rank'),
            lastUpdatedAt: Date.now()
        };
        if (isSampleMode) {
            if (editingTest)
                setTests(prev => prev.map(t => t.id === editingTest.id ? { ...t, ...testData } : t));
            else
                setTests(prev => [{ id: `st-${Date.now()}`, ...testData }, ...prev]);
        }
        else {
            try {
                if (editingTest)
                    await setDoc(doc(getTestsCol(), editingTest.id), testData, { merge: true });
                else
                    await addDoc(getTestsCol(), testData);
                fetchData(true);
            }
            catch {
                alert("保存に失敗しました。");
            }
        }
        setIsAddingTest(false);
        setEditingTest(null);
    };
    const handleDeleteTest = async (id) => {
        if (!confirm("成績を削除しますか？"))
            return;
        if (isSampleMode)
            setTests(prev => prev.filter(t => t.id !== id));
        else {
            try {
                await deleteDoc(doc(getTestsCol(), id));
                fetchData(true);
            }
        catch {
                alert("削除に失敗しました。");
            }
        }
    };
    const toggleSubjectVisibility = (subId) => {
        setVisibleSubjects(prev => prev.includes(subId) ? prev.filter(id => id !== subId) : [...prev, subId]);
    };
    const bulkSelectSubjects = (type) => {
        const major5 = SUBJECT_DEFS.school.filter(s => s.isMajor).map(s => s.id);
        const sub4 = SUBJECT_DEFS.school.filter(s => !s.isMajor).map(s => s.id);
        const juku5 = SUBJECT_DEFS.juku.map(s => s.id);
        switch (type) {
            case 'all':
                setVisibleSubjects(['average', ...major5, ...sub4, ...juku5]);
                break;
            case 'none':
                setVisibleSubjects([]);
                break;
            case 'school_major':
                setVisibleSubjects(prev => Array.from(new Set([...prev, ...major5])));
                break;
            case 'school_sub':
                setVisibleSubjects(prev => Array.from(new Set([...prev, ...sub4])));
                break;
            case 'juku':
                setVisibleSubjects(prev => Array.from(new Set([...prev, ...juku5])));
                break;
        }
    };
    const stats = useMemo(() => {
        const sDate = new Date(startDate);
        const eDate = new Date(endDate);
        eDate.setHours(23, 59, 59, 999);
        const rangeHistory = [];
        tasks.forEach(t => {
            (t.history || []).forEach((h) => {
                const d = new Date(h.date);
                if (d >= sDate && d <= eDate)
                    rangeHistory.push({ ...h, categoryId: t.categoryId, subjectId: t.subjectId });
            });
        });
        const totalSec = rangeHistory.reduce((acc, h) => acc + h.duration, 0);
        const dailyMap = new Map();
        // 指定期間の日付をすべて初期化 (データがない日もX軸に表示するため)
        let loopDate = new Date(sDate);
        while (loopDate <= eDate) {
            const dStr = `${loopDate.getFullYear()}-${(loopDate.getMonth() + 1).toString().padStart(2, '0')}-${loopDate.getDate().toString().padStart(2, '0')}`;
            dailyMap.set(dStr, { name: dStr.split('-').slice(1).join('/'), school: 0, juku: 0, etc: 0 });
            loopDate.setDate(loopDate.getDate() + 1);
        }
        rangeHistory.forEach(h => {
            if (!dailyMap.has(h.date))
                dailyMap.set(h.date, { name: h.date.split('-').slice(1).join('/'), school: 0, juku: 0, etc: 0 });
            dailyMap.get(h.date)[h.categoryId] += Math.round(h.duration / 60);
        });
        const breakdown = Object.values(CATEGORIES).map(cat => {
            const items = rangeHistory.filter(h => h.categoryId === cat.id);
            const catSec = items.reduce((acc, h) => acc + h.duration, 0);
            const subjects = (SUBJECT_DEFS[cat.id] || []).map(s => {
                const sSec = tasks.filter(t => t.subjectId === s.id).reduce((acc, t) => acc + (t.history || []).filter(h => {
                    const d = new Date(h.date);
                    return d >= sDate && d <= eDate;
                }).reduce((sum, h) => sum + h.duration, 0), 0);
                return { ...s, duration: sSec, percent: catSec > 0 ? Math.round((sSec / catSec) * 100) : 0 };
            }).filter(s => s.duration > 0);
            return { ...cat, duration: catSec, subjects, percent: totalSec > 0 ? Math.round((catSec / totalSec) * 100) : 0 };
        });
        return { totalSec, breakdown, dailyData: Array.from(dailyMap.values()).sort((a, b) => new Date(a.name).getTime() - new Date(b.name).getTime()) };
    }, [tasks, startDate, endDate]);
    const filteredTests = useMemo(() => {
        const sDate = new Date(testStartDate);
        const eDate = new Date(testEndDate);
        eDate.setHours(23, 59, 59, 999);
        return tests
            .filter(t => {
                const d = new Date(t.date);
                return d >= sDate && d <= eDate;
            })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [tests, testStartDate, testEndDate]);
    const testSummary = useMemo(() => {
        const latest = filteredTests[filteredTests.length - 1] || null;
        const previous = filteredTests[filteredTests.length - 2] || null;
        const latestDev = latest?.average;
        const previousDev = previous?.average;
        const delta = latestDev != null && previousDev != null ? Number((latestDev - previousDev).toFixed(1)) : null;
        const best = filteredTests.reduce((hit, test) => {
            if (test.average == null || Number.isNaN(Number(test.average)))
                return hit;
            return !hit || Number(test.average) > Number(hit.average) ? test : hit;
        }, null);
        return { latest, previous, delta, best, count: filteredTests.length };
    }, [filteredTests]);
    const allChartSubjects = useMemo(() => [
        { id: 'average', label: '総合偏差値', hex: '#0f172a' },
        ...SUBJECT_DEFS.school.filter(s => s.isMajor).map(s => ({ ...s, label: `${s.label}(中)` })),
        ...SUBJECT_DEFS.school.filter(s => !s.isMajor).map(s => ({ ...s, label: `${s.label}(中)` })),
        ...SUBJECT_DEFS.juku.map(s => ({ ...s, label: `${s.label}(塾)` }))
    ], []);
    // モーダル等のCSS制御用
    const modalOverlayClass = isMobileView
        ? "absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
        : "fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4";
    const taskDetailOverlayClass = isMobileView
        ? "absolute inset-0 z-[100] flex items-end justify-center p-0"
        : "fixed inset-0 z-[100] flex items-end lg:items-center justify-center p-0 sm:p-4";
    if (loading && !isSampleMode)
        return <div className="h-screen flex items-center justify-center bg-slate-50 font-black text-blue-600 animate-pulse uppercase tracking-[0.2em]">Syncing System...</div>;
    if (!user && !isSampleMode)
        return (<div className="h-screen bg-slate-100 flex items-center justify-center p-4 text-center">
      <div className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl p-8 space-y-6">
        <div className="mx-auto w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-blue-100">
           <GraduationCap size={40}/>
        </div>
        <h1 className="text-2xl font-black tracking-tighter uppercase leading-tight">Level Up JH</h1>
        <form onSubmit={handleLogin} className="space-y-4 text-left">
           <input name="email" type="email" required placeholder="メールアドレス" className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-blue-600 transition outline-none text-sm leading-none"/>
           <input name="password" type="password" required placeholder="パスワード" className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-blue-600 transition outline-none text-sm leading-none"/>
           <button type="submit" className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl active:scale-95 transition text-md uppercase leading-none">LOGIN</button>
        </form>
        <button type="button" aria-label="サンプルデータで試す" title="サンプルデータで試す" onClick={toggleSampleMode} className="text-slate-400 font-bold hover:text-blue-600 transition flex items-center justify-center gap-2 w-full text-xs uppercase leading-none"><FlaskConical size={14}/> サンプルデータでお試し</button>
      </div>
    </div>);
    return (<div className={isMobileView
            ? "min-h-screen bg-slate-800 p-4 sm:p-8 flex justify-center items-center font-sans selection:bg-blue-100"
            : "min-h-screen bg-slate-50 text-slate-900 lg:pl-72 pb-24 lg:pb-0 font-sans selection:bg-blue-100 overflow-x-hidden text-left"}>
      <div className={isMobileView
            ? "w-full max-w-[400px] h-[800px] bg-slate-50 rounded-[3rem] shadow-2xl relative overflow-hidden border-[12px] border-slate-900 text-slate-900 flex flex-col text-left"
            : "w-full h-full contents"}>
        
        {/* --- Sidebar (PC) --- */}
        <aside className={isMobileView
            ? "hidden"
            : "hidden lg:flex flex-col fixed inset-y-0 left-0 w-72 bg-white border-r border-slate-100 p-8 z-40 text-left"}>
          <div className="flex items-center gap-3 mb-4 text-left">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-3 rounded-2xl text-white shadow-xl shadow-blue-200"><Trophy size={24}/></div>
            <h1 className="text-xl font-black tracking-tighter leading-none uppercase">Level Up<br /><span className="text-blue-600 text-md uppercase leading-none">Study JH</span></h1>
          </div>
          <div className="mb-8 rounded-2xl bg-slate-50 px-4 py-3 text-left ring-1 ring-slate-100">
            <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Release</div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-sm font-black text-slate-800">{APP_VERSION}</span>
              <span className="rounded-full bg-blue-100 px-2 py-1 text-[9px] font-black text-blue-700">Timer Sync</span>
            </div>
          </div>
          <nav className="flex-1 space-y-2">
            {[{ id: 'daily', label: '学習記録', icon: Zap }, { id: 'stats', label: '実績分析', icon: BarChart2 }, { id: 'tests', label: '成績推移', icon: TrendingUp }].map(item => (<button type="button" key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center gap-4 px-6 py-4 rounded-3xl font-black transition-all leading-none ${activeTab === item.id ? 'bg-blue-600 text-white shadow-2xl' : 'text-slate-400 hover:bg-slate-50'}`}>
                <item.icon size={20}/> {item.label}
              </button>))}
          </nav>
          <button type="button" aria-label="サンプルモードを切り替える" title="サンプルモード" onClick={toggleSampleMode} className={`mt-8 w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all leading-none ${isSampleMode ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
            <span className="text-[10px] font-black uppercase tracking-wider leading-none">Sample Mode</span>
            <FlaskConical size={16}/>
          </button>
          
          {isSampleMode && (<button type="button" aria-label="スマホ表示に切り替える" title="スマホ表示" onClick={() => setIsMobileView(true)} className="mt-4 w-full flex items-center justify-between p-4 rounded-2xl bg-slate-900 text-white font-black transition-all leading-none shadow-xl">
              <span className="text-[10px] uppercase tracking-wider">スマホプレビュー</span>
              <Smartphone size={16}/>
            </button>)}

          {!isSampleMode && <button type="button" aria-label="ログアウト" title="ログアウト" onClick={() => signOut(auth)} className="mt-4 flex items-center gap-2 text-xs font-black text-slate-300 hover:text-rose-500 transition px-4 leading-none"><LogOut size={14}/> LOGOUT</button>}
        </aside>

        {/* --- Mobile Header --- */}
        <header className={isMobileView
            ? "bg-white border-b border-slate-100 p-4 sticky top-0 z-40 flex justify-between items-center px-6 leading-none shrink-0"
            : "lg:hidden bg-white border-b border-slate-100 p-4 sticky top-0 z-40 flex justify-between items-center px-6 leading-none"}>
          <div className="flex items-center gap-2 leading-none text-left">
            <Trophy className="text-blue-600" size={20}/>
            <h1 className="text-sm font-black tracking-tighter uppercase leading-none">Study JH</h1>
          </div>
          <div className="flex items-center">
            {isSampleMode && isMobileView && (<button type="button" aria-label="PC表示に切り替える" title="PC表示" onClick={() => setIsMobileView(false)} className="p-2 rounded-xl bg-slate-100 text-slate-600 flex items-center gap-1 leading-none mr-2">
                <Monitor size={14}/>
                <span className="text-[9px] font-black uppercase">PC</span>
              </button>)}
            <span className="mr-2 rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-black text-blue-700 ring-1 ring-blue-100">{APP_VERSION}</span>
            <button type="button" aria-label="サンプルモードを切り替える" title="サンプルモード" onClick={toggleSampleMode} className={`p-2 rounded-xl border leading-none ${isSampleMode ? 'bg-amber-100 border-amber-200 text-amber-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
              <FlaskConical size={18}/>
            </button>
          </div>
        </header>

        {/* --- Main Container --- */}
        <div className={isMobileView ? "flex-1 overflow-y-auto pb-24 no-scrollbar relative" : ""}>
          <main className="p-4 sm:p-6 lg:p-10 max-w-6xl mx-auto space-y-6 sm:space-y-10">
            {(activeTab === 'stats' || activeTab === 'tests') && (<div className="bg-white/80 backdrop-blur-xl p-4 sm:p-6 rounded-[2rem] shadow-sm border border-white flex flex-wrap items-center gap-4 justify-center lg:sticky lg:top-4 z-30 transition-all text-left">
                  <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl shrink-0 overflow-hidden leading-none">
                     <CalendarIcon className="text-slate-400" size={14}/>
                     <input type="date" value={activeTab === 'tests' ? testStartDate : startDate} onChange={e => activeTab === 'tests' ? setTestStartDate(e.target.value) : setStartDate(e.target.value)} className="bg-transparent border-none p-0 text-xs sm:text-sm font-black outline-none leading-none"/>
                     <span className="text-slate-300 mx-1">/</span>
                     <input type="date" value={activeTab === 'tests' ? testEndDate : endDate} onChange={e => activeTab === 'tests' ? setTestEndDate(e.target.value) : setEndDate(e.target.value)} className="bg-transparent border-none p-0 text-xs sm:text-sm font-black outline-none leading-none"/>
                  </div>
                  <div className="flex gap-1 overflow-x-auto no-scrollbar whitespace-nowrap">
                     {(activeTab === 'tests' ? [183, 365, 0] : [7, 14, 30, 0]).map(days => (<button type="button" key={days} onClick={() => {
                    const d = new Date();
                    if (activeTab === 'tests') {
                        if (days === 0)
                            setTestStartDate("2026-01-01");
                        else {
                            d.setDate(d.getDate() - days);
                            setTestStartDate(d.toISOString().split('T')[0]);
                        }
                        setTestEndDate(getTodayStr());
                        return;
                    }
                    if (days === 0)
                        setStartDate("2026-01-01");
                    else {
                        d.setDate(d.getDate() - days);
                        setStartDate(d.toISOString().split('T')[0]);
                    }
                    setEndDate(new Date().toISOString().split('T')[0]);
                }} className="px-3 py-2 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 rounded-lg text-[10px] sm:text-xs font-black transition-all whitespace-nowrap leading-none">
                         {activeTab === 'tests'
                             ? days === 183 ? '半年' : days === 365 ? '1年' : '全'
                             : days === 30 ? '1月' : days === 14 ? '2週' : days === 7 ? '1週' : '全'}
                       </button>))}
                     {!isSampleMode && <button type="button" aria-label="データを更新" title="更新" onClick={() => fetchData()} className="p-2 bg-blue-50 text-blue-600 rounded-lg ml-2 leading-none"><RefreshCw size={14}/></button>}
                  </div>
               </div>)}

            {activeTab === 'daily' && (<div className="space-y-8 animate-in fade-in duration-500">
            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-700 p-4 sm:p-5 shadow-2xl shadow-blue-200/40 ring-1 ring-white/20 lg:sticky lg:top-4 z-30">
              <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-blue-400/25 blur-2xl"/>
              <div className="relative z-10 flex items-center justify-between">
                <button type="button" aria-label="前月" title="前月" onClick={() => setSelectedMonth(m => m === 1 ? 12 : m - 1)} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition leading-none text-white ring-1 ring-white/15"><ChevronLeft size={20}/></button>
                <div className="flex-1 text-center">
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-100/80">Monthly Clean View</div>
                  <h2 className="mt-1 text-xl sm:text-3xl font-black text-white tracking-tight leading-none">{selectedMonth}月の学習記録</h2>
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black text-blue-50 ring-1 ring-white/15">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse"/> {APP_VERSION} / Monthly Clean View
                  </div>
                </div>
                <button type="button" aria-label="翌月" title="翌月" onClick={() => setSelectedMonth(m => m === 12 ? 1 : m + 1)} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition leading-none text-white ring-1 ring-white/15"><ChevronRight size={20}/></button>
              </div>
            </div>

            <AdventureStatus adventure={adventure}/>

            <div className={`grid gap-3 sm:gap-4 text-center ${isMobileView ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-4'}`}>
              <div className={`${isMobileView ? '' : 'md:col-span-1'} bg-gradient-to-br from-blue-600 to-indigo-700 p-3 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] text-white shadow-xl relative overflow-hidden text-center flex flex-col justify-center min-h-[70px] sm:min-h-[120px]`}>
                 <p className="text-[9px] sm:text-[10px] font-black opacity-70 mb-1 sm:mb-2 uppercase tracking-widest leading-none">Monthly</p>
                 <p className="text-2xl sm:text-4xl font-black font-mono leading-none tracking-tighter">
                   {formatDuration(tasks.reduce((sum, t) => sum + getMonthlyDuration(t, selectedMonth), 0))}
                 </p>
              </div>
              <div className={`${isMobileView ? 'grid grid-cols-3 gap-2' : 'md:col-span-3 grid grid-cols-3 gap-2 sm:gap-4'} text-center`}>
                 {Object.values(CATEGORIES).map(cat => {
                const catTotal = tasks.filter(t => t.categoryId === cat.id).reduce((sum, t) => sum + getMonthlyDuration(t, selectedMonth), 0);
                return (<div key={cat.id} onClick={() => handleCategoryChange(cat.id)} className={`cursor-pointer transition-all bg-white/90 backdrop-blur-xl p-2 sm:p-4 rounded-[1.5rem] sm:rounded-[2rem] border-2 shadow-sm hover:shadow-xl flex flex-col items-center justify-center min-h-[70px] sm:min-h-[120px] text-center leading-none ${activeCategory === cat.id ? 'border-blue-400 shadow-blue-100 scale-105 z-10 ring-4 ring-blue-50' : 'border-slate-100 hover:border-blue-200'}`}>
                        <cat.icon size={16} className={`sm:w-6 sm:h-6 ${cat.color}`}/>
                        <p className="text-[9px] sm:text-sm font-black text-slate-600 mt-1.5 sm:mt-3 uppercase leading-none">{cat.label}</p>
                        <p className="text-xs sm:text-lg font-black font-mono text-slate-800 mt-1 sm:mt-2 w-full text-center leading-none tracking-tighter whitespace-nowrap">{formatDuration(catTotal)}</p>
                     </div>);
            })}
              </div>
            </div>

            <div className="space-y-6 text-center">
              <div className="bg-white p-5 sm:p-6 rounded-[2rem] border border-slate-100 shadow-sm text-left">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-4">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Today Done</p>
                    <h3 className="text-lg sm:text-xl font-black text-slate-800 tracking-tight">今日やった作業</h3>
                  </div>
                  <div className="text-xs font-black text-blue-600">
                    {formatDuration(todayTaskSummaries.reduce((sum, item) => sum + item.totalDuration, 0))}
                  </div>
                </div>
                {todayTaskSummaries.length === 0 ? (<div className="rounded-2xl border-2 border-dashed border-slate-100 py-8 text-center">
                    <p className="text-xs font-black text-slate-300">今日はまだ記録がありません</p>
                  </div>) : (<div className={`grid gap-3 ${isMobileView ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
                    {todayTaskSummaries.map(item => (<button type="button" key={item.task.id} onClick={() => setSelectedTaskId(item.task.id)} className={`rounded-2xl border p-4 text-left transition active:scale-95 ${item.isRunning ? 'border-blue-200 bg-blue-50 shadow-blue-100' : 'border-slate-100 bg-slate-50 hover:bg-white hover:shadow-md'}`}>
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <span className="rounded-full px-2.5 py-1 text-[9px] font-black text-white" style={{ backgroundColor: item.color }}>{item.subjectLabel}</span>
                          <span className={`text-[9px] font-black ${item.isStale ? 'text-amber-600' : item.isRunning ? 'text-blue-600' : 'text-slate-400'}`}>{item.isStale ? '要確認' : item.isRunning ? '計測中' : `${item.count}回`}</span>
                        </div>
                        <div className="truncate text-sm font-black text-slate-800">{item.task.title || 'Untitled'}</div>
                        <div className="mt-3 flex items-center justify-between border-t border-white pt-3">
                          <span className="text-[10px] font-bold text-slate-400">{item.typeLabel}</span>
                          <span className="font-mono text-base font-black text-blue-600">{formatDuration(item.totalDuration)}</span>
                        </div>
                      </button>))}
                  </div>)}
              </div>

              {/* 当日のタイムライン */}
              <TodayTimeline tasks={tasks}/>

              <ActiveTimerSummary task={runningTask} onHeartbeat={handleUpdateLocalTask} onRequestRecovery={openRecoveryModal}/>

              <div className="flex gap-2 bg-slate-100 p-1.5 rounded-[1.75rem] w-full max-w-md mx-auto shadow-inner overflow-hidden leading-none text-center">
                    {Object.values(CATEGORIES).map(cat => (<button type="button" key={cat.id} onClick={() => handleCategoryChange(cat.id)} className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl text-[10px] font-black transition-all leading-none ${activeCategory === cat.id ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400'}`}>
                        <cat.icon size={14}/> {cat.label}
                      </button>))}
                  </div>

                  <div className="flex justify-center">
                    <button type="button" onClick={() => setIsAddingTask(true)} className="bg-white border-2 border-dashed border-blue-200 text-blue-600 font-black px-6 py-4 rounded-[1.75rem] flex items-center gap-2 hover:bg-blue-50 active:scale-95 transition-all shadow-sm text-xs leading-none">
                      <PlusCircle size={20}/> 項目を追加
                    </button>
                  </div>

                  <div className="space-y-8 pb-10 text-left">
                    {tasks.filter(t => t.categoryId === activeCategory && shouldShowTaskInMonth(t, selectedMonth)).length === 0 ? (<div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-3xl">
                        <p className="text-slate-300 font-black text-sm uppercase">記録が見つかりません</p>
                      </div>) : (SUBJECT_DEFS[activeCategory]?.map(subject => {
                const subjectTasks = tasks.filter(t => t.categoryId === activeCategory && t.subjectId === subject.id && shouldShowTaskInMonth(t, selectedMonth));
                if (subjectTasks.length === 0)
                    return null;
                return (<div key={subject.id} className="space-y-4">
                            <div className="flex items-center gap-2 px-2">
                               <div className="w-1.5 h-4 rounded-full" style={{ backgroundColor: subject.hex }}/>
                               <h3 className="font-black text-slate-700 text-base sm:text-lg leading-none">{subject.label}</h3>
                            </div>
                            <div className={`gap-3 sm:gap-4 ${isMobileView ? 'grid grid-cols-1' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
                              {subjectTasks.sort((a, b) => getLatestMonthlyTimestamp(b, selectedMonth) - getLatestMonthlyTimestamp(a, selectedMonth)).map(task => {
                        const monthlyHistories = getMonthlyHistories(task, selectedMonth);
                        const monthlyTime = getMonthlyDuration(task, selectedMonth);
                        const latestMonthlyTimestamp = getLatestMonthlyTimestamp(task, selectedMonth);
                        return (<div key={task.id} onClick={() => setSelectedTaskId(task.id)} className={`p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border shadow-sm hover:shadow-xl transition-all cursor-pointer relative overflow-hidden text-left group ${task.isRunning ? 'bg-gradient-to-br from-blue-600 to-indigo-800 text-white border-blue-400 shadow-blue-200' : 'bg-white border-slate-100'}`}>
                                    <div className="flex justify-between items-start mb-2 sm:mb-3 text-left">
                                      <div className="flex items-center gap-1.5 sm:gap-2 leading-none text-left">
                                        <span className={`text-[8px] sm:text-[9px] font-black px-2 py-0.5 rounded-full leading-none ${CATEGORIES[task.categoryId.toUpperCase()].bg} ${CATEGORIES[task.categoryId.toUpperCase()].color}`}>{task.type === 'homework' ? '宿題' : '自習'}</span>
                                      </div>
                                      {task.isRunning && <div className={`rounded-full px-2 py-1 text-[8px] font-black ring-1 ${isStaleRunningTask(task, staleCheckNow) ? 'bg-amber-300 text-slate-950 ring-amber-100' : 'bg-white/15 text-white ring-white/20'}`}>{isStaleRunningTask(task, staleCheckNow) ? '要確認' : 'LIVE'}</div>}
                                    </div>
                                    <div className={`text-[9px] sm:text-[10px] font-bold mb-2 sm:mb-3 ${task.isRunning ? 'text-blue-100/80' : 'text-slate-400'}`}>
                                       {task.isRunning ? isStaleRunningTask(task, staleCheckNow) ? '計測内容を確認してください' : '現在計測中' : `${formatRecordDate(latestMonthlyTimestamp)} 記録`}
                                    </div>
                                    <h4 className={`font-black text-base sm:text-lg mb-3 sm:mb-4 truncate leading-tight text-left ${task.isRunning ? 'text-white' : 'text-slate-800'}`}>{task.title || "Untitled"}</h4>
                                    <div className={`flex justify-between items-end border-t pt-3 sm:pt-4 leading-none text-left ${task.isRunning ? 'border-white/15' : 'border-slate-50'}`}>
                                       <div className={`text-[9px] sm:text-[10px] font-black flex items-center gap-1 uppercase leading-none text-left ${task.isRunning ? 'text-blue-100/80' : 'text-slate-300'}`}><History size={12}/> {monthlyHistories.length}回</div>
                                       <p className={`text-lg sm:text-xl font-black font-mono tracking-tighter leading-none text-left ${task.isRunning ? 'text-white' : 'text-blue-600'}`}>{formatDuration(monthlyTime)}</p>
                                    </div>
                                  </div>);
                    })}
                            </div>
                          </div>);
            }))}
                  </div>
                </div>
              </div>)}

            {activeTab === 'stats' && (<div className="space-y-8 sm:space-y-10 animate-in slide-in-from-bottom-5 duration-500 text-center">
                
                {/* 追加: 当日の学習タイムラインを実績分析画面にも表示 */}
                <TodayTimeline tasks={tasks}/>

                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden text-center text-left">
                   <h3 className="text-lg font-black mb-6 flex items-center justify-center gap-2 leading-none text-center"><BarChart2 className="text-blue-600" size={20}/> 学習推移 (分)</h3>
                   <div className="h-64 sm:h-80 w-full text-center">
                      <ResponsiveContainer width="100%" height="100%">
                         <BarChart data={stats.dailyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: '900', fill: '#cbd5e1' }}/>
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: '900', fill: '#cbd5e1' }}/>
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', fontSize: '10px' }}/>
                            <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px', fontSize: '10px', fontWeight: '900' }}/>
                            <Bar dataKey="school" name="中学校" stackId="a" fill="#3b82f6"/>
                            <Bar dataKey="juku" name="塾" stackId="a" fill="#10b981"/>
                            <Bar dataKey="etc" name="その他" stackId="a" fill="#8b5cf6"/>
                         </BarChart>
                      </ResponsiveContainer>
                   </div>
                </div>

                <div className={`grid gap-6 text-center text-left ${isMobileView ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
                   <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm text-center">
                  <h3 className="text-lg font-black mb-6 flex items-center justify-center gap-2 leading-none text-center text-center"><PieChartIcon className="text-indigo-600" size={20}/> 学習比率</h3>
                  <div className="h-56 sm:h-64 text-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={stats.breakdown} innerRadius="60%" outerRadius="85%" paddingAngle={5} dataKey="duration" nameKey="label">
                          {stats.breakdown.map((e) => <Cell key={e.id} fill={e.hex} stroke="none"/>)}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', fontSize: '14px', fontWeight: 'bold' }}/>
                        <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: '900' }}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center gap-2 sm:gap-4 mt-2 sm:mt-4 flex-wrap leading-none">
                    {stats.breakdown.map(d => (<div key={d.id} className="flex flex-col items-center p-3 sm:p-4 bg-slate-50 rounded-xl sm:rounded-2xl min-w-[70px] sm:min-w-[90px] leading-none text-center">
                         <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full mb-2 leading-none text-center" style={{ backgroundColor: d.hex }}/>
                         <span className="text-sm sm:text-base font-black text-slate-800 font-mono leading-none">{d.percent}%</span>
                      </div>))}
                  </div>
               </div>

               <div className="space-y-4 text-left">
                      {stats.breakdown.map(cat => (<div key={cat.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm relative overflow-hidden group text-left">
                           <h4 className={`font-black text-[10px] ${cat.color} uppercase mb-4 tracking-widest flex items-center gap-2 leading-none text-left`}>
                             <Award size={14}/> {cat.label}の内訳
                           </h4>
                           <div className="space-y-4 text-left">
                              {cat.subjects.map((s) => (<div key={s.id} className="space-y-1.5 text-left leading-none">
                                   <div className="flex justify-between text-[10px] font-black leading-none text-left text-left">
                                      <span className="text-slate-600 truncate text-left">{s.label}</span>
                                      <span className="text-slate-400 font-mono text-left text-left">{formatDuration(s.duration)}</span>
                                   </div>
                                   <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden text-left leading-none text-left">
                                      <div className={`h-full rounded-full ${cat.id === 'school' ? 'bg-blue-600' : cat.id === 'juku' ? 'bg-emerald-500' : 'bg-purple-500'}`} style={{ width: `${s.percent}%` }}/>
                                   </div>
                                </div>))}
                           </div>
                        </div>))}
                   </div>
                </div>
              </div>)}

            {activeTab === 'tests' && (<div className="space-y-8 sm:space-y-10 animate-in zoom-in-95 duration-500 pb-10 text-center text-left">
                <div className={`flex items-center gap-4 px-4 text-center leading-none text-center ${isMobileView ? 'flex-col' : 'flex-col sm:flex-row justify-between'}`}>
                  <h3 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight flex items-center justify-center gap-2 leading-none text-center text-center">
                    <TrendingUp className="text-rose-500" size={26}/> 偏差値推移
                  </h3>
                  <button type="button" onClick={() => { setEditingTest(null); setIsAddingTest(true); }} className="w-full sm:w-auto bg-rose-500 text-white font-black px-8 py-4 rounded-2xl shadow-xl active:scale-95 transition text-base leading-none">偏差値を登録</button>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 px-1">
                  <div className="rounded-[1.5rem] bg-slate-900 text-white p-4 sm:p-5 shadow-sm text-left">
                    <p className="text-[10px] sm:text-xs font-black text-slate-300 mb-2">最新偏差値</p>
                    <p className="text-3xl sm:text-4xl font-black font-mono">{testSummary.latest?.average ?? '-'}</p>
                  </div>
                  <div className="rounded-[1.5rem] bg-white border border-slate-100 p-4 sm:p-5 shadow-sm text-left">
                    <p className="text-[10px] sm:text-xs font-black text-slate-400 mb-2">前回差</p>
                    <p className={`text-3xl sm:text-4xl font-black font-mono ${testSummary.delta == null ? 'text-slate-300' : testSummary.delta >= 0 ? 'text-rose-500' : 'text-blue-500'}`}>
                      {testSummary.delta == null ? '-' : `${testSummary.delta > 0 ? '+' : ''}${testSummary.delta}`}
                    </p>
                  </div>
                  <div className="rounded-[1.5rem] bg-white border border-slate-100 p-4 sm:p-5 shadow-sm text-left">
                    <p className="text-[10px] sm:text-xs font-black text-slate-400 mb-2">期間ベスト</p>
                    <p className="text-3xl sm:text-4xl font-black font-mono text-slate-800">{testSummary.best?.average ?? '-'}</p>
                  </div>
                  <div className="rounded-[1.5rem] bg-white border border-slate-100 p-4 sm:p-5 shadow-sm text-left">
                    <p className="text-[10px] sm:text-xs font-black text-slate-400 mb-2">表示件数</p>
                    <p className="text-3xl sm:text-4xl font-black font-mono text-slate-800">{testSummary.count}</p>
                  </div>
                </div>

                <div className="bg-white p-5 sm:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-6 text-left overflow-x-hidden leading-none text-left">
                   <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-50 pb-4 leading-none text-left">
                      <div className="flex items-center gap-2 text-slate-400 leading-none text-left text-left">
                         <ListFilter size={16}/>
                         <span className="text-xs sm:text-sm font-black leading-none text-left">表示する教科</span>
                      </div>
                      <div className="flex gap-1 leading-none text-left">
                         <button type="button" onClick={() => bulkSelectSubjects('all')} className="px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-black leading-none">全て</button>
                         <button type="button" onClick={() => bulkSelectSubjects('none')} className="px-3 py-2 bg-slate-100 text-slate-400 rounded-lg text-xs font-black leading-none">解除</button>
                      </div>
                   </div>

                   <div className="flex flex-col gap-4 text-left leading-none text-left">
                      <div className="text-left leading-none text-left text-left">
                        <h5 className="text-xs font-black text-blue-600 mb-2 leading-none text-left text-left">中学校</h5>
                        <div className="flex flex-wrap gap-1.5 leading-none text-left text-left">
                           {SUBJECT_DEFS.school.map(s => (<button type="button" key={s.id} onClick={() => toggleSubjectVisibility(s.id)} className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all leading-none ${visibleSubjects.includes(s.id) ? 'bg-blue-50 text-blue-600 border border-blue-100 shadow-sm' : 'bg-slate-50 text-slate-400 border border-transparent'}`}>
                               {visibleSubjects.includes(s.id) ? <CheckSquare size={10}/> : <Square size={10}/>} {s.label}
                             </button>))}
                        </div>
                      </div>
                      <div className="text-left leading-none text-left text-left text-left">
                        <h5 className="text-xs font-black text-emerald-600 mb-2 leading-none text-left text-left">塾</h5>
                        <div className="flex flex-wrap gap-1.5 leading-none text-left text-left">
                           {SUBJECT_DEFS.juku.map(s => (<button type="button" key={s.id} onClick={() => toggleSubjectVisibility(s.id)} className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all leading-none ${visibleSubjects.includes(s.id) ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-sm' : 'bg-slate-50 text-slate-400 border border-transparent'}`}>
                               {visibleSubjects.includes(s.id) ? <CheckSquare size={10}/> : <Square size={10}/>} {s.label}
                           </button>))}
                        </div>
                      </div>
                      <button type="button" onClick={() => toggleSubjectVisibility('average')} className={`self-start px-4 py-3 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${visibleSubjects.includes('average') ? 'bg-slate-200 text-slate-800 shadow-inner' : 'bg-slate-50 text-slate-400'} leading-none text-left text-left`}>
                         {visibleSubjects.includes('average') ? <Eye size={12}/> : <EyeOff size={12}/>} 総合偏差値
                      </button>
                   </div>
                </div>

                <div className="bg-white p-5 sm:p-10 rounded-[2.5rem] border border-slate-100 shadow-sm relative overflow-hidden text-center leading-none text-center">
                   <div className="h-80 sm:h-[28rem] w-full text-center leading-none text-center">
                      <ResponsiveContainer width="100%" height="100%">
                         <LineChart data={filteredTests} margin={{ top: 10, right: 14, left: -8, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: '900', fill: '#94a3b8' }}/>
                            <YAxis domain={[30, 75]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: '900', fill: '#94a3b8' }}/>
                            <Tooltip contentStyle={{ borderRadius: '14px', border: 'none', fontSize: '13px', fontWeight: '900' }}/>
                            <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontWeight: '900', fontSize: '12px' }}/>
                            
                            {visibleSubjects.includes('average') && (<Line type="monotone" dataKey="average" name="総合偏差値" stroke="#0f172a" strokeWidth={4} dot={{ r: 5, fill: '#0f172a', strokeWidth: 2, stroke: '#fff' }} connectNulls/>)}
                            {allChartSubjects.filter(s => s.id !== 'average').map(sub => (visibleSubjects.includes(sub.id) && (<Line key={sub.id} type="monotone" dataKey={`scores.${sub.id}`} name={sub.label} stroke={sub.hex} strokeWidth={3} dot={{ r: 4, fill: sub.hex, strokeWidth: 1, stroke: '#fff' }} connectNulls animationDuration={800}/>)))}
                         </LineChart>
                      </ResponsiveContainer>
                   </div>
                </div>

                <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden text-left leading-none text-left text-left">
                  <div className="p-5 border-b border-slate-50 flex justify-between items-center bg-slate-50/30 leading-none text-left text-left">
                    <h4 className="font-black text-base sm:text-lg text-slate-800 leading-none text-left text-left">偏差値データ一覧</h4>
                    <span className="text-xs font-black text-slate-400 leading-none text-left text-left">{filteredTests.length}回分</span>
                  </div>
                  <div className="overflow-x-auto overflow-y-hidden no-scrollbar text-left leading-none text-left">
                    <table className="w-full text-left border-collapse min-w-[800px] leading-none text-left text-left">
                      <thead>
                        <tr className="bg-slate-50/80 text-xs font-black text-slate-400 tracking-widest border-b border-slate-100 text-left leading-none text-left">
                          <th className="px-6 py-4 sticky left-0 bg-slate-50/95 backdrop-blur-md z-10 text-left leading-none text-left">テスト名 / 日付</th>
                          <th className="px-4 py-4 text-center leading-none text-left">総合</th>
                          <th className="px-4 py-4 text-center text-blue-600 leading-none text-left">数学</th>
                          <th className="px-4 py-4 text-center text-rose-600 leading-none text-left">国語</th>
                          <th className="px-4 py-4 text-center text-indigo-600 leading-none text-left">英語</th>
                          <th className="px-4 py-4 text-center text-emerald-600 leading-none text-left">理科</th>
                          <th className="px-4 py-4 text-center text-amber-600 leading-none text-left">社会</th>
                          <th className="px-6 py-4 text-right leading-none text-left text-left">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-center leading-none text-left text-left">
                        {[...filteredTests].reverse().map(test => {
                const prefix = test.category === 'school' ? 's_' : 'j_';
                return (<tr key={test.id} className="group hover:bg-blue-50/10 transition-colors leading-none text-left">
                              <td className="px-6 py-5 sticky left-0 bg-white group-hover:bg-blue-50/10 backdrop-blur-md z-10 transition-colors text-left leading-none text-left text-left text-left">
                                <p className="font-black text-slate-800 text-base leading-tight truncate w-32 sm:w-auto text-left text-left text-left">{test.name}</p>
                                <p className="text-xs font-bold text-slate-400 mt-1 text-left leading-none text-left">{test.date}</p>
                              </td>
                              <td className="px-4 py-5 text-center font-mono font-black text-slate-800 text-base leading-none text-left">{test.average ?? "-"}</td>
                              <td className="px-4 py-5 text-center font-mono font-black text-blue-600 text-base leading-none text-left">{test.scores[`${prefix}math`] || "-"}</td>
                              <td className="px-4 py-5 text-center font-mono font-black text-rose-600 text-base leading-none text-left">{test.scores[`${prefix}japanese`] || "-"}</td>
                              <td className="px-4 py-5 text-center font-mono font-black text-indigo-600 text-base leading-none text-left">{test.scores[`${prefix}english`] || "-"}</td>
                              <td className="px-4 py-5 text-center font-mono font-black text-emerald-600 text-base leading-none text-left">{test.scores[`${prefix}science`] || "-"}</td>
                              <td className="px-4 py-5 text-center font-mono font-black text-amber-600 text-base leading-none text-left">{test.scores[`${prefix}social`] || "-"}</td>
                              <td className="px-6 py-5 text-right leading-none text-left text-left">
                                <div className="flex justify-end gap-2 leading-none text-left">
                                  <button type="button" aria-label="成績を編集" title="編集" onClick={() => { setEditingTest(test); setIsAddingTest(true); }} className="p-1.5 bg-slate-100 text-slate-400 rounded-lg hover:bg-blue-600 hover:text-white transition-all leading-none text-left"><Edit3 size={14}/></button>
                                  <button type="button" aria-label="成績を削除" title="削除" onClick={() => handleDeleteTest(test.id)} className="p-1.5 bg-slate-100 text-slate-400 rounded-lg hover:bg-rose-600 hover:text-white transition-all leading-none text-left"><Trash2 size={14}/></button>
                                </div>
                              </td>
                            </tr>);
            })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>)}
          </main>
        </div>

        {questResult && (<div className={modalOverlayClass} role="dialog" aria-modal="true" aria-label="学習結果">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-7 text-center shadow-2xl">
            <div className="text-xs font-black tracking-[0.24em] text-indigo-500">QUEST CLEAR!</div>
            <h3 className="mt-2 text-2xl font-black text-slate-800">学習を記録しました</h3>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-indigo-50 p-4"><div className="text-[10px] font-black text-indigo-400">EXP</div><div className="mt-1 text-xl font-black text-indigo-700">+{questResult.exp}</div></div>
              <div className="rounded-2xl bg-rose-50 p-4"><div className="text-[10px] font-black text-rose-400">DAMAGE</div><div className="mt-1 text-xl font-black text-rose-600">{questResult.damage}</div></div>
            </div>
            <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-500">記録時間 {formatDuration(questResult.recordedDuration)} / RPG報酬 {formatDuration(questResult.creditedDuration)}</div>
            {questResult.levelUp && <p className="mt-4 font-black text-amber-600">LEVEL UP!</p>}
            {questResult.chest && <p className="mt-2 font-black text-amber-600">宝箱を獲得！</p>}
            {questResult.newItems.map((item) => <p key={item.id} className="mt-2 text-sm font-black text-emerald-600">NEW ITEM! {item.name}</p>)}
            {questResult.newSkills.map((skill) => <p key={skill.id} className="mt-2 text-sm font-black text-cyan-600">NEW SKILL! {skill.name}</p>)}
            {questResult.creditedDuration >= 50 * 60 && questResult.creditedDuration <= 60 * 60 && <p className="mt-3 text-sm font-black text-blue-600">集中学習クリア！休憩後に次の教科へ。</p>}
            {questResult.needsReview && <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-relaxed text-amber-700">要確認セッションです。学習記録は保存済みですが、RPG報酬は安全な範囲だけ反映しました。</p>}
            <button type="button" aria-label="学習結果を閉じる" onClick={() => setQuestResult(null)} className="mt-6 w-full rounded-2xl bg-indigo-600 py-4 text-sm font-black text-white">冒険を続ける</button>
          </div>
        </div>)}

        {recoveryTask && (<div className={modalOverlayClass} role="dialog" aria-modal="true" aria-label="計測内容の確認">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 text-left shadow-2xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-2xl bg-amber-50 p-3 text-amber-600"><Clock size={22}/></div>
              <div className="min-w-0">
                <div className="text-[10px] font-black tracking-[0.2em] text-amber-500">TIMER CHECK</div>
                <h3 className="mt-1 text-xl font-black leading-tight text-slate-800">{recoveryTask.title || 'Untitled'}の計測が長時間継続しています</h3>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 text-sm font-bold leading-relaxed text-slate-600">
              <div>開始: {formatClockTime(recoveryTask.sessionStartTime)}</div>
              <div>最後の確認: {formatClockTime(getLastHeartbeatTime(recoveryTask))}</div>
              <div className="mt-2 text-xs text-slate-400">その後も勉強を続けていましたか？ 未確認の時間は、確定するまで通常の学習時間やRPG報酬として扱いません。</div>
            </div>
            <div className="mt-5 space-y-3">
              <button type="button" onClick={() => handleFinishStaleTask(getLastHeartbeatTime(recoveryTask), '最後の確認時刻で終了')} disabled={isSavingRecord} className="w-full rounded-2xl bg-slate-900 px-4 py-4 text-sm font-black text-white shadow-lg active:scale-95 disabled:opacity-60">
                最後の確認時刻で終了
              </button>
              <button type="button" onClick={handleContinueStaleTask} disabled={isSavingRecord} className="w-full rounded-2xl bg-blue-50 px-4 py-4 text-sm font-black text-blue-700 ring-1 ring-blue-100 active:scale-95 disabled:opacity-60">
                勉強を続けていた
              </button>
              <div className="rounded-2xl border border-slate-100 p-4">
                <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">終了時刻を修正</label>
                <input type="datetime-local" value={manualRecoveryEnd} min={formatDateTimeLocalValue(recoveryTask.sessionStartTime)} max={formatDateTimeLocalValue(staleCheckNow)} onChange={(e) => setManualRecoveryEnd(e.target.value)} className="w-full rounded-xl bg-slate-50 p-3 text-sm font-black text-slate-700 outline-none ring-1 ring-slate-100 focus:ring-blue-200"/>
                <button type="button" onClick={() => handleFinishStaleTask(Date.parse(manualRecoveryEnd), '終了時刻を修正')} disabled={isSavingRecord} className="mt-3 w-full rounded-xl bg-amber-400 px-4 py-3 text-xs font-black text-slate-950 shadow-sm active:scale-95 disabled:opacity-60">
                  この終了時刻で保存
                </button>
              </div>
            </div>
          </div>
        </div>)}

        {/* --- Modals --- */}
        {isAddingTask && (<div className={modalOverlayClass}>
             <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50 leading-none">
                   <h3 className="text-lg font-black tracking-tight text-center flex-1 leading-none text-center">学習項目の追加</h3>
                   <button type="button" aria-label="学習項目の追加を閉じる" title="閉じる" onClick={() => setIsAddingTask(false)} className="p-2 bg-white rounded-xl shadow-sm hover:bg-slate-50 transition leading-none text-left text-left"><X size={20}/></button>
                </div>
                <form onSubmit={handleAddTask} className="p-8 space-y-6 text-left leading-none text-left">
                   <div className="text-left leading-none text-left text-left">
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-2 leading-none text-left text-left text-left">教科</label>
                      <select name="subjectId" value={selectedSubjectId} onChange={(e) => setSelectedSubjectId(e.target.value)} required className="w-full bg-slate-50 border-none rounded-xl p-4 font-black text-slate-800 appearance-none shadow-inner text-sm outline-none focus:ring-2 focus:ring-blue-600 leading-none">
                         {SUBJECT_DEFS[activeCategory]?.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                   </div>
                   <div className="text-left leading-none text-left text-left text-left">
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-2 leading-none text-left text-left text-left">種類</label>
                      <div className="grid grid-cols-2 gap-3 leading-none text-left text-left">
                         {['homework', 'self'].map(t => (<label key={t} className="relative cursor-pointer group text-center leading-none text-left text-left">
                             <input type="radio" name="type" value={t} defaultChecked={t === 'homework'} className="peer sr-only"/>
                             <div className="p-3 border-2 border-slate-100 rounded-xl text-center font-black text-xs peer-checked:border-blue-600 peer-checked:bg-blue-50 peer-checked:text-blue-600 transition leading-none">
                               {t === 'homework' ? '宿題' : '自習'}
                             </div>
                           </label>))}
                      </div>
                   </div>
                   <div className="text-left leading-none text-left text-left text-left">
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-2 leading-none text-left text-left text-left text-left">内容</label>
                      <input name="detail" required placeholder="例：数学ワーク P.40" className="w-full bg-slate-50 border-none rounded-xl p-4 font-black placeholder:text-slate-300 shadow-inner text-sm outline-none leading-none text-left"/>
                   </div>
                   <button type="submit" className="w-full bg-blue-600 text-white font-black py-4 rounded-xl shadow-2xl active:scale-95 transition text-md uppercase leading-none">Add Task</button>
                </form>
             </div>
          </div>)}

        {selectedTaskId && (<div className={taskDetailOverlayClass}>
             <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setSelectedTaskId(null)}/>
             <div className="relative bg-white w-full max-w-2xl rounded-t-[2.5rem] lg:rounded-[3rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 h-[90vh] max-h-[90vh]">
                {(() => {
                const task = tasks.find(t => t.id === selectedTaskId);
                if (!task)
                    return null;
                const cat = CATEGORIES[task.categoryId.toUpperCase()];
                return (<>
                      <div className="p-6 sm:p-10 border-b border-slate-50 flex justify-between items-start shrink-0 bg-slate-50/50">
                         <div className="space-y-2">
                            <div className="flex gap-2 text-left">
                               <span className={`text-[9px] font-black px-3 py-1 rounded-full ${cat.bg} ${cat.color} uppercase text-left`}>{cat.label}</span>
                               <span className="text-[9px] font-black bg-white text-slate-400 px-3 py-1 rounded-full uppercase shadow-sm text-left">{task.type === 'homework' ? '宿題' : '自習'}</span>
                            </div>
                            <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tighter leading-tight text-left">{task.title}</h2>
                         </div>
                         <button type="button" aria-label="学習項目詳細を閉じる" title="閉じる" onClick={() => setSelectedTaskId(null)} className="p-3 bg-white rounded-2xl shadow-sm hover:bg-slate-50 transition shrink-0 text-left"><X size={24}/></button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-6 sm:p-10 space-y-10 no-scrollbar pb-32 text-left">
                         <StrictTimer task={task} isAnyOtherRunning={isAnyTaskRunning && !task.isRunning} isSaving={isSavingRecord} onUpdate={handleUpdateLocalTask} onSave={handleSaveRecord} onRequestRecovery={openRecoveryModal}/>
                         <div className="space-y-4 text-left">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 px-2 text-left"><Search size={14}/> 学習メモ</label>
                            <textarea value={task.tempDetail || ""} onChange={(e) => handleUpdateLocalTask(task.id, { tempDetail: e.target.value })} placeholder="内容をメモ..." className="w-full h-28 bg-slate-50/50 border-none rounded-2xl p-4 font-black text-md resize-none shadow-inner outline-none focus:ring-2 focus:ring-blue-100 text-left leading-snug"/>
                         </div>
                         <div className="space-y-6 text-left">
                            <h3 className="font-black text-lg flex items-center gap-2 px-2 text-left"><History className="text-blue-500"/> 履歴</h3>
                            <div className="space-y-3 text-left">
                              {getMonthlyHistories(task, selectedMonth).length === 0 ? <p className="text-center py-10 text-slate-300 font-bold italic text-sm text-center">この月の記録なし</p> :
                        [...getMonthlyHistories(task, selectedMonth)].reverse().map(h => (<div key={h.id} className="bg-white border border-slate-100 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center shadow-sm gap-3 text-left">
                                   <div className="flex-1 pr-4 w-full text-left">
                                      <span className="text-[10px] font-black bg-slate-50 text-slate-500 px-3 py-1 rounded-full mb-2 inline-block text-left">{h.date}</span>
                                      <p className="font-bold text-slate-500 text-xs leading-snug break-words text-left">{h.memo || "詳細なし"}</p>
                                   </div>
                                   <div className="text-blue-600 font-mono font-black text-xl tracking-tighter shrink-0 self-end sm:self-auto text-left">{formatDuration(h.duration)}</div>
                                </div>))}
                            </div>
                         </div>
                         <button type="button" onClick={async () => {
                         if (confirm("この学習項目を削除しますか？\nこの項目の学習履歴・メモもすべて削除されます。")) {
                            if (isSampleMode) {
                                setTasks(prev => prev.filter(t => t.id !== task.id));
                                setSelectedTaskId(null);
                            }
                            else {
                                try {
                                    await deleteDoc(doc(getTasksCol(), task.id));
                                    setTasks(prev => prev.filter(t => t.id !== task.id));
                                    setSelectedTaskId(null);
                                    fetchData(true);
                                }
                                catch {
                                    alert("失敗");
                                }
                            }
                        }
                    }} className="w-full py-6 text-rose-300 hover:text-rose-500 font-black text-[10px] flex items-center justify-center gap-2 border-2 border-dashed border-rose-50 rounded-2xl transition-all hover:bg-rose-50/50 uppercase tracking-widest mt-10 text-center">Delete Task Item</button>
                      </div>
                    </>);
            })()}
             </div>
          </div>)}

        {isAddingTest && (<div className={modalOverlayClass}>
             <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 h-[85vh] flex flex-col text-left">
                <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50 shrink-0 text-left leading-none text-left text-left">
                   <h3 className="text-xl sm:text-2xl font-black tracking-tight text-center flex-1 leading-none text-center">偏差値登録</h3>
                   <button type="button" aria-label="成績登録を閉じる" title="閉じる" onClick={() => { setIsAddingTest(false); setEditingTest(null); }} className="p-2 bg-white rounded-xl shadow-sm transition leading-none text-left text-left text-left text-left"><X size={20}/></button>
                </div>
                <form onSubmit={handleSaveTest} className="p-6 space-y-6 overflow-y-auto no-scrollbar pb-24 text-left leading-none text-left text-left">
                   <div className="grid grid-cols-2 gap-4 text-left leading-none text-left text-left text-left">
                      <div className="text-left leading-none text-left text-left text-left">
                        <label className="block text-xs font-black text-slate-500 mb-2 leading-none text-left text-left text-left">カテゴリ</label>
                        <select name="testCategory" defaultValue={editingTest?.category || "school"} className="w-full bg-slate-50 border-none rounded-xl p-4 font-black text-base shadow-inner appearance-none leading-none"><option value="school">中学校</option><option value="juku">塾</option></select>
                      </div>
                      <div className="text-left leading-none text-left text-left text-left">
                        <label className="block text-xs font-black text-slate-500 mb-2 leading-none text-left text-left text-left">種別</label>
                        <select name="testSubType" defaultValue={editingTest?.subType || "midterm"} className="w-full bg-slate-50 border-none rounded-xl p-4 font-black text-base shadow-inner appearance-none leading-none"><option value="midterm">中間</option><option value="final">期末</option><option value="normal">その他</option></select>
                      </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4 text-left leading-none text-left text-left text-left">
                      <div className="text-left leading-none text-left text-left text-left text-left"><label className="block text-xs font-black text-slate-500 mb-2 leading-none text-left text-left text-left text-left">テスト名</label><input name="name" required defaultValue={editingTest?.name} placeholder="例: 第1回公開模試" className="w-full bg-slate-50 border-none rounded-xl p-4 font-black text-base shadow-inner leading-none text-left text-left text-left"/></div>
                      <div className="text-left leading-none text-left text-left text-left text-left text-left"><label className="block text-xs font-black text-slate-500 mb-2 leading-none text-left text-left text-left text-left">実施日</label><input name="date" type="date" required defaultValue={editingTest?.date || getTodayStr()} className="w-full bg-slate-50 border-none rounded-xl p-4 font-black text-base shadow-inner leading-none text-left text-left text-left"/></div>
                   </div>
                   <div className="space-y-4 text-left">
                      <label className="block text-base font-black text-slate-700 leading-none text-left">教科別偏差値</label>
                      <div className="grid grid-cols-3 gap-3 text-left">
                         {[...SUBJECT_DEFS.school, ...SUBJECT_DEFS.juku].map(sub => (<div key={sub.id} className="bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-inner text-center leading-none">
                              <p className="text-xs font-black text-slate-500 mb-2 truncate leading-none text-center">{sub.label}</p>
                              <input name={`score_${sub.id}`} type="number" step="0.1" inputMode="decimal" defaultValue={editingTest?.scores?.[sub.id]} placeholder="50.0" className="w-full bg-white border-none rounded-xl p-3 font-black text-lg text-center shadow-sm outline-none focus:ring-2 focus:ring-blue-600 leading-none"/>
                           </div>))}
                      </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4 border-t border-slate-50 pt-6 text-left">
                      <div className="text-left"><label className="block text-xs font-black text-slate-500 mb-2 leading-none text-left">総合偏差値</label><input name="average" type="number" step="0.1" inputMode="decimal" defaultValue={editingTest?.average} placeholder="50.0" className="w-full bg-slate-50 border-none rounded-xl p-4 font-black text-lg leading-none"/></div>
                      <div className="text-left"><label className="block text-xs font-black text-slate-500 mb-2 leading-none text-left">順位 任意</label><input name="rank" defaultValue={editingTest?.rank} placeholder="例: 10位 / 1234人中" className="w-full bg-slate-50 border-none rounded-xl p-4 font-black text-base leading-none"/></div>
                   </div>
                   <button type="submit" className="w-full bg-rose-500 text-white font-black py-5 rounded-2xl shadow-xl active:scale-95 transition text-lg leading-none mt-4 text-center">保存する</button>
                </form>
             </div>
          </div>)}

        {/* --- Mobile Nav Bar --- */}
        <nav className={isMobileView
            ? "absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-3xl border-t border-slate-100 flex justify-around p-3 pb-8 z-50 rounded-t-[1.75rem] shadow-2xl leading-none text-center"
            : "lg:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-3xl border-t border-slate-100 flex justify-around p-3 pb-8 z-50 rounded-t-[1.75rem] shadow-2xl leading-none text-center"}>
          {[{ id: 'daily', label: '学習記録', icon: Zap }, { id: 'stats', label: '実績分析', icon: BarChart2 }, { id: 'tests', label: '成績推移', icon: TrendingUp }].map(item => (<button type="button" key={item.id} aria-label={item.label} title={item.label} onClick={() => setActiveTab(item.id)} className={`p-4 rounded-2xl transition-all duration-300 leading-none text-center ${activeTab === item.id ? 'bg-blue-600 text-white shadow-xl -translate-y-2 text-center' : 'text-slate-300 text-center'}`}><item.icon size={22}/></button>))}
        </nav>
      </div>
    </div>);
}
