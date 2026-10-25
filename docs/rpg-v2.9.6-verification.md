# v2.9.6 verification

## Reward policy and compatibility

- v1: floor(recordedSeconds / 60) GOLD. v2: floor(recordedSeconds / 60) * 100 GOLD. Energy (floor(seconds/900)) and materials (floor(seconds/600)) are unchanged.
- START now captures rpg-reward-v2 in activeTimers/current. STOP, forced invalidation and deferred time confirmation preserve that captured policy. Already running timers without a policy retain rpg-reward-v1, including after reload/version update. Timer duration, ownership, validation and approval logic are unchanged.
- Eligible canonical v1 and v2 sessions are both processed. Sessions without a saved policy, invalid/pending-review sessions and migrated legacySource data remain ineligible. Grant transactions read canonical Firestore sessions rather than caller-supplied seconds/policy. Existing ledgers block regrant, including after reversal. No backfill or balance multiplication.
- Grant and deferred-confirmation ledgers save the session's captured policy, never the current application constant. Corrections use the saved ledger policy first, then session policy; metadata-free old ledgers fall back to v1. Original ledger.rewards stays unchanged. Applied corrections update effectiveRewards; pending corrections store their complete deduction and retry it without recalculation.
- Reversal deducts effectiveRewards (or the original rewards when uncorrected), never a recalculated amount. Reversed ledgers cannot be reversed or granted again. Reversal while a correction is pending is rejected so the pending deduction remains intact.

| Recorded seconds | v1 GOLD | v2 GOLD |
|---:|---:|---:|
|59|0|0|
|60|1|100|
|90|1|100|
|120|2|200|
|600|10|1,000|
|1,800|30|3,000|
|3,600|60|6,000|

## Economy (prices unchanged)

The times below assume a new valid session and no other expenditure. Full-minute rounding applies per session.

| Product | GOLD | v1 study minutes | v2 study minutes |
|---|---:|---:|---:|
|Study material x1|30|30|1|
|N alchemy material x1|90|90|1|
|R alchemy material x1|240|240|3|
|Stat reallocation|120|120|2|
|NORMAL ticket|120|120|2|
|SILVER ticket|300|300|3|
|GOLD ticket|600|600|6|
|PREMIUM ticket|1,200|1,200|12|

A 30-minute new session grants 3,000G: enough GOLD for 100 study materials, 33 N materials, 12 R materials, 25 NORMAL tickets or 2 PREMIUM tickets, considered separately. Material/time/validation gates still apply. This materially accelerates the currency economy. A later price review is advisable after observing purchase and gacha behavior; no price, recipe, gacha probability or stat-point acquisition rule was changed here.

## UI and validation

- Completed-session feedback and result modal display the actual transaction reward with thousands separators. Prediction copy explicitly describes new sessions and complete-minute rounding.
- The history's on-demand reward button reads only its stored ledger, shows initial and effective grant amounts, and handles reversed/pending ledgers. It never recalculates history from current rates and adds no listener. Its state is keyed by UID/session.
- UI fixture is Firestore-free and uses selected simulated durations. Verified START, completion +3,000G / balance 30 -> 3,030G, saved old history 30G and new history 3,000G, and old in-progress v1 completion +10G. At 320/375/1440px no horizontal overflow. Actual Firestore transactions are tested separately on a newly launched demo-project Emulator; no production writes.
- Related reward/policy/review tests: 107 PASS across the targeted suites. Full unit/regression: 1,170 PASS (95 files). Emulator Rules/real transactions: 36 PASS. Duration-matrix tests allow 30 seconds for seven sequential transaction races; assertions are unchanged. Rules unchanged.
- npm run lint, npm run build, git diff --check: PASS. Existing >500kB chunk warning remains.
- JS+CSS bundle: 1,513,195 bytes / gzip 436,734. Increase over v2.9.5: 2,270 bytes / gzip 876. Total increase over baseline 3da4158: 10,613 bytes / gzip 3,085.

## Files

Core changes: rewardConfig, rewardCalculator, activeTimerRepository (policy metadata only), rewardLedgerRepository, rewardCorrectionRepository, studyTimeReviewRepository, rewardProgress, feedbackEvents, RewardResultModal, RewardProgressCard, StudyRewardHistory and minimal App connections. Targeted regression, real transaction tests and a standalone manual UI fixture accompany them.

## Protected workspace

Before measurement JSON remains untracked with git object hash 3ba6c44999e52a87ed9a7db31463dde395bf5998. Original C:/dev/study-app-jh retains its two modified tracked files, three untracked v2.10.0 files and untracked AGENTS.md. No source-tree synchronization, pull/merge/rebase, reset, clean, stash or force push was performed.
