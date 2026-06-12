import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import fs from 'node:fs';
import type { ExerciseSpec, TestResult } from '../types.js';
import { getTestPath } from '../utils/paths.js';
import { writeTextFile } from '../state/fsState.js';
import type { ExerciseRunResult } from './types.js';

const execFileAsync = promisify(execFile);

export async function runRustExercise(
  unitId: string,
  exercise: ExerciseSpec,
  exerciseDir: string
): Promise<ExerciseRunResult> {
  const testPath = path.join(exerciseDir, 'test.rs');
  const testSource = buildTestSource(exercise);
  writeTextFile(testPath, testSource);

  // Default to false unless proven passed
  let passed = false;

  try {
    // Compile the test.rs file
    const exeName = process.platform === 'win32' ? 'test_runner.exe' : 'test_runner';
    const exePath = path.join(exerciseDir, exeName);
    
    try {
      await execFileAsync('rustc', ['test.rs', '-o', exeName], {
        cwd: exerciseDir,
        timeout: 10000,
      });
    } catch (compileErr: any) {
      const stderr = compileErr.stderr || compileErr.message;
      return {
        unitId,
        stdout: compileErr.stdout ?? '',
        stderr: stderr,
        exitCode: compileErr.code ?? null,
        signal: compileErr.signal ?? null,
        testResults: [{ name: 'compiler', passed: false, message: stderr }],
        passed: false,
      };
    }

    // Run the compiled executable
    const { stdout, stderr } = await execFileAsync(exePath, [], {
      cwd: exerciseDir,
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });

    const testResults = parseJsonLines(stdout);
    passed = testResults.length > 0 && testResults.every((result) => result.passed);

    return {
      unitId,
      stdout,
      stderr,
      exitCode: 0,
      signal: null,
      testResults,
      passed,
    };
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number;
      signal?: NodeJS.Signals;
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
  
  // Since we don't want to rely on external serde/json crates,
  // we'll format the output manually in JSON format for the test runner to parse.
  
  let testsRustCode = '';
  
  exercise.testCases.forEach((test, index) => {
    // Quick heuristic to determine Rust type formatting.
    // If input is an array, we spread it into function arguments.
    // We assume the inputs are basic types that implement Display or Debug.
    const inputsStr = test.input.map(arg => {
      if (typeof arg === 'string') return `"${arg}"`;
      if (typeof arg === 'object') return `vec![${(arg as any[]).map(a => typeof a === 'string' ? `"${a}"` : a).join(', ')}]`;
      return String(arg);
    }).join(', ');

    let expectedStr = '';
    if (typeof test.expected === 'string') expectedStr = `"${test.expected}"`;
    else if (typeof test.expected === 'object') expectedStr = `vec![${(test.expected as any[]).map(a => typeof a === 'string' ? `"${a}"` : a).join(', ')}]`;
    else expectedStr = String(test.expected);

    testsRustCode += `
    {
        let expected = ${expectedStr};
        let actual = ${functionName}(${inputsStr});
        if actual == expected {
            println!("{{\\"name\\": \\"${test.name}\\", \\"passed\\": true}}");
            passed_count += 1;
        } else {
            println!("{{\\"name\\": \\"${test.name}\\", \\"passed\\": false, \\"message\\": \\"Assertion failed\\", \\"expected\\": \\"{:?}\\", \\"actual\\": \\"{:?}\\"}}", expected, actual);
        }
    }
    `;
  });

  return `
mod solution;
use solution::*;

fn main() {
    let mut passed_count = 0;
    let total_tests = ${exercise.testCases.length};
    
${testsRustCode}

    if passed_count != total_tests {
        std::process::exit(1);
    }
}
`;
}

function parseJsonLines(stdout: string): TestResult[] {
  return stdout
    .split(/\\r?\\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{') && line.endsWith('}'))
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as TestResult;
        return [parsed];
      } catch {
        return [];
      }
    });
}
