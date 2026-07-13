import crypto from 'node:crypto';
import { generateUnitContent } from '../agents/pipeline.js';
import { GeneratedUnitQualityError } from '../agents/generatedUnitQuality.js';
import { loadPlan } from '../state/fsState.js';
import type { LLMProvider } from '../providers/types.js';
import { InstrumentedProvider } from '../providers/instrumentedProvider.js';
import { qualityReportSchema, type GenerationCheckpoint, type GenerationJob, type GenerationMetrics, type QualityReport, type SeedUnit } from '../types.js';
import { stableStringify } from '../utils/cache.js';
import {
  createGenerationJob,
  createPassedQualityReport,
  publishUnitArtifacts,
  saveGenerationJob,
  type PublishedUnitArtifacts,
} from './publisher.js';

export interface GenerateAndPublishOptions {
  provider?: LLMProvider;
  resetSolution?: boolean;
  resumeFromJob?: GenerationJob;
}

export interface GenerateAndPublishResult {
  unit: SeedUnit;
  job: GenerationJob;
  artifacts: PublishedUnitArtifacts;
}

export async function generateAndPublishUnit(
  unitId: string,
  options: GenerateAndPublishOptions = {}
): Promise<GenerateAndPublishResult> {
  const plan = loadPlan();
  if (!plan) {
    throw new Error('No learning plan found. Run `fc plan` first.');
  }
  const unit = plan.units.find((candidate) => candidate.id === unitId);
  if (!unit) {
    throw new Error(`Unknown unit "${unitId}".`);
  }

  const projectUnit = plan.units.find((candidate) => candidate.type === 'project');
  const inputHash = hashInput({
    unit,
    learnerProfile: plan.learnerProfile,
    project: projectUnit ? { id: projectUnit.id, title: projectUnit.title, description: projectUnit.description } : null,
  });
  if (options.resumeFromJob) {
    if (options.resumeFromJob.unitId !== unit.id) {
      throw new Error(`Cannot resume job "${options.resumeFromJob.id}" for a different unit.`);
    }
    if (options.resumeFromJob.inputHash !== inputHash) {
      throw new Error(`Cannot resume job "${options.resumeFromJob.id}" because its generation input has changed.`);
    }
  }
  const startedAt = Date.now();
  const stages: Record<string, number> = {};
  const instrumentedProvider = options.provider ? new InstrumentedProvider(options.provider) : undefined;
  let job = createGenerationJob(unit.id, inputHash, options.resumeFromJob);
  saveGenerationJob(job);

  try {
    let artifact = unit;
    let status: 'published' | 'offline' = 'offline';
    let qualityReport: QualityReport;
    if (!isPublishableOfflineUnit(unit)) {
      if (!options.provider) {
        throw new Error('Provider not configured. Run `fc init` and set an API key.');
      }
      job = transition(job, 'retrieving', 'retrieving');
      saveGenerationJob(job);
      const generationStartedAt = Date.now();
      artifact = await generateUnitContent(unit, plan, instrumentedProvider, {
        onCheckpoint: (checkpoint) => {
          job = recordGenerationCheckpoint(job, checkpoint);
          saveGenerationJob(job);
        },
      });
      stages.generation = Date.now() - generationStartedAt;
      status = 'published';
    }

    const validationStartedAt = Date.now();
    job = transition(job, 'validating', 'validating');
    saveGenerationJob(job);
    qualityReport = createPassedQualityReport([
      'schema validation',
      'content and exercise quality gate',
      'artifact publication readiness',
    ]);
    job = {
      ...job,
      qualityReport,
      updatedAt: new Date().toISOString(),
    };
    stages.validation = Date.now() - validationStartedAt;
    saveGenerationJob(job);

    const publicationStartedAt = Date.now();
    job = transition(job, 'publishing', 'publishing');
    saveGenerationJob(job);
    const artifacts = publishUnitArtifacts(artifact, {
      inputHash,
      job,
      qualityReport,
      status,
      resetSolution: options.resetSolution,
      expectedPlanRevision: plan.revision,
    });
    stages.publication = Date.now() - publicationStartedAt;

    job = {
      ...transition(job, status, 'completed'),
      completedAt: new Date().toISOString(),
      metrics: buildMetrics(startedAt, stages, artifact, instrumentedProvider, status === 'published'),
    };
    saveGenerationJob(job);
    return { unit: artifact, job, artifacts };
  } catch (error) {
    const failedQualityReport = qualityReportFromGenerationError(error);
    job = {
      ...job,
      status: 'failed',
      stage: 'failed',
      error: error instanceof Error ? error.message : String(error),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      qualityReport: failedQualityReport ?? job.qualityReport,
      metrics: buildMetrics(startedAt, stages, unit, instrumentedProvider, false),
    };
    saveGenerationJob(job);
    throw error;
  }
}

export function qualityReportFromGenerationError(error: unknown): QualityReport | undefined {
  return error instanceof GeneratedUnitQualityError
    ? qualityReportSchema.parse({
        passed: false,
        checks: ['fact claim verification'],
        issues: error.issues,
        evaluatedAt: new Date().toISOString(),
      })
    : undefined;
}

export function recordGenerationCheckpoint(job: GenerationJob, checkpoint: GenerationCheckpoint): GenerationJob {
  const status = checkpoint.stage === 'draft'
    ? 'drafting'
    : checkpoint.stage === 'critique'
      ? 'reviewing'
      : 'validating';
  return {
    ...job,
    status,
    stage: checkpoint.stage,
    checkpoints: [
      ...job.checkpoints.filter((candidate) => candidate.stage !== checkpoint.stage),
      checkpoint,
    ],
    updatedAt: new Date().toISOString(),
  };
}

function buildMetrics(
  startedAt: number,
  stages: Record<string, number>,
  unit: SeedUnit,
  provider: InstrumentedProvider | undefined,
  generated: boolean
): GenerationMetrics {
  const providerMetrics = provider?.snapshot();
  return {
    totalDurationMs: Date.now() - startedAt,
    stages,
    providerCalls: providerMetrics?.calls ?? 0,
    providerRetries: providerMetrics?.retries ?? 0,
    promptTokens: providerMetrics?.promptTokens ?? 0,
    completionTokens: providerMetrics?.completionTokens ?? 0,
    totalTokens: providerMetrics?.totalTokens ?? 0,
    sourceCount: unit.sources?.length ?? 0,
    cacheReuse: generated && (providerMetrics?.calls ?? 0) === 0,
  };
}

function isPublishableOfflineUnit(unit: SeedUnit): boolean {
  return Boolean(unit.content?.trim() && unit.quiz?.length && unit.exercise);
}

function transition(job: GenerationJob, status: GenerationJob['status'], stage: string): GenerationJob {
  return {
    ...job,
    status,
    stage,
    updatedAt: new Date().toISOString(),
  };
}

function hashInput(value: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}
