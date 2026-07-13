import type { ExerciseSpec, LearningPlan, QuizQuestion, SeedUnit } from '../types.js';
import { buildFactVerificationIssues } from '../agents/factVerification.js';
import { buildQuizDiagnosticIssues } from '../agents/assessmentDiagnostics.js';
import { analyzeKnowledgeGraph } from './knowledgeGraph.js';

export type CurriculumAuditSeverity = 'error' | 'warning' | 'info';

export interface CurriculumAuditIssue {
  severity: CurriculumAuditSeverity;
  code: string;
  message: string;
  unitId?: string;
  suggestion?: string;
}

export interface CurriculumAuditReport {
  passed: boolean;
  score: number;
  summary: {
    units: number;
    projects: number;
    remediations: number;
    errors: number;
    warnings: number;
    infos: number;
  };
  issues: CurriculumAuditIssue[];
}

const LOCAL_RUNNER_LANGUAGES = new Set(['typescript', 'python', 'bash', 'rust']);

export function auditLearningPlan(plan: LearningPlan): CurriculumAuditReport {
  const issues: CurriculumAuditIssue[] = [];
  const unitIds = new Set<string>();
  const duplicateIds = new Set<string>();

  if (plan.units.length === 0) {
    issues.push({
      severity: 'error',
      code: 'plan.empty',
      message: 'Learning plan contains no units.',
      suggestion: 'Run fc plan after creating a learner profile.',
    });
  }

  if (plan.currentIndex < 0 || plan.currentIndex >= plan.units.length) {
    issues.push({
      severity: 'error',
      code: 'plan.currentIndex.outOfRange',
      message: `currentIndex ${plan.currentIndex} is outside the unit list.`,
      suggestion: 'Reset currentIndex to an existing unit index.',
    });
  }

  for (const unit of plan.units) {
    if (unitIds.has(unit.id)) {
      duplicateIds.add(unit.id);
    }
    unitIds.add(unit.id);
  }

  for (const id of duplicateIds) {
    issues.push({
      severity: 'error',
      code: 'plan.duplicateUnitId',
      unitId: id,
      message: `Duplicate unit id "${id}" found.`,
      suggestion: 'Regenerate or rename duplicated units so routing is unambiguous.',
    });
  }

  if (plan.units.length >= 4 && !plan.units.some((unit) => unit.type === 'project')) {
    issues.push({
      severity: 'warning',
      code: 'plan.missingProject',
      message: 'A course with 4+ units should include at least one project unit.',
      suggestion: 'Regenerate the plan or add a project unit to synthesize the preceding concepts.',
    });
  }

  const hasKnowledgeGraph = plan.units.some((unit) => (unit.prerequisiteObjectiveIds?.length ?? 0) > 0);
  if (hasKnowledgeGraph) {
    for (const graphIssue of analyzeKnowledgeGraph(plan.units, true).issues) {
      issues.push({
        severity: graphIssue.severity,
        code: graphIssue.code,
        unitId: graphIssue.unitId,
        message: graphIssue.message,
      });
    }
  } else {
    issues.push({
      severity: 'info',
      code: 'plan.knowledgeGraph.legacy',
      message: 'Plan predates explicit prerequisiteObjectiveIds and is not graph-validated.',
      suggestion: 'Regenerate the plan to create an explicit knowledge objective graph.',
    });
  }

  for (const unit of plan.units) {
    auditUnit(unit, unitIds, issues);
  }

  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.filter((issue) => issue.severity === 'warning').length;
  const infos = issues.filter((issue) => issue.severity === 'info').length;
  const score = Math.max(0, 100 - errors * 12 - warnings * 4);

  return {
    passed: errors === 0,
    score,
    summary: {
      units: plan.units.length,
      projects: plan.units.filter((unit) => unit.type === 'project').length,
      remediations: plan.units.filter((unit) => unit.type === 'remediation').length,
      errors,
      warnings,
      infos,
    },
    issues,
  };
}

function auditUnit(
  unit: SeedUnit,
  unitIds: Set<string>,
  issues: CurriculumAuditIssue[]
): void {
  if (!unit.title.trim()) {
    addIssue(issues, unit, 'error', 'unit.title.empty', 'Unit title is empty.');
  }

  if (!unit.description.trim()) {
    addIssue(issues, unit, 'warning', 'unit.description.empty', 'Unit description is empty.');
  }

  if (unit.objectives.length === 0) {
    addIssue(issues, unit, 'warning', 'unit.objectives.empty', 'Unit has no learning objectives.');
  }

  auditRoute(unit, unit.nextIfPassed, unitIds, issues, 'nextIfPassed');
  auditRoute(unit, unit.nextIfFailed, unitIds, issues, 'nextIfFailed');

  const looksGenerated = Boolean(unit.content || unit.quiz || unit.exercise || unit.project);
  if (!looksGenerated) {
    addIssue(
      issues,
      unit,
      'info',
      'unit.notGenerated',
      'Unit is outline-only and has not generated lesson/exercise content yet.',
      'Run fc start for this unit or fc generate-all before auditing generated artifacts.'
    );
    return;
  }

  auditContent(unit, issues);
  auditTeachingEvidence(unit, issues);
  auditQuiz(unit, issues);
  auditExercise(unit, issues);
  auditProject(unit, issues);
  auditRemediation(unit, unitIds, issues);
}

