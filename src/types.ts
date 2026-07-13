import { z } from 'zod';

export const providerConfigSchema = z.object({
  provider: z.enum(['openai-compatible']).default('openai-compatible'),
  baseUrl: z.string().url().default('https://api.openai.com/v1'),
  model: z.string().default('gpt-4o-mini'),
  apiKey: z.string().default(''),
  temperature: z.number().min(0).max(2).default(0.2),
  searchProvider: z.enum(['wikipedia', 'tavily']).default('wikipedia'),
  tavilyApiKey: z.string().optional(),
});

export type ProviderConfig = z.infer<typeof providerConfigSchema>;

export const learnerProfileSchema = z.object({
  target: z.string().default('数据结构与算法入门'),
  programmingLevel: z.enum(['zero', 'basic', 'small-projects', 'comfortable']).default('basic'),
  dsaLevel: z.enum(['none', 'heard', 'some-practice', 'systematic']).default('none'),
  weeklyHours: z.enum(['<2', '2-5', '5-10', '10+']).default('2-5'),
  totalWeeks: z.enum(['1-4', '5-8', '9-12', '12+']).default('5-8'),
  learningStyle: z.enum(['explain-first', 'example-first', 'practice-first', 'project-first']).default('example-first'),
  codePractice: z.enum(['yes', 'sometimes', 'no']).default('yes'),
  pace: z.enum(['fast', 'normal', 'steady']).default('normal'),
  nearTermGoal: z.string().default(''),
  rawAnswers: z.record(z.string()).default({}),
  summary: z.string().default(''),
  createdAt: z.string().datetime().optional(),
});

export type LearnerProfile = z.infer<typeof learnerProfileSchema>;

export const distractorRationaleSchema = z.object({
  option: z.string().min(1),
  misconception: z.string().min(1),
  feedback: z.string().min(1),
});

export type DistractorRationale = z.infer<typeof distractorRationaleSchema>;

export const quizQuestionSchema = z.object({
  id: z.string(),
  type: z.enum(['choice', 'short-answer']).default('choice'),
  question: z.string(),
  options: z.array(z.string()).optional(),
  answer: z.string(),
  explanation: z.string().default(''),
  objectiveIds: z.array(z.string()).optional(),
  misconception: z.string().optional(),
  rubric: z.string().optional(),
  distractorRationales: z.array(distractorRationaleSchema).optional(),
});

export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

export const exerciseSchema = z.object({
  id: z.string(),
  language: z.string().default('typescript'),
  entrypoint: z.string(),
  description: z.string(),
  starterCode: z.string(),
  testCode: z.string().optional(),
  assertionMode: z.enum(['return', 'mutate-and-return', 'stdout']).default('return'),
  testCases: z.array(
    z.object({
      name: z.string(),
      category: z.enum(['normal', 'edge', 'misconception']).optional(),
      input: z.array(z.unknown()),
      expected: z.unknown(),
      explanation: z.string().optional(),
    })
  ),
  hints: z.array(z.string()).default([]),
  difficulty: z.enum(['introductory', 'practice', 'challenge']).optional(),
  conceptTags: z.array(z.string()).optional(),
  commonPitfalls: z.array(z.string()).optional(),
  estimatedMinutes: z.number().int().min(1).max(240).optional(),
});

export type ExerciseSpec = z.infer<typeof exerciseSchema>;

export const projectMilestoneSchema = z.object({
  id: z.string(),
  title: z.string(),
  goal: z.string(),
  learnerTasks: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).default([]),
  objectiveIds: z.array(z.string()).optional(),
  checkpointQuestions: z.array(z.string()).optional(),
});

export type ProjectMilestone = z.infer<typeof projectMilestoneSchema>;

export const projectFileSchema = z.object({
  path: z.string(),
  purpose: z.string(),
  required: z.boolean().default(true),
});

export type ProjectFile = z.infer<typeof projectFileSchema>;

export const projectRubricItemSchema = z.object({
  criterion: z.string(),
  points: z.number().int().min(1).max(10),
  evidence: z.string(),
});

export type ProjectRubricItem = z.infer<typeof projectRubricItemSchema>;

export const projectSpecSchema = z.object({
  id: z.string(),
  title: z.string(),
  narrative: z.string(),
  drivingQuestion: z.string(),
  deliverables: z.array(z.string()).default([]),
  milestones: z.array(projectMilestoneSchema).default([]),
  files: z.array(projectFileSchema).default([]),
  rubric: z.array(projectRubricItemSchema).default([]),
  extensionIdeas: z.array(z.string()).default([]),
});

export type ProjectSpec = z.infer<typeof projectSpecSchema>;

export const sourceSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  title: z.string(),
  publisher: z.string(),
  retrievedAt: z.string().datetime(),
  hash: z.string(),
  trust: z.enum(['primary', 'secondary', 'background']),
  freshness: z.enum(['fresh', 'stale']).optional(),
  excerpt: z.string(),
});

export type Source = z.infer<typeof sourceSchema>;

export const objectiveCoverageSchema = z.object({
  objectiveId: z.string(),
  lessonEvidence: z.string().min(1),
  exampleEvidence: z.string().min(1),
  assessmentIds: z.array(z.string()).min(1),
});

export type ObjectiveCoverage = z.infer<typeof objectiveCoverageSchema>;

export const citationSchema = z.object({
  sourceId: z.string(),
  claim: z.string().min(1),
});

export type Citation = z.infer<typeof citationSchema>;

