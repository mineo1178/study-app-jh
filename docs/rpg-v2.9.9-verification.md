# v2.9.9 職業別スキルパネル

v2.9.8 (88050372fd291f468ae9ab6001121997d256fb4d) に各職業5枚・計30枚を追加。共通24枚＋専用30枚＋無料中央=55ノード。共通/職業別表示を切り替え、現在職業の専用ノードだけを表示。接続線・ひみつ公開・前後の能力/MP/技威力を表示する独自マップ。

## 職業別の内容

|職業|ID|SP|Lv|効果|前提|
|---|---|---:|---:|---|---|
|冒険者|job_adventurer_1|2|1|攻撃力＋1|start|
|冒険者|job_adventurer_2|3|3|最大MP＋2|job_adventurer_1|
|冒険者|job_adventurer_3|4|5|最大HP＋5|job_adventurer_1|
|冒険者|job_adventurer_4|4|7|回復効果＋5%|job_adventurer_2|
|冒険者|job_adventurer_5|6|12|攻撃力＋1・ガード軽減率＋5ポイント|job_adventurer_3,job_adventurer_4 両方必須|
|戦士|job_warrior_1|2|1|攻撃力＋1|start|
|戦士|job_warrior_2|3|3|炎斬り威力＋10%|job_warrior_1|
|戦士|job_warrior_3|4|5|最大HP＋5|job_warrior_1|
|戦士|job_warrior_4|4|7|攻撃力＋2|job_warrior_2|
|戦士|job_warrior_5|6|12|攻撃力＋2・炎斬り威力＋5%|job_warrior_3,job_warrior_4 両方必須|
|騎士|job_knight_1|2|1|最大HP＋5|start|
|騎士|job_knight_2|3|3|防御力＋1|job_knight_1|
|騎士|job_knight_3|4|5|ガード軽減率＋5ポイント|job_knight_1|
|騎士|job_knight_4|4|7|最大HP＋5|job_knight_2|
|騎士|job_knight_5|6|12|防御力＋1・ガード軽減率＋5ポイント|job_knight_3,job_knight_4 両方必須|
|魔法使い|job_mage_1|2|1|最大MP＋3|start|
|魔法使い|job_mage_2|3|3|属性攻撃威力＋5%|job_mage_1|
|魔法使い|job_mage_3|4|5|MP攻撃技威力＋5%|job_mage_1|
|魔法使い|job_mage_4|4|7|最大MP＋3|job_mage_2|
|魔法使い|job_mage_5|6|12|属性攻撃威力＋5%・水刃威力＋5%|job_mage_3,job_mage_4 両方必須|
|僧侶|job_priest_1|2|1|回復効果＋5%|start|
|僧侶|job_priest_2|3|3|最大MP＋3|job_priest_1|
|僧侶|job_priest_3|4|5|ガード軽減率＋5ポイント|job_priest_1|
|僧侶|job_priest_4|4|7|消費MP－1|job_priest_2|
|僧侶|job_priest_5|6|12|回復効果＋5%・最大HP＋5|job_priest_3,job_priest_4 両方必須|
|盗賊|job_thief_1|2|1|攻撃力＋1|start|
|盗賊|job_thief_2|3|3|雷撃威力＋10%|job_thief_1|
|盗賊|job_thief_3|4|5|最大MP＋2|job_thief_1|
|盗賊|job_thief_4|4|7|攻撃力＋1|job_thief_2|
|盗賊|job_thief_5|6|12|雷撃威力＋5%・攻撃力＋1|job_thief_3,job_thief_4 両方必須|

各職業の合計19SP。最終パネルは指定2パネルの両方取得とLv12が必要。冒険者はバランス、戦士は攻撃/炎斬り、騎士はHP/防御/ガード、魔法使いはMP/属性技、僧侶は回復/MP効率/防御支援、盗賊は攻撃/雷撃の技巧を強化。既存スキルの確定パラメータに反映する。

## SP・転職・保存の整合性

