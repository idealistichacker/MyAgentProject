import path from 'node:path';

export function getProjectRoot(): string {
  return process.cwd();
}

export function getFcDir(): string {
  return path.join(getProjectRoot(), '.fuckcolloge');
}

export function getLessonsDir(): string {
  return path.join(getFcDir(), 'lessons');
}

export function getExercisesDir(): string {
  return path.join(getFcDir(), 'exercises');
}

export function getLogsDir(): string {
  return path.join(getFcDir(), 'logs');
}

export function getTmpDir(): string {
  return path.join(getFcDir(), 'tmp');
}

export function getConfigPath(): string {
  return path.join(getFcDir(), 'config.json');
}

export function getLearnerPath(): string {
  return path.join(getFcDir(), 'learner.json');
}

export function getPlanPath(): string {
  return path.join(getFcDir(), 'plan.json');
}

export function getStatePath(): string {
  return path.join(getFcDir(), 'state.json');
}

export function getLessonPath(unitId: string): string {
  return path.join(getLessonsDir(), `${unitId}.md`);
}

export function getExerciseDir(unitId: string): string {
  return path.join(getExercisesDir(), unitId);
}

export function getSolutionPath(unitId: string): string {
  return path.join(getExerciseDir(unitId), 'solution.ts');
}

export function getTestPath(unitId: string): string {
  return path.join(getExerciseDir(unitId), 'test.ts');
}
