import type { LearnerProfile, SeedUnit, ProjectSpec, TestResult, AssessmentResult } from '../types.js';

export function buildFallbackProjectSpec(unit: SeedUnit): ProjectSpec {
  const exercisePath = 'solution.ts';

  return {
    id: `project-${unit.id}`,
    title: unit.title,
    narrative: `${unit.description} 这个项目会把前置单元里的概念串成一个可以运行、可以测试、可以迭代的小系统。`,
    drivingQuestion: `如何把《${unit.title}》拆成清晰的模块，并用测试证明每个阶段都可靠？`,
    deliverables: [
      `完成 ${exercisePath} 中的核心函数`,
      '通过本项目附带的自动化测试',
      '在代码注释中解释关键设计取舍',
    ],
    milestones: [
      {
        id: 'phase-1-core-model',
        title: 'Phase 1: 建立核心模型',
        goal: '先写出最小可运行的数据模型和函数签名。',
        learnerTasks: [
          '阅读 PROJECT.md 和讲义，标记输入、输出、不变量',
          '补全 starter code 中的类型和基础分支',
        ],
        acceptanceCriteria: [
          '正常输入能够返回结构正确的结果',
          '边界输入不会抛出未处理异常',
        ],
      },
      {
        id: 'phase-2-rules-and-tests',
        title: 'Phase 2: 落实规则与测试',
        goal: '把项目规则变成可验证的代码路径。',
        learnerTasks: [
          '实现主要算法或状态转移规则',
          '用本地测试反馈修正误区',
        ],
        acceptanceCriteria: [
          '至少通过 normal、edge、misconception 三类测试',
          '代码结构能让后续扩展点自然出现',
        ],
      },
    ],
    files: [
      { path: exercisePath, purpose: '主要实现文件，由 fc start 自动生成 starter code。', required: true },
      { path: 'test.ts', purpose: '提交时由本地 runner 生成的验收测试。', required: false },
      { path: 'PROJECT.md', purpose: '项目规格、里程碑、评分标准和扩展方向。', required: true },
    ],
    rubric: [
      { criterion: 'Correctness', points: 4, evidence: '核心测试全部通过，并正确处理边界情况。' },
      { criterion: 'Design', points: 3, evidence: '函数边界清晰，状态和数据结构选择能解释。' },
      { criterion: 'Learning Trace', points: 3, evidence: '注释或提交说明能说明关键误区如何被修正。' },
    ],
    extensionIdeas: [
      '增加一组你自己设计的隐藏测试',
      '把单函数实现拆成两个更清晰的辅助函数',
    ],
  };
}

export function buildFallbackDiagnosis(profile: LearnerProfile): string {
  const styleMap: Record<string, string> = {
    'explain-first': '偏讲解型',
    'example-first': '偏示例型',
    'practice-first': '偏练习型',
    'project-first': '偏项目型',
  };

  const paceMap: Record<string, string> = {
    fast: '较快节奏',
    normal: '正常节奏',
    steady: '稳扎稳打节奏',
  };

  return `学习者目标：${profile.target}。当前 编程语言水平：${profile.programmingLevel}；DSA 水平：${profile.dsaLevel}。每周预计投入 ${profile.weeklyHours} 小时，计划总时长 ${profile.totalWeeks} 周，偏好${styleMap[profile.learningStyle] ?? '混合'}学习，节奏为${paceMap[profile.pace] ?? '正常'}。`;
}

export function buildFallbackAssessmentDiagnosis(
  unit: SeedUnit,
  testResults: TestResult[],
  quizResults: AssessmentResult['quizResults'],
  score: number
): string {
  const failedTests = testResults.filter((result) => !result.passed);
  const failedQuizzes = quizResults.filter((result) => !result.passed);

  const parts: string[] = [`本单元《${unit.title}》评分：${score}/5。`];

  if (testResults.length === 0) {
    parts.push('本次没有运行代码测试，当前反馈主要来自概念小测。');
  } else if (failedTests.length === 0) {
    parts.push('代码测试全部通过，说明当前实现能覆盖 MVP 测试用例。');
  } else {
    parts.push(`代码测试失败 ${failedTests.length} 个，优先检查：${failedTests.map((item) => item.name).join('、')}。`);
  }

  if (failedQuizzes.length === 0) {
    parts.push('概念小测通过，说明核心概念掌握较稳定。');
  } else {
    parts.push(`概念小测失败 ${failedQuizzes.length} 个，建议回看对应知识点并用自己的话解释错因。`);
  }

  return parts.join('');
}
