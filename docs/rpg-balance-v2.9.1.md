# v2.9.1 BOSS難易度緩和

## 測定と範囲

- 基準HEAD: 5a9bbd7442ccdf9359763f31eb89d1ab660f6a77（v2.9.0）。保存済みBeforeを再利用。
- v2.6.1の構成と戦略を再利用し、Tower20階を追加。4構成 × 20対戦 × 通常/戦略の2方針 = 各160対戦。
- レベル1 / 7 / 12 / 20。装備・仲間・行動方針は scripts/simulateBattleBalance.js を参照。
- 決定的なサンプル測定であり、全プレイヤーの勝利を保証しない。パーティ残HPは全員の合計。
- 通常敵の全80結果（Campaign3種、Tower1/4/7/24/27/54/57階 × 4構成 × 2方針）はBeforeと完全一致。
- 通常敵、装備、報酬、Energy、スキル、ダメージ式、transaction、Firestore Rulesは変更なし。

## 新規Battleの数値

| BOSS | HP Before → After | 攻撃 Before → After |
|---|---:|---:|
| オークチーフ | 92 → 80 | 8 → 7 |
| エンシェントゴーレム | 130 → 110 | 11 → 9 |
| 炎帝イグニス | 850 → 430 | 52 → 28 |
| 蒼海竜リヴァイア | 900 → 450 | 49 → 27 |
| 雷王ヴォルト | 760 → 430 | 53 → 29 |
| 大地巨神ガイア | 950 → 470 | 50 → 27 |
| Tower 10F 主ボス | 99 → 80 | 13 → 11 |
| Tower 20F 主ボス | 197 → 155 | 19 → 14 |
| Tower 30F 主ボス | 183 → 148 | 21 → 18 |
| Tower 60F 主ボス | 470 → 369 | 41 → 31 |

Tower主ボスのHP係数0.7→0.65、攻撃係数0.9→0.75。取り巻きの通常敵は維持。

## Before / After（戦略方針、全構成・主要BOSS）

