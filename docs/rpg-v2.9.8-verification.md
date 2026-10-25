# v2.9.8 共通スキルパネル

中央無料＋24有料パネル（4系統×6、各系統にひみつ1）。中央から接続線で分岐し、取得状態・SP・条件・能力/技の前後比較を表示。ノード条件はpure selectorとrepositoryで共用。ひみつは指定2ノード取得まで効果・名称を隠す。

|ID|系統|必要SP|Lv|効果|接続/ひみつ条件|
|---|---|---:|---:|---|---|
|start|中央|0|1|||
|attack_1|攻撃|2|1|攻撃力＋1|start|
|attack_2|攻撃|3|3|属性攻撃威力＋5%|attack_1|
|attack_3|攻撃|4|5|攻撃力＋1|attack_2|
|attack_4|攻撃|4|5|MP攻撃技威力＋5%|attack_2|
|attack_5|攻撃|5|7|攻撃力＋2|attack_3|
|attack_6|攻撃|7|12|攻撃力＋2・属性攻撃威力＋5%|attack_4,attack_5 両方必須|
|defense_1|耐久|2|1|最大HP＋5|start|
|defense_2|耐久|3|3|防御力＋1|defense_1|
|defense_3|耐久|4|5|最大HP＋5|defense_2|
|defense_4|耐久|4|5|防御力＋1|defense_2|
|defense_5|耐久|5|7|最大HP＋10|defense_3|
|defense_6|耐久|7|12|最大HP＋10・防御力＋1|defense_4,defense_5 両方必須|
|magic_1|魔法|2|1|最大MP＋3|start|
|magic_2|魔法|3|3|MP攻撃技威力＋5%|magic_1|
|magic_3|魔法|4|5|最大MP＋3|magic_2|
|magic_4|魔法|4|5|消費MP－1|magic_2|
|magic_5|魔法|5|7|最大MP＋5|magic_3|
|magic_6|魔法|7|12|最大MP＋5・MP攻撃技威力＋5%|magic_4,magic_5 両方必須|
|support_1|支援|2|1|回復効果＋5%|start|
|support_2|支援|3|3|ガード軽減率＋5ポイント|support_1|
|support_3|支援|4|5|回復効果＋5%|support_2|
|support_4|支援|4|5|ガード軽減率＋5ポイント|support_2|
|support_5|支援|5|7|最大MP＋3|support_3|
|support_6|支援|7|12|回復効果＋5%・ガード軽減率＋5ポイント|support_4,support_5 両方必須|

## SPと保存

Lv上昇1につき2SP（Lv1=0、7=12、12=22、20=38）。Campaignのdistinct completedChapterIds（2体×2）、Tower最高到達階の10階区切り（最大6体×2）、Weekly totalClears/履歴（最大10回×1）から導出し合計80SPまで。重複履歴・同じTower BOSSの再試行で加算しない。既存条件達成者も同じ式で使用可能。既存HP/MPポイントとは独立。

保存はprofile.skillPanelのunlockedNodeIdsとrevisionのみ（残SP/能力の保存なし）。既存profile/進捗とactionLedgerを使うtransaction。入力は許可フィールドだけ受け取り、SP根拠は必ずFirestoreから読む。revision/職業/二重取得/未接続/不明ID/SP不足/戦闘中を拒否。

振り直し1,000GはGOLD・全ノード初期化・ledgerを同一transactionに保存。HP/MP基礎配分、EXP、装備、職業、進捗は保持。報酬訂正保留中のGOLD消費は既存の整合性チェックで禁止。新collection/常時listener/移行なし。

効果は職業倍率・装備・基礎配分の後に主人公へ加算。HP+40/MP+20/攻撃+8/防御+6、属性/MP技の合計威力補正25%、回復60%、ガード80%、MP消費最低1を上限/下限としてpure helperに集約。新Campaign/Tower/Weeklyに効果・revision・ID・確定能力/スキルコストをsnapshot保存。仲間は対象外。旧Battleを再構築しない。

## Balance

Lv7/12/20×6職業×未取得/序盤/攻撃/耐久/魔法/バランス×13対象=1,404比較。SP・レベル・接続条件内で取得する。全ケース終了、全職業がLv20の適切な育成で主要BOSSを攻略。Weeklyの1ラウンド全滅撃破なし。

|職業|未取得勝利(各育成比較の基準)|取得後勝利|Weekly 1ラウンド撃破|
|---|---:|---:|---:|
|adventurer|222|222|0|
|warrior|222|222|0|
|knight|216|221|0|
|mage|222|222|0|
|priest|222|222|0|
|thief|216|220|0|

詳細JSONにはv2.9.7調整のLv/職業別の平均ターン・残HP・残MP・被ダメージ・使用スキル数も補足収録。確率ではなく固定戦術による測定。敵はv2.9.7の値を維持。

## Verification

- 対象32 PASS、全体1,208 PASS (98 files)、新規起動demo Firestore Emulator47 PASS、Rules変更なし。実transactionで二重解放/同一actionId/別端末/偽SP入力/再配分二重課金/不足GOLD/保留/戦闘開始競合/失敗再試行を確認。本番書込なし。
- lint/build/diff-check PASS。320/375/1440px、接続線28本、56px以上の操作領域、内側スクロールでページ横はみ出しなし。隣接解放→ひみつ公開/取得、Tab/Enter、失敗未消費→再試行、reload復元、1,000G振り直し、基礎配分維持、戦闘中禁止、新Tower MP12→15、UID切替を確認。画面fixtureはFirestore未接続、実永続化はEmulatorで別確認。
- JS+CSS 1530004 bytes / gzip 441938。前版比 +16776 / gzip +5169。既存500kB超警告あり。
- 認証済みクライアント書込を許可する既存Rulesには改造クライアント対策の限界が残る。元v2.10.0の5ファイル/AGENTS.md、既存未追跡Before JSONは保護。
