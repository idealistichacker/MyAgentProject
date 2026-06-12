import { runExercise } from './src/runner/runnerFactory.js';
import type { ExerciseSpec } from './src/types.js';
import { ensureProjectDirs, writeTextFile } from './src/state/fsState.js';
import { getExerciseDir, getSolutionPath } from './src/utils/paths.js';

async function testPython() {
  ensureProjectDirs();
  const unitId = 'test-python-unit';
  const exerciseDir = getExerciseDir(unitId);
  const solutionPath = getSolutionPath(unitId, '.py');

  const exercise: ExerciseSpec = {
    id: 'ex-1',
    language: 'python',
    entrypoint: 'add',
    description: 'Add two numbers',
    assertionMode: 'return',
    starterCode: '',
    hints: [],
    testCases: [
      { name: '1+1', input: [1, 1], expected: 2 },
      { name: '2+3', input: [2, 3], expected: 5 },
    ]
  };

  const solutionCode = `
def add(a, b):
    return a + b
`;
  writeTextFile(solutionPath, solutionCode);

  console.log("Running python exercise...");
  const result = await runExercise(unitId, exercise, exerciseDir);
  console.log("Passed:", result.passed);
  console.log("Test Results:", result.testResults);
  console.log("Stderr:", result.stderr);
}

testPython().catch(console.error);
