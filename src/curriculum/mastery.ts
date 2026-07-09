import type { AssessmentResult, LearningPlan, LearningState, SeedUnit } from '../types.js';

export type MasteryStatus = 'mastered' | 'progressing' | 'needs-practice' | 'not-started';

export interface SkillMastery {
  skill: string;
  score: number;
  status: MasteryStatus;
  unitIds: string[];
  evidence: string[];
  mistakeTypes: string[];
}

export interface UnitMastery {
  unitId: string;
  title: string;
  type: SeedUnit['type'];
  score: number;
  status: MasteryStatus;
  attempts: number;
  latestAssessment?: {
    passed: boolean;
    score: number;
    mistakeTypes: string[];
    createdAt: string;
  };
}

export interface MasteryReport {
  overallScore: number;
  status: MasteryStatus;
  summary: {
    totalUnits: number;
    completedUnits: number;
    skippedUnits: number;
    attemptedUnits: number;
    masteredSkills: number;
    needsPracticeSkills: number;
  };
  skills: SkillMastery[];
  units: UnitMastery[];
  recommendations: string[];
}

export function buildMasteryReport(plan: LearningPlan, state?: LearningState): MasteryReport {
  const assessmentsByUnit = groupAssessmentsByUnit(state?.assessments ?? []);
  const skillBuckets = new Map<string, {
    scores: number[];
    unitIds: Set<string>;
    evidence: string[];
    mistakeTypes: Set<string>;
  }>();

  const units = plan.units.map((unit) => {
    const latestAssessment = assessmentsByUnit.get(unit.id)?.at(-1);
    const attempts = state?.attempts[unit.id]?.count ?? assessmentsByUnit.get(unit.id)?.length ?? 0;
    const completed = Boolean(state?.completedUnitIds.includes(unit.id));
    const skipped = Boolean(state?.skippedUnitIds.includes(unit.id));
    const unitScore = scoreUnit(unit, latestAssessment, attempts, completed, skipped);
    const status = statusForScore(unitScore, attempts, completed, skipped, latestAssessment);
    const unitMastery: UnitMastery = {
      unitId: unit.id,
      title: unit.title,
      type: unit.type,
      score: unitScore,
      status,
      attempts,
      latestAssessment: latestAssessment
        ? {
            passed: latestAssessment.passed,
            score: latestAssessment.score,
            mistakeTypes: latestAssessment.mistakeTypes,
            createdAt: latestAssessment.createdAt,
          }
        : undefined,
    };

    const skills = unit.objectives.length > 0 ? unit.objectives : [unit.title];
    for (const skill of skills) {
      const bucket = skillBuckets.get(skill) ?? {
        scores: [],
        unitIds: new Set<string>(),
        evidence: [],
        mistakeTypes: new Set<string>(),
      };
      bucket.scores.push(unitScore);
      bucket.unitIds.add(unit.id);
      bucket.evidence.push(buildEvidence(unit, unitMastery, latestAssessment));
      for (const mistake of latestAssessment?.mistakeTypes ?? []) {
        bucket.mistakeTypes.add(mistake);
      }
      skillBuckets.set(skill, bucket);
    }

    return unitMastery;
  });

  const skills = [...skillBuckets.entries()]
    .map(([skill, bucket]) => {
      const score = round(avg(bucket.scores));
      return {
        skill,
        score,
        status: statusForSkill(score, bucket.scores),
        unitIds: [...bucket.unitIds],
        evidence: bucket.evidence,
        mistakeTypes: [...bucket.mistakeTypes],
      };
    })
    .sort((a, b) => a.score - b.score || a.skill.localeCompare(b.skill));

  const overallScore = round(units.length > 0 ? avg(units.map((unit) => unit.score)) : 0);
  const recommendations = buildRecommendations(plan, state, units, skills);

  return {
    overallScore,
    status: statusForOverall(overallScore, units),
    summary: {
      totalUnits: plan.units.length,
      completedUnits: state?.completedUnitIds.length ?? 0,
      skippedUnits: state?.skippedUnitIds.length ?? 0,
      attemptedUnits: units.filter((unit) => unit.attempts > 0).length,
      masteredSkills: skills.filter((skill) => skill.status === 'mastered').length,
      needsPracticeSkills: skills.filter((skill) => skill.status === 'needs-practice').length,
    },
    skills,
    units,
    recommendations,
  };
}

