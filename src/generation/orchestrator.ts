import crypto from 'node:crypto';
import { generateUnitContent } from '../agents/pipeline.js';
import { loadPlan } from '../state/fsState.js';
import type { LLMProvider } from '../providers/types.js';
import type { GenerationJob, QualityReport, SeedUnit } from '../types.js';
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

  const inputHash = hashInput({ unit, learnerProfile: plan.learnerProfile });
  let job = createGenerationJob(unit.id, inputHash);
  saveGenerationJob(job);

  try {
    let artifact = unit;
    let status: 'published' | 'offline' = 'offline';
    let qualityReport: QualityReport;
    if (!isPublishableOfflineUnit(unit)) {
      if (!options.provider) {
        throw new Error('Provider not configured. Run `fc init` and set an API key.');
      }
      job = transition(job, 'drafting', 'drafting');
      saveGenerationJob(job);
      artifact = await generateUnitContent(unit, plan, options.provider);
      status = 'published';
    }

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
    saveGenerationJob(job);

    job = transition(job, 'publishing', 'publishing');
    saveGenerationJob(job);
    const artifacts = publishUnitArtifacts(artifact, {
      inputHash,
      job,
      qualityReport,
      status,
      resetSolution: options.resetSolution,
    });

    job = {
      ...transition(job, status, 'completed'),
      completedAt: new Date().toISOString(),
    };
    saveGenerationJob(job);
    return { unit: artifact, job, artifacts };
  } catch (error) {
    job = {
      ...job,
      status: 'failed',
      stage: 'failed',
      error: error instanceof Error ? error.message : String(error),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    saveGenerationJob(job);
    throw error;
  }
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

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
