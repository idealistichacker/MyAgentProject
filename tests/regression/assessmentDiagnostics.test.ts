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

test('accepts options whose clause order changes their validity', () => {
  const unit = structuredClone(SEED_CURRICULUM[0]);
  unit.objectives = [objective];
  const issues = buildQuizDiagnosticIssues(unit, [validQuestion({
    options: [
      'try: ... except: ... finally: ...',
      'try: ... finally: ... except: ...',
      'try: ... except: ... else: ...',
    ],
    answer: 'try: ... except: ... finally: ...',
    distractorRationales: [
      {
        option: 'try: ... finally: ... except: ...',
        misconception: '认为异常处理子句可以任意排序',
        feedback: 'except 必须位于 finally 之前，否则代码不符合 Python 的异常处理语法。',
      },
      {
        option: 'try: ... except: ... else: ...',
        misconception: '混淆 else 与 finally 的执行条件',
        feedback: 'else 只在没有异常时执行，finally 才能保证无论结果如何都执行。',
      },
    ],
  })]);

  assert.equal(issues.some((issue) => issue.code === 'quiz.choice.distractor.tooSimilar'), false);
});

test('reports the exact near-identical option pair', () => {
  const unit = structuredClone(SEED_CURRICULUM[0]);
  unit.objectives = [objective];
  const issues = buildQuizDiagnosticIssues(unit, [validQuestion({
    options: [
      "config = json.loads(file.read())",
      "config = json.load(file)",
      "config = json.loads(file.read(1))",
    ],
    answer: "config = json.load(file)",
    distractorRationales: [
      {
        option: "config = json.loads(file.read())",
        misconception: '认为只能先读取全部文本再解析 JSON',
        feedback: 'json.load 可以直接解析文件对象，避免额外的完整字符串读取。',
      },
      {
        option: "config = json.loads(file.read(1))",
        misconception: '认为读取一个字符便足以形成完整 JSON',
        feedback: '只读取一个字符通常不是完整 JSON 文档，因此解析会失败。',
      },
    ],
  })]);

  const similarityIssue = issues.find((issue) => issue.code === 'quiz.choice.distractor.tooSimilar');
  assert.match(similarityIssue?.message ?? '', /options 1 and 3/);
});
