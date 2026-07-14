import type { QualityIssue, QuizQuestion, SeedUnit } from '../types.js';

const GENERIC_DISTRACTOR = /^(以上(都|皆)(正确|错误|是|不是)?|以上都不是|都不对|all of the above|none of the above)$/i;

export function buildQuizDiagnosticIssues(unit: SeedUnit, quiz: QuizQuestion[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const questionIds = new Set<string>();
  const coveredObjectives = new Set<string>();

  for (const question of quiz) {
    if (questionIds.has(question.id)) {
      issues.push(issue('quiz.id.duplicate', `Quiz id "${question.id}" is duplicated.`));
    }
    questionIds.add(question.id);

    if (compactLength(question.question) < 8) {
      issues.push(issue('quiz.question.tooShort', `Quiz "${question.id}" prompt is too short to establish a diagnostic scenario.`));
    }
    if (compactLength(question.explanation) < 12) {
      issues.push(issue('quiz.explanation.tooShort', `Quiz "${question.id}" explanation is too short to teach from the result.`));
    }
    if (compactLength(question.misconception ?? '') < 6) {
      issues.push(issue('quiz.misconception.tooWeak', `Quiz "${question.id}" needs a specific misconception label.`));
    }
    if (compactLength(question.rubric ?? '') < 10) {
      issues.push(issue('quiz.rubric.tooWeak', `Quiz "${question.id}" needs a concrete grading rubric.`));
    }

    for (const objectiveId of question.objectiveIds ?? []) {
      if (!unit.objectives.includes(objectiveId)) {
        issues.push(issue('quiz.objective.unknown', `Quiz "${question.id}" maps to unknown objective "${objectiveId}".`));
      } else {
        coveredObjectives.add(objectiveId);
      }
    }

    if (question.type !== 'choice') continue;
    const options = question.options ?? [];
    if (options.length < 3) {
      issues.push(issue('quiz.choice.options.tooFew', `Choice quiz "${question.id}" needs at least 3 options.`));
      continue;
    }
    const normalizedOptions = options.map(normalizeQuizText);
    if (new Set(normalizedOptions).size !== normalizedOptions.length) {
      issues.push(issue('quiz.choice.options.duplicate', `Choice quiz "${question.id}" contains duplicate options.`));
    }
    if (options.some((option) => GENERIC_DISTRACTOR.test(option.trim()))) {
      issues.push(issue('quiz.choice.distractor.generic', `Choice quiz "${question.id}" uses an "all/none of the above" distractor that weakens diagnosis.`));
    }
    for (let left = 0; left < normalizedOptions.length; left += 1) {
      for (let right = left + 1; right < normalizedOptions.length; right += 1) {
        if (editSimilarity(normalizedOptions[left]!, normalizedOptions[right]!) >= 0.9) {
          issues.push(issue(
            'quiz.choice.distractor.tooSimilar',
            `Choice quiz "${question.id}" contains options ${left + 1} and ${right + 1} that are too lexically similar to diagnose distinct reasoning.`
          ));
        }
      }
    }

    const correctOption = resolveCorrectOption(question.answer, options);
    const incorrectOptions = options.filter((option) => normalizeQuizText(option) !== normalizeQuizText(correctOption ?? ''));
    const rationales = question.distractorRationales ?? [];
    const rationaleOptions = rationales.map((rationale) => normalizeQuizText(rationale.option));
    if (rationales.length !== incorrectOptions.length || new Set(rationaleOptions).size !== rationaleOptions.length) {
      issues.push(issue('quiz.choice.rationale.coverage', `Choice quiz "${question.id}" needs exactly one rationale for every incorrect option.`));
    }
    const misconceptionKeys = rationales.map((rationale) => normalizeQuizText(rationale.misconception));
    if (new Set(misconceptionKeys).size !== misconceptionKeys.length) {
      issues.push(issue('quiz.choice.rationale.misconceptionDuplicate', `Choice quiz "${question.id}" assigns the same misconception to multiple distractors.`));
    }
    for (const rationale of rationales) {
      if (!incorrectOptions.some((option) => normalizeQuizText(option) === normalizeQuizText(rationale.option))) {
        issues.push(issue('quiz.choice.rationale.optionMismatch', `Quiz "${question.id}" rationale references a non-distractor option "${rationale.option}".`));
      }
      if (compactLength(rationale.misconception) < 6 || compactLength(rationale.feedback) < 10) {
        issues.push(issue('quiz.choice.rationale.tooWeak', `Quiz "${question.id}" distractor rationale needs a specific misconception and corrective feedback.`));
      }
    }
    for (const incorrectOption of incorrectOptions) {
      if (!rationaleOptions.includes(normalizeQuizText(incorrectOption))) {
        issues.push(issue('quiz.choice.rationale.missingOption', `Quiz "${question.id}" has no misconception rationale for distractor "${incorrectOption}".`));
      }
    }
  }

  for (const objective of unit.objectives) {
    if (!coveredObjectives.has(objective)) {
      issues.push(issue('quiz.objective.unassessed', `No quiz question directly assesses objective "${objective}".`));
    }
  }
  return issues;
}

function issue(code: string, message: string): QualityIssue {
  return { code, message, severity: 'error' };
}

function compactLength(value: string): number {
  return value.replace(/\s/g, '').length;
}

function normalizeQuizText(value: string): string {
  return value.trim().replace(/[.)。]/g, '').replace(/\s+/g, ' ').toLowerCase();
}

function resolveCorrectOption(answer: string, options: string[]): string | undefined {
  const normalizedAnswer = normalizeQuizText(answer);
  return options.find((option, index) =>
    normalizeQuizText(option) === normalizedAnswer
    || normalizeQuizText(String(index + 1)) === normalizedAnswer
    || normalizeQuizText(String.fromCharCode(65 + index)) === normalizedAnswer
  );
}

function editSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  const longestLength = Math.max(left.length, right.length);
  if (longestLength === 0) return 1;
  const distances = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = distances[0]!;
    distances[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const previous = distances[rightIndex]!;
      distances[rightIndex] = Math.min(
        previous + 1,
        distances[rightIndex - 1]! + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
      diagonal = previous;
    }
  }
  return 1 - distances[right.length]! / longestLength;
}
