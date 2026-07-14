import assert from 'node:assert/strict';
import test from 'node:test';
import { GeneratedUnitQualityError } from '../../src/agents/generatedUnitQuality.js';
import {
  buildAssessmentRepairPrompt,
  buildCitationRepairPrompt,
  extractCitationClaimCandidates,
  isAssessmentOnlyQualityError,
  isCitationOnlyQualityError,
  mergeAssessmentRepair,
  mergeCitationRepair,
  normalizeAssessmentRepairEvidence,
  retainSupportedCitationClaims,
} from '../../src/agents/unitArtifactRepair.js';
import { parseUnitArtifact, type GeneratedUnitArtifact } from '../../src/agents/structuredOutput.js';

test('routes quiz-only quality failures to the lightweight assessment repair', () => {
  const quizFailure = new GeneratedUnitQualityError([
    { code: 'quiz.objective.unknown', message: 'unknown objective', severity: 'error' },
    { code: 'quiz.choice.distractor.tooSimilar', message: 'similar options', severity: 'error' },
  ]);
  const mixedFailure = new GeneratedUnitQualityError([
    { code: 'quiz.objective.unknown', message: 'unknown objective', severity: 'error' },
    { code: 'fact.unsupported', message: 'unsupported fact', severity: 'error' },
  ]);

  assert.equal(isAssessmentOnlyQualityError(quizFailure), true);
  assert.equal(isAssessmentOnlyQualityError(mixedFailure), false);
  assert.equal(isCitationOnlyQualityError(new GeneratedUnitQualityError([
    { code: 'fact.claim.notInLesson', message: 'invalid citation', severity: 'error' },
  ])), true);
});

test('merges repaired assessment fields without regenerating the lesson or solution', () => {
  const artifact = {
    content: '# Lesson',
    quiz: [],
    exercise: {
      id: 'exercise-1',
      language: 'typescript',
      entrypoint: 'solve',
      description: 'Solve it',
      starterCode: 'export function solve() {}',
      assertionMode: 'return',
      testCases: [
        { name: 'normal', category: 'normal', input: [], expected: true },
        { name: 'edge', category: 'edge', input: [], expected: true },
        { name: 'misconception', category: 'misconception', input: [], expected: false },
      ],
      hints: ['First hint', 'Second hint'],
      difficulty: 'introductory',
      conceptTags: ['test'],
      commonPitfalls: ['test'],
      estimatedMinutes: 10,
    },
    objectiveCoverage: [],
    citations: [{ sourceId: 'src-1', claim: 'claim' }],
    referenceSolution: 'export function solve() { return true; }',
  } as GeneratedUnitArtifact;
  const repairedQuiz = [{
    id: 'q1',
    type: 'short-answer' as const,
    question: 'Explain the objective clearly.',
    answer: 'answer',
    explanation: 'A sufficiently detailed explanation.',
    objectiveIds: ['objective-a'],
    misconception: 'A specific misconception',
    rubric: 'A sufficiently concrete grading rubric.',
    distractorRationales: [],
  }];
  const repairedCoverage = [{
    objectiveId: 'objective-a',
    lessonEvidence: 'Lesson',
    exampleEvidence: 'Lesson',
    assessmentIds: ['q1'],
  }];

  const merged = parseUnitArtifact(mergeAssessmentRepair(artifact, {
    quiz: repairedQuiz,
    objectiveCoverage: repairedCoverage,
  }));

  assert.equal(merged.content, artifact.content);
  assert.equal(merged.referenceSolution, artifact.referenceSolution);
  assert.deepEqual(merged.quiz, repairedQuiz);
  assert.deepEqual(merged.objectiveCoverage, repairedCoverage);
});

