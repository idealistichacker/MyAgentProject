import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ExerciseSpec } from '../types.js';
import { getExtensionForLanguage } from '../utils/paths.js';
import { runExercise } from './runnerFactory.js';

const LOCAL_REFERENCE_LANGUAGES = new Set(['typescript', 'python', 'bash', 'rust']);

export async function verifyReferenceSolution(
  exercise: ExerciseSpec,
  referenceSolution: string
): Promise<void> {
  if (!LOCAL_REFERENCE_LANGUAGES.has(exercise.language)) {
    throw new Error(`Reference verification requires a local runner; "${exercise.language}" is unsupported.`);
  }

  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-reference-'));
  try {
    const extension = getExtensionForLanguage(exercise.language);
    await fs.writeFile(path.join(workspace, `solution${extension}`), referenceSolution, 'utf8');
    const result = await runExercise(`reference-${Date.now()}`, exercise, workspace);
    if (!result.passed) {
      const details = result.testResults
        .filter((test) => !test.passed)
        .map((test) => `${test.name}: ${test.message ?? 'failed'}`)
        .join('; ');
      throw new Error(`Reference solution did not pass generated tests. ${details}`.trim());
    }
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}
