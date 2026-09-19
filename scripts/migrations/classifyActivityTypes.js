#!/usr/bin/env node
/* global process */
import { buildMigrationReport, readMigrationInput, writeReport } from './migrationUtils.js';

const data = readMigrationInput(process.argv);
writeReport(process.argv, { script: 'classifyActivityTypes', ...buildMigrationReport(data) });
