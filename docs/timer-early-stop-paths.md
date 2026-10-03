# v1.98.1 タイマー早期停止調査・診断手順

## 結論

通常の共通時計では、開始30秒・1分・4:59・5:01や4分のbackgroundだけで
タイマーを終了する経路はない。実機報告の直接原因は未特定。
今回は診断のみを追加し、missing snapshotの扱い・終了条件・報酬条件を変更しない。

別端末の時計が15分進んでいる場合、開始30秒後でも `isStaleActiveTimer`
がtrueになり、その端末の自動処理でinvalid記録の作成とタイマー削除が可能。
この経路はtransactionテストで再現済みだが、実機報告との一致は未確認。
時計補正やstale判定の緩和は追加していない。

## A〜Fと終了・消失の全経路

| 分類・起点 | 条件・結果 | 実行場所 | ユーザー操作 | visibility / auth |
|---|---|---|---|---|
| A/D: `handleSaveRecord` → `finishActiveTimer` | STOP成功で最新segmentsを検証し、Session作成とcurrent削除を同一transactionで確定。二重STOPは既存Sessionを返す | clientがFirestore transactionを要求、serverでcommit | この端末または他端末のSTOP | visibility非依存。UI起点は認証済み |
| A/C/D: `activeStaleTimer` effect → `invalidateStaleActiveTimer` | runningの最終heartbeatから15分以上。transaction内の最新状態もstaleの場合だけinvalid Session作成とcurrent削除 | client起点 / server commit | 不要。所有者以外の認証端末からも実行される | visibility非依存。auth必須。backgroundによるheartbeat停止が15分続くと対象 |
| A/D: reading自動終了effect → `handleSaveRecord` | 所有者のreading連続5時間上限。既存STOPと同じ確定処理 | client起点 / server commit | 不要 | visibility非依存、auth必須。stale時は最終heartbeatまでの時間で上限判定 |
| D/current置換: `handleTimerUpdate` → `startOrSwitchActiveTimer` | 別タスクSTARTで前のSessionを確定しcurrentを新timerへ置換。stale/orphanはinvalid。同一タスクは再開またはno-op | client起点 / server commit | この端末または他端末のSTART | visibility非依存、auth必須 |
| B: PAUSE / 休憩開始 | running → paused。currentとsegmentsは残る。休憩終了だけではSTOPやRESUMEしない | client起点 / server commit | 所有者の操作が必要 | visibility非依存、auth必須 |
| B/F: currentのmissing snapshot | `setActiveTimer(null)`。表示は停止相当になるが、このcallbackはSession作成・Firestore削除を行わない | client stateのみ | 不要 | cache/server・購読再構築の文脈に依存。STOPした人物は判定不能 |
| B: task未取得・削除 | currentがrunningでも `activeTimerTask` が見つからずlive表示が消える。タスク削除自体はcurrentを削除しない | client表示 / タスクdocumentのみ | task削除は操作が必要。未取得は不要 | initial load、snapshot、sample切替で起こり得る |
| B/C: stale表示 | `timerRecordedSeconds`、StrictTimer、LiveStudyStatus等が時間を最終heartbeatまでに固定／要確認表示にする | client表示のみ | 不要 | clockとheartbeat経過に依存。表示自体は削除しない |
| E: auth変更 | `onAuthStateChanged`がuserを更新し、購読とheartbeatを解除・再構築。logoutでログイン画面に戻る。user UIDやprofileからfamilyを変える処理はない | clientのみ | logoutは操作。auth callbackは自動でも発生 | auth依存。`FAMILY_ID`は固定 |
| E/B: sampleモード切替 | canonical購読・heartbeatを解除。sampleの旧ローカルタイマー表示へ切替。戻るとtasksを空にして再取得。currentの削除なし | clientのみ | 必要 | sample/authのeffect依存 |
| F: App再mount / 再読込 | `useState(null)`から再購読。通信・auth確定前はtimer表示なし。unmountのcleanupはlistener/interval解除のみ | clientのみ | reload、browser生命周期、親mount等 | unmount自体はcurrentを終了しない |
| B: タスク詳細を閉じる / 画面タブ切替 / StrictTimer再mount | 詳細・局所表示counterのみ変更。AppのactiveTimerとFirestoreは保持 | clientのみ | 操作が必要 | cleanupによるSTOPなし |
| A: アプリ外のdocument削除 | Rulesは同一家族の認証ユーザーにcurrent削除を許可。別クライアント・管理操作の呼出元をsnapshot単独では特定できない | server上のdocument変更 | アプリコード外では判定不能 | server missingとして観測可能 |