function auditRoute(
  unit: SeedUnit,
  targetUnitId: string | undefined,
  unitIds: Set<string>,
  issues: CurriculumAuditIssue[],
  fieldName: 'nextIfPassed' | 'nextIfFailed'
): void {
  if (!targetUnitId) return;

  if (!unitIds.has(targetUnitId)) {
    addIssue(
      issues,
      unit,
      'error',
      `unit.route.${fieldName}.missingTarget`,
      `${fieldName} points to unknown unit "${targetUnitId}".`,
      'Regenerate the plan or update the route to an existing unit id.'
    );
  }
}

function auditContent(unit: SeedUnit, issues: CurriculumAuditIssue[]): void {
  if (!unit.content?.trim()) {
    addIssue(
      issues,
      unit,
      'warning',
      'unit.content.missing',
      'Generated unit has no lesson content.',
      'Run fc start to generate the lesson or regenerate this unit.'
    );
    return;
  }

  const contentLength = unit.content.replace(/\s/g, '').length;
  const minimumLength = unit.type === 'project' ? 700 : unit.type === 'remediation' ? 250 : 400;
  if (contentLength < minimumLength) {
    addIssue(
      issues,
      unit,
      'warning',
      'unit.content.short',
      `Lesson content is short (${contentLength} non-whitespace chars, expected at least ${minimumLength}).`,
      'Regenerate the unit or expand the lesson with examples, gotchas, and walkthroughs.'
    );
  }

  if (unit.content.includes('基础预备版本')) {
    addIssue(
      issues,
      unit,
      'warning',
      'unit.content.fallback',
      'Lesson is a fallback basic version.',
      'Regenerate the unit when the provider is available.'
    );
  }
}

function auditQuiz(unit: SeedUnit, issues: CurriculumAuditIssue[]): void {
  if (!unit.quiz || unit.quiz.length === 0) {
    addIssue(issues, unit, 'warning', 'unit.quiz.missing', 'Generated unit has no quiz.');
    return;
  }

  if (unit.passCriteria.quizMinScore > unit.quiz.length) {
    addIssue(
      issues,
      unit,
      'error',
      'unit.quiz.passCriteria.impossible',
      `quizMinScore ${unit.passCriteria.quizMinScore} exceeds quiz length ${unit.quiz.length}.`,
      'Lower quizMinScore or generate more quiz questions.'
    );
  }

  for (const question of unit.quiz) {
    auditQuizQuestion(unit, question, issues);
  }

  if (hasTeachingMetadata(unit)) {
    for (const diagnostic of buildQuizDiagnosticIssues(unit, unit.quiz)) {
      addIssue(issues, unit, diagnostic.severity, diagnostic.code, diagnostic.message);
    }
  }
}

function auditQuizQuestion(
  unit: SeedUnit,
  question: QuizQuestion,
  issues: CurriculumAuditIssue[]
): void {
  if (!question.question.trim()) {
    addIssue(issues, unit, 'warning', 'unit.quiz.question.empty', `Quiz "${question.id}" has an empty prompt.`);
  }

  if (hasTeachingMetadata(unit) && !question.objectiveIds?.length) {
    addIssue(issues, unit, 'warning', 'unit.quiz.objectives.missing', `Quiz "${question.id}" has no objective mapping.`);
  }

  if (hasTeachingMetadata(unit) && !question.misconception?.trim()) {
    addIssue(issues, unit, 'warning', 'unit.quiz.misconception.missing', `Quiz "${question.id}" has no misconception label.`);
  }

  if (hasTeachingMetadata(unit) && question.type === 'short-answer' && !question.rubric?.trim()) {
    addIssue(issues, unit, 'warning', 'unit.quiz.rubric.missing', `Short-answer quiz "${question.id}" has no grading rubric.`);
  }

  if (question.type === 'choice') {
    if (!question.options || question.options.length < 2) {
      addIssue(
        issues,
        unit,
        'error',
        'unit.quiz.choice.optionsMissing',
        `Choice quiz "${question.id}" needs at least 2 options.`
      );
      return;
    }

    const normalizedAnswer = normalizeQuizText(question.answer);
    const answerIsOption = question.options.some((option, index) =>
      normalizeQuizText(option) === normalizedAnswer ||
      normalizeQuizText(String(index + 1)) === normalizedAnswer ||
      normalizeQuizText(String.fromCharCode(65 + index)) === normalizedAnswer
    );

    if (!answerIsOption) {
      addIssue(
        issues,
        unit,
        'error',
        'unit.quiz.choice.answerMismatch',
        `Choice quiz "${question.id}" answer is not one of its options.`,
        'Regenerate the unit or align the answer with the option text/index.'
      );
    }
  }
}

