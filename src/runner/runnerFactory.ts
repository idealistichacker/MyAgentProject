import type { ExerciseSpec } from '../types.js';
import type { ExerciseRunResult } from './types.js';
import { runTypeScriptExercise } from './typescriptRunner.js';
import { runPythonExercise } from './pythonRunner.js';
import { runBashExercise } from './bashRunner.js';
import { runRustExercise } from './rustRunner.js';
import { runPistonExercise } from './pistonRunner.js';

export async function runExercise(
  unitId: string,
  exercise: ExerciseSpec,
  exerciseDir: string
): Promise<ExerciseRunResult> {
  // If the exercise has LLM-generated testCode, or if it's not a natively supported local language,
  // we route it to the Piston API runner (Cloud Execution).
  if (exercise.testCode || !['typescript', 'python', 'bash', 'rust'].includes(exercise.language)) {
    return runPistonExercise(unitId, exercise, exerciseDir);
  }

  switch (exercise.language) {
    case 'python':
      return runPythonExercise(unitId, exercise, exerciseDir);
    case 'bash':
      return runBashExercise(unitId, exercise, exerciseDir);
    case 'rust':
      return runRustExercise(unitId, exercise, exerciseDir);
    case 'typescript':
    default:
      return runTypeScriptExercise(unitId, exercise, exerciseDir);
  }
}
