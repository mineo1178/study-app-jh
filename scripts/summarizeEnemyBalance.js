/* global process */
import { readFileSync, writeFileSync } from 'node:fs';
import { candidateTarget } from './measureEnemyBalance.js';
const report=JSON.parse(readFileSync('docs/rpg-v2.9.13-comparison.json'));
const stats = values => { const sorted=[...values].sort((a,b)=>a-b); return { min:sorted[0], median:sorted[Math.floor(sorted.length/2)], max:sorted.at(-1) }; };
const metrics = results => ({ wins:results.filter(r=>r[0]==='won').length, conditions:results.length, ...Object.fromEntries(report.columns.slice(1).map((name,i)=>[name,stats(results.map(r=>r[i+1]))])) });
const groups=new Map();
for(const row of report.rows) {
 const key=JSON.stringify([row.matrix,row.level,row.target,row.build,row.equipment||'equipped']);
 if(!groups.has(key)) groups.set(key,[]);
 groups.get(key).push(row);
}
const summary=[...groups].map(([key,rows])=>({ dimensions:JSON.parse(key), candidates:Object.fromEntries(Object.keys(report.candidates).map(c=>[c,Object.fromEntries(report.policies.map((p,i)=>[p,metrics(rows.map(r=>r.results[c][i]))]))])) }));
writeFileSync('docs/rpg-v2.9.13-summary.json',JSON.stringify({ dimensions:['matrix','level','target','build','equipment'], selected:'medium', summary }));
const range = s => s.min===s.max?String(s.min):`${s.min}–${s.max}`;
const wins = s => `${s.wins}/${s.conditions}`;
const selected = (matrix,level,target,build='balanced')=>summary.find(s=>JSON.stringify(s.dimensions)===JSON.stringify([matrix,level,target,build,'equipped']));
const lines=[`# v2.9.13 RPG敵バランス検証`, '',
'基準: main / 専用ブランチ開始時 `1ef9b8e01b85ebd0f90602caa9e6eb5445a2311b` (v2.9.11)。Issue #2。専用worktree `C:/dev/study-app-jh-balance-v2913`、branch `codex/rpg-balance-v2913`。', '',
'## 採用案と原因', '',
'中案を採用。Weekly4種だけHPを30%、攻撃を約8%増加。塔は `m=max(0,1−abs(floor−40)/20)` とし、既存の未丸めHPへ `1+0.20m`、攻撃へ `1+0.08m` を掛け最後に1回丸める。21〜59階だけを変更し、1〜20階・60階以降・Campaignは能力を維持する。Weekly rules 4→5、Tower rules 5→6、APP_VERSION v2.9.13。Campaign catalogは不変。', '',
'Weeklyは固定HP400〜440・攻撃25〜27に対し、味方全員が敵の反撃前に行動する。Lv20の育成済み90条件は2〜5ラウンド、被ダメージ1〜40、回復・防御0回で全勝する。敵固定値に対して味方のLv・装備・パネル・仲間の育成が重なることが原因。Lv7の全勝だけでは易しすぎると断定できず、変更前でも4〜14ラウンド、通常攻撃のみではボス別18〜48勝、回復最大9回を要した。', '',
'塔80階はLv20育成済みで35/36勝でも通常攻撃のみ0/36、7〜20ラウンド、回復3〜17回を要する。100階は同Lv0/36、Lv25も0/36、Lv30で2/36。育成済み35勝という数だけで80階を強化しない。80→100階では同じ古代ゴーレム系の3体編成でも既存二次成長・tier成長が重なり、回復・防御・MPの持続限界に達する。高階層の数値を維持して攻略不能化を避ける。', '',
'軽案はLv7の戦術条件を多く残す一方、高Lvでの必要行動数への効果が小さい。強案はLv7がボス別3〜14/90勝となり足止めが強い。中案はLv7の戦術40〜66/90に対し通常0/90、Lv12以上では育成後の全90条件を維持する折衷。WeeklyはCampaign後の任意挑戦であり、Campaign進行・塔序盤を妨げない。Lv20以上のWeeklyを全員に厳しくするための自動Lvスケーリングは追加しない。高Lvでは通常攻撃でも勝てるが、戦術のラウンド・残HP上の利点を残し、育成の成果として許容する。', '',
'初期探索ではHP×1.5/2.0/2.5・攻撃×1.2/1.4/1.6を試し、最軽案でもLv7が3〜14/90勝、後2案は0/90となったため棄却した。以下の最終3案へ探索範囲を狭めた。塔の初期20〜80階補正も、既に育成差が出る60階のLv12が20/36→6/36となったため棄却し、補正終点を60階に移した。', '',
'## 再現方法・測定条件', '',
'`node scripts/measureEnemyBalance.js --verify-after`、続いて `node scripts/summarizeEnemyBalance.js`。前者は保存した旧敵fixtureからBeforeと3案を再測定し、採用案の敵HP・攻撃・EXP・Energy・報酬が実装カタログと一致することをassertする。v2.9.11の2,700塔条件とWeekly9,?の旧結果を照合し、既存90条件と36条件の再現を確認する。v2.9.10/v2.9.11 JSONへの書込なし。', '',
'既存 `simulateBattleBalance` をそのまま使用し、`measureCompanionBalance` の5育成型、`measureTowerBalance` と同じ代表36条件を拡張。6職業、Lv1/7/12/20/25/30、塔1/10/20/30/40/50/60/80/100階、Weekly4種、Campaign全通常敵と2ボス。主人公パネル未育成/攻撃/バランス×守護/既存代表編成、仲間未育成/防御/攻撃/MP/バランス、装備あり/なしを比較。Weekly別枠は6職業×15仲間=90条件、対象仲間のみ育成・同伴未育成という旧条件を維持。Lv25/30はLv20の装備・編成を維持してEXPを対応Lvへ変更し、HP/MP配分を現Lvで再計算。', '',
'Lv1の未解放職業・仲間、低Lvでの高階層・Weekly等は到達性を主張しない合成ストレス条件。育成予算はEXP・既存解放条件から導出。戦術は既存の決定的な弱点/範囲攻撃・HP55%未満の回復・致死回避ガード方針。最適戦術探索や実ユーザーの確率的勝率ではない。防御はこの方針で必要な時だけ使うため0回も正常。実時間は未計測で、ラウンド数・行動数を負担の代理とする。', '',
`比較JSON: ${report.rows.length.toLocaleString()}行。各行はBefore/軽/中/強それぞれ戦術/通常の9指標を保持。列順: ${report.columns.join(', ')}。summary JSONは各Lv×対象×育成型×装備の勝利条件数とmin/median/maxを保持し、各職業・各仲間・各主人公育成型・各編成の失敗もraw JSONから追跡可能。平均値で隠さない。`, '',
'## 3案比較 (Weekly: バランス仲間90条件・戦術)', '',
'塔係数は軽HP+10%/攻撃+4%、中+20%/+8%、強+30%/+12%を40階頂点に適用。Weeklyの軽HP×1.15/攻撃×1.04、中×1.30/×1.08、強×1.50/×1.20。', '',
'|Lv|対象|Before|軽|中 (採用)|強|', '|---:|---|---:|---:|---:|---:|'];
for(const level of [1,7,12,20,25,30]) for(const target of report.targets.filter(t=>t.id.startsWith('weekly_')).map(t=>t.id)) {
 const s=selected('weekly90',level,target);
 lines.push(`|${level}|${target}|${Object.keys(report.candidates).map(c=>wins(s.candidates[c].strategy)).join('|')}|`);
}
lines.push('', '## 敵能力 Before → After', '', '|対象|HP|攻撃|', '|---|---|---|');
for(const target of report.targets.filter(t=>t.encounter && (!t.floor || [40,80,100].includes(t.floor)))) {
 const old=target.encounter.enemies, after=candidateTarget(target,'medium').encounter.enemies;
 lines.push('|'+target.id+' (敵順)|'+old.map((e,i)=>e.maxHp+'→'+after[i].maxHp).join('/')+'|'+old.map((e,i)=>e.attack+'→'+after[i].attack).join('/')+'|');
}
lines.push('', '## 塔の3案比較 (同行2人バランス・36条件)', '', '|Lv|階|Before勝利/ラウンド|軽|中|強|', '|---:|---:|---|---|---|---|');
for(const level of [7,12,20,25,30]) for(const floor of [30,40,50,60,80,100]) {
 const s=selected('reference',level,'tower-'+floor);
 lines.push('|'+level+'|'+floor+'|'+Object.keys(report.candidates).map(c=>wins(s.candidates[c].strategy)+' / '+range(s.candidates[c].strategy.turns)).join('|')+'|');
}
lines.push('', '## Weekly Before → After (仲間バランス90条件)', '', 'HPはパーティー残HP比%。範囲は敗北を含む全条件の最小〜最大。H/G/Sは回復/防御/全スキル使用数。', '', '|Lv|対象|戦術勝利|通常勝利|ラウンド|残HP%|被ダメージ|H|G|S|','|---:|---|---|---|---|---|---|---|---|---|');
for(const level of [7,12,20,25,30]) for(const target of report.targets.filter(t=>t.id.startsWith('weekly_')).map(t=>t.id)) {
 const s=selected('weekly90',level,target), a=s.candidates.before,b=s.candidates.medium;
 lines.push(`|${level}|${target}|${wins(a.strategy)}→${wins(b.strategy)}|${wins(a.normal)}→${wins(b.normal)}|${['turns','hpPercent','damage','heals','guards','skillUseCount'].map(k=>`${range(a.strategy[k])}→${range(b.strategy[k])}`).join('|')}|`);
}
lines.push('', '## 塔 Before → After (同行2人バランス育成・代表36条件)', '', '|Lv|階|戦術勝利|通常勝利|ラウンド|残HP%|被ダメージ|H|G|S|','|---:|---:|---|---|---|---|---|---|---|---|');
for(const level of [1,7,12,20,25,30]) for(const floor of [20,40,60,80,100]) {
 const s=selected('reference',level,`tower-${floor}`),a=s.candidates.before,b=s.candidates.medium;
 lines.push(`|${level}|${floor}|${wins(a.strategy)}→${wins(b.strategy)}|${wins(a.normal)}→${wins(b.normal)}|${['turns','hpPercent','damage','heals','guards','skillUseCount'].map(k=>`${range(a.strategy[k])}→${range(b.strategy[k])}`).join('|')}|`);
}
lines.push('', '## 育成・装備・Campaign対照', '', '|Lv|対象|未育成|防御|攻撃|MP|バランス|','|---:|---|---|---|---|---|---|');
for(const level of [7,12,20,25,30]) for(const target of ['weekly_ignis','tower-40','tower-80','tower-100']) {
 const matrix=target.startsWith('weekly')?'weekly90':'reference';
 lines.push(`|${level}|${target}|${['none','defensive','attack','magic','balanced'].map(build=>{const s=selected(matrix,level,target,build);return `${wins(s.candidates.before.strategy)}→${wins(s.candidates.medium.strategy)}`;}).join('|')}|`);
}
lines.push('', '装備対照は装備以外の主人公パネル・同行育成を固定し、各Lv×6職業×2編成で実施。結果詳細はsummary JSONのmatrix=equipment。Campaignは敵能力・報酬・全測定結果がBeforeと3案で同一。', '',
'## 互換性と検証', '',
'変更する実行コードはWeekly/Tower敵カタログとAppのversion表記のみ。新規開始時の既存snapshot生成経路が新version・能力を固定する。保存済みバトルのsnapshot/HP/MP/報酬/進行を書き換えず、再開・戦闘計算・transaction/revision/actionIdは変更しない。', '',
'新規回帰テストは100階まで全階の正確な能力と報酬・行動パターン・属性・敵数不変性、Weekly4種の新規開始、Tower新規version/初期HP、旧Tower rules5/Weekly rules4および新規バトルを実際に1行動後保存→JSON再読込→勝利/敗北まで継続する。各敵行動の被ダメージは保存attackから再計算し一致、毎行動で敵/味方/遭遇/報酬snapshot不変、決着後activeBattleId解除、EXP/報酬/階進行と決着後再実行拒否を確認。既存rules2/4等の互換テストも維持。', '',
'旧v2.9.7緩和・v2.9.10成長の歴史的assertionは削除せず、今回保存したv2.9.11敵fixtureを入力として維持。現在の敵値は別の新規テストで正確に検証。現行敵に旧緩和上限を強制する矛盾だけを解消し、勝利数期待値の引下げやskipは行わない。', '',
'### 最終チェック', '', '全Vitest: 104ファイル・1,470件PASS (既存1,349件を維持、121件追加、skip/削除なし)。対象テストもPASS。npm run lint: PASS。npm run build: PASS、既存500kB超chunk警告あり。git diff --check: PASS。', '',
'Firestore Rules: npm run test:rules、独立した新規demo Firestore Emulatorで71件PASS。既存Emulatorへの代替接続なし。Rulesファイル・本番Firestoreは変更なし。最初は新規Towerのversion期待値(5→6)だけで1件失敗し修正。その次の全実行では変更外の報酬訂正競合テストがPENDING_CORRECTION_INVALIDで1件失敗、再度の全実行で71件PASSした。該当のrewardCorrectionRepositoryはorigin/mainから差分なし。間欠的な競合失敗の可能性は未解決として残し、本タスクで報酬・transactionを変更しない。', '',
'保護対象: 元worktreeの既存変更6件、GUI worktreeのclean状態、既存RPG worktreeの未追跡Before JSONを保持。v2.9.10/v2.9.11報告JSONおよびfirestore.rulesはorigin/mainとの差分なし。', '',
'変更ファイル: src/App.jsx (versionのみ)、src/rpg/weeklyBossCatalog.js、src/rpg/towerCatalog.js。関連テスト: src/rpg/enemyBalanceV2913.test.js、battleBalance.test.js、towerGrowth.test.js、difficultyRelief.test.js、src/data/rpgTowerBattle.test.js、test/firestore/firestore.rules.test.js (version期待値のみ)。成果物: scripts/measureEnemyBalance.js、summarizeEnemyBalance.js、test/fixtures/rpg-v2.9.13-before-enemies.json、docs/rpg-v2.9.13-comparison.json、rpg-v2.9.13-summary.json、本報告。', '',
'## 既知の制限', '',
'Lv25の100階は代表36条件で0勝、Lv30でも2勝に限られる。これはBeforeから不変であり、広い編成での攻略を保証しない。本件では高階層を強化しない。Weeklyは高Lvで通常攻撃でも勝てる条件が残る。固定敵数値のみの調整では、低Lvの挑戦可能性と全高Lvの緊張感を同時に最大化できない。実ユーザーの操作時間・離脱率・最適攻略は未測定。中案でもLv7の一部編成は失敗し、塔40階の通常攻撃は不利になる。', '',
'GUI PR #1、既存RPG worktree、未公開v2.10.0、AGENTS.md、既存Before JSON、未追跡ファイルは編集しない。本番Firestore接続・merge・本番公開なし。');
const historical=JSON.parse(readFileSync('docs/rpg-v2.9.11-balance.json'));
const text=lines.join('\n').replace('2,700塔条件とWeekly9,?の旧結果',`${historical.reference.length.toLocaleString()}塔条件とWeekly${historical.rows.filter(r=>r.target.startsWith('weekly_')).length.toLocaleString()}条件の旧結果`);
if(process.argv.includes('--write-report')) writeFileSync('docs/rpg-v2.9.13-verification.md',text+'\n');
console.log('summary groups',summary.length,'rows',report.rows.length,'implementation verified',report.verifiedImplementation);