test('final assessment repair round uses focused feedback without resending lesson content', () => {
  const artifact = {
    content: 'VERY_LARGE_LESSON_BODY',
    quiz: [{
      id: 'q2',
      type: 'choice' as const,
      question: 'Which implementation is correct?',
      options: ['json.loads(file.read())', 'json.load(file)', 'json.dumps(file)'],
      answer: 'json.load(file)',
      explanation: 'json.load accepts a file object.',
      objectiveIds: ['objective-a'],
      misconception: 'Confusing JSON loading APIs',
      rubric: 'Select the only implementation that directly parses a file object.',
      distractorRationales: [],
    }],
    exercise: {
      id: 'exercise-1',
      language: 'typescript',
      entrypoint: 'solve',
      description: 'Solve it',
      starterCode: 'export function solve() {}',
      assertionMode: 'return' as const,
      testCases: [
        { name: 'normal', category: 'normal' as const, input: [], expected: true },
        { name: 'edge', category: 'edge' as const, input: [], expected: true },
        { name: 'misconception', category: 'misconception' as const, input: [], expected: false },
      ],
      hints: ['First hint', 'Second hint'],
      difficulty: 'introductory' as const,
      conceptTags: ['test'],
      commonPitfalls: ['test'],
      estimatedMinutes: 10,
    },
    objectiveCoverage: [{
      objectiveId: 'objective-a',
      lessonEvidence: 'evidence',
      exampleEvidence: 'example',
      assessmentIds: ['q2'],
    }],
    citations: [],
    referenceSolution: 'export function solve() { return true; }',
  } as GeneratedUnitArtifact;
  const error = new GeneratedUnitQualityError([{
    code: 'quiz.choice.distractor.tooSimilar',
    message: 'Choice quiz "q2" contains options 1 and 2 that are too lexically similar.',
    severity: 'error',
  }]);

  const prompt = buildAssessmentRepairPrompt(['objective-a'], artifact, error, 2);

  assert.match(prompt, /Convert any persistently conflicting choice question into a diagnostic short-answer question/);
  assert.match(prompt, /options 1 and 2/);
  assert.doesNotMatch(prompt, /VERY_LARGE_LESSON_BODY/);
});

test('citation repair preserves the generated artifact and requires verbatim lesson claims', () => {
  const artifact = parseUnitArtifact(mergeAssessmentRepair({
    content: 'Python 列表是有序且可变的集合。',
    quiz: [],
    exercise: {
      id: 'exercise-1',
      language: 'typescript',
      entrypoint: 'solve',
      description: 'Solve it',
      starterCode: 'export function solve() {}',
      assertionMode: 'return',
      testCases: [
        { name: 'normal', category: 'normal', input: [], expected: true },
        { name: 'edge', category: 'edge', input: [], expected: true },
        { name: 'misconception', category: 'misconception', input: [], expected: false },
      ],
      hints: ['First hint', 'Second hint'],
      difficulty: 'introductory',
      conceptTags: ['test'],
      commonPitfalls: ['test'],
      estimatedMinutes: 10,
    },
    objectiveCoverage: [],
    citations: [{ sourceId: 'source-a', claim: 'English source quote.' }],
    referenceSolution: 'export function solve() { return true; }',
  } as GeneratedUnitArtifact, {
    quiz: [{
      id: 'q1',
      type: 'short-answer',
      question: '列表有什么特征？',
      answer: '有序且可变',
      explanation: '列表保持顺序并允许修改。',
      objectiveIds: ['objective-a'],
      misconception: '认为列表不可变',
      rubric: '回答同时包含有序和可变两个关键特征。',
      distractorRationales: [],
    }],
    objectiveCoverage: [{
      objectiveId: 'objective-a',
      lessonEvidence: 'Python 列表是有序且可变的集合。',
      exampleEvidence: 'Python 列表是有序且可变的集合。',
      assessmentIds: ['q1'],
    }],
  }));
  const error = new GeneratedUnitQualityError([{
    code: 'fact.claim.notInLesson',
    message: 'English source quote is not in lesson.',
    severity: 'error',
  }]);
  const sources = [{
    id: 'source-a',
    url: 'https://example.com/python-list',
    title: 'Python lists',
    publisher: 'example.com',
    retrievedAt: new Date().toISOString(),
    hash: 'hash',
    trust: 'primary' as const,
    excerpt: 'Lists are ordered and mutable.',
  }];

  const candidates = extractCitationClaimCandidates(artifact.content);
  const prompt = buildCitationRepairPrompt(artifact, sources, error, candidates, 1);
  const merged = parseUnitArtifact(mergeCitationRepair(artifact, {
    citations: [{ sourceId: 'source-a', claim: 'Python 列表是有序且可变的集合。' }],
  }));

  assert.match(prompt, /exact contiguous sentence copied verbatim/);
  assert.deepEqual(candidates, ['Python 列表是有序且可变的集合。']);
  assert.equal(merged.content, artifact.content);
  assert.equal(merged.citations[0]?.claim, 'Python 列表是有序且可变的集合。');
});

