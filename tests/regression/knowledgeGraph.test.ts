import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeKnowledgeGraph, assertKnowledgeGraph } from '../../src/curriculum/knowledgeGraph.js';
import { seedUnitSchema, type ProjectSpec, type SeedUnit } from '../../src/types.js';

function unit(id: string, objectives: string[], prerequisiteObjectiveIds: string[], type: SeedUnit['type'] = 'unit'): SeedUnit {
  return seedUnitSchema.parse({
    id,
    type,
    title: id,
    description: `${id} description`,
    prerequisites: [],
    objectives,
    prerequisiteObjectiveIds,
  });
}

function projectSpec(objectiveIds: string[]): ProjectSpec {
  return {
    id: 'project-spec',
    title: '综合项目',
    narrative: '综合前置目标。',
    drivingQuestion: '如何组合前置能力？',
    deliverables: ['实现', '设计说明'],
    milestones: [
      { id: 'm1', title: '阶段一', goal: '组合目标', learnerTasks: ['实现'], acceptanceCriteria: ['通过'], objectiveIds, checkpointQuestions: ['为什么这样组合？'] },
      { id: 'm2', title: '阶段二', goal: '验证目标', learnerTasks: ['测试'], acceptanceCriteria: ['通过'], objectiveIds, checkpointQuestions: ['如何验证？'] },
      { id: 'm3', title: '阶段三', goal: '完善目标', learnerTasks: ['重构'], acceptanceCriteria: ['通过'], objectiveIds, checkpointQuestions: ['如何改进？'] },
    ],
    files: [{ path: 'PROJECT.md', purpose: '规格' }, { path: 'solution.ts', purpose: '实现' }],
    rubric: [
      { criterion: '正确性', points: 4, evidence: '测试' },
      { criterion: '设计', points: 3, evidence: '结构' },
      { criterion: '解释', points: 3, evidence: '说明' },
    ],
    extensionIdeas: [],
  };
}

test('builds a valid objective path and project synthesis across prior units', () => {
  const first = unit('unit-a', ['掌握目标 A'], []);
  const second = unit('unit-b', ['掌握目标 B'], ['掌握目标 A']);
  const project = unit('unit-project', ['完成综合项目'], ['掌握目标 A', '掌握目标 B'], 'project');
  project.project = projectSpec(['掌握目标 A', '掌握目标 B']);

  const analysis = analyzeKnowledgeGraph([first, second, project], true);
  assert.deepEqual(analysis.issues, []);
  assert.equal(analysis.nodes.length, 3);
  assert.equal(analysis.edges.length, 3);
  assert.doesNotThrow(() => assertKnowledgeGraph([first, second, project]));
});

test('rejects forward references and missing objective paths', () => {
  const first = unit('unit-a', ['掌握目标 A'], ['掌握目标 B']);
  const second = unit('unit-b', ['掌握目标 B'], []);
  const issues = analyzeKnowledgeGraph([first, second], true).issues;

  assert.ok(issues.some((issue) => issue.code === 'knowledge.prerequisite.forwardReference'));
  assert.ok(issues.some((issue) => issue.code === 'knowledge.prerequisite.missing'));
});

test('rejects projects that do not synthesize and use prior objectives', () => {
  const first = unit('unit-a', ['掌握目标 A'], []);
  const second = unit('unit-b', ['掌握目标 B'], ['掌握目标 A']);
  const project = unit('unit-project', ['完成综合项目'], ['掌握目标 A'], 'project');
  project.project = projectSpec([]);
  const issues = analyzeKnowledgeGraph([first, second, project], true).issues;

  assert.ok(issues.some((issue) => issue.code === 'knowledge.project.insufficientSynthesis'));
  assert.ok(issues.some((issue) => issue.code === 'knowledge.project.prerequisiteUnused'));
});
