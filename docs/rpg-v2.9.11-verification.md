# v2.9.11 仲間個別育成

基準main: 13f974c113bb68b4a72a54ac2ecc929871b1faaf。専用worktree: C:/dev/study-app-jh-rpg-upgrade、branch: codex/rpg-upgrade。

## 育成仕様

解放済みの仲間15人が対象。主人公は対象外。能力ポイントとSPは各仲間が独立してmin(20, プレイヤーLv−1)を持つ。レベルはtotalExpから導出し、保存済みlevelや呼び出し元の残高を信用しない。Lv20は19pt・19SP、Lv21以降20pt・20SP。既存仲間も現在レベル分を使える。仲間EXP・モンスター捕獲は追加しない。

HPは1pt=+3、MPは1pt=+2、攻撃/防御は1pt=+1。項目上限はHP/MP各12、攻撃/防御各6、合計は獲得pt以内。主人公のポイント・54パネル・80SPとは独立。

各人6パネル。生命の根(2SP, HP+6)、魔力の根(2SP, MP+2)が入口。攻撃の枝(3SP, 攻撃+1・技威力+5%)は魔力の根から、守りの枝(3SP, 防御+1・ガード軽減+3pt)は生命の根から接続。得意分野(4SP)はどちらかの枝から、固有パネル(5SP)は得意分野から接続。全取得19SP。取得配列の順序に依存せず到達性を検証する。

|仲間|得意分野パネル|固有パネル|
|---|---|---|
|守護戦士 (guardian)|HP +9・防御 +1|鉄壁の守り：防御 +2・ガード軽減pt +12|
|魔導士 (mage)|MP +4|広域炎魔法：技威力% +18・MP +2|
|僧侶 (healer)|MP +2・HP +6|祈りの回復：回復率pt +12|
|アカネ (akane)|攻撃 +2|鋭い炎斬り：技威力% +20|
|ミナト (minato)|MP +4|省魔力の癒し：消費MP軽減 +1・回復率pt +3|
|ライカ (raika)|MP +4|省魔力の雷雲：技を雷属性にする・消費MP軽減 +1・技威力% +5|
|ガク (gaku)|HP +12|大地の体力：HP +12・ガード軽減pt +5|
|カエデ (kaede)|MP +4|持続する炎：消費MP軽減 +1・技威力% +10|
|セリア (seria)|HP +9|みんなへの祝福：回復率pt +8・HP +6|
|レオン (leon)|攻撃 +2|轟く雷撃：技を雷属性にする・技威力% +20|
|ノア (noa)|防御 +2|静かな結界：ガード軽減pt +15|
|ホムラ (homura)|攻撃 +1・HP +6|猛火の剣：技威力% +15・攻撃 +1|
|シズク (shizuku)|MP +4|尽きぬ泉：回復率pt +5・MP +4|
|ライデン (raiden)|MP +2・攻撃 +1|雷帝の魔力：技を雷属性にする・技威力% +12・MP +4|
|テラ (terra)|HP +6・防御 +1|大地の要塞：防御 +2・ガード軽減pt +8|

技威力の補正上限25%、回復率上限60%、ガード軽減上限80%、消費MPは最低1。雷仲間の技属性変更は固有パネル取得時のみ。既存の役割・属性表示・レアリティ・倍率・スキルID・対象範囲を保持。

## 保存・互換性

playerProfile.companionGrowth[memberId]へallocation / unlockedNodeIds / revisionを保存し、残pt/SPや能力合計は導出する。未保存の旧profileは未育成。null、不明ID、不正配分、重複/未接続/予算超過パネルは拒否し、破損値を初期化しない。パーティー画面と戦闘準備画面はエラー表示で止める。

Firestore transactionでprofile・rpgActionLedger・rewardIntegrityを読み、正規memberId、仲間解放、能力上限、SP、パネル接続、revision、戦闘中でないことを再検証。対象仲間のmapだけをmergeし、他の仲間を保持。actionId ledgerで冪等化。同じ仲間への異なるactionId競合は片方をrevision不一致で拒否。異なる仲間への競合は再試行後に両方を保存。共有Gの不足も再検証。

1人100G(学習100G/分の1分相当)で能力配分とパネルを同時reset。能力配分を減らす再配分も100G、追加配分/パネル購入はG無料。パネル削除はresetのみ。残高不足・報酬訂正保留中の有料操作は拒否する。

buildTowerPartySnapshotへcompanionGrowthRulesVersion=1を明示する新規Tower/Weeklyと準備画面へ接続。memberId、育成前基礎能力、育成後HP/MP/攻撃/防御、最終スキル効果/MP、ルールversion、配分/パネル/revisionを戦闘snapshotへ固定する。戦闘エンジンの再開処理は変更なし。旧Tower rules2〜5、Weekly、Campaign互換テストを維持。主人公育成・Campaign単独戦・敵能力・報酬・Energyは変更しない。

## Before/After

scripts/measureCompanionBalance.jsで再現。全結果はdocs/rpg-v2.9.11-balance.json。既存v2.9.10レポートの540基準条件と結果全項目が一致することを測定時にassertする。

