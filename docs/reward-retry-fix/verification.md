# v2.9.13 Issue #4 correction retry verification

Base: 7649834c9e3c27f5eba07302bb30de2c30b73216.

## Failure and fix

With concurrent clients, A can read an old pending reward ledger while B commits the correction and clears the pending ID. If A then reads the updated adjustment, the original branch throws `PENDING_CORRECTION_INVALID` before the SDK can detect a version conflict at commit. The failure branch now reads the same ledger document again inside A's transaction. The Web SDK detects that the version it read earlier changed and retries. A fresh callback observes no pending correction. If the version is unchanged, the same business error still surfaces for a genuinely inconsistent adjustment. The patch does not change reward arithmetic, the stored snapshot format, or Firestore Rules.

The barrier tests on real Firestore Emulator clients verify both reward policies. They cover the late-read conflict, the commit-time conflict, the real business error without retry, and eight-way contention. They assert the original and effective grant, single deduction, final balance, cleared pending state, ledger revision and replay using the same adjustment ID. The isolated proof and six repeat runs passed.

## Original repeat runs

| Group | Baseline runs with the Issue #4 error | Patched runs with the Issue #4 error | Patched runs with any failure |
| --- | ---: | ---: | ---: |
| Original affected test, both reward policies | 1/20 | 0/50 | 1/50 |
| Original Rules suite, 71 tests | 4/20 | 0/20 | 1/20 |
| Original Rules suite in shuffled order | 3/5 | 0/10 | 0/10 |
| Controlled concurrency suite, 8 tests | — | 0/6 | 0/6 |

The two failures were Vitest's 5,000 ms deadline. The full suite failed in the v1 correction/reversal test (full-9, runner-reported 10.68 s), and the isolated v2 pending correction case failed once (isolated-20, 30.28 s). Neither emitted the original business error. The runner durations include overhead and do not identify the slow operation. A follow-up in one independent emulator with a 60 s test deadline passed the four v1/v2 cases and their state assertions. The cause of the intermittent delay remains unconfirmed. The original failures remain recorded in the two worker JSON files.

All 1,470 Vitest tests, lint, build and diff-check passed. Local repetition used Java 25 and two independent Firestore Emulator instances on ports 8087 and 8088. The Draft PR workflow uses Java 21.

## Reproduction

From the repository root, run these in separate terminals to reproduce the original schedule. Raw test and trace output goes into the ignored logs directory. The commands report a nonzero exit if any repeat fails.

```sh
mkdir -p docs/reward-retry-fix/logs
npx firebase emulators:exec --config firebase.reward-retry-worker0.json --project demo-study-app-jh --only firestore "node scripts/reward-retry/repeatRegression.js 0"
npx firebase emulators:exec --config firebase.reward-retry-worker1.json --project demo-study-app-jh --only firestore "node scripts/reward-retry/repeatRegression.js 1"
```

The first GitHub run exposed a Linux shell difference: the unquoted test exclusion expanded to the direct children of the Rules folder, allowing the nested proof to enter the default Vitest run without an emulator. The proof file has an explicit non-default suffix and is discovered only by its dedicated Vitest config. A second CI run showed that the expanded directory was also passed to Vitest as a positional filter. The npm test script now quotes the glob so Vitest receives the same exclusion on Linux and Windows.
