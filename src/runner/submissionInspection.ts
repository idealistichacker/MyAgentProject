import fs from 'node:fs';
import {
  getExerciseDir,
  getExtensionForLanguage,
  getSolutionPath,
  getStarterPath,
} from '../utils/paths.js';

export interface SubmissionFileInspection {
  exerciseDir: string;
  solutionPath: string;
  starterPath: string;
  solutionExists: boolean;
  starterExists: boolean;
  matchesStarter: boolean;
}

export function inspectSubmissionFiles(
  unitId: string,
  unitTitle: string,
  language: string
): SubmissionFileInspection {
  const extension = getExtensionForLanguage(language);
  const exerciseDir = getExerciseDir(unitId, unitTitle);
  const solutionPath = getSolutionPath(unitId, extension, unitTitle);
  const starterPath = getStarterPath(unitId, extension, unitTitle);
  const solutionExists = fs.existsSync(solutionPath);
  const starterExists = fs.existsSync(starterPath);
  const matchesStarter = solutionExists
    && starterExists
    && fs.readFileSync(solutionPath).equals(fs.readFileSync(starterPath));

  return {
    exerciseDir,
    solutionPath,
    starterPath,
    solutionExists,
    starterExists,
    matchesStarter,
  };
}