function groupAssessmentsByUnit(assessments: AssessmentResult[]): Map<string, AssessmentResult[]> {
  const byUnit = new Map<string, AssessmentResult[]>();
  for (const assessment of assessments) {
    const list = byUnit.get(assessment.unitId) ?? [];
    list.push(assessment);
    byUnit.set(assessment.unitId, list);
  }

  for (const list of byUnit.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  return byUnit;
}

function scoreUnit(
  unit: SeedUnit,
  latestAssessment: AssessmentResult | undefined,
  attempts: number,
  completed: boolean,
  skipped: boolean
): number {
  if (completed) {
    const assessmentScore = latestAssessment ? latestAssessment.score * 20 : 90;
    return clamp(Math.max(80, assessmentScore));
  }

  if (skipped) {
    return 25;
  }

  if (!latestAssessment) {
    return unit.type === 'remediation' ? 15 : 0;
  }

  const attemptPenalty = Math.min(18, Math.max(0, attempts - 1) * 4);
  const failedPenalty = latestAssessment.passed ? 0 : 12;
  return clamp(latestAssessment.score * 20 - attemptPenalty - failedPenalty);
}

function statusForScore(
  score: number,
  attempts: number,
  completed: boolean,
  skipped: boolean,
  latestAssessment?: AssessmentResult
): MasteryStatus {
  if (completed || score >= 80) return 'mastered';
  if (skipped || latestAssessment?.passed === false) return 'needs-practice';
  if (attempts > 0 || score >= 45) return 'progressing';
  return 'not-started';
}

function statusForSkill(score: number, rawScores: number[]): MasteryStatus {
  if (score >= 80) return 'mastered';
  if (rawScores.some((value) => value > 0) && score >= 45) return 'progressing';
  if (rawScores.some((value) => value > 0)) return 'needs-practice';
  return 'not-started';
}

function statusForOverall(score: number, units: UnitMastery[]): MasteryStatus {
  if (score >= 80) return 'mastered';
  if (units.some((unit) => unit.status === 'needs-practice')) return 'needs-practice';
  if (units.some((unit) => unit.status === 'progressing' || unit.status === 'mastered')) return 'progressing';
  return 'not-started';
}

function buildEvidence(
  unit: SeedUnit,
  mastery: UnitMastery,
  latestAssessment?: AssessmentResult
): string {
  if (!latestAssessment) {
    return `${unit.title}: not attempted yet`;
  }

  const result = latestAssessment.passed ? 'passed' : 'not passed';
  const mistakes = latestAssessment.mistakeTypes.length
    ? `; mistakes: ${latestAssessment.mistakeTypes.join(', ')}`
    : '';
  return `${unit.title}: ${result}, score ${latestAssessment.score}/5 after ${mastery.attempts} attempt(s)${mistakes}`;
}

function buildRecommendations(
  plan: LearningPlan,
  state: LearningState | undefined,
  units: UnitMastery[],
  skills: SkillMastery[]
): string[] {
  const recommendations: string[] = [];
  const currentUnit = plan.units[plan.currentIndex];
  const currentUnitMastery = currentUnit ? units.find((unit) => unit.unitId === currentUnit.id) : undefined;

  if (currentUnit && currentUnitMastery?.status !== 'mastered') {
    recommendations.push(`Continue with ${currentUnit.id}: ${currentUnit.title}.`);
  }

  const weakestSkills = skills
    .filter((skill) => skill.status === 'needs-practice' || skill.status === 'not-started')
    .slice(0, 3);
  for (const skill of weakestSkills) {
    recommendations.push(`Practice skill: ${skill.skill} (${skill.score}/100).`);
  }

  const skipped = state?.skippedUnitIds ?? [];
  if (skipped.length > 0) {
    recommendations.push(`Review skipped unit(s): ${skipped.slice(0, 3).join(', ')}.`);
  }

  const currentRemediation = currentUnit?.type === 'remediation' ? currentUnit : undefined;
  if (currentRemediation?.remediationForUnitId) {
    recommendations.push(`After passing this remediation, return to ${currentRemediation.remediationForUnitId}.`);
  }

  if (recommendations.length === 0) {
    recommendations.push('Keep going: run fc start for the next unit or fc generate-all to prepare offline materials.');
  }

  return [...new Set(recommendations)].slice(0, 5);
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, round(value)));
}
