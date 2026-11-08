import { defineConfig } from 'vitest/config';
export default defineConfig({test:{include:['test/firestore/reward-retry/rewardCorrectionRace.rules.js'],setupFiles:['test/firestore/reward-retry/transactionTrace.js'],testTimeout:30000,hookTimeout:30000}});