15人×Lv7/12/20×6職業×5育成型×9対象(塔20/40/60/80/100階、Weekly4種)=12,150比較。対象仲間だけを育成し、同伴は未育成guardian(guardian自身はhealer同伴)。主人公は既存バランスパネル。未育成、HP防御、攻撃、MPスキル、バランス型についてBefore戦術/After戦術/After通常攻撃を記録する。

別にv2.9.10の代表36条件(6職業×主人公パネル3型×守護/既存代表2編成)で同行2人をともに育成。3レベル×5階×5育成型の2,700比較。装備・主人公HP/MP均等配分・パネル条件はv2.9.10と同一。合計29,970回の決定的戦闘計算。確率的勝率ではない。全戦闘300行動以内に終了。

Lv20・代表36条件の勝利数:

|階|未育成Before|HP防御|攻撃|MPスキル|バランス|
|---:|---:|---:|---:|---:|---:|
|20|36/36|36/36|36/36|36/36|36/36|
|40|36/36|36/36|36/36|36/36|36/36|
|60|36/36|36/36|36/36|36/36|36/36|
|80|3/36|31/36|31/36|34/36|35/36|
|100|0/36|0/36|0/36|0/36|0/36|

Lv12・60階は2/36→HP防御28/36、攻撃28/36、MP12/36、バランス20/36。80/100階は0/36のまま。Lv7は全育成型で20階36/36、40階以降0/36。

15人を一人ずつ育成したLv20・80階90条件は、未育成0/90→バランス戦術27/90勝、同じ育成で通常攻撃だけでは0/90勝。育成と戦術の双方が必要。Lv7のWeekly4種はバランス戦術90/90勝、通常攻撃はイグニス48/90・リヴァイア35/90・ヴォルト43/90・ガイア18/90。Lv12/20のWeeklyは育成前から90/90勝で勝利数不変。残HP/行動数/技使用数等はJSON参照。今回の全条件で100階未突破。より高Lvや別戦術は未評価。

## 検証

- npm test: 103ファイル・1,349件PASS。既存1,276件を維持し73件追加、削除/skipなし。
- 関連テスト: 15人の独立性、EXP予算、項目上限、SP接続、不正値、revision、再配分コスト、旧profile、snapshot不変性、15人の育成技の正のMP消費。画面SSRで未解放/破損/戦闘ロック/Campaign非干渉を確認。
- npm run test:rules: 新規demo Firestore Emulatorで71件PASS(既存61＋追加10)。同一/別仲間競合、二重送信、reset一度だけ課金、共有G競合、破損/未解放/上限/接続/revision拒否、未認証拒否、訂正保留、Tower/Weekly開始競合を実transactionで検証。既存Emulatorへの代替接続なし。Rulesファイル変更なし。本番Firestoreアクセスなし。
- npm run lint / npm run build / git diff --check: PASS。既存500kB超chunk警告のみ。
- JS bundle(minify後・非gzip・全JS合計): 1,468,388→1,484,818 bytes、+16,430 bytes(+1.12%)。初期distのv2.9.10合計と最終buildを比較。生成distはcommit対象外。

## 実画面

test/manual/rpg-companions.htmlをin-app実ブラウザーで確認。React実コンポーネントとpure保存/戦闘helperを使う専用fixture。Firestore・本番アカウント未接続。冪等性/競合はEmulatorで別検証。

320/375/1440pxでdocument.scrollWidthは305/360/1425px(スクロールバー分を除く)。横はみ出しなし。タップ相当クリック、TabでHP→MP加算へ移動、Enterで確認/保存、画面と保存確認へのフォーカス移動を確認。守護戦士HP1pt＋生命パネルで101→110。MP未保存値を残して魔導士へ切替後に混在せず、戻ると保存値だけを表示。100Gresetで配分/パネルを戻し、戦闘ロック時の育成禁止も確認。

1440pxでライカ4パネル＋MP1ptによりMP12→20、攻撃16→17、技威力90→99%、雷属性化、MP消費4→3。編成後、新規Weekly準備/戦闘へ反映し、実技使用でMP20→17。320pxで守護戦士HP110が新規Tower80階の準備/実戦へ反映されることを確認。

## 変更と保護

主要変更: companionGrowthCatalog/Selectors、rpgCompanionGrowthRepository、CompanionGrowthPanel、partyMemberCatalog、playerProfile、battlePreparation、rpgBattleRepository、PartyPanel、RpgHub、BattleStartConfirmModal、App(接続とversionのみ)。関連テスト、画面fixture、測定script/JSON、本報告を追加/更新。

元C:/dev/study-app-jhの未公開v2.10.0の5ファイルとAGENTS.md、専用worktreeの未追跡Before JSONの計7ファイルは開始/最終SHA256一致。元フォルダーへの編集/pull/merge/rebaseは行わない。Before JSONは変更/削除/stageしない。reset --hard/clean/stash/force pushなし。

v2.9.12・v2.9.13・未公開v2.10.0には着手せずv2.9.11で停止する。
