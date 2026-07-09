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
  // Keep local languages on local runners for speed and stability. Piston is only
  // needed when the generated language has no native runner in this project.
  if (!['typescript', 'python', 'bash', 'rust'].includes(exercise.language)) {
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
