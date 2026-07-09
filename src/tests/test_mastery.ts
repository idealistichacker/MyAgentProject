import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMasteryReport } from '../curriculum/mastery.js';
import type { LearningPlan, LearningState } from '../types.js';

test('buildMasteryReport computes overall score and status correctly', () => {
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
        title: 'Unit 1',
        description: 'desc',
        prerequisites: [],
        objectives: ['skillA'],
        passCriteria: { quizMinScore: 1, exerciseMustPass: true },
      },
    ],
    currentIndex: 0,
    createdAt: '',
    updatedAt: '',
  };

  const state: LearningState = {
    planId: 'plan1',
    planCreatedAt: '',
    planUpdatedAt: '',
    startedAt: '',
    lastUpdatedAt: '',
    completedUnitIds: [],
    skippedUnitIds: [],
    assessments: [
      {
        unitId: 'u1',
        assessmentType: 'code+quiz',
        passed: true,
        score: 5,
        maxScore: 5,
        testResults: [],
        quizResults: [],
        mistakeTypes: [],
        diagnosis: '',
        nextAction: '',
        createdAt: '2023-01-01T00:00:00Z',
      },
    ],
    attempts: {
      u1: { count: 1, lastAttemptAt: '' },
    },
    metrics: { totalStudyTimeMinutes: 0 },
  };

  const report = buildMasteryReport(plan, state);
  assert.equal(report.units.length, 1);
  assert.equal(report.units[0].status, 'mastered'); // Score will be 100
  assert.equal(report.overallScore, 100);
});
