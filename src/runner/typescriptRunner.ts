import { execFile } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import type { ExerciseSpec, TestResult } from '../types.js';
import { getTestPath } from '../utils/paths.js';
import { writeTextFile } from '../state/fsState.js';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const tsxPackageDir = path.dirname(require.resolve('tsx/package.json'));
const tsxCliPath = path.join(tsxPackageDir, 'dist/cli.mjs');

import type { ExerciseRunResult } from './types.js';

export async function runTypeScriptExercise(
  unitId: string,
  exercise: ExerciseSpec,
  exerciseDir: string
): Promise<ExerciseRunResult> {
  const testPath = getTestPath(unitId);
  const testSource = buildTestSource(exercise);
  writeTextFile(testPath, testSource);

  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [tsxCliPath, 'test.ts'],
      {
        cwd: exerciseDir,
        env: {
          ...process.env,
          NODE_ENV: 'test',
        },
        timeout: 5000,
        maxBuffer: 1024 * 1024,
      }
    );

    const testResults = parseJsonLines(stdout);
    return {
      unitId,
      stdout,
      stderr,
      exitCode: 0,
      signal: null,
      testResults,
      passed: testResults.length > 0 && testResults.every((result) => result.passed),
    };
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number;
      signal?: NodeJS.Signals;
      killed?: boolean;
    };

    const testResults = parseJsonLines(execError.stdout ?? '');
    const message = execError.signal === 'SIGTERM'
      ? 'timeout: exercise exceeded 5 seconds'
      : execError.stderr || execError.message || 'unknown execution error';

    return {
      unitId,
      stdout: execError.stdout ?? '',
      stderr: execError.stderr ?? '',
      exitCode: execError.code ?? null,
      signal: execError.signal ?? null,
      testResults: testResults.length > 0
        ? testResults
        : [{ name: 'exercise-runner', passed: false, message }],
      passed: false,
    };
  }
}

function buildTestSource(exercise: ExerciseSpec): string {
  const functionName = exercise.entrypoint;
  const testCasesJson = JSON.stringify(exercise.testCases, null, 2);

  return `import assert from 'node:assert/strict';
import { ${functionName} } from './solution.ts';

const assertionMode = ${JSON.stringify(exercise.assertionMode)};
const tests = ${testCasesJson} as Array<{
  name: string;
  input: unknown[];
  expected: unknown;
}>;

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function cloneInput(input: unknown[]): unknown[] {
  return input.map((item) => {
    try {
      return JSON.parse(JSON.stringify(item));
    } catch {
      return item;
    }
  });
}

let passedCount = 0;

for (const test of tests) {
  const clonedInput = cloneInput(test.input);
  const actualValue = ${functionName}(...clonedInput as any[]);
  const actual = assertionMode === 'mutate-and-return'
    ? { k: actualValue, nums: clonedInput[0] }
    : actualValue;

  try {
    assert.deepEqual(actual, test.expected);
    passedCount++;
    console.log(JSON.stringify({ name: test.name, passed: true }));
  } catch (error) {
    console.log(JSON.stringify({
      name: test.name,
      passed: false,
      message: error instanceof Error ? error.message : String(error),
      expected: safeStringify(test.expected),
      actual: safeStringify(actual),
    }));
  }
}

if (passedCount !== tests.length) {
  process.exitCode = 1;
}
`;
}

function parseJsonLines(stdout: string): TestResult[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as TestResult;
        return [parsed];
      } catch {
        return [];
      }
    });
}
