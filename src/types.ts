import { z } from 'zod';

export const providerConfigSchema = z.object({
  provider: z.enum(['openai-compatible']).default('openai-compatible'),
  baseUrl: z.string().url().default('https://api.openai.com/v1'),
  model: z.string().default('gpt-4o-mini'),
  apiKey: z.string().default(''),
  temperature: z.number().min(0).max(2).default(0.2),
});

export type ProviderConfig = z.infer<typeof providerConfigSchema>;

export const learnerProfileSchema = z.object({
  target: z.string().default('数据结构与算法入门'),
  jsLevel: z.enum(['zero', 'basic', 'small-projects', 'comfortable']).default('basic'),
  dsaLevel: z.enum(['none', 'heard', 'some-practice', 'systematic']).default('none'),
  weeklyHours: z.enum(['<2', '2-5', '5-10', '10+']).default('2-5'),
  learningStyle: z.enum(['explain-first', 'example-first', 'practice-first', 'project-first']).default('example-first'),
  codePractice: z.enum(['yes', 'sometimes', 'no']).default('yes'),
  pace: z.enum(['fast', 'normal', 'steady']).default('normal'),
  nearTermGoal: z.string().default(''),
  rawAnswers: z.record(z.string()).default({}),
  summary: z.string().default(''),
  createdAt: z.string().datetime().optional(),
});

export type LearnerProfile = z.infer<typeof learnerProfileSchema>;

export const quizQuestionSchema = z.object({
  id: z.string(),
  type: z.enum(['choice', 'short-answer']).default('choice'),
  question: z.string(),
  options: z.array(z.string()).optional(),
  answer: z.string(),
  explanation: z.string().default(''),
});

export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

export const exerciseSchema = z.object({
  id: z.string(),
  type: z.literal('typescript').default('typescript'),
  functionName: z.string(),
  description: z.string(),
  starterCode: z.string(),
  assertionMode: z.enum(['return', 'mutate-and-return']).default('return'),
  testCases: z.array(
    z.object({
      name: z.string(),
      input: z.array(z.unknown()),
      expected: z.unknown(),
      explanation: z.string().optional(),
    })
  ),
  hints: z.array(z.string()).default([]),
});

export type ExerciseSpec = z.infer<typeof exerciseSchema>;

export const seedUnitSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  prerequisites: z.array(z.string()).default([]),
  objectives: z.array(z.string()).default([]),
  content: z.string(),
  references: z.array(z.string()).default([]),
  quiz: z.array(quizQuestionSchema).default([]),
  exercise: exerciseSchema,
  passCriteria: z.object({
    quizMinScore: z.number().int().min(0).default(2),
    exerciseMustPass: z.boolean().default(true),
  }).default({ quizMinScore: 2, exerciseMustPass: true }),
  nextIfPassed: z.string().optional(),
  nextIfFailed: z.string().optional(),
});

export type SeedUnit = z.infer<typeof seedUnitSchema>;

export const planSchema = z.object({
  learnerProfile: learnerProfileSchema,
  units: z.array(seedUnitSchema),
  currentIndex: z.number().int().min(0).default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type LearningPlan = z.infer<typeof planSchema>;

export const testResultSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  message: z.string().optional(),
  expected: z.unknown().optional(),
  actual: z.unknown().optional(),
});

export type TestResult = z.infer<typeof testResultSchema>;

export const assessmentSchema = z.object({
  id: z.string().optional(),
  unitId: z.string(),
  assessmentType: z.literal('code+quiz'),
  passed: z.boolean(),
  score: z.number().int().min(0).max(5),
  maxScore: z.number().int().default(5),
  testResults: z.array(testResultSchema),
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

export type AssessmentResult = z.infer<typeof assessmentSchema>;

export const stateSchema = z.object({
  currentUnitId: z.string(),
  completedUnitIds: z.array(z.string()).default([]),
  attempts: z.record(
    z.object({
      count: z.number().int().min(0),
      lastSubmittedAt: z.string().datetime().optional(),
    })
  ).default({}),
  assessments: z.array(assessmentSchema).default([]),
  lastAssessmentId: z.string().optional(),
  updatedAt: z.string().datetime(),
});

export type LearningState = z.infer<typeof stateSchema>;
