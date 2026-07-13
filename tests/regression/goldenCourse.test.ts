import assert from 'node:assert/strict';
import test from 'node:test';
import { assertGeneratedUnitQuality } from '../../src/agents/generatedUnitQuality.js';
import type { SeedUnit, Source } from '../../src/types.js';

test('representative generated course artifact passes the publication quality gate', () => {
  const objective = '理解纯函数如何根据输入稳定地产生输出';
  const lessonEvidence = '纯函数不会读取或修改函数外部的可变状态。';
  const exampleEvidence = '例如 add(1, 2) 每次都会得到 3。';
  const factClaim = '纯函数对相同输入产生相同输出。';
  const content = [
    '# 纯函数与可预测性',
    lessonEvidence,
    exampleEvidence,
    factClaim,
    '常见误区是把日志输出或全局计数器更新也当成纯计算。'.repeat(45),
  ].join('\n\n');
  const source: Source = {
    id: 'src-1',
    url: 'https://developer.mozilla.org/en-US/docs/Glossary/Pure_function',
    title: 'Pure function',
    publisher: 'MDN',
    retrievedAt: '2026-07-13T00:00:00.000Z',
    hash: 'source-hash',
    trust: 'primary',
    excerpt: 'A pure function has no side effects and returns the same output for the same input.',
  };
  const unit: SeedUnit = {
    id: 'golden-pure-functions',
    type: 'unit',
    title: '纯函数与可预测性',
    description: '通过可执行练习理解纯函数。',
    prerequisites: [],
    objectives: [objective],
    content,
    references: [source.url],
    sources: [source],
    citations: [{ sourceId: source.id, claim: factClaim }],
    objectiveCoverage: [{
      objectiveId: objective,
      lessonEvidence,
      exampleEvidence,
      assessmentIds: ['quiz-1', 'normal addition'],
    }],
    quiz: [{
      id: 'quiz-1',
      type: 'choice',
      question: '哪个函数更接近纯函数？',
      options: ['返回两个参数之和', '修改全局计数器后返回', '读取当前时间后返回参数之和'],
      answer: '返回两个参数之和',
      explanation: '参数求和不依赖外部可变状态。',
      objectiveIds: [objective],
      misconception: '认为只要函数有返回值就是纯函数',
      rubric: '选择无副作用且输出稳定的选项。',
      distractorRationales: [
        { option: '修改全局计数器后返回', misconception: '认为返回值正确即可忽略副作用', feedback: '修改全局状态会让函数行为依赖外部历史，因此不是纯函数。' },
        { option: '读取当前时间后返回参数之和', misconception: '认为只读外部状态不会破坏纯度', feedback: '当前时间是变化的外部输入，相同显式参数可能产生不同观察结果。' },
      ],
    }],
    exercise: {
      id: 'exercise-add',
      language: 'typescript',
      entrypoint: 'add',
      description: '实现一个无副作用的加法函数。',
      starterCode: 'export function add(left: number, right: number): number { return 0; }',
      assertionMode: 'return',
      testCases: [
        { name: 'normal addition', category: 'normal', input: [1, 2], expected: 3 },
        { name: 'zero boundary', category: 'edge', input: [0, 0], expected: 0 },
        { name: 'negative misconception', category: 'misconception', input: [-1, 1], expected: 0 },
      ],
      hints: ['只使用参数。', '直接返回求和结果。'],
      difficulty: 'introductory',
      conceptTags: ['pure-function'],
      commonPitfalls: ['修改外部状态'],
      estimatedMinutes: 10,
    },
    passCriteria: { quizMinScore: 1, exerciseMustPass: true },
  };

  assert.doesNotThrow(() => assertGeneratedUnitQuality(
    unit,
    content,
    unit.quiz ?? [],
    unit.exercise!,
    undefined,
    unit.objectiveCoverage ?? [],
    unit.citations ?? [],
    unit.sources ?? []
  ));
});
