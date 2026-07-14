import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getGenerationInputHash,
  isArtifactManifestReusable,
  shouldGenerateUnit,
} from '../../src/generation/orchestrator.js';
import {
  artifactManifestSchema,
  planSchema,
  type LearningPlan,
  type SeedUnit,
} from '../../src/types.js';

function generatedPlan(unit: SeedUnit): LearningPlan {
  const timestamp = '2026-07-14T00:00:00.000Z';
  return planSchema.parse({
    learnerProfile: {
      target: 'Learn Rust web backend development',
      programmingLevel: 'basic',
      dsaLevel: 'none',
      weeklyHours: '2-5',
      totalWeeks: '9-12',
      learningStyle: 'project-first',
      codePractice: 'yes',
      pace: 'normal',
      nearTermGoal: '',
      rawAnswers: {},
      summary: '',
    },
    units: [unit],
    currentIndex: 0,
    revision: 3,
    origin: 'generated',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

const seedUnit: SeedUnit = {
  id: 'unit-1',
  type: 'unit',
  title: 'Rust ownership fundamentals',
  description: 'Learn ownership and borrowing for backend development.',
  prerequisites: [],
  objectives: ['Explain ownership rules', 'Use immutable references'],
  prerequisiteObjectiveIds: [],
  references: [],
  passCriteria: { quizMinScore: 2, exerciseMustPass: true },
};

test('rejects a published manifest when a reused unit id has new generation inputs', () => {
  const originalPlan = generatedPlan(seedUnit);
  const originalHash = getGenerationInputHash(originalPlan, seedUnit);
  const manifest = artifactManifestSchema.parse({
    schemaVersion: 1,
    unitId: seedUnit.id,
    status: 'published',
    inputHash: originalHash,
    updatedAt: '2026-07-14T00:00:00.000Z',
    files: [],
  });

  const publishedUnit: SeedUnit = {
    ...seedUnit,
    content: '# Generated lesson',
    references: ['https://doc.rust-lang.org/book/'],
    quiz: [{
      id: 'q1',
      type: 'short-answer',
      question: 'State one ownership rule.',
      answer: 'Each value has one owner.',
      explanation: 'Ownership determines when values are dropped.',
      objectiveIds: ['Explain ownership rules'],
    }],
  };
  const publishedPlan = generatedPlan(publishedUnit);
  assert.equal(getGenerationInputHash(publishedPlan, publishedUnit), originalHash);
  assert.equal(isArtifactManifestReusable(manifest, publishedPlan, publishedUnit), true);
  assert.equal(shouldGenerateUnit(manifest, publishedPlan, publishedUnit), false);
  assert.equal(shouldGenerateUnit(manifest, publishedPlan, publishedUnit, { contentOnly: true }), true);

  const replacementUnit = {
    ...seedUnit,
    title: 'Python files and JSON',
    objectives: ['Read and write JSON files'],
  };
  const replacementPlan = generatedPlan(replacementUnit);
  assert.equal(isArtifactManifestReusable(manifest, replacementPlan, replacementUnit), false);
});
