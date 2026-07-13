import type { ProjectSpec, QualityIssue, QuizQuestion, SeedUnit, Source } from '../types.js';
import { buildFactVerificationIssues } from './factVerification.js';
import { buildQuizDiagnosticIssues } from './assessmentDiagnostics.js';
import { analyzeProjectObjectiveUsage } from '../curriculum/knowledgeGraph.js';

const NATIVE_RUNNER_LANGUAGES = new Set(['typescript', 'python', 'bash', 'rust']);

export class GeneratedUnitQualityError extends Error {
  constructor(public readonly issues: QualityIssue[]) {
    super(issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n'));
    this.name = 'GeneratedUnitQualityError';
  }
}

export function assertGeneratedUnitQuality(
  unit: SeedUnit,
  content: string,
  quiz: QuizQuestion[],
  exercise: NonNullable<SeedUnit['exercise']>,
  project: ProjectSpec | undefined,
  objectiveCoverage: NonNullable<SeedUnit['objectiveCoverage']>,
  citations: NonNullable<SeedUnit['citations']>,
  sources: Source[]
): void {
  if (content.replace(/\s/g, '').length < 400) {
    throw new Error('Generated content is too short to be useful.');
  }
  if (exercise.testCases.length < 3) {
    throw new Error('Generated exercise needs at least 3 test cases.');
  }
  if (exercise.hints.length < 2) {
    throw new Error('Generated exercise needs at least 2 hints.');
  }

  const testCategories = new Set(exercise.testCases.map((testCase) => testCase.category));
  for (const category of ['normal', 'edge', 'misconception'] as const) {
    if (!testCategories.has(category)) {
      throw new Error(`Generated exercise needs a ${category} test case.`);
    }
  }
  if (!exercise.conceptTags?.length || !exercise.commonPitfalls?.length) {
    throw new Error('Generated exercise needs concept tags and common pitfalls.');
  }
  if (exercise.language !== 'bash' && !exercise.starterCode.includes(exercise.entrypoint)) {
    throw new Error(`Starter code does not contain entrypoint "${exercise.entrypoint}".`);
  }
  if (!NATIVE_RUNNER_LANGUAGES.has(exercise.language) && !exercise.testCode) {
    throw new Error(`Non-local language "${exercise.language}" requires TEST_CODE.`);
  }

  for (const question of quiz) {
    if (!question.objectiveIds?.length || !question.misconception?.trim()) {
      throw new Error(`Quiz "${question.id}" needs objective coverage and a misconception label.`);
    }
    if (question.type === 'short-answer' && !question.rubric?.trim()) {
      throw new Error(`Short-answer quiz "${question.id}" needs a grading rubric.`);
    }
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
  const quizIssues = buildQuizDiagnosticIssues(unit, quiz);
  if (quizIssues.some((issue) => issue.severity === 'error')) {
    throw new GeneratedUnitQualityError(quizIssues);
  }

  if (sources.length === 0) {
    throw new Error('Generated unit needs at least one verified source.');
  }
  const sourceIds = new Set(sources.map((source) => source.id));
  if (citations.length === 0 || citations.some((citation) => !sourceIds.has(citation.sourceId))) {
    throw new Error('Generated citations must reference the retrieved source pack.');
  }
  const factIssues = buildFactVerificationIssues(content, citations, sources);
  if (factIssues.some((issue) => issue.severity === 'error')) {
    throw new GeneratedUnitQualityError(factIssues);
  }

  const coveredObjectives = new Map(objectiveCoverage.map((coverage) => [coverage.objectiveId, coverage]));
  const assessmentIds = new Set([
    ...quiz.map((question) => question.id),
    ...exercise.testCases.map((testCase) => testCase.name),
  ]);
  for (const objective of unit.objectives) {
    const coverage = coveredObjectives.get(objective);
    if (!coverage) {
      throw new Error(`Generated unit has no evidence for objective "${objective}".`);
    }
    if (!content.includes(coverage.lessonEvidence) || !content.includes(coverage.exampleEvidence)) {
      throw new Error(`Generated evidence for objective "${objective}" is not present in the lesson content.`);
    }
    if (coverage.assessmentIds.some((id) => !assessmentIds.has(id))) {
      throw new Error(`Generated objective coverage for "${objective}" references an unknown assessment.`);
    }
  }

  if (unit.type !== 'project') return;
  const projectKnowledgeIssues = analyzeProjectObjectiveUsage({ ...unit, project });
  if (projectKnowledgeIssues.length > 0) {
    throw new GeneratedUnitQualityError(projectKnowledgeIssues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      severity: issue.severity,
    })));
  }
  if (!project) {
    throw new Error('Project unit requires project metadata.');
  }
  if (content.replace(/\s/g, '').length < 700) {
    throw new Error('Project content is too short for a real project spec.');
  }
  if (project.deliverables.length < 2 || project.milestones.length < 3 || project.files.length < 2 || project.rubric.length < 3) {
    throw new Error('Project spec does not meet the required deliverable, milestone, file, or rubric minimums.');
  }
  for (const milestone of project.milestones) {
    if (milestone.learnerTasks.length === 0 || milestone.acceptanceCriteria.length === 0) {
      throw new Error(`Project milestone "${milestone.id}" needs tasks and acceptance criteria.`);
    }
    if (!milestone.objectiveIds?.length || !milestone.checkpointQuestions?.length) {
      throw new Error(`Project milestone "${milestone.id}" needs objective mappings and checkpoint questions.`);
    }
  }
}

function normalizeQuizText(value: string): string {
  return value.trim().replace(/[.)。]/g, '').toLowerCase();
}
