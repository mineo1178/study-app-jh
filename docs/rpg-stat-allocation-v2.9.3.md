# study-app-jh v2.9.3 HP・MP育成 検証レポート

## Allocation / GOLD

- 獲得ポイントは totalExp → 既存levelForTotalExp → min(30, level - 1)。Lv1/5/10/20/31 = 0/4/9/19/30pt。
- Campaign主人公HP = 40 + HP配分×3。Tower/Weekly主人公HP = 40 + 2×(Lv-1) + HP配分×3。MP = 8 + MP配分×2。
- 各配分は0～30の整数、合計は獲得ポイント以下。未知フィールド・NaN・Infinity・小数・負数を拒否。
- 未設定の旧profileは0/0として導出。破損値は保存を拒否し、修復・移行writeを行わない。
- 両方の配分が維持または増加なら無料。片方でも減少なら120G。価格はstatAllocation.jsの定数を利用する。
- 最新profileのEXP/GOLD/配分を確認時のbaselineと比較。不一致なら再確認を要求。activeBattleIdがあれば全配分操作を拒否。
- 保存はprofileの配分/GOLD/updatedAtだけをmergeし、既存rpgActionLedgerと同じtransactionで記録する。同じactionIdは再適用しない。
- 有料再配分はrewardIntegrityの保留中訂正を確認。GOLD不足・競合・通信失敗時に部分適用しない。
- 新しいcollection・listener・ポイント配布履歴migrationは追加していない。

## Battle

- 本番のCampaign/Tower/Weekly開始repositoryでmpRulesVersion:1を明示する。schemaVersion 7/8/9と既存Party判定は維持。
- 新規戦闘だけにmaxMpと初期playerMp、スキルmpCostを保存する。行動transactionで残MP・使用回数・対象を検証し、MPと効果とledgerを一括保存。
- 炎斬り/水刃/雷撃/ガード=2MP、ヒール=3MP、通常攻撃=0MP。従来の各スキル2回上限を維持。
- PartyのMPは主人公だけ。仲間のHPは育成加算前の従来hero基礎値で計算し、仲間の能力・スキル回数を維持する。
- 旧BattleにMPフィールドを補完しない。mpRulesVersionがないsnapshotはMPを検証・消費しない。
- 再開時は保存済snapshotとplayerMpを継続使用する。新規MP消費のbefore/after/costはaction ledgerへ記録。
- 旧バランス測定は明示的なpre-MP経路を維持し、160結果の既存SHA256期待値 bbf8e9c3ba26dbd8450b71dcb851419472301dc280a74430995735124477353c を変更せずPASS。

## Balance

基準はHEAD 62bdcaa (v2.9.2) に含まれるv2.9.1 BOSS緩和済catalog。敵・装備・報酬catalog、EXP・通常攻撃計算は変更なし。
同じレベル・装備・仲間編成で、Before=未配分/MP制限なし、After=指定配分/新MPルールを比較。決定的な戦略policyによる測定であり、全ての戦術の最適勝率を意味しない。

- Lv1は未配分。Lv7/12/20はHP極振り・MP極振り・HPに端数を寄せた均等配分。
- Campaignは主人公単独、Partyは主人公+守護戦士+魔導士/僧侶。装備は既存BALANCE_PLAYERSを使用。
- Campaign第1/最終Boss、Tower 10/20/30/60、Weekly全4種を含む180条件。
- Lv12 Weeklyは全24条件で勝利を維持。HP極振りもLv7のWeeklyや高層Towerでは敗北し、無敵化していない。
- MP極振りはスキル選択の余地を増やすが、使用回数上限は解除されない。MPを温存する最適化は今回の測定policyには追加していない。
- 未配分Lv1でも通常敵スライム/ゴブリンに勝利。未配分の通常攻撃policyは80条件で戦闘結果が完全一致。
- 提案の基本HP40/基本MP8/HP+3/MP+2、MPコストを採用。測定による数値再調整は不要だった。

