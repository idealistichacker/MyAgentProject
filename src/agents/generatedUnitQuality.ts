import type { QuizQuestion, SeedUnit, ProjectSpec } from '../types.js';
import { normalizeQuizText } from './generatedUnitParser.js';

export const NATIVE_RUNNER_LANGUAGES = ['typescript', 'python', 'bash', 'rust'] as const;

export function normalizeExerciseLanguage(language: string): string {
  const normalized = language.trim().toLowerCase();
  const aliases: Record<string, string> = {
    ts: 'typescript',
    js: 'javascript',
    py: 'python',
    shell: 'bash',
    sh: 'bash',
    rs: 'rust',
    'c++': 'cpp',
    golang: 'go',
  };
  return aliases[normalized] ?? normalized;
}

export function assertGeneratedUnitQuality(
  unit: SeedUnit,
  content: string,
  quiz: QuizQuestion[],
  exercise: NonNullable<SeedUnit['exercise']>,
  project?: ProjectSpec
): void {
  if (content.replace(/\\s/g, '').length < 400) {
    throw new Error('Generated content is too short to be useful.');
  }

  if (exercise.testCases.length < 3) {
    throw new Error('Generated exercise needs at least 3 test cases.');
  }

  if (exercise.hints.length < 2) {
    throw new Error('Generated exercise needs at least 2 hints.');
  }

  if (exercise.language !== 'bash' && !exercise.starterCode.includes(exercise.entrypoint)) {
    throw new Error(`Starter code does not contain entrypoint "${exercise.entrypoint}".`);
  }

  const isNativeLanguage = NATIVE_RUNNER_LANGUAGES.includes(exercise.language as typeof NATIVE_RUNNER_LANGUAGES[number]);
  if (!isNativeLanguage && !exercise.testCode) {
    throw new Error(`Non-local language "${exercise.language}" requires TEST_CODE.`);
  }

  for (const question of quiz) {
    if (question.type === 'choice' && question.options?.length) {
      const normalizedAnswer = normalizeQuizText(question.answer);
      const answerIsOption = question.options.some((option, index) =>
        normalizeQuizText(option) === normalizedAnswer ||
        normalizeQuizText(String(index + 1)) === normalizedAnswer ||
        normalizeQuizText(String.fromCharCode(65 + index)) === normalizedAnswer
      );
      if (!answerIsOption) {
        throw new Error(`Quiz answer for "${question.id}" is not one of its options.`);
      }
    }
  }

  if (unit.type === 'project') {
    if (!project) {
      throw new Error('Project unit requires project metadata.');
    }

    if (content.replace(/\\s/g, '').length < 700) {
      throw new Error('Project content is too short for a real project spec.');
    }

    if (project.deliverables.length < 2) {
      throw new Error('Project spec needs at least 2 deliverables.');
    }

    if (project.milestones.length < 3) {
      throw new Error('Project spec needs at least 3 milestones.');
    }

    for (const milestone of project.milestones) {
      if (milestone.learnerTasks.length === 0 || milestone.acceptanceCriteria.length === 0) {
        throw new Error(`Project milestone "${milestone.id}" needs tasks and acceptance criteria.`);
      }
    }

    if (project.files.length < 2) {
      throw new Error('Project spec needs at least 2 file entries.');
    }

    if (project.rubric.length < 3) {
      throw new Error('Project spec needs at least 3 rubric items.');
    }
  }
}
