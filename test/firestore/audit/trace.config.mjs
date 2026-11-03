import { defineConfig } from 'vitest/config';
export default defineConfig({ test:{ include:['test/firestore/audit/rewardCorrection.audit.test.js','test/firestore/firestore.rules.test.js'],setupFiles:['test/firestore/audit/transactionTrace.js'],testTimeout:30000,hookTimeout:30000 } });
