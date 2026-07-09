import { z } from 'zod';
import { getSeedUnit, SEED_CURRICULUM } from '../curriculum/seed.js';
import type {
  AssessmentResult,
  LearnerProfile,
  LearningPlan,
  LearningState,
  QuizQuestion,
  SeedUnit,
  TestResult,
} from '../types.js';
import type { LLMProvider, ChatMessage } from '../providers/types.js';
import { ToolManager, WebSearchTool, TimeTool } from './tools.js';
import { loadConfig } from '../state/fsState.js';
import { llmCache } from '../utils/cache.js';
import { buildMasteryReport } from '../curriculum/mastery.js';
import { buildFallbackDiagnosis, buildFallbackAssessmentDiagnosis } from './fallbacks.js';
import { parseJsonFromText, sanitizeJsonString, extractJsonCandidate } from './generatedUnitParser.js';
export { generateUnitContent, generateRemediationUnit } from './unitGeneration.js';

const nowIso = () => new Date().toISOString();

export async function diagnoseLearner(
  rawProfile: LearnerProfile,
  provider?: LLMProvider
): Promise<LearnerProfile> {
  if (!provider) {
    return {
      ...rawProfile,
      summary: buildFallbackDiagnosis(rawProfile),
      createdAt: rawProfile.createdAt ?? nowIso(),
    };
  }

  try {
    const prompt = `
You are FCAgent DiagnoseAgent, a super perceptive, slightly sassy, and highly encouraging AI mentor.
Summarize the learner profile in Chinese in 3-5 sentences. Make it feel like a personalized, highly insightful psychological/academic diagnosis. Use a fun and empathetic tone (人情味) to welcome them to their learning journey!
Return only the summary text, no JSON.

Profile:
${JSON.stringify(rawProfile, null, 2)}
`.trim();

    const response = await provider.chat([
      { role: 'system', content: 'You are a concise learning diagnostician.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.2 });

    const summary = response.content || '';

    return {
      ...rawProfile,
      summary: summary.trim(),
      createdAt: rawProfile.createdAt ?? nowIso(),
    };
  } catch {
    return {
      ...rawProfile,
      summary: buildFallbackDiagnosis(rawProfile),
      createdAt: rawProfile.createdAt ?? nowIso(),
    };
  }
}

import type { MasteryReport } from '../curriculum/mastery.js';

export async function generatePlan(
  learnerProfile: LearnerProfile,
  provider?: LLMProvider,
  masteryReport?: MasteryReport
): Promise<LearningPlan> {
  const now = nowIso();
  let units = SEED_CURRICULUM;

  if (provider) {
    try {
      const cacheKey = `plan:${JSON.stringify({
        target: learnerProfile.target,
        programmingLevel: learnerProfile.programmingLevel,
        dsaLevel: learnerProfile.dsaLevel,
        weeklyHours: learnerProfile.weeklyHours,
        totalWeeks: learnerProfile.totalWeeks,
        learningStyle: learnerProfile.learningStyle,
        codePractice: learnerProfile.codePractice,
        pace: learnerProfile.pace,
        nearTermGoal: learnerProfile.nearTermGoal,
      })}`;
      const cachedUnits = await llmCache.get<SeedUnit[]>(cacheKey);
      if (cachedUnits?.length) {
        return {
          learnerProfile,
          units: cachedUnits,
          currentIndex: 0,
          createdAt: now,
          updatedAt: now,
        };
      }

      const toolManager = new ToolManager();
      const config = loadConfig();
      toolManager.register(new WebSearchTool(config.searchProvider, config.tavilyApiKey));
      toolManager.register(new TimeTool());

      let weeks = 6.5;
      if (learnerProfile.totalWeeks === '1-4') weeks = 2.5;
      else if (learnerProfile.totalWeeks === '9-12') weeks = 10.5;
      else if (learnerProfile.totalWeeks === '12+') weeks = 16;

      let hoursPerWeek = 3.5;
      if (learnerProfile.weeklyHours === '<2') hoursPerWeek = 1;
      else if (learnerProfile.weeklyHours === '5-10') hoursPerWeek = 7.5;
      else if (learnerProfile.weeklyHours === '10+') hoursPerWeek = 12;

      // Estimate total units: say, 1 unit takes around 5 hours of dedicated study.
      // Clamp between 2 and 10 to guarantee token safety and prompt alignment.
      const calculatedCount = Math.round((weeks * hoursPerWeek) / 5);
      const targetUnitCount = Math.min(10, Math.max(2, calculatedCount));
      const totalUnits = targetUnitCount >= 4 ? targetUnitCount + 1 : targetUnitCount;

      const prompt = `
You are FCAgent CurriculumPlanner, an elite, inspiring, and slightly playful AI mentor designing an Epic Learning Journey.
Generate a personalized learning curriculum array (JSON) with exactly ${totalUnits} units based on the learner profile.

IMPORTANT RULES:
1. NARRATIVE & COHESION: The curriculum MUST have a cohesive storyline or thematic progression. Early units must explicitly state how they build up to the final Project. The titles and descriptions should be highly engaging, fun, and human-like (e.g., "驯服你的第一只爬虫" instead of "爬虫基础").
2. First priority: Use the \`search_web\` tool to search for latest and highly-quality resources relating to the learner's goal.
3. Second priority: Use your internal parametric knowledge to combine with search results.
4. ${targetUnitCount >= 4 ? 'Since the course is long enough, you MUST include exactly 1 unit of `type: "project"` (a large-scale coding project, like CS61A Ants or Scheme). It should be placed in the mid-to-late part of the curriculum. Mark its id with a "-project" suffix. All preceding units must explicitly state in their description how they serve as a puzzle piece for this specific project.' : 'Generate regular instructional units, but keep them tightly connected conceptually.'}
5. Ensure the JSON is completely valid and free of formatting issues. VERY IMPORTANT: Any double quotes inside JSON string values MUST be properly escaped as \\" (backslash double quote) or replaced with Chinese quotes (“ ”) or single quotes.

The JSON output MUST be a valid array of objects matching this schema (containing exactly ${totalUnits} elements):
[{
  "id": "unique-unit-id",
  "type": "unit",
  "title": "Fun, Engaging Unit Title",
  "description": "Brief description explaining the concept AND how it connects to the next unit or the final project.",
  "prerequisites": ["prereq1"],
  "objectives": ["obj1"]
}]

Do not include markdown codeblocks (\`\`\`json) in the final string, just the raw JSON array.
Learner Profile:
${JSON.stringify(learnerProfile, null, 2)}
${masteryReport ? `
Additionally, the learner needs a REPLAN based on their current progress.
Current Mastery Status:
${JSON.stringify(masteryReport.skills, null, 2)}
Please adjust the curriculum to focus heavily on "needs-practice" skills, and skip "mastered" skills.` : ''}
`.trim();

      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are a JSON-only curriculum planner with web search capabilities. You must output strictly valid JSON, escaping any double quotes inside string fields with a backslash.' },
        { role: 'user', content: prompt }
      ];

      let finalContent = '';
      for (let i = 0; i < 5; i++) {
        const response = await provider.chat(messages, { 
          temperature: 0.3,
          tools: toolManager.getToolsDefinitions()
        });

        if (response.tool_calls && response.tool_calls.length > 0) {
          messages.push({
            role: 'assistant',
            content: response.content,
            tool_calls: response.tool_calls
          });

          for (const call of response.tool_calls) {
            // console.log(\`\\n🔍 FCAgent 正在调用工具: \${call.function.name}...\`);
            const result = await toolManager.executeToolCall(call.function.name, call.function.arguments);
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: call.function.name,
              content: result
            });
          }
        } else {
          finalContent = response.content || '';
          break;
        }
      }
      
      let parsed: any;
      try {
        parsed = parseJsonFromText(finalContent);
      } catch (firstErr) {
        try {
          parsed = JSON.parse(sanitizeJsonString(extractJsonCandidate(finalContent)));
        } catch (secondErr) {
          console.warn('\n⚠️ Failed to parse JSON from LLM:\n', finalContent);
          throw firstErr;
        }
      }

      if (parsed && Array.isArray(parsed) && parsed.length > 0) {
        units = parsed.map((u: any, index: number) => ({
          ...u,
          id: u.id || `dyn-unit-${index}`,
          type: u.type || 'unit',
          title: u.title || 'Untitled',
          description: u.description || '',
          prerequisites: u.prerequisites || [],
          objectives: u.objectives || [],
          passCriteria: { quizMinScore: 1, exerciseMustPass: true },
        })) as SeedUnit[];
        await llmCache.set(cacheKey, units, { ttlMs: 7 * 24 * 60 * 60 * 1000 });
      }
    } catch (err) {
      console.warn('Failed to generate dynamic plan, falling back to seed.', err);
    }
  }

  return {
    learnerProfile,
    units,
    currentIndex: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function getCurrentUnit(plan: LearningPlan, unitId?: string): SeedUnit {
  if (unitId) {
    const unit = plan.units.find(u => u.id === unitId) ?? getSeedUnit(unitId);
    if (!unit) {
      throw new Error(`Unknown unit id: ${unitId}`);
    }
    return unit;
  }

  const unit = plan.units[plan.currentIndex];
  if (!unit) {
    throw new Error('No current unit in plan.');
  }

  return unit;
}

export function gradeQuiz(
  quiz: QuizQuestion[],
  answers: Record<string, string>
): AssessmentResult['quizResults'] {
  return quiz.map((question) => {
    const actual = answers[question.id]?.trim() || '';
    const expected = question.answer.trim();

    const normalize = (val: string): string => {
      let cleaned = val.trim().toLowerCase();
      if (cleaned.endsWith(')')) {
        cleaned = cleaned.slice(0, -1).trim();
      }
      const mapping: Record<string, string> = {
        a: '1',
        b: '2',
        c: '3',
        d: '4',
      };
      if (mapping[cleaned]) {
        return mapping[cleaned];
      }
      return cleaned;
    };

    const normActual = normalize(actual);
    const normExpected = normalize(expected);

    let passed = normActual === normExpected;

    // Fallback: Index-based mapping if options are present
    if (!passed && question.options && question.options.length > 0) {
      const actualIdx = question.options.findIndex(
        (opt) => opt.trim().toLowerCase() === actual.toLowerCase()
      );
      const expectedIdx = question.options.findIndex(
        (opt) => opt.trim().toLowerCase() === expected.toLowerCase()
      );

      const numActual = parseInt(normActual, 10);
      const numExpected = parseInt(normExpected, 10);

      const realActualIdx = !isNaN(numActual) && numActual >= 1 && numActual <= question.options.length
        ? numActual - 1
        : actualIdx;

      const realExpectedIdx = !isNaN(numExpected) && numExpected >= 1 && numExpected <= question.options.length
        ? numExpected - 1
        : expectedIdx;

      if (realActualIdx !== -1 && realExpectedIdx !== -1) {
        passed = realActualIdx === realExpectedIdx;
      }
    }

    return {
      id: question.id,
      passed,
      answer: actual,
      expected,
    };
  });
}

export async function buildAssessment(
  unit: SeedUnit,
  testResults: TestResult[],
  quizResults: AssessmentResult['quizResults'],
  learnerCode?: string,
  provider?: LLMProvider,
  attemptCount: number = 0,
  id = `assessment-${unit.id}-${Date.now()}`
): Promise<AssessmentResult> {
  const exercisePassed = testResults.every((result) => result.passed);
  const quizMinScore = unit.passCriteria?.quizMinScore ?? 1;
  const quizScore = quizResults.filter((result) => result.passed).length;
  const quizPassed = quizScore >= quizMinScore;
  const passed = exercisePassed && quizPassed;

  const mistakeTypes = new Set<string>();

  if (!exercisePassed) {
    const timeoutOrCompile = testResults.some((result) =>
      result.message?.includes('timeout') || result.message?.includes('Command failed')
    );
    if (timeoutOrCompile) {
      mistakeTypes.add('execution-error');
    } else {
      mistakeTypes.add('test-case-failure');
    }
  }

  if (!quizPassed) {
    mistakeTypes.add('concept-gap');
  }

  const score = passed ? 5 : !quizPassed ? Math.max(1, quizScore) : exercisePassed ? 3 : 2;
  let diagnosis = buildFallbackAssessmentDiagnosis(unit, testResults, quizResults, score);
  let nextAction = passed
    ? `通过本单元。建议执行 fc next 进入${unit.nextIfPassed ? ' ' + unit.nextIfPassed : '下一单元'}。`
    : `未通过本单元。建议先查看错题和测试失败信息，再执行 fc submit 重新提交。`;

  if (provider) {
    try {
      let hintStrategy = "你必须只提供概念性的启发，指出误区，不要给出具体的代码修改建议。";
      if (attemptCount === 2) {
        hintStrategy = "你可以指出具体是哪一段代码（例如变量作用域、某一行逻辑）出了问题，并给出明确的修改方向，但不要直接写出完整答案。";
      } else if (attemptCount >= 3) {
        hintStrategy = "学习者已经尝试多次仍然失败，请直接提供详细的结构化伪代码，或者修正后的关键代码骨架片段，帮助他们渡过难关，保护学习积极性。";
      }

      const prompt = `
You are FCAgent AssessmentReviewer, an elite, empathetic, and incredibly supportive teaching assistant. The learner just completed a unit.
Unit: ${unit.title}
Passed: ${passed}
Attempt Count: ${attemptCount}
Test Results: ${JSON.stringify(testResults)}
Quiz Results: ${JSON.stringify(quizResults)}

Learner's Actual Code Submission:
\`\`\`
${learnerCode || 'No code provided'}
\`\`\`

Here is your hint strategy based on the learner's attempt count (${attemptCount}):
${hintStrategy}

Analyze their performance:
1. If tests failed, look at the actual code and test errors, and provide hints strictly following the hint strategy above.
2. If concepts failed, explain the misconception.
3. Write a supportive, highly personalized diagnosis (3-4 sentences in Chinese), integrating the hints appropriately. CRITICAL: Inject a lot of 'human touch' (人情味). If they failed, comfort them like a true mentor. If they succeeded, celebrate enthusiastically!
4. Write a short 1-sentence nextAction recommending what to do next in a playful, encouraging tone.

Return exactly valid JSON ONLY:
{ "diagnosis": "...", "nextAction": "..." }
`.trim();
      const response = await provider.chat([
        { role: 'system', content: 'You are a JSON-only assessment reviewer.' },
        { role: 'user', content: prompt }
      ], { temperature: 0.2 });
      
      const responseContent = response.content || '';
      const parsed = parseJsonFromText<{ diagnosis?: string; nextAction?: string }>(responseContent);
      if (parsed.diagnosis) diagnosis = parsed.diagnosis;
      if (parsed.nextAction) nextAction = parsed.nextAction;
    } catch (err) {
      console.warn('Failed to generate LLM assessment, falling back.', err);
    }
  }

  return {
    unitId: unit.id,
    assessmentType: 'code+quiz',
    passed,
    score,
    maxScore: 5,
    testResults,
    quizResults,
    mistakeTypes: [...mistakeTypes],
    diagnosis,
    nextAction,
    createdAt: nowIso(),
  };
}

export function adaptNextUnit(plan: LearningPlan, assessment: AssessmentResult, state: LearningState): { currentIndex: number; reason: string } {
  const currentIndex = plan.units.findIndex((item) => item.id === assessment.unitId);
  if (currentIndex === -1) {
    return { currentIndex: plan.currentIndex, reason: 'Unknown unit.' };
  }

  const mastery = buildMasteryReport(plan, state);
  const currentUnitMastery = mastery.units.find(u => u.unitId === assessment.unitId);

  if (assessment.passed) {
    const routedIndex = plan.units.findIndex((item) => item.id === plan.units[currentIndex]?.nextIfPassed);
    const nextIndex = routedIndex === -1
      ? Math.min(plan.units.length - 1, currentIndex + 1)
      : routedIndex;
    
    let reason = routedIndex === -1 ? 'Passed current unit.' : `Passed current unit. Routed to ${plan.units[nextIndex]?.id}.`;
    
    // Add explainable mastery data
    if (currentUnitMastery && currentUnitMastery.status === 'mastered') {
      reason += ' (Mastery achieved based on assessment score)';
    }

    return {
      currentIndex: nextIndex,
      reason,
    };
  }

  const failedRouteIndex = plan.units.findIndex((item) => item.id === plan.units[currentIndex]?.nextIfFailed);
  if (failedRouteIndex !== -1) {
    return {
      currentIndex: failedRouteIndex,
      reason: `Failed current unit. Routed to ${plan.units[failedRouteIndex]?.id}.`,
    };
  }

  return {
    currentIndex,
    reason: 'Failed current unit. Stay on this unit for remedial practice.',
  };
}

export const assessmentSchema = z.object({
  id: z.string().optional(),
  unitId: z.string(),
  assessmentType: z.literal('code+quiz'),
  passed: z.boolean(),
  score: z.number().int().min(0).max(5),
  maxScore: z.number().int().default(5),
  testResults: z.array(
    z.object({
      name: z.string(),
      passed: z.boolean(),
      message: z.string().optional(),
      expected: z.unknown().optional(),
      actual: z.unknown().optional(),
    })
  ),
  quizResults: z.array(
    z.object({
      id: z.string(),
      passed: z.boolean(),
      answer: z.string().optional(),
      expected: z.string().optional(),
    })
  ).default([]),
  mistakeTypes: z.array(z.string()).default([]),
  diagnosis: z.string(),
  nextAction: z.string(),
  createdAt: z.string().datetime(),
});
