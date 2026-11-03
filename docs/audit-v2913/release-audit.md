# v2.9.13 公開前最終監査（2026-11-03）

結論: **本番公開推奨 NO**。今回の調査は完了。ただし認証後E2E未実施とIssue #4の実装不具合が残るため、v2.9.13全体完了はNO。

対象: PR #5 / integration/gui-rpg-v2913 / `7649834c9e3c27f5eba07302bb30de2c30b73216`。mainは`1ef9b8e01b85ebd0f90602caa9e6eb5445a2311b`。専用監査worktree `C:/dev/study-app-jh-release-audit`、branch `codex/v2913-release-audit`。

## 検証結果

|検証|判定|根拠・制限|
|---|---|---|
|統合HEADのGitHub CI|PASS|[GUI検証](https://github.com/mineo1178/study-app-jh/actions/runs/41555943915)、[測定検証](https://github.com/mineo1178/study-app-jh/actions/runs/41555944170)成功。Rulesは初回70/71失敗後の再実行71/71であり、安定性PASSとは別。PR #3限定workflowのskipも全チェック実行とは数えない。|
|原テスト単独20回|FAIL|各回v1/v2の2件を選択、合計40件中1件失敗。20実行中1失敗(5%)。対象外69件skipは意図したfilter。|
|原Rules71件を連続20回|FAIL|1,420件中4件失敗。20実行中4失敗(20%)。各回新しいVitest process、同一の専用Emulator。|
|テスト順変更5回|FAIL|seed1701〜1705。355件中3件失敗、5実行中3失敗。全71件をshuffle。|
|実SDKの順序制御診断4ケース|PASS|v1/v2各2ケース。read順序による誤エラーとcommit後の正しいSDK再試行を再現。|
|認証前ログイン画面|PASS|統合Previewのメール/パスワード/LOGIN/サンプル表示を確認。ログイン成功は未実施。|
|PreviewのPC/モバイル表示|PASS（サンプル限定）|PC viewport1230/scrollWidth1215、スマホ表示375×812/scrollWidth360。横はみ出しなし。画像を同ディレクトリへ保存。実端末Safariは未実施。|
|サンプルSTART/PAUSE/再開|PASS（サンプル限定）|START→PAUSE→START→PAUSE、累計3秒の表示を確認。永続studySessionsの検証ではない。|
|サンプルSTOP|FAIL / 要切り分け|「保存に失敗しました」alertを観測。その後の同一タブの自動操作はダイアログで中断。native promptを含む経路のため、自動化制約かアプリ側か未確定。修正せず、成功扱いしない。|
|Firebase認証・認証後画面・実タイマー/履歴/報酬E2E|未実施|VercelでFirebase環境変数がProduction and Preview共用と確認。非本番の認証先・資格情報を確保できず、本番実データ禁止のためログインしない。|
|PreviewでのRPG遷移/戦闘/塔進行|未実施|サンプルモードはRPGナビゲーションを非表示にする既存仕様。認証後操作をサンプルで代替PASSにしない。|
|旧snapshot互換性|PASS（自動テスト範囲）/ 実データE2E未実施|統合CIの既存互換fixture・Rulesにより確認。本番データは使用せず、実アカウント再開は未実施。|
|統合差分|PASS|39変更ファイル。GUI/RPG元由来37ファイルのblob一致、AppはGUI版のversionだけv2.9.13にした内容と一致。integration-diff.json参照。|
|禁止領域|PASS|報酬訂正・報酬台帳・activeTimerRepository・firestore.rulesはmainとblob一致。監査によるsrc/Rules変更なし。|
|監査コードlint / tracked diff-check|PASS|npm run lint、git diff --check成功。監査データ・スクリプトのみ未commit。|

## Issue #4: 原因と影響

失敗8件はすべて `retryPendingRewardCorrection` の `rewardCorrectionRepository.js:238`、`PENDING_CORRECTION_INVALID`。v1で3件、v2で5件。全Rulesの他のテストで失敗はなく、単独でも発生するため、他テストの共有fixtureや実行順だけでは説明できない。上記率は当該Emulator・実行回数での観測値であり、実ユーザーでの発生確率ではない。

### 確認した競合順序

1. Aがsession/ledger/profile/integrityを読み、ledgerのrevision=1、correctionStatus=reversal_pending、pendingCorrection.adjustmentId=`audit-session-revision-1`を取得。
2. Aが調整documentを読む前にBが同一pending correctionの回収をtransactionで確定。profile減算、ledger applied/pending=null、adjustment applied、integrity pending除去を原子的に保存。
3. Aの後続readは新しいadjustment appliedを返す。Aは古いpending ledgerと新しいadjustmentを組み合わせ、commit前に通常のError(PENDING_CORRECTION_INVALID)を投げる。
4. SDKは通常Errorを再試行しないためAはcallback1回で失敗。対照として、Aの両read後にBを確定させると、Aのcommitが競合検出され、callbackが2回以上呼ばれ、NO_PENDING_CORRECTIONで正常終了する。

`transaction-trace-confirmed.jsonl`にread/write/確定/例外のseqと時刻、attempt回数・revision・IDを記録。`causal-sequences.json`が該当順序と失敗後snapshotを抽出する。両reward policyで順序制御による再現に成功し、特定SDKエラーをモックして投げる方法は使っていない。実SDK・実Emulatorのread/commitを使用し、待ち合わせとログだけをtest-only wrapperで追加した。

補足: 同じwrapperで原テストを自然実行した追加20回は40件すべて成功。ログの挿入が競合タイミングを変えるため、これを問題解消と解釈しない。未変更原テストの失敗率と、順序制御の原因証明を分離する。

### revision / pending ID / actionId / データ影響

revisionは訂正時に1へ進み、回収retryでは増加しない。調整IDはsession ID＋revisionで生成され、pending IDと同じ。訂正のcorrectionId/lastCorrectionIdが同一依頼の識別子。retryPendingRewardCorrectionには独立したactionId引数/新規action ledgerは存在せず、RPGのactionId処理とは別経路。今回の原因はIDの重複生成やrevision競合の上書きではない。

順序制御4ケースの決着後は、元報酬60×rate、effective報酬20×rate、回収40×rateが一度だけ適用。補充した40×rateの残高は0、revision1、pending=null、adjustment applied、pending session一覧は空、学習記録は訂正後1200秒。追加retryはNO_PENDING_CORRECTIONで残高不変。`diagnostic-final-states.jsonl`に保存。

この範囲では二重付与・重複減算・永続台帳破損を観測しなかった。ただし全ケースの無欠陥を保証するものではない。実装由来のユーザー可視な誤エラーであり、「テストだけの不安定性」とは判定しない。通常の学習付与やタイマー本体を変更していない既存不具合で、GUI/RPG統合で新規導入されたものでもない。

### 最小変更案（未実装・別PR対象）

adjustment不一致を直ちにPENDING_CORRECTION_INVALIDにする前に、同じtransactionでledgerReferenceを再読込する。並行確定でledgerのread versionが変わっていればSDKのABORTED判定を通じてtransaction全体を再試行させる。台帳versionが変わっていない真の不整合では現在のPENDING_CORRECTION_INVALIDを維持し、appliedを無条件に成功扱いして隠さない。

```js
if (!adjustmentSnap.exists() || adjustmentSnap.data().status !== 'pending') {
  await transaction.get(ledgerReference); // changed version => SDK ABORTED/retry
  throw correctionFailure('PENDING_CORRECTION_INVALID');
}
```

インストール済みSDKのrecordVersion（同一documentの異なるversionをABORTEDにする）とTransactionRunner（FirebaseErrorのみを選別してretry、通常Errorはreject）を確認した。これは案であり実装・修正済みの主張ではない。別のIssue #4修正PRで、今回の順序制御に加え真の不整合維持・連続多重retry・元テストの反復を回帰条件にして検証する。PR #5には混入させない。

## リリースゲート・ロールバック

Vercel Production設定をUIで読取確認。Production Branch=main、Every commit pushed to main will create a Production Deployment、Auto-Assign Custom Production Domains=ON。したがってmainマージは自動で本番公開へ進む。設定は一切変更していない。

現行Productionはcommit `1ef9b8e`、deployment `8wRAhb6rtxAWCK3tnu6JbJXcJrR8`、固有URL `study-app-d9y7zbzc0-mineojan1178s-projects.vercel.app`、Ready。Productionドメイン `study-app-jh-mauve.vercel.app`。統合Preview `EYAXmnWfVumACB6Bs78832VGiauj` は別deploymentでReady。

承認後のリリース直前に現行Production IDを再確認・保全し、異常時はプロジェクトOverviewのInstant Rollbackから直前Production（現在確認したv2.9.11）へ戻す。Hobbyでは直前deploymentのみが対象になる点に注意。[Vercel公式手順](https://vercel.com/docs/instant-rollback)。今回はボタンを実行せず、ロールバック訓練は未実施。Git側を戻す場合も、mainへのrevert pushは新たな本番デプロイになるため別の明示承認が必要。

フロントエンドのrollbackはFirestoreデータを巻き戻さない。新規戦闘snapshot・台帳を削除/再生成しない。Issue #4は現在のmainにも存在し、v2.9.11へのrollbackで修正される問題ではない。

阻害要因: Issue #4修正/リスク受容が未承認、認証後の安全な統合E2Eが未実施、サンプルSTOPの観測失敗が未切り分け。公開前に非本番Firebaseの専用Previewと合成テストアカウントを用意し、タイマー・履歴/報酬・RPG/塔・既存snapshotの認証後E2Eを実施する必要がある。

## 状態

- 作業branch: codex/v2913-release-audit。HEADは基準7649834。監査のみの未commit成果物を保存。
- 新規commit / push / PR作成なし。ユーザーの監査依頼には新規commit/pushの明示指示がないため実施していない。
- PR #5: Draft・未merge、元ブランチとmainを未変更。Vercel Production公開なし。
- 今回の調査完了: YES（上記制約による未実施項目を明示）。
- v2.9.13全体完了: NO。
- 本番公開推奨: NO。

## 再現と証跡

- 原テスト反復: `node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --project demo-study-app-jh --config firebase.audit.json --only firestore "node scripts/audit/repeatRules.js"`
- 順序制御: AUDIT_TRACE_PATHを未使用の保存先にして、firebase.audit-trace.jsonの8086ポートで `vitest run test/firestore/audit/rewardCorrection.audit.test.js --config test/firestore/audit/trace.config.mjs`。
- 原試験ログ・全JSON: logs/、反復集計: repeat-summary.json。失敗ログはisolated-18、full-7/8/11/12、shuffle-1701/1702/1703。
- 全てdemo-study-app-jhのEmulatorと合成データのみ。baseline8085と診断8086は別process/別port。元71件と実装は未変更。Emulatorプロセスは終了済み。
- PC証跡: preview-pc.png、mobile証跡: preview-mobile.png、Production設定証跡: vercel-production-settings.png。

最終ローカル確認: 全Vitest104ファイル・1,470件PASS、npm run lint / npm run build / git diff --check PASS。buildは既存500kB超chunk警告のみ。PR #5のHEAD7649834・Draft・未merge、main1ef9b8eを最終再確認。新規commit/push/PRなし。

## 監査資料の確定（追加依頼）

上記「新規commit/pushなし」は監査終了時点の記録。今回の明示依頼に従って専用監査ブランチへ成果物をcommit/pushする。アプリ・PR #5・mainは未変更。既存gitignoreで除外されるlogsディレクトリの全実行ログ/JSON/JSONLはrun-evidence.json.gzへ格納し、manifestでSHA256を保持する。
