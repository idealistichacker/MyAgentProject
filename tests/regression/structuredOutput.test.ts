import assert from 'node:assert/strict';
import test from 'node:test';
import { parseUnitArtifact } from '../../src/agents/structuredOutput.js';
import type { ChatResponse } from '../../src/providers/types.js';

function validResponse(): ChatResponse {
  return {
    content: null,
    tool_calls: [{
      id: 'call-1',
      type: 'function',
      function: {
        name: 'submit_unit_artifact',
        arguments: JSON.stringify({
          content: '# 加法\n\n示例：1 + 1 = 2。\n\n常见误区：不要把字符串拼接当作数值相加。',
          quiz: [{
            id: 'quiz-1',
            type: 'choice',
            question: '1 + 1 等于多少？',
            options: ['1', '2'],
            answer: '2',
            explanation: '数值相加得到 2。',
            objectiveIds: ['理解加法'],
            misconception: '把字符串拼接当作加法',
            rubric: '选择正确答案。',
          }],
          exercise: {
            id: 'exercise-1',
            language: 'typescript',
            entrypoint: 'add',
            description: '实现加法。',
            starterCode: 'export function add(left: number, right: number): number { return 0; }',
            assertionMode: 'return',
            testCases: [
              { name: 'normal', category: 'normal', input: [1, 2], expected: 3 },
              { name: 'edge', category: 'edge', input: [0, 0], expected: 0 },
              { name: 'misconception', category: 'misconception', input: [-1, 1], expected: 0 },
            ],
            hints: ['先声明返回类型。', '直接相加两个参数。'],
            difficulty: 'introductory',
            conceptTags: ['addition'],
            commonPitfalls: ['字符串拼接'],
            estimatedMinutes: 10,
          },
          objectiveCoverage: [{
            objectiveId: '理解加法',
            lessonEvidence: '示例',
            exampleEvidence: '1 + 1 = 2',
            assessmentIds: ['quiz-1'],
          }],
          citations: [{ sourceId: 'src-1', claim: '加法示例。' }],
          referenceSolution: 'export function add(left: number, right: number): number { return left + right; }',
        }),
      },
    }],
  };
}

test('parses only the required structured unit tool call', () => {
  const artifact = parseUnitArtifact(validResponse());
  assert.equal(artifact.exercise.entrypoint, 'add');
  assert.equal(artifact.referenceSolution.includes('left + right'), true);
});

test('rejects plain text instead of guessing JSON fragments', () => {
  assert.throws(
    () => parseUnitArtifact({ content: '{"content":"looks like json"}' }),
    /required structured-output tool/
  );
});
