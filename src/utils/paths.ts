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

export function getJobsDir(): string {
  return path.join(getFcDir(), 'jobs');
}

export function getManifestsDir(): string {
  return path.join(getFcDir(), 'manifests');
}

export function getLocksDir(): string {
  return path.join(getFcDir(), 'locks');
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

export function getGenerationJobPath(jobId: string): string {
  return path.join(getJobsDir(), `${safePathComponent(jobId, 'job id')}.json`);
}

export function getArtifactManifestPath(unitId: string): string {
  return path.join(getManifestsDir(), `${safePathComponent(unitId, 'unit id')}.json`);
}

export function getPublicationLockPath(): string {
  return path.join(getLocksDir(), 'publication.lock');
}

export function getLessonPath(unitId: string): string {
  return path.join(getLessonsDir(), `${safePathComponent(unitId, 'unit id')}.md`);
}

export function getExerciseDir(unitId: string): string {
  return path.join(getExercisesDir(), safePathComponent(unitId, 'unit id'));
}

export function getSolutionPath(unitId: string, extension = '.ts'): string {
  return path.join(getExerciseDir(unitId), `solution${extension}`);
}

export function getStarterPath(unitId: string, extension = '.ts'): string {
  return path.join(getExerciseDir(unitId), `starter${extension}`);
}

export function getProjectSpecPath(unitId: string): string {
  return path.join(getExerciseDir(unitId), 'PROJECT.md');
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

function safePathComponent(value: string, label: string): string {
  const trimmed = value.trim();
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,127}$/u.test(trimmed) || trimmed === '.' || trimmed === '..') {
    throw new Error(`Invalid ${label} for local artifact path: ${value}`);
  }
  return trimmed;
}
