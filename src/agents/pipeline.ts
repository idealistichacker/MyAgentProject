import { z } from 'zod';
import { getSeedUnit, SEED_CURRICULUM } from '../curriculum/seed.js';
import type {
  AssessmentResult,
  LearnerProfile,
  LearningPlan,
  QuizQuestion,
  SeedUnit,
  TestResult,
} from '../types.js';
import type { LLMProvider, ChatMessage } from '../providers/types.js';
import { ToolManager, WebSearchTool, TimeTool, ExecuteCommandTool, FileReadTool, FileWriteTool } from './tools.js';

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
You are FCAgent DiagnoseAgent. Summarize the learner profile in Chinese in 3-5 sentences.
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

export async function generatePlan(
  learnerProfile: LearnerProfile,
  provider?: LLMProvider
): Promise<LearningPlan> {
  const now = nowIso();
  let units = SEED_CURRICULUM;

  if (provider) {
    try {
      const toolManager = new ToolManager();
      toolManager.register(new WebSearchTool());
      toolManager.register(new TimeTool());

      const prompt = `
You are FCAgent CurriculumPlanner. Generate a personalized learning curriculum array (JSON) with exactly 2 units based on the learner profile.

IMPORTANT RULES:
1. First priority: Use the \`search_web\` tool to search for latest and highly-quality resources relating to the learner's goal.
2. Second priority: Use your internal parametric knowledge to combine with search results.
3. Once you have enough info, return the final JSON array.

The JSON output MUST be a valid array of objects matching this schema:
[{
  "id": "unique-unit-id",
  "title": "Unit Title",
  "description": "Brief description",
  "prerequisites": ["prereq1"],
  "objectives": ["obj1"]
}]

Do not include markdown codeblocks (\`\`\`json) in the final string, just the raw JSON array.
Learner Profile:
${JSON.stringify(learnerProfile, null, 2)}
`.trim();

      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are a JSON-only curriculum planner with web search capabilities.' },
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
            console.log(`\n🔍 FCAgent 正在调用工具: ${call.function.name}...`);
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
      
      const parsed = JSON.parse(finalContent.replace(/^[\s\S]*?```json\n?/, '').replace(/\n?```[\s\S]*?$/, '').trim());
      if (Array.isArray(parsed) && parsed.length > 0) {
        units = parsed.map((u: any, index: number) => ({
          ...u,
          id: u.id || `dyn-unit-${index}`,
          title: u.title || 'Untitled',
          description: u.description || '',
          prerequisites: u.prerequisites || [],
          objectives: u.objectives || [],
          passCriteria: { quizMinScore: 1, exerciseMustPass: true },
        })) as SeedUnit[];
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

function ensureUnitFullyPopulated(unit: SeedUnit): SeedUnit {
  const seedUnit = getSeedUnit(unit.id);
  const merged = { ...seedUnit, ...unit };
  return {
    ...merged,
    content: merged.content || `# ${merged.title}\n\n${merged.description}\n\n*（注：当前学习资料为基础预备版本，您可以稍后尝试重新生成以获得大模型提炼的完整内容）*`,
    quiz: merged.quiz || [
      {
        id: 'q1',
        type: 'choice',
        question: `关于《${merged.title}》，以下哪个表述是最合适的？`,
        options: [
          `它是关于：${merged.description}`,
          '它没有任何实际用途',
          '它只适用于初学者',
          '它完全不需要任何前置知识'
        ],
        answer: `它是关于：${merged.description}`,
        explanation: `根据单元描述，《${merged.title}》的主旨是：${merged.description}`
      }
    ],
    exercise: merged.exercise || {
      id: `ex-${merged.id}`,
      language: 'typescript',
      entrypoint: 'placeholderFunc',
      description: `针对《${merged.title}》的占位练习。请根据所学内容实现相关逻辑。`,
      assertionMode: 'return',
      starterCode: `/**
 * 针对《${merged.title}》的练习函数。
 * 
 * TODO: 请实现对应的逻辑。
 * 
 * 示例:
 * >>> placeholderFunc()
 * true
 */
export function placeholderFunc(): boolean {
  // TODO: Step 1 - 实现你的逻辑
  return true;
}
`,
      testCases: [
        { name: 'default case', input: [], expected: true }
      ],
      hints: ['请先完成核心概念的学习，然后再尝试此练习。']
    },
    passCriteria: merged.passCriteria || { quizMinScore: 1, exerciseMustPass: true }
  };
}

export async function generateUnitContent(
  unit: SeedUnit,
  learnerProfile: LearnerProfile,
  provider?: LLMProvider
): Promise<SeedUnit> {
  if (!provider) return ensureUnitFullyPopulated(unit);

  try {
    // 1. Web Search
    let searchResult = 'No search results available.';
    try {
      const toolManager = new ToolManager();
      const webSearch = new WebSearchTool();
      const query = `${unit.title} ${unit.objectives?.[0] || ''}`.trim();
      console.log(`\n🔍 FCAgent ContentGenerator 正在联网检索资料: "${query}"...`);
      searchResult = await webSearch.execute({ query });
      console.log(`📥 联网检索资料获取完成 (大小: ${searchResult.length} 字符)。`);
    } catch (searchErr: any) {
      console.warn('⚠️ 联网检索失败，将使用 LLM 内部参数化知识。', searchErr.message);
    }

    // 2. Pass 1: Generate Initial Draft (with Tool Support)
    console.log('📝 Pass 1: 生成初稿 (Drafting)...');
    const toolManager = new ToolManager();
    toolManager.register(new WebSearchTool());
    toolManager.register(new TimeTool());
    toolManager.register(new ExecuteCommandTool());
    toolManager.register(new FileReadTool());
    toolManager.register(new FileWriteTool());

    const draftPrompt = `
You are FCAgent ContentGenerator, an elite AI tutor designed to produce educational content at the rigor of UC Berkeley's CS61A.
Your task is to write a comprehensive, high-quality, detailed technical course draft in Chinese about the following unit.

Unit Outline:
- Title: ${unit.title}
- Description: ${unit.description}
- Objectives: ${unit.objectives.join(', ')}

Learner Profile:
- Target: ${learnerProfile.target}
- Programming Level: ${learnerProfile.programmingLevel}
- DSA Level: ${learnerProfile.dsaLevel}
- Learning Style: ${learnerProfile.learningStyle}

Search Results from Web:
${searchResult}

Generate a rich, detailed markdown content explanation including technical definitions, examples, and deep explanation. Keep the draft dense and focused (under 800 words in Chinese).
Feel free to use tools to execute quick node scripts, read existing files, or do web searches to ensure absolute technical accuracy and ZERO factual errors. Once you have enough context, return the final draft.
Do not format as JSON yet, just generate a deep markdown document draft.
`.trim();

    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a highly-qualified computer science educator, teaching at the level of CS61A.' },
      { role: 'user', content: draftPrompt }
    ];

    let draftContent = '';
    for (let i = 0; i < 5; i++) {
      const draftRes = await provider.chat(messages, { 
        temperature: 0.5,
        tools: toolManager.getToolsDefinitions()
      });

      if (draftRes.tool_calls && draftRes.tool_calls.length > 0) {
        messages.push({
          role: 'assistant',
          content: draftRes.content,
          tool_calls: draftRes.tool_calls
        });

        for (const call of draftRes.tool_calls) {
          console.log(`\n🔍 FCAgent ContentGenerator 正在调用工具: ${call.function.name}...`);
          const result = await toolManager.executeToolCall(call.function.name, call.function.arguments);
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.function.name,
            content: result
          });
        }
      } else {
        draftContent = draftRes.content || '';
        break;
      }
    }
    console.log('✅ Pass 1: 初稿生成完毕。');

    // 3. Pass 2: Critique and Expand (Refinement 1)
    console.log('🔧 Pass 2: 提炼与深度扩展 (Critique & Expand)...');
    const critiquePrompt = `
You are FCAgent ContentCritic. Your task is to critique and significantly expand the course draft below to ensure it meets the rigorous academic and pedagogical standards of UC Berkeley's CS61A.
Ensure the content is technically deep, impeccably clear, conforms to the learning objectives, and has zero factual errors.
Provide additional insights, explain tricky edge cases, and add comprehensive practical walk-through examples or "gotchas".

Objectives: ${unit.objectives.join(', ')}
Search Results Context:
${searchResult}

Original Draft:
${draftContent}

Provide the expanded and corrected course content in Chinese. Focus on technical depth and gotchas, keeping the total content rich but under 1000 words in Chinese. Do not format as JSON yet, output the refined Markdown draft.
`.trim();

    const critiqueRes = await provider.chat([
      { role: 'system', content: 'You are an elite technical reviewer and educator.' },
      { role: 'user', content: critiquePrompt }
    ], { temperature: 0.3 });

    const refinedDraft = critiqueRes.content || '';
    console.log('✅ Pass 2: 提炼与扩展完成。');

    // 4. Pass 3: Final Polishing, Quiz & Starter Code Generation (Refinement 2)
    console.log('💎 Pass 3: 格式化与精修 (Format & Polish)...');
    const finalPrompt = `
You are FCAgent FinalPolisher. Format the refined learning materials into the final required three-part output format.
Ensure the final output reflects the premium quality of CS61A.

You must construct:
1. A JSON block containing a quiz (choice questions with options, answers, and detailed explanations) and a programming exercise (starter code description, test cases with assertion mode). The exercise should be challenging and deeply educational, matching CS61A rigor.
   - Choose the MOST APPROPRIATE programming language for this unit (e.g. 'typescript', 'python', 'bash').
   - For bash exercises, assertionMode should likely be 'stdout'. For python/typescript it can be 'return' or 'mutate-and-return'.
2. The final Markdown CONTENT (using the refined course content). Keep it dense and copy it directly from the refined draft without expanding it with unnecessary verbose prose.
3. The STARTER_CODE block for the exercise. This must be the raw code for the exercise.

CS61A Pedagogical Rules for STARTER_CODE:
- Must include a rich docstring (e.g. TSDoc or Python Docstring) explaining the problem.
- Must include "doctest" style input/output examples within the comment (e.g. \`>>> funcName(1)\n2\`).
- Must use step-by-step TODO comments to scaffold the solution for the learner (e.g. \`// Step 1: Base case...\`, \`# Step 2: Recursive call...\`).
- Do NOT simply provide an empty function. Give them a robust skeleton!

The output MUST contain exactly these three sections, using your generated exercise code and quiz instead of the template examples:
\`\`\`json
{
  "quiz": [
    {
      "id": "q1",
      "type": "choice",
      "question": "...",
      "options": ["A", "B", "C", "D"],
      "answer": "A",
      "explanation": "..."
    }
  ],
  "exercise": {
    "id": "ex-1",
    "language": "python",
    "entrypoint": "actual_function_name",
    "description": "...",
    "assertionMode": "return",
    "testCases": [
      { "name": "test 1", "input": ["actual_input"], "expected": "actual_output" }
    ],
    "hints": ["hint 1"]
  }
}
\`\`\`

### CONTENT
# Markdown content...
(Put the final polished and expanded course content here, using clear typography, H2/H3 headers, and bold text)

### STARTER_CODE
/**
 * Detailed description of the function...
 * 
 * Examples:
 * >>> actualFunctionName("actual_input")
 * "actual_output"
 */
export function actualFunctionName(args: any): any {
  // TODO: Step 1 - ...
  // TODO: Step 2 - ...
  return null;
}

Refined Course Draft:
${refinedDraft}

Learner Programming Level: ${learnerProfile.programmingLevel}
Learner DSA Level: ${learnerProfile.dsaLevel}
`.trim();

    const finalRes = await provider.chat([
      { role: 'system', content: 'You are a JSON-only curriculum content generator.' },
      { role: 'user', content: finalPrompt }
    ], { temperature: 0.2 });

    const responseContent = finalRes.content || '';
    console.log('✅ Pass 3: 格式精修完成。');

    try {
      const jsonMatch = responseContent.match(/```json\n([\s\S]*?)\n```/);
      const contentMatch = responseContent.match(/### CONTENT\n([\s\S]*?)(?=\n### STARTER_CODE|$)/);
      const starterCodeMatch = responseContent.match(/### STARTER_CODE\n([\s\S]*)$/);

      if (!jsonMatch) throw new Error('Missing JSON block');
      const parsed = JSON.parse(jsonMatch[1].trim());
      
      const content = contentMatch ? contentMatch[1].trim() : '';
      let starterCode = starterCodeMatch ? starterCodeMatch[1].trim() : '';
      starterCode = starterCode.replace(/```[a-zA-Z]*\n?/g, '').replace(/```\n?/g, '').trim();

      return {
        ...unit,
        content: content || unit.content || '',
        quiz: parsed.quiz || unit.quiz || [],
        exercise: parsed.exercise ? { ...parsed.exercise, starterCode } : unit.exercise,
        passCriteria: unit.passCriteria || { quizMinScore: 1, exerciseMustPass: true },
      };
    } catch (parseErr) {
      console.warn('Response parsing failed. Raw response was:', responseContent);
      throw parseErr;
    }
  } catch (err) {
    console.warn('Failed to generate dynamic unit content, falling back to basic.', err);
    return ensureUnitFullyPopulated(unit);
  }
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
    const actual = answers[question.id]?.trim();
    const expected = question.answer.trim();
    const passed = actual?.toLowerCase() === expected.toLowerCase();
    return {
      id: question.id,
      passed,
      answer: actual || '',
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

  const score = passed ? 5 : exercisePassed ? Math.max(2, quizScore) : quizPassed ? 3 : 1;
  let diagnosis = buildFallbackAssessmentDiagnosis(unit, testResults, quizResults, score);
  let nextAction = passed
    ? `通过本单元。建议执行 fc next 进入${unit.nextIfPassed ? ' ' + unit.nextIfPassed : '下一单元'}。`
    : `未通过本单元。建议先查看错题和测试失败信息，再执行 fc submit ${unit.id} 重新提交。`;

  if (provider) {
    try {
      const prompt = `
You are FCAgent AssessmentReviewer, an elite teaching assistant mirroring the pedagogy of CS61A. The learner just completed a unit.
Unit: ${unit.title}
Passed: ${passed}
Test Results: ${JSON.stringify(testResults)}
Quiz Results: ${JSON.stringify(quizResults)}

Learner's Actual Code Submission:
\`\`\`typescript
${learnerCode || 'No code provided'}
\`\`\`

Analyze their performance:
1. If tests failed, look at the actual code and test errors, and point out specifically where their logic went wrong (without giving the exact code answer away). Give a helpful hint.
2. If concepts failed, explain the misconception.
3. Write a supportive, concise diagnosis (3-4 sentences in Chinese).
4. Write a short 1-sentence nextAction recommending what to do next.

Return exactly valid JSON ONLY:
{ "diagnosis": "...", "nextAction": "..." }
`.trim();
      const response = await provider.chat([
        { role: 'system', content: 'You are a JSON-only assessment reviewer.' },
        { role: 'user', content: prompt }
      ], { temperature: 0.2 });
      
      const responseContent = response.content || '';
      const parsed = JSON.parse(responseContent.replace(/^[\s\S]*?```json\n?/, '').replace(/\n?```[\s\S]*?$/, '').trim());
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

export function adaptNextUnit(plan: LearningPlan, assessment: AssessmentResult): { currentIndex: number; reason: string } {
  const currentIndex = plan.units.findIndex((item) => item.id === assessment.unitId);
  if (currentIndex === -1) {
    return { currentIndex: plan.currentIndex, reason: 'Unknown unit.' };
  }

  if (assessment.passed) {
    const nextIndex = Math.min(plan.units.length - 1, currentIndex + 1);
    return {
      currentIndex: nextIndex,
      reason: assessment.passed ? 'Passed current unit.' : 'Need remedial practice.',
    };
  }

  return {
    currentIndex,
    reason: 'Failed current unit. Stay on this unit for remedial practice.',
  };
}

function buildFallbackDiagnosis(profile: LearnerProfile): string {
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

  return `学习者目标：${profile.target}。当前 编程语言水平：${profile.programmingLevel}；DSA 水平：${profile.dsaLevel}。每周预计投入 ${profile.weeklyHours} 小时，偏好${styleMap[profile.learningStyle] ?? '混合'}学习，节奏为${paceMap[profile.pace] ?? '正常'}。`;
}

function buildFallbackAssessmentDiagnosis(
  unit: SeedUnit,
  testResults: TestResult[],
  quizResults: AssessmentResult['quizResults'],
  score: number
): string {
  const failedTests = testResults.filter((result) => !result.passed);
  const failedQuizzes = quizResults.filter((result) => !result.passed);

  const parts: string[] = [`本单元《${unit.title}》评分：${score}/5。`];

  if (failedTests.length === 0) {
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
