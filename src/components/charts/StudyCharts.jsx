import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatTestDateLabel } from '../../tests/testRecord.js';

const TestChartTooltip = ({ active, payload, categories }) => {
    if (!active || !payload?.length)
        return null;
    const test = payload[0]?.payload;
    if (!test)
        return null;
    const categoryLabel = test.category === categories.SCHOOL.id
        ? categories.SCHOOL.label
        : test.category === categories.JUKU.id
            ? categories.JUKU.label
            : 'カテゴリ不明';
    const values = payload.filter(item => typeof item.value === 'number' && Number.isFinite(item.value));
    return (<div className="min-w-44 rounded-2xl border border-slate-100 bg-white p-4 shadow-xl">
      <p className="font-black text-slate-800">{test.name || '名称未設定'}</p>
      <p className="mt-1 text-xs font-bold text-slate-400">{test.date} ・ {categoryLabel}</p>
      <div className="mt-3 space-y-2">
        {values.map(item => (<div key={item.dataKey} className="flex items-center justify-between gap-4 text-xs font-black">
          <span style={{ color: item.color }}>{item.name}</span>
          <span className="font-mono text-slate-700">偏差値 {item.value}</span>
        </div>))}
      </div>
    </div>);
};

export default function StudyCharts({ kind, stats, filteredTests, visibleSubjects, allChartSubjects, deviationDomain, categories }) {
  if (kind === 'study') return (<ResponsiveContainer width="100%" height="100%">
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
                      </ResponsiveContainer>);
  if (kind === 'ratio') return (<ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={stats.breakdown} innerRadius="60%" outerRadius="85%" paddingAngle={5} dataKey="duration" nameKey="label">
                          {stats.breakdown.map((e) => <Cell key={e.id} fill={e.hex} stroke="none"/>)}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', fontSize: '14px', fontWeight: 'bold' }}/>
                        <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: '900' }}/>
                      </PieChart>
                    </ResponsiveContainer>);
  return (<ResponsiveContainer width="100%" height="100%">
                         <LineChart data={filteredTests} margin={{ top: 10, right: 14, left: -8, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                            <XAxis dataKey="date" tickFormatter={formatTestDateLabel} minTickGap={24} tickMargin={10} axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: '900', fill: '#94a3b8' }}/>
                            <YAxis domain={deviationDomain} axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: '900', fill: '#94a3b8' }}/>
                            <Tooltip content={<TestChartTooltip categories={categories}/>}/>

                            {visibleSubjects.includes('average') && (<Line type="monotone" dataKey="average" name="総合偏差値" stroke="#0f172a" strokeWidth={4} dot={{ r: 5, fill: '#0f172a', strokeWidth: 2, stroke: '#fff' }} connectNulls/>)}
                            {allChartSubjects.filter(s => s.id !== 'average').map(sub => (visibleSubjects.includes(sub.id) && (<Line key={sub.id} type="monotone" dataKey={`scores.${sub.id}`} name={sub.label} stroke={sub.hex} strokeWidth={3} dot={{ r: 4, fill: sub.hex, strokeWidth: 1, stroke: '#fff' }} connectNulls animationDuration={800}/>)))}
                         </LineChart>
                      </ResponsiveContainer>);
}
