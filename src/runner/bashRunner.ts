import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ExerciseSpec, TestResult } from '../types.js';
import { getTestPath } from '../utils/paths.js';
import { writeTextFile } from '../state/fsState.js';
import type { ExerciseRunResult } from './types.js';

const execFileAsync = promisify(execFile);

export async function runBashExercise(
  unitId: string,
  exercise: ExerciseSpec,
  exerciseDir: string
): Promise<ExerciseRunResult> {
  const testPath = getTestPath(unitId, '.sh');
  const testSource = buildTestSource(exercise);
  writeTextFile(testPath, testSource);

  try {
    const { stdout, stderr } = await execFileAsync(
      'bash',
      ['test.sh'],
      {
        cwd: exerciseDir,
        env: {
          ...process.env,
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
  
  let script = `#!/bin/bash\nsource ./solution.sh\n\npassed_count=0\n\n`;
  
  for (const test of exercise.testCases) {
    const argsStr = test.input.map(arg => `"${String(arg).replace(/"/g, '\\"')}"`).join(' ');
    const expectedStr = String(test.expected).replace(/"/g, '\\"');
    
    script += `
# Test: ${test.name}
actual=$(${functionName} ${argsStr})
if [ "$actual" == "${expectedStr}" ]; then
  passed_count=$((passed_count+1))
  echo '{"name": "${test.name}", "passed": true}'
else
  # Escape actual output for JSON
  escaped_actual=$(echo "$actual" | python -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))')
  expected_json='${JSON.stringify(test.expected)}'
  echo '{"name": "${test.name}", "passed": false, "message": "Assertion failed", "expected": '"$expected_json"', "actual": '"$escaped_actual"'}'
fi
`;
  }
  
  script += `\nif [ "$passed_count" -ne ${exercise.testCases.length} ]; then\n  exit 1\nfi\n`;
  return script;
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
