import { loadPlan, withFileLock, writeJson } from './fsState.js';
import { planSchema, type LearningPlan } from '../types.js';
import { getPlanPath, getPublicationLockPath } from '../utils/paths.js';

export class PlanConflictError extends Error {
  constructor(expectedRevision: number, actualRevision: number) {
    super(`Learning plan revision conflict: expected ${expectedRevision}, found ${actualRevision}. Reload and retry.`);
    this.name = 'PlanConflictError';
  }
}

export function replacePlan(plan: LearningPlan): LearningPlan {
  return withFileLock(getPublicationLockPath(), () => {
    const current = loadPlan();
    const next = planSchema.parse({
      ...plan,
      revision: current ? current.revision + 1 : 0,
      updatedAt: new Date().toISOString(),
    });
    writeJson(getPlanPath(), next);
    return next;
  });
}

export function updatePlan(
  expectedRevision: number,
  mutation: (draft: LearningPlan) => void | LearningPlan
): LearningPlan {
  return withFileLock(getPublicationLockPath(), () => {
    const current = loadPlan();
    if (!current) {
      throw new Error('Cannot update a missing learning plan.');
    }
    if (current.revision !== expectedRevision) {
      throw new PlanConflictError(expectedRevision, current.revision);
    }
    return commitPlanUpdate(current, mutation);
  });
}

export function commitPlanUpdate(
  current: LearningPlan,
  mutation: (draft: LearningPlan) => void | LearningPlan
): LearningPlan {
  const next = preparePlanUpdate(current, mutation);
  return commitPreparedPlan(current, next);
}

export function preparePlanUpdate(
  current: LearningPlan,
  mutation: (draft: LearningPlan) => void | LearningPlan,
  updatedAt = new Date().toISOString()
): LearningPlan {
  const draft = structuredClone(current);
  const result = mutation(draft) ?? draft;
  return planSchema.parse({
    ...result,
    revision: current.revision + 1,
    updatedAt,
  });
}

export function commitPreparedPlan(current: LearningPlan, next: LearningPlan): LearningPlan {
  if (next.revision !== current.revision + 1) {
    throw new Error(`Prepared learning plan revision must be ${current.revision + 1}, received ${next.revision}.`);
  }
  writeJson(getPlanPath(), next);
  return next;
}
