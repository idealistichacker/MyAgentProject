import { z } from 'zod';
import { getSeedUnit, SEED_CURRICULUM } from '../curriculum/seed.js';
import type {
  AssessmentResult,
  LearnerProfile,
  LearningPlan,
  QuizQuestion,
  SeedUnit,
  TestResult,
} from '../types.js';
import type { LLMProvider } from '../providers/types.js';

const nowIso = () => new Date().toISOString();

export async function diagnoseLearner(
  rawProfile: LearnerProfile,
  provider?: LLMProvider
): Promise<LearnerProfile> {
  if (!provider) {
    return {
      ...rawProfile,
      summary: buildFallbackDiagnosis(rawProfile),
      createdAt: rawProfile.createdAt ?? nowIso(),
    };
  }

  try {
    const prompt = `
You are FCAgent DiagnoseAgent. Summarize the learner profile in Chinese in 3-5 sentences.
Return only the summary text, no JSON.

Profile:
${JSON.stringify(rawProfile, null, 2)}
`.trim();

    const summary = await provider.chat([
      { role: 'system', content: 'You are a concise learning diagnostician.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.2 });

    return {
      ...rawProfile,
      summary: summary.trim(),
      createdAt: rawProfile.createdAt ?? nowIso(),
    };
  } catch {
    return {
      ...rawProfile,
      summary: buildFallbackDiagnosis(rawProfile),
      createdAt: rawProfile.createdAt ?? nowIso(),
    };
  }
}

export function generatePlan(learnerProfile: LearnerProfile): LearningPlan {
  const now = nowIso();
  return {
    learnerProfile,
    units: SEED_CURRICULUM,
    currentIndex: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function getCurrentUnit(plan: LearningPlan, unitId?: string): SeedUnit {
  if (unitId) {
    const unit = getSeedUnit(unitId);
    if (!unit) {
      throw new Error(`Unknown unit id: ${unitId}`);
    }
    return unit;
  }

  const unit = plan.units[plan.currentIndex];
  if (!unit) {
    throw new Error('No current unit in plan.');
  }

  return unit;
}

export function gradeQuiz(
  quiz: QuizQuestion[],
  answers: Record<string, string>
): AssessmentResult['quizResults'] {
  return quiz.map((question) => {
    const actual = answers[question.id]?.trim();
    const expected = question.answer.trim();
    const passed = actual.toLowerCase() === expected.toLowerCase();
    return {
      id: question.id,
      passed,
      answer: actual,
      expected,
    };
  });
}

export function buildAssessment(
  unit: SeedUnit,
  testResults: TestResult[],
  quizResults: AssessmentResult['quizResults'],
  id = `assessment-${unit.id}-${Date.now()}`
): AssessmentResult {
  const exercisePassed = testResults.every((result) => result.passed);
  const quizScore = quizResults.filter((result) => result.passed).length;
  const quizMinScore = unit.passCriteria.quizMinScore;
  const quizPassed = quizScore >= quizMinScore;
  const passed = exercisePassed && quizPassed;

  const mistakeTypes = new Set<string>();

  if (!exercisePassed) {
    const timeoutOrCompile = testResults.some((result) =>
      result.message?.includes('timeout') || result.message?.includes('Command failed')
    );
    if (timeoutOrCompile) {
      mistakeTypes.add('execution-error');
    } else {
      mistakeTypes.add('test-case-failure');
    }
  }

  if (!quizPassed) {
    mistakeTypes.add('concept-gap');
  }

  const score = passed ? 5 : exercisePassed ? Math.max(2, quizScore) : quizPassed ? 3 : 1;

  const diagnosis = buildFallbackAssessmentDiagnosis(unit, testResults, quizResults, score);
  const nextAction = passed
    ? `通过本单元。建议执行 fc next 进入 ${unit.nextIfPassed ?? '下一单元'}。`
    : `未通过本单元。建议先查看错题和测试失败信息，再执行 fc submit ${unit.id} 重新提交。`;

  return {
    unitId: unit.id,
    assessmentType: 'code+quiz',
    passed,
    score,
    maxScore: 5,
    testResults,
    quizResults,
    mistakeTypes: [...mistakeTypes],
    diagnosis,
    nextAction,
    createdAt: nowIso(),
  };
}

export function adaptNextUnit(plan: LearningPlan, assessment: AssessmentResult): { currentIndex: number; reason: string } {
  const unit = getSeedUnit(assessment.unitId);
  if (!unit) {
    return { currentIndex: plan.currentIndex, reason: 'Unknown unit.' };
  }

  if (assessment.passed) {
    const nextIndex = Math.min(plan.units.length - 1, plan.units.findIndex((item) => item.id === unit.id) + 1);
    return {
      currentIndex: nextIndex,
      reason: assessment.passed ? 'Passed current unit.' : 'Need remedial practice.',
    };
  }

  return {
    currentIndex: plan.units.findIndex((item) => item.id === unit.id),
    reason: 'Failed current unit. Stay on this unit for remedial practice.',
  };
}

function buildFallbackDiagnosis(profile: LearnerProfile): string {
  const styleMap: Record<string, string> = {
    'explain-first': '偏讲解型',
    'example-first': '偏示例型',
    'practice-first': '偏练习型',
    'project-first': '偏项目型',
  };

  const paceMap: Record<string, string> = {
    fast: '较快节奏',
    normal: '正常节奏',
    steady: '稳扎稳打节奏',
  };

  return `学习者目标：${profile.target}。当前 TypeScript/JavaScript 水平：${profile.jsLevel}；DSA 水平：${profile.dsaLevel}。每周预计投入 ${profile.weeklyHours} 小时，偏好${styleMap[profile.learningStyle] ?? '混合'}学习，节奏为${paceMap[profile.pace] ?? '正常'}。`;
}

function buildFallbackAssessmentDiagnosis(
  unit: SeedUnit,
  testResults: TestResult[],
  quizResults: AssessmentResult['quizResults'],
  score: number
): string {
  const failedTests = testResults.filter((result) => !result.passed);
  const failedQuizzes = quizResults.filter((result) => !result.passed);

  const parts: string[] = [`本单元《${unit.title}》评分：${score}/5。`];

  if (failedTests.length === 0) {
    parts.push('代码测试全部通过，说明当前实现能覆盖 MVP 测试用例。');
  } else {
    parts.push(`代码测试失败 ${failedTests.length} 个，优先检查：${failedTests.map((item) => item.name).join('、')}。`);
  }

  if (failedQuizzes.length === 0) {
    parts.push('概念小测通过，说明核心概念掌握较稳定。');
  } else {
    parts.push(`概念小测失败 ${failedQuizzes.length} 个，建议回看对应知识点并用自己的话解释错因。`);
  }

  return parts.join('');
}

export const assessmentSchema = z.object({
  id: z.string().optional(),
  unitId: z.string(),
  assessmentType: z.literal('code+quiz'),
  passed: z.boolean(),
  score: z.number().int().min(0).max(5),
  maxScore: z.number().int().default(5),
  testResults: z.array(
    z.object({
      name: z.string(),
      passed: z.boolean(),
      message: z.string().optional(),
      expected: z.unknown().optional(),
      actual: z.unknown().optional(),
    })
  ),
  quizResults: z.array(
    z.object({
      id: z.string(),
      passed: z.boolean(),
      answer: z.string().optional(),
      expected: z.string().optional(),
    })
  ).default([]),
  mistakeTypes: z.array(z.string()).default([]),
  diagnosis: z.string(),
  nextAction: z.string(),
  createdAt: z.string().datetime(),
});
