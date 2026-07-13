import assert from 'node:assert/strict';
import test from 'node:test';
import { assessDraftQuality } from '../../src/agents/draftQuality.js';
import { SEED_CURRICULUM } from '../../src/curriculum/seed.js';

test('skips critique only for a high-confidence draft', () => {
  const unit = structuredClone(SEED_CURRICULUM[0]);
  unit.objectives = ['理解递归的基本结构', '识别递归的边界条件'];
  const draft = `
## 递归的基本结构
理解递归的基本结构，首先要区分问题规模、递归调用和返回值。${'递归函数每次缩小问题规模，并在返回阶段组合结果。'.repeat(18)}

## 边界条件
识别递归的边界条件是终止计算的关键。注意事项：空输入和单元素输入都是边界情况。${'边界条件必须在递归调用之前判断。'.repeat(14)}

## 示例演示
下面的示例展示一个可运行实现：
\`\`\`ts
function sum(values: number[]): number {
  if (values.length === 0) return 0;
  return values[0] + sum(values.slice(1));
}
\`\`\`
${'逐步展开调用栈，再按相反顺序组合结果。'.repeat(12)}

## 常见误区
常见误区是忘记缩小问题规模，错误地让函数使用原输入再次调用自身。${'这会导致调用无法抵达终止条件。'.repeat(10)}
`;

  const assessment = assessDraftQuality(unit, draft);
  assert.equal(assessment.highConfidence, true);
  assert.ok(assessment.score >= 85);
});

test('requires critique when objectives and examples are weak', () => {
  const unit = structuredClone(SEED_CURRICULUM[0]);
  unit.objectives = ['理解递归的基本结构', '识别递归的边界条件'];
  const assessment = assessDraftQuality(unit, '## 简介\n递归是一种调用自己的技术。');

  assert.equal(assessment.highConfidence, false);
  assert.ok(assessment.signals.some((signal) => signal.code === 'objective-coverage' && !signal.passed));
  assert.ok(assessment.signals.some((signal) => signal.code === 'worked-example' && !signal.passed));
});
