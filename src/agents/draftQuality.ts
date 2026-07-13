import type { SeedUnit } from '../types.js';

export interface DraftQualitySignal {
  code: 'length' | 'objective-coverage' | 'structure' | 'worked-example' | 'edge-cases' | 'misconceptions' | 'project-architecture';
  passed: boolean;
  weight: number;
  message: string;
}

export interface DraftQualityAssessment {
  score: number;
  highConfidence: boolean;
  signals: DraftQualitySignal[];
}

export function assessDraftQuality(unit: SeedUnit, draft: string): DraftQualityAssessment {
  const compactLength = draft.replace(/\s/g, '').length;
  const headingCount = draft.match(/^#{2,3}\s+.+$/gm)?.length ?? 0;
  const isProject = unit.type === 'project';
  const objectiveResults = unit.objectives.map((objective) => objectiveCoverage(draft, objective));
  const minimumLength = isProject ? 1_500 : 900;
  const minimumHeadings = isProject ? 4 : 3;

  const signals: DraftQualitySignal[] = [
    signal('length', compactLength >= minimumLength, 20, `正文长度 ${compactLength}/${minimumLength}`),
    signal(
      'objective-coverage',
      objectiveResults.length > 0 && objectiveResults.every((coverage) => coverage >= 0.65),
      30,
      `目标词汇覆盖率 ${objectiveResults.map((coverage) => `${Math.round(coverage * 100)}%`).join(', ') || '0%'}`
    ),
    signal('structure', headingCount >= minimumHeadings, 15, `二三级标题 ${headingCount}/${minimumHeadings}`),
    signal(
      'worked-example',
      /```[\s\S]+?```/.test(draft) && /(例如|示例|演示|example|walk-?through)/i.test(draft),
      15,
      '需要同时包含可运行代码块和讲解示例'
    ),
    signal('edge-cases', /(边界|异常|陷阱|注意事项|edge\s*case|gotcha)/i.test(draft), 10, '需要明确讨论边界、异常或陷阱'),
    signal('misconceptions', /(误区|常见错误|错误地|不要直接|misconception)/i.test(draft), 10, '需要指出至少一个常见误区'),
  ];

  if (isProject) {
    signals.push(signal(
      'project-architecture',
      /(里程碑|阶段\s*[一二三123]|milestone)/i.test(draft)
        && /(验收标准|完成标准|acceptance\s*criteria)/i.test(draft)
        && /(模块|架构|接口|数据流|module|architecture)/i.test(draft),
      20,
      'Project 草稿需要里程碑、验收标准和模块架构'
    ));
  }

  const totalWeight = signals.reduce((total, item) => total + item.weight, 0);
  const passedWeight = signals.reduce((total, item) => total + (item.passed ? item.weight : 0), 0);
  const score = Math.round((passedWeight / totalWeight) * 100);
  const requiredCodes = new Set(['length', 'objective-coverage', 'structure', 'worked-example']);
  if (isProject) requiredCodes.add('project-architecture');
  const requiredPassed = signals.every((item) => !requiredCodes.has(item.code) || item.passed);

  return {
    score,
    highConfidence: requiredPassed && score >= 85,
    signals,
  };
}

function signal(code: DraftQualitySignal['code'], passed: boolean, weight: number, message: string): DraftQualitySignal {
  return { code, passed, weight, message };
}

function objectiveCoverage(content: string, objective: string): number {
  const normalizedContent = normalize(content);
  const normalizedObjective = normalize(objective);
  if (!normalizedObjective) return 0;
  if (normalizedContent.includes(normalizedObjective)) return 1;
  if (normalizedObjective.length < 4) return 0;

  const grams = new Set<string>();
  for (let index = 0; index < normalizedObjective.length - 1; index += 1) {
    grams.add(normalizedObjective.slice(index, index + 2));
  }
  const matched = [...grams].filter((gram) => normalizedContent.includes(gram)).length;
  return grams.size === 0 ? 0 : matched / grams.size;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}