repositoryにcurrentの `transaction.delete` はSTOPとstale無効化の2箇所だけ。
START切替は同じdocumentへのset。migration/exportはcurrentを読み取るだけ。
server側の自動タイマー終了処理はこのリポジトリ内にはない。

visibility hidden/visible、focus/blur、online/offline、heartbeat失敗、購読待機、
タブ切替、unmountだけではcurrentを削除しない。
ただし共通時計でも通信停止が15分に達すると、既存stale仕様の自動無効化が起こる。

## 時刻とsnapshotの限界

新規timerのstartedAt、segmentStartedAt、lastHeartbeatAtはclientの`Date.now()`による
数値ミリ秒。timer repositoryは`serverTimestamp`やFirestore Timestampを生成しない。
transactionでもserver現在時刻との比較には置き換わらないため、端末間clock skewの影響が残る。
診断は壁時計・monotonic clockの差分、heartbeat age、時刻フィールドの型を記録する。
monotonicとの差分は端末内clock jumpの手掛かりであり、端末間offsetの測定値ではない。

missing callbackをSTOP成功とみなして報酬を付与する処理はない。
cache missingとserver missingはmetadataで区別できるが、serverで誰が削除したかは
通知履歴・追加queryなしには判定不能。`SERVER_MISSING_UNKNOWN_CALLER`として記録する。
metadata changesを既存current listenerで受ける。新規query・Firestore writeは追加しない。

## 診断ログ

- 保存先: 同じブラウザ・originのlocalStorage `study-jh-timer-diagnostics-v1`
- 最大300件。学習名、メモ、task内容、user UID、email、credentials、error本文は記録しない。
- 端末内の同origin別タブはinstance IDで識別。順次書込をmergeするが、同時localStorage書込の厳密な排他は行わない。
- localStorage利用不可・容量不足時はメモリ内ringへ継続。保存失敗でタイマー処理を失敗させない。
- START、PAUSE、RESUME、休憩、STOP、heartbeat、stale無効化の要求・成功・失敗。
- App mount/unmount、visibility、focus/blur、online/offline、auth変更有無、購読開始/終了/error。
- current snapshot、exists/cache/pending状態、UI状態、時刻、stale判定、local reset、消失/置換。
- Session確定、current削除commit、関連Session snapshot。transaction再試行内のチェックは確定と区別。

## 次回発生時

1. 通常どおり利用できる。表示が必要なときだけアプリURLに`?deviceTest=1`を追加する。
   既存queryがある場合は`&deviceTest=1`。診断は表示OFFでも記録される。
2. 再発したら、可能なら再読込・再START前にパネルの「ログをコピー」を押す。
   clipboardを使えない場合はコピー用textareaを手動コピーする。
3. 発生時刻、画面OFF/他アプリ切替の有無、開いていた他端末/タブと各端末の時計を確認する。
   他端末も関係する場合は、その端末のログも取得する。
4. `stop_control`のreason、`stop_success`、`stale_transaction_check`、
   `active_timer_delete_committed`、`active_timer_delete_observed`、`session_snapshot`を同じtimerIdで照合する。
5. serverのtimerがrunningのままUIだけ消えた場合は、`timer_ui_state`の
   `hasTimerTask`、`sampleMode`、`auth_state`、購読世代、cache missingを確認する。
6. `clockDeltaMs`の大きな変化／開始直後の大きな`heartbeatAgeMs`は時計問題の手掛かり。
   ログが正常でも実機原因と一致するまでは修正完了と断定しない。
