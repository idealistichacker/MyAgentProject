import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ExerciseSpec, TestResult } from '../types.js';
import { writeTextFile } from '../state/fsState.js';
import type { ExerciseRunResult } from './types.js';
import { createRestrictedEnvironment } from './restrictedEnv.js';
import { TIMEOUTS } from '../timeouts.js';

const execFileAsync = promisify(execFile);

export async function runPythonExercise(
  unitId: string,
  exercise: ExerciseSpec,
  exerciseDir: string
): Promise<ExerciseRunResult> {
  const testPath = path.join(exerciseDir, 'test.py');
  const testSource = buildTestSource(exercise);
  writeTextFile(testPath, testSource);

  try {
    const { stdout, stderr } = await execFileAsync(
      'python',
      ['test.py'],
      {
        cwd: exerciseDir,
        env: createRestrictedEnvironment(),
        timeout: TIMEOUTS.RUNNER_RUN_PYTHON,
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
      ? `timeout: exercise exceeded ${TIMEOUTS.RUNNER_RUN_PYTHON / 1000} seconds`
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
  const testCasesJson = JSON.stringify(exercise.testCases);
  const testCasesBase64 = Buffer.from(testCasesJson, 'utf8').toString('base64');

  return `import base64
import json
import sys
import copy

try:
    from solution import ${functionName}
except ImportError as e:
    print(json.dumps({"name": "import-error", "passed": False, "message": str(e)}))
    sys.exit(1)

tests = json.loads(base64.b64decode('${testCasesBase64}').decode('utf-8'))
assertion_mode = '${exercise.assertionMode}'
passed_count = 0

def expected_exception_name(expected):
    if not isinstance(expected, str):
        return None
    if expected.endswith('Error') or expected.endswith('Exception'):
        return expected
    return None

for test in tests:
    try:
        # Clone input to avoid mutation issues across tests
        cloned_input = copy.deepcopy(test['input'])
        actual_value = ${functionName}(*cloned_input)
        
        actual = actual_value
        if assertion_mode == 'mutate-and-return':
            actual = {"k": actual_value, "nums": cloned_input[0]}
            
        if actual == test['expected']:
            passed_count += 1
            print(json.dumps({"name": test['name'], "passed": True}))
        else:
            print(json.dumps({
                "name": test['name'],
                "passed": False,
                "message": "Assertion failed",
                "expected": test['expected'],
                "actual": actual
            }))
    except Exception as e:
        expected_exception = expected_exception_name(test['expected'])
        actual_exception = type(e).__name__
        if expected_exception == actual_exception:
            passed_count += 1
            print(json.dumps({"name": test['name'], "passed": True}))
        else:
            print(json.dumps({
                "name": test['name'],
                "passed": False,
                "message": str(e),
                "expected": test['expected'],
                "actual": actual_exception
            }))

if passed_count != len(tests):
    sys.exit(1)
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