| Lv | 配分 | 勝利条件数 / 18 | Weekly勝利数 / 8 |
|---|---|---:|---:|
| 1 | none | 0 | 0 |
| 7 | hp | 8 | 0 |
| 7 | mp | 7 | 0 |
| 7 | balanced | 8 | 0 |
| 12 | hp | 16 | 8 |
| 12 | mp | 16 | 8 |
| 12 | balanced | 16 | 8 |
| 20 | hp | 18 | 8 |
| 20 | mp | 18 | 8 |
| 20 | balanced | 18 | 8 |

Lv1の0/18はBoss/高層Towerの比較対象に対する結果。序盤通常敵の到達性は別テストで確認した。
残HPはCampaignでは主人公、Partyでは生存全員の合計。ターンはCampaign行動数、Partyラウンド数。

## Verification

- npm test: 90ファイル、1,098件PASS (既存1,040 + 追加58)。既存テストを削除/skipしていない。
- 対象テスト: 育成pure helper、transactionモック再試行、HP/MP snapshot、旧Battle、UI表示、バランス受入を実行。
- Rules/実Emulator: 既存13 + 追加5 = 18件PASS。demo-study-app-jh専用Emulatorを起動し終了。既存Emulatorへの代替接続なし。firestore.rules変更なし。
- lint: PASS。build: PASS。git diff --check: PASS。
- JS総量: 1,427,411 → 1,438,244 bytes、+10,833 bytes (+0.76%)。既存500kB超chunk警告は残る。
- 実画面: test/manual/rpg-stats.html をin-app browserで確認。Firestore接続なし、実コンポーネントとpure helperを利用したfixture。
- 320/375/1440px: 育成画面・新旧Campaign/Tower/Weeklyを確認。18戦闘表示条件で横overflowなし。新規のみMP/消費MPを表示。
- 実操作: HP/MP加減算、無料配分、120G再配分(300→180G)、保存前確認、キャンセル、保存成功、通信失敗再現と入力保持、GOLD不足、Lv1ポイント不足、他端末更新警告、戦闘中disable、UID切替、Tab/Shift+Tabのfocus循環、Enter確定。
- UID切替は本番RpgHubと同じkeyによる再mountをfixtureで再現。認証サービスへの実ログインや本番Firestore書込みは行っていない。
- 保存の再試行/競合/二重送信の原子性は実Emulatorで検証。画面fixtureの操作とEmulator検証は分けて実施した。
- 元フォルダーの5ファイル/AGENTS.md、専用worktreeのBefore JSONは作業前SHA256と一致。

## Known limits

既存Firestore Rulesは認証済クライアントの経済操作を許可する設計であり、改造クライアントの経済不正を完全には防止できない。今回の通常repository経路ではtransaction、baseline比較、ledgerで整合性を保護する。
バランスは固定装備・編成・policyによる代表条件。今回、敵や報酬を再強化する変更は行っていない。

## Full comparison

再現: node scripts/measureStatAllocationBalance.js (JSONを標準出力)。Before JSONは変更/commitしない。

