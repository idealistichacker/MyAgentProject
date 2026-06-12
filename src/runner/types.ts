import type { TestResult } from '../types.js';

export interface ExerciseRunResult {
  unitId: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  testResults: TestResult[];
  passed: boolean;
}
