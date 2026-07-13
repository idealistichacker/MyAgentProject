import type { SeedUnit } from '../types.js';

export interface KnowledgeGraphNode {
  id: string;
  unitId: string;
  objective: string;
  unitIndex: number;
}

export interface KnowledgeGraphEdge {
  from: string;
  to: string;
}

export interface KnowledgeGraphIssue {
  code: string;
  message: string;
  unitId?: string;
  severity: 'error' | 'warning';
}

export interface KnowledgeGraphAnalysis {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  issues: KnowledgeGraphIssue[];
}

export class KnowledgeGraphError extends Error {
  constructor(public readonly issues: KnowledgeGraphIssue[]) {
    super(issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n'));
    this.name = 'KnowledgeGraphError';
  }
}

export function analyzeKnowledgeGraph(units: SeedUnit[], strict = true): KnowledgeGraphAnalysis {
  const nodes: KnowledgeGraphNode[] = [];
  const edges: KnowledgeGraphEdge[] = [];
  const issues: KnowledgeGraphIssue[] = [];
  const objectiveOwners = new Map<string, KnowledgeGraphNode[]>();

  units.forEach((unit, unitIndex) => {
    const localObjectives = new Set<string>();
    for (const objective of unit.objectives) {
      if (localObjectives.has(objective)) {
        issues.push(error('knowledge.objective.duplicateInUnit', `Objective "${objective}" is duplicated in unit "${unit.id}".`, unit.id));
        continue;
      }
      localObjectives.add(objective);
      const node = { id: `${unit.id}::${objective}`, unitId: unit.id, objective, unitIndex };
      nodes.push(node);
      objectiveOwners.set(objective, [...(objectiveOwners.get(objective) ?? []), node]);
    }
  });

  for (const [objective, owners] of objectiveOwners) {
    if (owners.length > 1) {
      issues.push(error(
        'knowledge.objective.ambiguous',
        `Objective "${objective}" is declared by multiple units (${owners.map((owner) => owner.unitId).join(', ')}).`,
        owners[1]?.unitId
      ));
    }
  }

  units.forEach((unit, unitIndex) => {
    const declaredPrerequisites = unit.prerequisiteObjectiveIds ?? [];
    const prerequisites = [...new Set(declaredPrerequisites)];
    if (prerequisites.length !== declaredPrerequisites.length) {
      issues.push(error('knowledge.prerequisite.duplicate', `Unit "${unit.id}" repeats prerequisite objectives.`, unit.id));
    }
    if (strict && unitIndex > 0 && unit.type !== 'remediation' && prerequisites.length === 0) {
      issues.push(error('knowledge.prerequisite.missing', `Unit "${unit.id}" has no prerequisite objective path.`, unit.id));
    }

    const priorUnitIds = new Set<string>();
    for (const prerequisite of prerequisites) {
      const owners = objectiveOwners.get(prerequisite) ?? [];
      const earlierOwners = owners.filter((owner) => owner.unitIndex < unitIndex);
      if (earlierOwners.length !== 1) {
        const hasLaterOwner = owners.some((owner) => owner.unitIndex >= unitIndex);
        issues.push(error(
          hasLaterOwner ? 'knowledge.prerequisite.forwardReference' : 'knowledge.prerequisite.unknown',
          `Unit "${unit.id}" prerequisite "${prerequisite}" must resolve to exactly one earlier objective.`,
          unit.id
        ));
        continue;
      }
      const owner = earlierOwners[0]!;
      priorUnitIds.add(owner.unitId);
      for (const objective of unit.objectives) {
        edges.push({ from: owner.id, to: `${unit.id}::${objective}` });
      }
    }

    if (unit.type === 'project' && strict && unitIndex >= 2 && priorUnitIds.size < 2) {
      issues.push(error(
        'knowledge.project.insufficientSynthesis',
        `Project "${unit.id}" must integrate objectives from at least two preceding units.`,
        unit.id
      ));
    }

    issues.push(...analyzeProjectObjectiveUsage(unit));
  });

  return { nodes, edges, issues };
}

export function analyzeProjectObjectiveUsage(unit: SeedUnit): KnowledgeGraphIssue[] {
  if (unit.type !== 'project' || !unit.project) return [];
  const issues: KnowledgeGraphIssue[] = [];
  const prerequisites = [...new Set(unit.prerequisiteObjectiveIds ?? [])];
  const milestoneObjectives = new Set(unit.project.milestones.flatMap((milestone) => milestone.objectiveIds ?? []));
  for (const objective of milestoneObjectives) {
    if (!prerequisites.includes(objective)) {
      issues.push(error(
        'knowledge.project.milestoneUnknownObjective',
        `Project milestone references objective "${objective}" that is not declared as a project prerequisite.`,
        unit.id
      ));
    }
  }
  for (const prerequisite of prerequisites) {
    if (!milestoneObjectives.has(prerequisite)) {
      issues.push(error(
        'knowledge.project.prerequisiteUnused',
        `Project prerequisite objective "${prerequisite}" is not used by any milestone.`,
        unit.id
      ));
    }
  }
  return issues;
}

export function assertKnowledgeGraph(units: SeedUnit[]): void {
  const analysis = analyzeKnowledgeGraph(units, true);
  if (analysis.issues.some((issue) => issue.severity === 'error')) {
    throw new KnowledgeGraphError(analysis.issues);
  }
}

function error(code: string, message: string, unitId?: string): KnowledgeGraphIssue {
  return { code, message, unitId, severity: 'error' };
}