export const seedUnitSchema = z.object({
  id: z.string(),
  type: z.enum(['unit', 'project', 'remediation']).default('unit'),
  title: z.string(),
  description: z.string(),
  prerequisites: z.array(z.string()).default([]),
  objectives: z.array(z.string()).default([]),
  prerequisiteObjectiveIds: z.array(z.string()).optional(),
  content: z.string().optional(),
  references: z.array(z.string()).default([]),
  sources: z.array(sourceSchema).optional(),
  citations: z.array(citationSchema).optional(),
  objectiveCoverage: z.array(objectiveCoverageSchema).optional(),
  quiz: z.array(quizQuestionSchema).optional(),
  exercise: exerciseSchema.optional(),
  project: projectSpecSchema.optional(),
  passCriteria: z.object({
    quizMinScore: z.number().int().min(0).default(2),
    exerciseMustPass: z.boolean().default(true),
  }).default({ quizMinScore: 2, exerciseMustPass: true }),
  remediationForUnitId: z.string().optional(),
  nextIfPassed: z.string().optional(),
  nextIfFailed: z.string().optional(),
});

export type SeedUnit = z.infer<typeof seedUnitSchema>;

export const planSchema = z.object({
  learnerProfile: learnerProfileSchema,
  units: z.array(seedUnitSchema),
  currentIndex: z.number().int().min(0).default(0),
  revision: z.number().int().min(0).default(0),
  origin: z.enum(['generated', 'offline']).default('offline'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type LearningPlan = z.infer<typeof planSchema>;

export const generationStatusSchema = z.enum([
  'planned',
  'retrieving',
  'drafting',
  'reviewing',
  'validating',
  'publishing',
  'published',
  'offline',
  'degraded',
  'failed',
]);

export type GenerationStatus = z.infer<typeof generationStatusSchema>;

export const qualityIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: z.enum(['error', 'warning']),
});

export type QualityIssue = z.infer<typeof qualityIssueSchema>;

export const qualityReportSchema = z.object({
  passed: z.boolean(),
  checks: z.array(z.string()).default([]),
  issues: z.array(qualityIssueSchema).default([]),
  evaluatedAt: z.string().datetime(),
});

export type QualityReport = z.infer<typeof qualityReportSchema>;

export const generationMetricsSchema = z.object({
  totalDurationMs: z.number().int().min(0),
  stages: z.record(z.number().int().min(0)).default({}),
  providerCalls: z.number().int().min(0).default(0),
  providerRetries: z.number().int().min(0).default(0),
  promptTokens: z.number().int().min(0).default(0),
  completionTokens: z.number().int().min(0).default(0),
  totalTokens: z.number().int().min(0).default(0),
  sourceCount: z.number().int().min(0).default(0),
  cacheReuse: z.boolean().default(false),
});

export type GenerationMetrics = z.infer<typeof generationMetricsSchema>;

export const generationCheckpointSchema = z.object({
  stage: z.enum(['draft', 'critique', 'final']),
  cacheKeyHash: z.string(),
  completedAt: z.string().datetime(),
  cacheHit: z.boolean(),
  outcome: z.enum(['completed', 'skipped']).optional(),
  qualityScore: z.number().int().min(0).max(100).optional(),
  reasons: z.array(z.string()).optional(),
});

export type GenerationCheckpoint = z.infer<typeof generationCheckpointSchema>;

export const generationJobSchema = z.object({
  id: z.string(),
  unitId: z.string(),
  status: generationStatusSchema,
  stage: z.string(),
  attempt: z.number().int().min(1),
  parentJobId: z.string().optional(),
  inputHash: z.string(),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  error: z.string().optional(),
  qualityReport: qualityReportSchema.optional(),
  metrics: generationMetricsSchema.optional(),
  checkpoints: z.array(generationCheckpointSchema).default([]),
});

export type GenerationJob = z.infer<typeof generationJobSchema>;

export const artifactFileSchema = z.object({
  path: z.string(),
  hash: z.string(),
  role: z.enum(['lesson', 'starter', 'solution', 'project']),
  protected: z.boolean().default(false),
});

export type ArtifactFile = z.infer<typeof artifactFileSchema>;

export const artifactSourceSchema = sourceSchema.pick({
  id: true,
  url: true,
  publisher: true,
  retrievedAt: true,
  hash: true,
  trust: true,
  freshness: true,
});

export type ArtifactSource = z.infer<typeof artifactSourceSchema>;

export const publicationRecoveryFileSchema = z.object({
  path: z.string().min(1),
  existed: z.boolean(),
  backupPath: z.string().min(1).optional(),
  backupHash: z.string().optional(),
  expectedHash: z.string().optional(),
});
export type PublicationRecoveryFile = z.infer<typeof publicationRecoveryFileSchema>;

export const publicationRecoverySchema = z.object({
  transactionId: z.string().min(1),
  createdAt: z.string().datetime(),
  basePlanRevision: z.number().int().min(0).optional(),
  targetPlanRevision: z.number().int().min(0).optional(),
  files: z.array(publicationRecoveryFileSchema).min(1),
});
export type PublicationRecovery = z.infer<typeof publicationRecoverySchema>;

export const artifactManifestSchema = z.object({
  schemaVersion: z.literal(1),
  unitId: z.string(),
  jobId: z.string().optional(),
  status: z.enum(['publishing', 'published', 'offline', 'degraded', 'failed']),
  inputHash: z.string(),
  publishedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
  qualityReport: qualityReportSchema.optional(),
  sourcePolicyVersion: z.string().optional(),
  sources: z.array(artifactSourceSchema).default([]),
  targetStatus: z.enum(['published', 'offline']).optional(),
  recovery: publicationRecoverySchema.optional(),
  recoveredAt: z.string().datetime().optional(),
  error: z.string().optional(),
  files: z.array(artifactFileSchema).default([]),
});

export type ArtifactManifest = z.infer<typeof artifactManifestSchema>;

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
  skippedUnitIds: z.array(z.string()).default([]),
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