function auditExercise(unit: SeedUnit, issues: CurriculumAuditIssue[]): void {
  if (!unit.exercise) {
    addIssue(issues, unit, 'warning', 'unit.exercise.missing', 'Generated unit has no exercise.');
    return;
  }

  const exercise = unit.exercise;
  if (exercise.description.includes('占位练习')) {
    addIssue(
      issues,
      unit,
      'warning',
      'unit.exercise.fallback',
      'Exercise is a fallback placeholder.',
      'Regenerate the unit when the provider is available.'
    );
  }

  if (!LOCAL_RUNNER_LANGUAGES.has(exercise.language) && !exercise.testCode) {
    addIssue(
      issues,
      unit,
      'error',
      'unit.exercise.nonLocalNoTestCode',
      `Exercise language "${exercise.language}" has no local runner and no testCode.`,
      'Prefer TypeScript/Python/Bash/Rust or include testCode for the remote runner.'
    );
  }

  if (exercise.language !== 'bash' && !exercise.starterCode.includes(exercise.entrypoint)) {
    addIssue(
      issues,
      unit,
      'error',
      'unit.exercise.entrypointMissing',
      `Starter code does not contain entrypoint "${exercise.entrypoint}".`
    );
  }

  if (exercise.testCases.length < 3) {
    addIssue(
      issues,
      unit,
      'warning',
      'unit.exercise.testCases.tooFew',
      `Exercise has ${exercise.testCases.length} test case(s); expected at least 3.`,
      'Include normal, edge, and misconception-catching tests.'
    );
  }

  if (exercise.hints.length < 2) {
    addIssue(
      issues,
      unit,
      'warning',
      'unit.exercise.hints.tooFew',
      `Exercise has ${exercise.hints.length} hint(s); expected at least 2.`
    );
  }

  if (hasTeachingMetadata(unit) && (!exercise.conceptTags?.length || !exercise.commonPitfalls?.length)) {
    addIssue(
      issues,
      unit,
      'warning',
      'unit.exercise.teachingMetadata.missing',
      'Exercise has no concept tags or common-pitfall guidance.'
    );
  }

  auditExerciseTestShape(unit, exercise, issues);
}

function auditExerciseTestShape(
  unit: SeedUnit,
  exercise: ExerciseSpec,
  issues: CurriculumAuditIssue[]
): void {
  const names = new Set<string>();
  let duplicateFound = false;

  for (const testCase of exercise.testCases) {
    if (names.has(testCase.name)) {
      duplicateFound = true;
    }
    names.add(testCase.name);
  }

  if (duplicateFound) {
    addIssue(
      issues,
      unit,
      'warning',
      'unit.exercise.testCases.duplicateNames',
      'Exercise has duplicate test case names.',
      'Use descriptive names so assessment feedback is actionable.'
    );
  }

  const joinedNames = [...names].join(' ').toLowerCase();
  if (exercise.testCases.length >= 3 && !/(edge|boundary|empty|zero|corner)/.test(joinedNames)) {
    addIssue(
      issues,
      unit,
      'warning',
      'unit.exercise.testCases.noEdgeCase',
      'Exercise has 3+ tests but no obvious edge/boundary test name.',
      'Add an edge case so learners confront boundary reasoning.'
    );
  }

  const categories = new Set(exercise.testCases.map((testCase) => testCase.category).filter(Boolean));
  if (categories.size > 0 && !['normal', 'edge', 'misconception'].every((category) => categories.has(category as typeof exercise.testCases[number]['category']))) {
    addIssue(
      issues,
      unit,
      'warning',
      'unit.exercise.testCases.categoriesMissing',
      'Exercise test metadata does not cover normal, edge, and misconception categories.'
    );
  }
}

