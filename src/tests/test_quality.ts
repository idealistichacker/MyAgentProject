import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertGeneratedUnitQuality,
  normalizeExerciseLanguage,
} from '../agents/generatedUnitQuality.js';
import type { SeedUnit, QuizQuestion } from '../types.js';

test('normalizeExerciseLanguage correctly normalizes', () => {
  assert.equal(normalizeExerciseLanguage(' ts '), 'typescript');
  assert.equal(normalizeExerciseLanguage('python'), 'python');
  assert.equal(normalizeExerciseLanguage('C++'), 'cpp');
});

test('assertGeneratedUnitQuality passes valid input', () => {
  const unit: SeedUnit = {
    id: 'unit-1',
    type: 'unit',
    title: 'Unit 1',
    description: 'Desc',
    prerequisites: [],
    objectives: [],
    passCriteria: { quizMinScore: 1, exerciseMustPass: true },
  };

  const content = 'a'.repeat(401);
  const quiz: QuizQuestion[] = [
    {
      id: 'q1',
      type: 'choice',
      question: 'Q',
      options: ['A', 'B', 'C'],
      answer: 'B',
    },
  ];
  const exercise = {
    language: 'typescript',
    entrypoint: 'foo',
    starterCode: 'function foo() {}',
    solutionCode: 'function foo() { return 1; }',
    testCases: [
      { name: '1', code: '', expected: '' },
      { name: '2', code: '', expected: '' },
      { name: '3', code: '', expected: '' },
    ],
    hints: ['Hint 1', 'Hint 2'],
    description: 'Desc',
  };

  assert.doesNotThrow(() => {
    assertGeneratedUnitQuality(unit, content, quiz, exercise);
  });
});

test('assertGeneratedUnitQuality throws if content is too short', () => {
  const unit: SeedUnit = {
    id: 'unit-1',
    type: 'unit',
    title: 'Unit 1',
    description: 'Desc',
    prerequisites: [],
    objectives: [],
    passCriteria: { quizMinScore: 1, exerciseMustPass: true },
  };

  const content = 'a'.repeat(100); // Too short
  const exercise = {
    language: 'typescript',
    entrypoint: 'foo',
    starterCode: 'function foo() {}',
    solutionCode: 'function foo() { return 1; }',
    testCases: [
      { name: '1', code: '', expected: '' },
      { name: '2', code: '', expected: '' },
      { name: '3', code: '', expected: '' },
    ],
    hints: ['Hint 1', 'Hint 2'],
    description: 'Desc',
  };

  assert.throws(() => {
    assertGeneratedUnitQuality(unit, content, [], exercise);
  }, /too short/);
});