| Lv | 配分 HP/MP | 回復役 | 対象 | Before 勝敗 / ターン / 残HP | After 勝敗 / ターン / 残HP | 残MP/最大MP | 主人公スキル使用数 |
|---|---|---|---|---|---|---|---|
| 1 | none 0/0 | なし | campaign-orc_chief | lost / 10 / 0 | lost / 6 / 0 | 0/8 | 4 |
| 1 | none 0/0 | なし | campaign-ancient_golem | lost / 7 / 0 | lost / 5 / 0 | 1/8 | 3 |
| 1 | none 0/0 | なし | tower-10 | lost / 11 / 0 | lost / 9 / 0 | 1/8 | 3 |
| 1 | none 0/0 | なし | tower-20 | lost / 4 / 0 | lost / 4 / 0 | 0/8 | 3 |
| 1 | none 0/0 | なし | tower-30 | lost / 4 / 0 | lost / 4 / 0 | 0/8 | 3 |
| 1 | none 0/0 | なし | tower-60 | lost / 3 / 0 | lost / 3 / 0 | 3/8 | 2 |
| 1 | none 0/0 | なし | weekly_ignis | lost / 6 / 0 | lost / 6 / 0 | 1/8 | 3 |
| 1 | none 0/0 | なし | weekly_leviathan | lost / 7 / 0 | lost / 6 / 0 | 1/8 | 3 |
| 1 | none 0/0 | なし | weekly_volt | lost / 6 / 0 | lost / 6 / 0 | 1/8 | 3 |
| 1 | none 0/0 | なし | weekly_gaia | lost / 7 / 0 | lost / 6 / 0 | 1/8 | 3 |
| 1 | none 0/0 | あり | tower-10 | won / 12 / 25 | lost / 14 / 0 | 1/8 | 3 |
| 1 | none 0/0 | あり | tower-20 | lost / 5 / 0 | lost / 5 / 0 | 0/8 | 3 |
| 1 | none 0/0 | あり | tower-30 | lost / 5 / 0 | lost / 5 / 0 | 1/8 | 3 |
| 1 | none 0/0 | あり | tower-60 | lost / 3 / 0 | lost / 3 / 0 | 3/8 | 2 |
| 1 | none 0/0 | あり | weekly_ignis | lost / 6 / 0 | lost / 6 / 0 | 1/8 | 3 |
| 1 | none 0/0 | あり | weekly_leviathan | lost / 7 / 0 | lost / 6 / 0 | 1/8 | 3 |
| 1 | none 0/0 | あり | weekly_volt | lost / 6 / 0 | lost / 6 / 0 | 1/8 | 3 |
| 1 | none 0/0 | あり | weekly_gaia | lost / 7 / 0 | lost / 6 / 0 | 1/8 | 3 |
| 7 | hp 6/0 | なし | campaign-orc_chief | won / 5 / 25 | won / 5 / 43 | 0/8 | 4 |
| 7 | hp 6/0 | なし | campaign-ancient_golem | won / 9 / 8 | won / 7 / 14 | 0/8 | 4 |
| 7 | hp 6/0 | なし | tower-10 | won / 3 / 146 | won / 3 / 164 | 2/8 | 3 |
| 7 | hp 6/0 | なし | tower-20 | won / 9 / 24 | won / 9 / 24 | 1/8 | 3 |
| 7 | hp 6/0 | なし | tower-30 | lost / 11 / 0 | won / 8 / 38 | 1/8 | 3 |
| 7 | hp 6/0 | なし | tower-60 | lost / 4 / 0 | lost / 4 / 0 | 0/8 | 3 |
| 7 | hp 6/0 | なし | weekly_ignis | lost / 11 / 0 | lost / 10 / 0 | 1/8 | 3 |
| 7 | hp 6/0 | なし | weekly_leviathan | lost / 10 / 0 | lost / 10 / 0 | 1/8 | 3 |
| 7 | hp 6/0 | なし | weekly_volt | lost / 10 / 0 | lost / 9 / 0 | 1/8 | 3 |
| 7 | hp 6/0 | なし | weekly_gaia | lost / 10 / 0 | lost / 10 / 0 | 1/8 | 3 |
| 7 | hp 6/0 | あり | tower-10 | won / 3 / 155 | won / 3 / 173 | 2/8 | 3 |
| 7 | hp 6/0 | あり | tower-20 | won / 10 / 48 | won / 10 / 64 | 1/8 | 3 |
| 7 | hp 6/0 | あり | tower-30 | won / 10 / 47 | won / 9 / 76 | 0/8 | 4 |
| 7 | hp 6/0 | あり | tower-60 | lost / 4 / 0 | lost / 4 / 0 | 0/8 | 4 |
| 7 | hp 6/0 | あり | weekly_ignis | lost / 14 / 0 | lost / 11 / 0 | 1/8 | 3 |
| 7 | hp 6/0 | あり | weekly_leviathan | lost / 14 / 0 | lost / 13 / 0 | 1/8 | 3 |
| 7 | hp 6/0 | あり | weekly_volt | lost / 12 / 0 | lost / 12 / 0 | 1/8 | 3 |
| 7 | hp 6/0 | あり | weekly_gaia | lost / 14 / 0 | lost / 13 / 0 | 1/8 | 3 |
| 7 | mp 0/6 | なし | campaign-orc_chief | won / 5 / 25 | won / 5 / 25 | 12/20 | 4 |
| 7 | mp 0/6 | なし | campaign-ancient_golem | won / 9 / 8 | won / 9 / 8 | 6/20 | 6 |
| 7 | mp 0/6 | なし | tower-10 | won / 3 / 146 | won / 3 / 146 | 14/20 | 3 |
| 7 | mp 0/6 | なし | tower-20 | won / 9 / 24 | won / 9 / 24 | 6/20 | 6 |
| 7 | mp 0/6 | なし | tower-30 | lost / 11 / 0 | lost / 11 / 0 | 6/20 | 6 |
| 7 | mp 0/6 | なし | tower-60 | lost / 4 / 0 | lost / 4 / 0 | 10/20 | 4 |
| 7 | mp 0/6 | なし | weekly_ignis | lost / 11 / 0 | lost / 11 / 0 | 4/20 | 7 |
| 7 | mp 0/6 | なし | weekly_leviathan | lost / 10 / 0 | lost / 10 / 0 | 4/20 | 7 |
| 7 | mp 0/6 | なし | weekly_volt | lost / 10 / 0 | lost / 10 / 0 | 4/20 | 7 |
| 7 | mp 0/6 | なし | weekly_gaia | lost / 10 / 0 | lost / 10 / 0 | 4/20 | 7 |
| 7 | mp 0/6 | あり | tower-10 | won / 3 / 155 | won / 3 / 155 | 14/20 | 3 |
| 7 | mp 0/6 | あり | tower-20 | won / 10 / 48 | won / 10 / 48 | 4/20 | 7 |
| 7 | mp 0/6 | あり | tower-30 | won / 10 / 47 | won / 10 / 47 | 0/20 | 9 |
| 7 | mp 0/6 | あり | tower-60 | lost / 4 / 0 | lost / 4 / 0 | 10/20 | 4 |
| 7 | mp 0/6 | あり | weekly_ignis | lost / 14 / 0 | lost / 14 / 0 | 2/20 | 8 |
| 7 | mp 0/6 | あり | weekly_leviathan | lost / 14 / 0 | lost / 14 / 0 | 2/20 | 8 |
| 7 | mp 0/6 | あり | weekly_volt | lost / 12 / 0 | lost / 12 / 0 | 6/20 | 6 |
| 7 | mp 0/6 | あり | weekly_gaia | lost / 14 / 0 | lost / 14 / 0 | 2/20 | 8 |
| 7 | balanced 3/3 | なし | campaign-orc_chief | won / 5 / 25 | won / 5 / 34 | 6/14 | 4 |
| 7 | balanced 3/3 | なし | campaign-ancient_golem | won / 9 / 8 | won / 9 / 23 | 0/14 | 6 |
| 7 | balanced 3/3 | なし | tower-10 | won / 3 / 146 | won / 3 / 155 | 8/14 | 3 |
| 7 | balanced 3/3 | なし | tower-20 | won / 9 / 24 | won / 9 / 36 | 0/14 | 6 |
| 7 | balanced 3/3 | なし | tower-30 | lost / 11 / 0 | won / 8 / 38 | 0/14 | 6 |
| 7 | balanced 3/3 | なし | tower-60 | lost / 4 / 0 | lost / 4 / 0 | 4/14 | 4 |
| 7 | balanced 3/3 | なし | weekly_ignis | lost / 11 / 0 | lost / 11 / 0 | 0/14 | 6 |
| 7 | balanced 3/3 | なし | weekly_leviathan | lost / 10 / 0 | lost / 10 / 0 | 0/14 | 6 |
| 7 | balanced 3/3 | なし | weekly_volt | lost / 10 / 0 | lost / 10 / 0 | 0/14 | 6 |
| 7 | balanced 3/3 | なし | weekly_gaia | lost / 10 / 0 | lost / 10 / 0 | 0/14 | 6 |
| 7 | balanced 3/3 | あり | tower-10 | won / 3 / 155 | won / 3 / 164 | 8/14 | 3 |
| 7 | balanced 3/3 | あり | tower-20 | won / 10 / 48 | won / 10 / 71 | 0/14 | 6 |
| 7 | balanced 3/3 | あり | tower-30 | won / 10 / 47 | won / 10 / 69 | 0/14 | 6 |
| 7 | balanced 3/3 | あり | tower-60 | lost / 4 / 0 | lost / 4 / 0 | 4/14 | 4 |
| 7 | balanced 3/3 | あり | weekly_ignis | lost / 14 / 0 | lost / 12 / 0 | 0/14 | 6 |
| 7 | balanced 3/3 | あり | weekly_leviathan | lost / 14 / 0 | lost / 13 / 0 | 0/14 | 6 |
| 7 | balanced 3/3 | あり | weekly_volt | lost / 12 / 0 | lost / 12 / 0 | 0/14 | 6 |
| 7 | balanced 3/3 | あり | weekly_gaia | lost / 14 / 0 | lost / 13 / 0 | 0/14 | 6 |
| 12 | hp 11/0 | なし | campaign-orc_chief | won / 3 / 38 | won / 3 / 71 | 2/8 | 3 |
| 12 | hp 11/0 | なし | campaign-ancient_golem | won / 6 / 29 | won / 5 / 51 | 0/8 | 4 |
| 12 | hp 11/0 | なし | tower-10 | won / 2 / 190 | won / 2 / 223 | 4/8 | 2 |
| 12 | hp 11/0 | なし | tower-20 | won / 5 / 143 | won / 5 / 176 | 1/8 | 3 |
| 12 | hp 11/0 | なし | tower-30 | won / 4 / 143 | won / 4 / 176 | 0/8 | 4 |
| 12 | hp 11/0 | なし | tower-60 | lost / 5 / 0 | lost / 4 / 0 | 0/8 | 4 |
| 12 | hp 11/0 | なし | weekly_ignis | won / 7 / 90 | won / 7 / 95 | 1/8 | 3 |
| 12 | hp 11/0 | なし | weekly_leviathan | won / 7 / 99 | won / 7 / 104 | 1/8 | 3 |
| 12 | hp 11/0 | なし | weekly_volt | won / 7 / 84 | won / 7 / 89 | 1/8 | 3 |
| 12 | hp 11/0 | なし | weekly_gaia | won / 8 / 84 | won / 8 / 89 | 1/8 | 3 |
| 12 | hp 11/0 | あり | tower-10 | won / 3 / 195 | won / 3 / 228 | 4/8 | 2 |
| 12 | hp 11/0 | あり | tower-20 | won / 6 / 142 | won / 6 / 155 | 0/8 | 4 |
| 12 | hp 11/0 | あり | tower-30 | won / 6 / 131 | won / 5 / 154 | 0/8 | 4 |
| 12 | hp 11/0 | あり | tower-60 | lost / 6 / 0 | lost / 6 / 0 | 1/8 | 3 |
| 12 | hp 11/0 | あり | weekly_ignis | won / 8 / 150 | won / 8 / 137 | 1/8 | 3 |
| 12 | hp 11/0 | あり | weekly_leviathan | won / 9 / 127 | won / 9 / 161 | 1/8 | 3 |
| 12 | hp 11/0 | あり | weekly_volt | won / 8 / 145 | won / 8 / 130 | 1/8 | 3 |
| 12 | hp 11/0 | あり | weekly_gaia | won / 9 / 127 | won / 9 / 161 | 1/8 | 3 |
| 12 | mp 0/11 | なし | campaign-orc_chief | won / 3 / 38 | won / 3 / 38 | 24/30 | 3 |
| 12 | mp 0/11 | なし | campaign-ancient_golem | won / 6 / 29 | won / 6 / 29 | 19/30 | 5 |
| 12 | mp 0/11 | なし | tower-10 | won / 2 / 190 | won / 2 / 190 | 26/30 | 2 |
| 12 | mp 0/11 | なし | tower-20 | won / 5 / 143 | won / 5 / 143 | 21/30 | 4 |
| 12 | mp 0/11 | なし | tower-30 | won / 4 / 143 | won / 4 / 143 | 22/30 | 4 |
| 12 | mp 0/11 | なし | tower-60 | lost / 5 / 0 | lost / 5 / 0 | 20/30 | 4 |
| 12 | mp 0/11 | なし | weekly_ignis | won / 7 / 90 | won / 7 / 90 | 16/30 | 6 |
| 12 | mp 0/11 | なし | weekly_leviathan | won / 7 / 99 | won / 7 / 99 | 16/30 | 6 |
| 12 | mp 0/11 | なし | weekly_volt | won / 7 / 84 | won / 7 / 84 | 16/30 | 6 |
| 12 | mp 0/11 | なし | weekly_gaia | won / 8 / 84 | won / 8 / 84 | 16/30 | 6 |
| 12 | mp 0/11 | あり | tower-10 | won / 3 / 195 | won / 3 / 195 | 26/30 | 2 |
| 12 | mp 0/11 | あり | tower-20 | won / 6 / 142 | won / 6 / 142 | 19/30 | 5 |
| 12 | mp 0/11 | あり | tower-30 | won / 6 / 131 | won / 6 / 131 | 19/30 | 5 |
| 12 | mp 0/11 | あり | tower-60 | lost / 6 / 0 | lost / 6 / 0 | 18/30 | 5 |
| 12 | mp 0/11 | あり | weekly_ignis | won / 8 / 150 | won / 8 / 150 | 16/30 | 6 |
| 12 | mp 0/11 | あり | weekly_leviathan | won / 9 / 127 | won / 9 / 127 | 16/30 | 6 |
| 12 | mp 0/11 | あり | weekly_volt | won / 8 / 145 | won / 8 / 145 | 16/30 | 6 |
| 12 | mp 0/11 | あり | weekly_gaia | won / 9 / 127 | won / 9 / 127 | 16/30 | 6 |
| 12 | balanced 6/5 | なし | campaign-orc_chief | won / 3 / 38 | won / 3 / 56 | 12/18 | 3 |
| 12 | balanced 6/5 | なし | campaign-ancient_golem | won / 6 / 29 | won / 5 / 36 | 10/18 | 4 |
| 12 | balanced 6/5 | なし | tower-10 | won / 2 / 190 | won / 2 / 208 | 14/18 | 2 |
| 12 | balanced 6/5 | なし | tower-20 | won / 5 / 143 | won / 5 / 161 | 9/18 | 4 |
| 12 | balanced 6/5 | なし | tower-30 | won / 4 / 143 | won / 4 / 161 | 10/18 | 4 |
| 12 | balanced 6/5 | なし | tower-60 | lost / 5 / 0 | lost / 6 / 0 | 8/18 | 4 |
| 12 | balanced 6/5 | なし | weekly_ignis | won / 7 / 90 | won / 7 / 108 | 4/18 | 6 |
| 12 | balanced 6/5 | なし | weekly_leviathan | won / 7 / 99 | won / 7 / 117 | 4/18 | 6 |
| 12 | balanced 6/5 | なし | weekly_volt | won / 7 / 84 | won / 7 / 102 | 4/18 | 6 |
| 12 | balanced 6/5 | なし | weekly_gaia | won / 8 / 84 | won / 8 / 102 | 4/18 | 6 |
| 12 | balanced 6/5 | あり | tower-10 | won / 3 / 195 | won / 3 / 213 | 14/18 | 2 |
| 12 | balanced 6/5 | あり | tower-20 | won / 6 / 142 | won / 6 / 160 | 7/18 | 5 |
| 12 | balanced 6/5 | あり | tower-30 | won / 6 / 131 | won / 6 / 156 | 7/18 | 5 |
| 12 | balanced 6/5 | あり | tower-60 | lost / 6 / 0 | lost / 6 / 0 | 6/18 | 5 |
| 12 | balanced 6/5 | あり | weekly_ignis | won / 8 / 150 | won / 8 / 147 | 4/18 | 6 |
| 12 | balanced 6/5 | あり | weekly_leviathan | won / 9 / 127 | won / 8 / 156 | 4/18 | 6 |
| 12 | balanced 6/5 | あり | weekly_volt | won / 8 / 145 | won / 8 / 171 | 4/18 | 6 |
| 12 | balanced 6/5 | あり | weekly_gaia | won / 9 / 127 | won / 9 / 126 | 4/18 | 6 |
| 20 | hp 19/0 | なし | campaign-orc_chief | won / 2 / 39 | won / 2 / 96 | 4/8 | 2 |
| 20 | hp 19/0 | なし | campaign-ancient_golem | won / 3 / 38 | won / 3 / 95 | 2/8 | 3 |
| 20 | hp 19/0 | なし | tower-10 | won / 2 / 244 | won / 2 / 301 | 6/8 | 1 |
| 20 | hp 19/0 | なし | tower-20 | won / 3 / 232 | won / 3 / 289 | 2/8 | 3 |
| 20 | hp 19/0 | なし | tower-30 | won / 3 / 238 | won / 3 / 295 | 2/8 | 3 |
| 20 | hp 19/0 | なし | tower-60 | won / 7 / 93 | won / 7 / 123 | 1/8 | 3 |
| 20 | hp 19/0 | なし | weekly_ignis | won / 4 / 206 | won / 4 / 263 | 0/8 | 4 |
| 20 | hp 19/0 | なし | weekly_leviathan | won / 4 / 210 | won / 4 / 267 | 0/8 | 4 |
| 20 | hp 19/0 | なし | weekly_volt | won / 4 / 203 | won / 4 / 260 | 0/8 | 4 |
| 20 | hp 19/0 | なし | weekly_gaia | won / 5 / 192 | won / 5 / 249 | 0/8 | 4 |
| 20 | hp 19/0 | あり | tower-10 | won / 2 / 252 | won / 2 / 309 | 4/8 | 2 |
| 20 | hp 19/0 | あり | tower-20 | won / 4 / 240 | won / 4 / 297 | 0/8 | 4 |
| 20 | hp 19/0 | あり | tower-30 | won / 4 / 246 | won / 4 / 303 | 0/8 | 4 |
| 20 | hp 19/0 | あり | tower-60 | won / 10 / 120 | won / 10 / 190 | 1/8 | 3 |
| 20 | hp 19/0 | あり | weekly_ignis | won / 5 / 196 | won / 5 / 253 | 0/8 | 4 |
| 20 | hp 19/0 | あり | weekly_leviathan | won / 5 / 202 | won / 5 / 259 | 0/8 | 4 |
| 20 | hp 19/0 | あり | weekly_volt | won / 5 / 192 | won / 5 / 249 | 0/8 | 4 |
| 20 | hp 19/0 | あり | weekly_gaia | won / 5 / 202 | won / 5 / 259 | 0/8 | 4 |
| 20 | mp 0/19 | なし | campaign-orc_chief | won / 2 / 39 | won / 2 / 39 | 42/46 | 2 |
| 20 | mp 0/19 | なし | campaign-ancient_golem | won / 3 / 38 | won / 3 / 38 | 40/46 | 3 |
| 20 | mp 0/19 | なし | tower-10 | won / 2 / 244 | won / 2 / 244 | 44/46 | 1 |
| 20 | mp 0/19 | なし | tower-20 | won / 3 / 232 | won / 3 / 232 | 40/46 | 3 |
| 20 | mp 0/19 | なし | tower-30 | won / 3 / 238 | won / 3 / 238 | 40/46 | 3 |
| 20 | mp 0/19 | なし | tower-60 | won / 7 / 93 | won / 7 / 93 | 32/46 | 6 |
| 20 | mp 0/19 | なし | weekly_ignis | won / 4 / 206 | won / 4 / 206 | 38/46 | 4 |
| 20 | mp 0/19 | なし | weekly_leviathan | won / 4 / 210 | won / 4 / 210 | 38/46 | 4 |
| 20 | mp 0/19 | なし | weekly_volt | won / 4 / 203 | won / 4 / 203 | 38/46 | 4 |
| 20 | mp 0/19 | なし | weekly_gaia | won / 5 / 192 | won / 5 / 192 | 38/46 | 4 |
| 20 | mp 0/19 | あり | tower-10 | won / 2 / 252 | won / 2 / 252 | 42/46 | 2 |
| 20 | mp 0/19 | あり | tower-20 | won / 4 / 240 | won / 4 / 240 | 38/46 | 4 |
| 20 | mp 0/19 | あり | tower-30 | won / 4 / 246 | won / 4 / 246 | 38/46 | 4 |
| 20 | mp 0/19 | あり | tower-60 | won / 10 / 120 | won / 10 / 120 | 28/46 | 8 |
| 20 | mp 0/19 | あり | weekly_ignis | won / 5 / 196 | won / 5 / 196 | 38/46 | 4 |
| 20 | mp 0/19 | あり | weekly_leviathan | won / 5 / 202 | won / 5 / 202 | 38/46 | 4 |
| 20 | mp 0/19 | あり | weekly_volt | won / 5 / 192 | won / 5 / 192 | 38/46 | 4 |
| 20 | mp 0/19 | あり | weekly_gaia | won / 5 / 202 | won / 5 / 202 | 38/46 | 4 |
| 20 | balanced 10/9 | なし | campaign-orc_chief | won / 2 / 39 | won / 2 / 69 | 22/26 | 2 |
| 20 | balanced 10/9 | なし | campaign-ancient_golem | won / 3 / 38 | won / 3 / 68 | 20/26 | 3 |
| 20 | balanced 10/9 | なし | tower-10 | won / 2 / 244 | won / 2 / 274 | 24/26 | 1 |
| 20 | balanced 10/9 | なし | tower-20 | won / 3 / 232 | won / 3 / 262 | 20/26 | 3 |
| 20 | balanced 10/9 | なし | tower-30 | won / 3 / 238 | won / 3 / 268 | 20/26 | 3 |
| 20 | balanced 10/9 | なし | tower-60 | won / 7 / 93 | won / 7 / 131 | 12/26 | 6 |
| 20 | balanced 10/9 | なし | weekly_ignis | won / 4 / 206 | won / 4 / 236 | 18/26 | 4 |
| 20 | balanced 10/9 | なし | weekly_leviathan | won / 4 / 210 | won / 4 / 240 | 18/26 | 4 |
| 20 | balanced 10/9 | なし | weekly_volt | won / 4 / 203 | won / 4 / 233 | 18/26 | 4 |
| 20 | balanced 10/9 | なし | weekly_gaia | won / 5 / 192 | won / 5 / 222 | 18/26 | 4 |
| 20 | balanced 10/9 | あり | tower-10 | won / 2 / 252 | won / 2 / 282 | 22/26 | 2 |
| 20 | balanced 10/9 | あり | tower-20 | won / 4 / 240 | won / 4 / 270 | 18/26 | 4 |
| 20 | balanced 10/9 | あり | tower-30 | won / 4 / 246 | won / 4 / 276 | 18/26 | 4 |
| 20 | balanced 10/9 | あり | tower-60 | won / 10 / 120 | won / 10 / 181 | 10/26 | 7 |
| 20 | balanced 10/9 | あり | weekly_ignis | won / 5 / 196 | won / 5 / 226 | 18/26 | 4 |
| 20 | balanced 10/9 | あり | weekly_leviathan | won / 5 / 202 | won / 5 / 232 | 18/26 | 4 |
| 20 | balanced 10/9 | あり | weekly_volt | won / 5 / 192 | won / 5 / 222 | 18/26 | 4 |
| 20 | balanced 10/9 | あり | weekly_gaia | won / 5 / 202 | won / 5 / 232 | 18/26 | 4 |
