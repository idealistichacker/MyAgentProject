import type { ExerciseSpec } from '../types.js';
import type { ExerciseRunResult } from './types.js';
import { runTypeScriptExercise } from './typescriptRunner.js';
import { runPythonExercise } from './pythonRunner.js';
import { runBashExercise } from './bashRunner.js';

export async function runExercise(
  unitId: string,
  exercise: ExerciseSpec,
  exerciseDir: string
): Promise<ExerciseRunResult> {
  switch (exercise.language) {
    case 'python':
      return runPythonExercise(unitId, exercise, exerciseDir);
    case 'bash':
      return runBashExercise(unitId, exercise, exerciseDir);
    case 'typescript':
    default:
      return runTypeScriptExercise(unitId, exercise, exerciseDir);
  }
}
