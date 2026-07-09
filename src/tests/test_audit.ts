import test from 'node:test';
import assert from 'node:assert/strict';
import { auditLearningPlan } from '../curriculum/audit.js';
import type { LearningPlan, SeedUnit } from '../types.js';

test('auditLearningPlan reports errors for empty plan', () => {
  const plan: LearningPlan = {
    learnerProfile: {
      target: 'Test',
      programmingLevel: 'beginner',
      dsaLevel: 'beginner',
      weeklyHours: '5-10',
      totalWeeks: '1-4',
      learningStyle: 'visual',
      codePractice: 'medium',
      pace: 'standard',
      nearTermGoal: 'N/A',
      createdAt: '',
    },
    units: [],
    currentIndex: 0,
    createdAt: '',
    updatedAt: '',
  };

  const report = auditLearningPlan(plan);
  assert.equal(report.passed, false);
  assert.ok(report.issues.some((i) => i.code === 'plan.empty'));
});

test('auditLearningPlan detects empty unit title', () => {
  const plan: LearningPlan = {
    learnerProfile: {
      target: 'Test',
      programmingLevel: 'beginner',
      dsaLevel: 'beginner',
      weeklyHours: '5-10',
      totalWeeks: '1-4',
      learningStyle: 'visual',
      codePractice: 'medium',
      pace: 'standard',
      nearTermGoal: 'N/A',
      createdAt: '',
    },
    units: [
      {
        id: 'u1',
        type: 'unit',
        title: ' ',
        description: 'desc',
        prerequisites: [],
        objectives: ['obj'],
        passCriteria: { quizMinScore: 1, exerciseMustPass: true },
      },
    ],
    currentIndex: 0,
    createdAt: '',
    updatedAt: '',
  };

  const report = auditLearningPlan(plan);
  assert.equal(report.passed, false);
  assert.ok(report.issues.some((i) => i.code === 'unit.title.empty'));
});
