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

export function getSolutionPath(unitId: string, extension = '.ts'): string {
  return path.join(getExerciseDir(unitId), `solution${extension}`);
}

export function getTestPath(unitId: string, extension = '.ts'): string {
  return path.join(getExerciseDir(unitId), `test${extension}`);
}

export function getExtensionForLanguage(language: string): string {
  switch (language) {
    case 'python': return '.py';
    case 'bash': return '.sh';
    case 'rust': return '.rs';
    case 'cpp': return '.cpp';
    case 'java': return '.java';
    case 'go': return '.go';
    case 'ruby': return '.rb';
    case 'php': return '.php';
    case 'csharp': return '.cs';
    case 'swift': return '.swift';
    case 'kotlin': return '.kt';
    case 'javascript': return '.js';
    case 'typescript': return '.ts';
    default: return '.txt'; // fallback
  }
}