test('drops unsupported citation claims while preserving primary-supported claims', () => {
  const sources = [
    {
      id: 'primary-source',
      url: 'https://docs.example.com/list',
      title: 'List documentation',
      publisher: 'docs.example.com',
      retrievedAt: new Date().toISOString(),
      hash: 'primary-hash',
      trust: 'primary' as const,
      excerpt: 'Lists are mutable.',
    },
    {
      id: 'secondary-source',
      url: 'https://blog.example.com/dict',
      title: 'Dictionary article',
      publisher: 'blog.example.com',
      retrievedAt: new Date().toISOString(),
      hash: 'secondary-hash',
      trust: 'secondary' as const,
      excerpt: 'Dictionaries contain key-value pairs.',
    },
  ];

  const filtered = retainSupportedCitationClaims({
    citations: [
      { sourceId: 'primary-source', claim: '列表是可变的。' },
      { sourceId: 'secondary-source', claim: '字典存储键值对。' },
    ],
  }, sources);

  assert.deepEqual(filtered.citations, [
    { sourceId: 'primary-source', claim: '列表是可变的。' },
  ]);
});

test('normalizes objective evidence to verbatim lesson text and valid assessment IDs', () => {
  const artifact = {
    content: [
      '# 数据结构',
      '列表像购物清单，Agent用它存储**一系列**东西：待测文件列表、历史修复记录。',
      '```python',
      "bug_info = ['test_login', 'KeyError', 'username']",
      '```',
    ].join('\n'),
    quiz: [],
    exercise: {
      id: 'exercise-1',
      language: 'python',
      entrypoint: 'solve',
      description: 'Solve it',
      starterCode: 'def solve(): pass',
      assertionMode: 'return' as const,
      testCases: [
        { name: 'normal', category: 'normal' as const, input: [], expected: true },
        { name: 'edge', category: 'edge' as const, input: [], expected: true },
        { name: 'misconception', category: 'misconception' as const, input: [], expected: false },
      ],
      hints: ['First hint', 'Second hint'],
      difficulty: 'introductory' as const,
      conceptTags: ['list'],
      commonPitfalls: ['mutation'],
      estimatedMinutes: 10,
    },
    objectiveCoverage: [],
    citations: [{ sourceId: 'source-a', claim: '列表是事实。' }],
    referenceSolution: 'def solve(): return True',
  } as GeneratedUnitArtifact;
  const quiz = [{
    id: 'q1',
    type: 'short-answer' as const,
    question: '列表如何存储数据？',
    answer: '按顺序存储',
    explanation: '列表保存有序元素。',
    objectiveIds: ['objective-a'],
    misconception: '认为列表没有顺序',
    rubric: '说明列表能够按顺序存储多个元素。',
    distractorRationales: [],
  }];

  const normalized = normalizeAssessmentRepairEvidence(artifact, {
    quiz,
    objectiveCoverage: [{
      objectiveId: 'objective-a',
      lessonEvidence: '列表像购物清单，Agent用它存储一系列东西：待测文件列表、历史修复记录。',
      exampleEvidence: "bug_info = ['test_login', 'KeyError', 'username']",
      assessmentIds: ['exercise-1'],
    }],
  });

  assert.equal(normalized.objectiveCoverage[0]?.lessonEvidence, '列表像购物清单，Agent用它存储**一系列**东西：待测文件列表、历史修复记录。');
  assert.equal(normalized.objectiveCoverage[0]?.exampleEvidence, "bug_info = ['test_login', 'KeyError', 'username']");
  assert.deepEqual(normalized.objectiveCoverage[0]?.assessmentIds, ['q1']);
});
