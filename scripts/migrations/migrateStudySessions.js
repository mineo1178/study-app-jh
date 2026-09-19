#!/usr/bin/env node
/* global process */
import { buildMigrationReport, readMigrationInput, writeReport } from './migrationUtils.js';

// Dry-run only. This script intentionally never writes to Firestore.
const data = readMigrationInput(process.argv);
writeReport(process.argv, { script: 'migrateStudySessions', ...buildMigrationReport(data) });