- 獲得式はv2.9.8を維持: レベル上昇ごと2、Campaign初回BOSS各2 (最大4)、Tower最高到達階の10階区切り各2 (最大12)、Weekly各1 (最大10)、全体80SP上限。基礎HP/MPポイントと独立。
- すべての職業と共通で1つのunlockedNodeIds/revisionを共有。非アクティブ職業の取得も使用SPに含む。転職で返却/増殖せず、戻ると取得済み効果が復活する。既存の無料転職transactionは変更なし。
- 解放はFirestoreの最新profile/進捗から計算。現在職業/期待revision/期待jobIdを検証する既存actionLedger transaction。転職と購入の競合を再試行・拒否できる。新collection/常時listenerなし。振り直し1,000Gは共通/全職業の取得を同時リセットし、基礎配分を維持する。
- 新Battleにpanel rules 2、取得ID/revision/有効効果、確定能力/スキルMP/威力を保存。現在職業の専用効果のみ加算し、仲間へ適用しない。進行中の旧Battleを更新しない。v2.9.8の3モードsnapshotを保存して再開/実transaction回帰確認。
- 威力補正は属性＋MP技＋指定技を加算して25%まで、最後にfloor。HP/MP等のflat bonusは職業/装備/基礎配分の後に加算。共有上限: HP40/MP20/攻撃8/防御6、回復効果25%（最終回復60%）、ガード加算20pt（最終80%）、MP軽減1（消費最低1）。上限超過分は増加しない。
- 専用技の実ダメージ・MP・snapshot・actionLedgerの一致と同一actionId二重処理防止を6職業の実transactionで確認。敵、学習タイマー/validation、毎分100G、過去rewardLedger、素材/ショップ/ガチャ、HP/MP配分、無料転職へ追加変更なし。

## Battle比較

Lv7/12/20、6職業、未取得/序盤/攻撃/耐久/魔法/バランスの6育成、通常敵3・Campaign BOSS2・Tower10/20/30/60・Weekly4の13対象、計1404比較。HP/MPは代表的なバランス配分、装備は既存代表構成、仲間は守護戦士＋僧侶。SPと接続/レベル条件の範囲で共通/専用を取得する。

|職業|未取得基準の勝利|共通＋専用育成の勝利|Weekly1ラウンド撃破|
|---|---:|---:|---:|
|冒険者|222|222|0|
|戦士|222|222|0|
|騎士|216|221|0|
|魔法使い|222|222|0|
|僧侶|222|222|0|
|盗賊|216|224|0|

各職業234比較。全職業が適切なLv20育成で全主要BOSSを攻略可能。無限戦闘・Weekly1ラウンド撃破なし。決定的な戦術測定で、確率的勝率ではない。JSONに育成別のターン/残HP/残MP/被ダメージ/使用スキル数も収録。敵はv2.9.7から追加変更なし。

## Verification

- 主な対象テスト52 PASS (共通32＋職業20)、全体1228 PASS (100 files)。
- 新規起動のdemo Firestore Emulator57 PASS。6職業の購入、別端末での保持、無料転職と効果復元、転職/購入競合、専用技の確定ダメージ/MP/ledger、同一actionId、旧共通パネルBattle3モード等を含む。Rules変更なし、本番書込なし。
- lint/build/git diff --check PASS。320/375/1440pxで6職業・計18ケース。320pxでは専用5枚＋共通1枚を全職業で解放、375/1440pxでは各職業の表示・専用root/共通取得を確認。ページ横はみ出しなし。
- UIで転職後もSP/取得保持、元職業への復帰・reload、共通＋専用振り直し3000→2000G、全SP返却、Tab/Enter、戦闘中の解放/転職拒否、UID切替を確認。新Towerの雷撃145%→159%とMP12→10も確認。画面fixtureはFirestore未接続で、実永続化/競合はEmulatorで別検証。
- JS+CSS 1533105 bytes / gzip 442797。v2.9.8比 +3101 / gzip +859。v2.9.6基準比 +19910 / gzip +6063。既存500kB超bundle警告は継続。

## 保護と既知の制約

既存Firestore Rulesは同一家族の認証済みクライアントの書込を許可するため、改造クライアント対策には限界がある。今回は既存transaction設計内の整合性を保証し、新しいRulesの厳格化は行っていない。元C:/dev/study-app-jhの未公開v2.10.0変更5ファイルとAGENTS.md、未追跡Before JSONは保護。元フォルダーの同期/統合は行わない。v2.9.9完了後に停止する。