function auditTeachingEvidence(unit: SeedUnit, issues: CurriculumAuditIssue[]): void {
  const sources = unit.sources ?? [];
  const citations = unit.citations ?? [];
  const coverage = unit.objectiveCoverage ?? [];

  if (sources.length === 0) {
    addIssue(issues, unit, 'info', 'unit.qualityMetadata.legacy', 'Unit predates structured sources and objective evidence.');
    return;
  }

  const sourceIds = new Set(sources.map((source) => source.id));
  const staleSources = sources.filter((source) => source.freshness === 'stale');
  if (staleSources.length > 0) {
    addIssue(
      issues,
      unit,
      'warning',
      'unit.sources.stale',
      `Unit uses ${staleSources.length} stale source snapshot(s).`,
      'Regenerate when the search provider is available to refresh factual context.'
    );
  }
  if (citations.length === 0 || citations.some((citation) => !sourceIds.has(citation.sourceId))) {
    addIssue(issues, unit, 'warning', 'unit.citations.invalid', 'Unit citations are missing or do not match its source pack.');
  }
  for (const factIssue of buildFactVerificationIssues(unit.content ?? '', citations, sources)) {
    addIssue(issues, unit, factIssue.severity, factIssue.code, factIssue.message);
  }

  const coverageIds = new Set(coverage.map((item) => item.objectiveId));
  for (const objective of unit.objectives) {
    if (!coverageIds.has(objective)) {
      addIssue(issues, unit, 'warning', 'unit.objectives.uncovered', `Objective "${objective}" has no lesson/example/assessment evidence.`);
    }
  }
}

function hasTeachingMetadata(unit: SeedUnit): boolean {
  return Boolean(
    unit.sources?.length ||
    unit.objectiveCoverage?.length ||
    unit.quiz?.some((question) => question.objectiveIds?.length || question.misconception || question.rubric) ||
    unit.exercise?.conceptTags?.length ||
    unit.exercise?.commonPitfalls?.length ||
    unit.exercise?.testCases.some((testCase) => testCase.category)
  );
}

function auditProject(unit: SeedUnit, issues: CurriculumAuditIssue[]): void {
  if (unit.type !== 'project') return;

  if (!unit.project) {
    addIssue(
      issues,
      unit,
      'warning',
      'unit.project.missingSpec',
      'Project unit has no ProjectSpec.',
      'Run fc start or fc generate-all so PROJECT.md can be rendered.'
    );
    return;
  }

  if (unit.project.deliverables.length < 2) {
    addIssue(issues, unit, 'warning', 'unit.project.deliverables.tooFew', 'Project needs at least 2 deliverables.');
  }

  if (unit.project.milestones.length < 3) {
    addIssue(issues, unit, 'warning', 'unit.project.milestones.tooFew', 'Project needs at least 3 milestones.');
  }

  for (const milestone of unit.project.milestones) {
    if (milestone.learnerTasks.length === 0 || milestone.acceptanceCriteria.length === 0) {
      addIssue(
        issues,
        unit,
        'warning',
        'unit.project.milestone.incomplete',
        `Project milestone "${milestone.id}" needs learnerTasks and acceptanceCriteria.`
      );
    }
    if (hasTeachingMetadata(unit) && (!milestone.objectiveIds?.length || !milestone.checkpointQuestions?.length)) {
      addIssue(
        issues,
        unit,
        'warning',
        'unit.project.milestone.learningEvidenceMissing',
        `Project milestone "${milestone.id}" needs objective mappings and checkpoint questions.`
      );
    }
  }

  if (!unit.project.files.some((file) => file.path === 'PROJECT.md')) {
    addIssue(issues, unit, 'warning', 'unit.project.files.noProjectMd', 'Project files should include PROJECT.md.');
  }

  if (unit.project.rubric.length < 3) {
    addIssue(issues, unit, 'warning', 'unit.project.rubric.tooFew', 'Project needs at least 3 rubric items.');
  }
}

function auditRemediation(
  unit: SeedUnit,
  unitIds: Set<string>,
  issues: CurriculumAuditIssue[]
): void {
  if (unit.type !== 'remediation') return;

  if (!unit.remediationForUnitId) {
    addIssue(
      issues,
      unit,
      'error',
      'unit.remediation.missingParent',
      'Remediation unit must specify remediationForUnitId.'
    );
    return;
  }

  if (!unitIds.has(unit.remediationForUnitId)) {
    addIssue(
      issues,
      unit,
      'error',
      'unit.remediation.unknownParent',
      `Remediation parent "${unit.remediationForUnitId}" does not exist.`
    );
  }

  if (unit.nextIfPassed !== unit.remediationForUnitId) {
    addIssue(
      issues,
      unit,
      'warning',
      'unit.remediation.nextIfPassedNotParent',
      'Remediation should route back to the original unit when passed.',
      `Set nextIfPassed to "${unit.remediationForUnitId}".`
    );
  }
}

function addIssue(
  issues: CurriculumAuditIssue[],
  unit: SeedUnit,
  severity: CurriculumAuditSeverity,
  code: string,
  message: string,
  suggestion?: string
): void {
  issues.push({
    severity,
    code,
    message,
    unitId: unit.id,
    suggestion,
  });
}

function normalizeQuizText(value: string): string {
  return value.trim().replace(/[.)。]/g, '').toLowerCase();
}
