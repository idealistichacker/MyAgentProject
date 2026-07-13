import assert from 'node:assert/strict';
import test from 'node:test';
import { buildQuizDiagnosticIssues } from '../../src/agents/assessmentDiagnostics.js';
import { SEED_CURRICULUM } from '../../src/curriculum/seed.js';
import type { QuizQuestion } from '../../src/types.js';

const objective = '理解递归调用如何缩小问题规模';

function validQuestion(overrides: Partial<QuizQuestion> = {}): QuizQuestion {
  return {
    id: 'quiz-recursion',
    type: 'choice',
    question: '哪一种实现能够让递归调用稳定抵达基本情况？',
    options: ['每次缩小输入规模', '每次保持原输入', '每次扩大输入规模'],
    answer: '每次缩小输入规模',
    explanation: '缩小输入规模使后续调用逐步接近基本情况并最终终止。',
    objectiveIds: [objective],
    misconception: '认为递归调用不需要改变输入规模',
    rubric: '选择能够证明问题规模单调缩小并最终终止的方案。',
    distractorRationales: [
      { option: '每次保持原输入', misconception: '认为重复相同输入也会自然终止', feedback: '原输入不会接近基本情况，应明确缩小问题规模。' },
      { option: '每次扩大输入规模', misconception: '把递归深度增加误认为进度', feedback: '扩大输入会远离基本情况，应寻找单调减小的度量。' },
    ],
    ...overrides,
  };
}

test('accepts a diagnostic choice question with explicit objective coverage', () => {
  const unit = structuredClone(SEED_CURRICULUM[0]);
  unit.objectives = [objective];

  assert.deepEqual(buildQuizDiagnosticIssues(unit, [validQuestion()]), []);
});

test('rejects duplicate and generic distractors', () => {
  const unit = structuredClone(SEED_CURRICULUM[0]);
  unit.objectives = [objective];
  const issues = buildQuizDiagnosticIssues(unit, [validQuestion({
    options: ['每次缩小输入规模', '每次缩小输入规模', '以上都正确'],
  })]);

  assert.ok(issues.some((issue) => issue.code === 'quiz.choice.options.duplicate'));
  assert.ok(issues.some((issue) => issue.code === 'quiz.choice.distractor.generic'));
});

test('rejects unknown objective mappings and unassessed objectives', () => {
  const unit = structuredClone(SEED_CURRICULUM[0]);
  unit.objectives = [objective];
  const issues = buildQuizDiagnosticIssues(unit, [validQuestion({ objectiveIds: ['不存在的目标'] })]);

  assert.ok(issues.some((issue) => issue.code === 'quiz.objective.unknown'));
  assert.ok(issues.some((issue) => issue.code === 'quiz.objective.unassessed'));
});

test('rejects near-identical distractors and duplicated misconception rationales', () => {
  const unit = structuredClone(SEED_CURRICULUM[0]);
  unit.objectives = [objective];
  const issues = buildQuizDiagnosticIssues(unit, [validQuestion({
    options: ['递归调用每次把输入规模减少一', '递归调用每次把输入规模减少二', '递归调用每次把输入规模减少三'],
    answer: '递归调用每次把输入规模减少一',
    distractorRationales: [
      { option: '递归调用每次把输入规模减少二', misconception: '只要减少即可', feedback: '需要根据问题定义选择正确的规模变化。' },
      { option: '递归调用每次把输入规模减少三', misconception: '只要减少即可', feedback: '不同递减步长可能跳过合法状态或改变结果。' },
    ],
  })]);

  assert.ok(issues.some((issue) => issue.code === 'quiz.choice.distractor.tooSimilar'));
  assert.ok(issues.some((issue) => issue.code === 'quiz.choice.rationale.misconceptionDuplicate'));
});