| 構成 | 対象 | 勝敗 | ターン/ラウンド | 残HP | 総被ダメージ | 回復回数 | 防御回数 |
|---|---|---|---:|---:|---:|---:|---:|
| beginner | campaign-orc_chief | lost → lost | 8 → 10 | 0 → 0 | 72 → 74 | 2 → 2 | 0 → 1 |
| beginner | campaign-ancient_golem | lost → lost | 5 → 7 | 0 → 0 | 68 → 70 | 2 → 2 | 0 → 1 |
| beginner | tower-10 | lost → lost | 7 → 8 | 0 → 0 | 141 → 134 | 2 → 2 | 1 → 2 |
| beginner | tower-20 | lost → lost | 4 → 4 | 0 → 0 | 134 → 131 | 1 → 2 | 3 → 4 |
| beginner | tower-30 | lost → lost | 4 → 4 | 0 → 0 | 132 → 121 | 1 → 1 | 3 → 3 |
| beginner | tower-60 | lost → lost | 2 → 2 | 0 → 0 | 144 → 159 | 1 → 1 | 1 → 1 |
| beginner | weekly_ignis | lost → lost | 4 → 5 | 0 → 0 | 221 → 132 | 1 → 1 | 1 → 1 |
| beginner | weekly_leviathan | lost → lost | 4 → 5 | 0 → 0 | 207 → 126 | 1 → 1 | 1 → 1 |
| beginner | weekly_volt | lost → lost | 3 → 5 | 0 → 0 | 179 → 137 | 1 → 1 | 0 → 1 |
| beginner | weekly_gaia | lost → lost | 4 → 5 | 0 → 0 | 212 → 126 | 1 → 1 | 1 → 1 |
| intermediate | campaign-orc_chief | won → won | 7 → 5 | 22 → 25 | 32 → 15 | 1 → 0 | 0 → 0 |
| intermediate | campaign-ancient_golem | lost → won | 8 → 9 | 0 → 8 | 82 → 60 | 2 → 2 | 0 → 0 |
| intermediate | tower-10 | won → won | 3 → 3 | 137 → 146 | 27 → 18 | 0 → 0 | 0 → 0 |
| intermediate | tower-20 | lost → won | 10 → 9 | 0 → 24 | 231 → 184 | 2 → 2 | 4 → 0 |
| intermediate | tower-30 | lost → lost | 9 → 11 | 0 → 0 | 225 → 213 | 2 → 2 | 3 → 2 |
| intermediate | tower-60 | lost → lost | 4 → 4 | 0 → 0 | 294 → 268 | 2 → 2 | 3 → 3 |
| intermediate | weekly_ignis | lost → lost | 6 → 11 | 0 → 0 | 317 → 258 | 2 → 2 | 1 → 3 |
| intermediate | weekly_leviathan | lost → lost | 6 → 10 | 0 → 0 | 295 → 249 | 2 → 2 | 1 → 1 |
| intermediate | weekly_volt | lost → lost | 6 → 10 | 0 → 0 | 322 → 260 | 2 → 2 | 1 → 2 |
| intermediate | weekly_gaia | lost → lost | 6 → 10 | 0 → 0 | 303 → 249 | 2 → 2 | 1 → 1 |
| prepared | campaign-orc_chief | won → won | 4 → 3 | 30 → 38 | 10 → 2 | 0 → 0 | 0 → 0 |
| prepared | campaign-ancient_golem | won → won | 8 → 6 | 15 → 29 | 53 → 25 | 2 → 1 | 0 → 0 |
| prepared | tower-10 | won → won | 3 → 3 | 195 → 195 | 7 → 7 | 0 → 0 | 0 → 0 |
| prepared | tower-20 | won → won | 8 → 6 | 165 → 142 | 142 → 80 | 4 → 1 | 0 → 0 |
| prepared | tower-30 | won → won | 7 → 6 | 108 → 131 | 135 → 92 | 2 → 1 | 0 → 0 |
| prepared | tower-60 | lost → lost | 5 → 6 | 0 → 0 | 321 → 352 | 2 → 4 | 3 → 4 |
| prepared | weekly_ignis | lost → won | 6 → 8 | 0 → 150 | 323 → 164 | 2 → 4 | 0 → 0 |
| prepared | weekly_leviathan | lost → won | 7 → 9 | 0 → 127 | 299 → 184 | 2 → 4 | 1 → 0 |
| prepared | weekly_volt | lost → won | 6 → 8 | 0 → 145 | 329 → 171 | 2 → 4 | 0 → 0 |
| prepared | weekly_gaia | lost → won | 6 → 9 | 0 → 127 | 308 → 184 | 2 → 4 | 0 → 0 |
| trained | campaign-orc_chief | won → won | 3 → 2 | 38 → 39 | 2 → 1 | 0 → 0 | 0 → 0 |
| trained | campaign-ancient_golem | won → won | 4 → 3 | 35 → 38 | 5 → 2 | 0 → 0 | 0 → 0 |
| trained | tower-10 | won → won | 2 → 2 | 255 → 255 | 1 → 1 | 0 → 0 | 0 → 0 |
| trained | tower-20 | won → won | 3 → 3 | 253 → 249 | 3 → 7 | 0 → 0 | 0 → 0 |
| trained | tower-30 | won → won | 4 → 3 | 249 → 253 | 7 → 3 | 0 → 0 | 0 → 0 |
| trained | tower-60 | won → won | 8 → 7 | 131 → 163 | 264 → 155 | 4 → 2 | 0 → 0 |
| trained | weekly_ignis | won → won | 9 → 4 | 72 → 223 | 344 → 33 | 4 → 0 | 0 → 0 |
| trained | weekly_leviathan | won → won | 9 → 4 | 104 → 227 | 312 → 29 | 4 → 0 | 1 → 0 |
| trained | weekly_volt | won → won | 7 → 3 | 131 → 230 | 236 → 26 | 3 → 0 | 1 → 0 |
| trained | weekly_gaia | won → won | 10 → 4 | 77 → 227 | 339 → 29 | 4 → 0 | 1 → 0 |

## 評価と互換性

- Lv7第1ボスは5ターン勝利。最終ボスは敗北→9ターン勝利（回復2回）。
- Lv12 Weekly4種は敗北→8〜9ラウンド勝利。回復は各4回。通常攻撃だけより残HPが増え、回復役の価値を維持。
- Lv7 Weekly4種とTower30/60階は依然敗北。Lv12でもTower60階は敗北。進行・装備更新は必要。
- 高育成Lv20のWeeklyは3〜4ラウンドで勝利。8〜9ラウンドの目安はLv12適正構成に対する値。
- Lv7 Tower10階は3ラウンド、Tower20階は9ラウンド。Lv12 Tower20/30階は6ラウンド、Lv20 Tower60階は7ラウンド。
- 旧オーク（92HP・攻撃8、さらに旧58HP・攻撃5）、Tower rules 2、Weekly rules 1/2を独立テストで確認。HP/攻撃/行動/報酬snapshotは再生成しない。
- オーク強撃は floor(7×150/100)−4=6。ゴーレム岩砕きは floor(9×150/100)−4=9、大地震は floor(9×175/100)−4=11、防御時floor(11×0.5)=5。
- 新Tower/WeeklyのrulesVersionは3。旧バージョンは保存済みの能力・EXP・報酬で継続。

## 検証

- 関連テスト: 9ファイル・74件PASS。
- 全体テスト: 83ファイル・859件PASS（skipなし）。
- lint / build / git diff --check: PASS。
- 一時ファイルENOENTなし。TEMP/TMP変更不要。
- Rules変更なし、Rulesテストは対象外。UI機能変更なし、画面確認は未実施。
- build主JS: 903.87kB、gzip 268.14kB。500kB超のchunk警告あり、build成功。
- 今回のBLOCKED解除は旧仕様のテスト期待値更新と独立互換テスト追加。戦闘処理の追加修正・バランス再調整なし。
