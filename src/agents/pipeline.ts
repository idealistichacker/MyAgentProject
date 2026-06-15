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
import { loadConfig } from '../state/fsState.js';

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

export async function generatePlan(
  learnerProfile: LearnerProfile,
  provider?: LLMProvider
): Promise<LearningPlan> {
  const now = nowIso();
  let units = SEED_CURRICULUM;

  if (provider) {
    try {
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
            // console.log(`\n🔍 FCAgent 正在调用工具: ${call.function.name}...`);
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
      
      let cleanContent = finalContent;
      const jsonBlockMatch = finalContent.match(/```json\n([\s\S]*?)\n```/);
      if (jsonBlockMatch) {
        cleanContent = jsonBlockMatch[1];
      } else {
        const startIdx = cleanContent.indexOf('[');
        const endIdx = cleanContent.lastIndexOf(']');
        if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
          cleanContent = cleanContent.substring(startIdx, endIdx + 1);
        } else {
          cleanContent = cleanContent.replace(/^[\s\S]*?```json\n?/, '').replace(/\n?```[\s\S]*?$/, '').trim();
        }
      }

      let parsed: any;
      try {
        parsed = JSON.parse(cleanContent);
      } catch (firstErr) {
        try {
          parsed = JSON.parse(sanitizeJsonString(cleanContent));
        } catch (secondErr) {
          console.warn('\n⚠️ Failed to parse JSON from LLM:\n', cleanContent);
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

import { llmCache } from '../utils/cache.js';
import color from 'picocolors';

export async function generateUnitContent(
  unit: SeedUnit,
  plan: LearningPlan,
  provider?: LLMProvider
): Promise<SeedUnit> {
  if (!provider) return ensureUnitFullyPopulated(unit);
  const learnerProfile = plan.learnerProfile;
  const projectUnit = plan.units.find(u => u.type === 'project');
  const projectContext = projectUnit ? `The final project for this curriculum is: ${projectUnit.title} (${projectUnit.description}). Your content MUST build towards this.` : 'Ensure content connects to the overall curriculum goals.';

  const cacheKey = `unit:${unit.id}:${unit.title}:${learnerProfile.target}:${learnerProfile.programmingLevel}`;
  const cachedUnit = await llmCache.get<SeedUnit>(cacheKey);
  if (cachedUnit) {
    console.log(color.magenta(`\n⚡ [LLM Cache HIT] 恢复已生成的单元: ${unit.title}`));
    return cachedUnit;
  }

  try {
    // 1. Web Search
    let searchResult = 'No search results available.';
    try {
      const toolManager = new ToolManager();
      const config = loadConfig();
      const webSearch = new WebSearchTool(config.searchProvider, config.tavilyApiKey);
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
    const config = loadConfig();
    toolManager.register(new WebSearchTool(config.searchProvider, config.tavilyApiKey));
    toolManager.register(new TimeTool());
    toolManager.register(new ExecuteCommandTool());
    toolManager.register(new FileReadTool());
    toolManager.register(new FileWriteTool());

    const isProject = unit.type === 'project';
    const projectDraftInstruction = isProject ? 'Since this is a PROJECT unit, generate a detailed Project Specification (similar to CS61A Ants/Scheme) detailing the architecture, phases of development, and module interactions instead of a regular conceptual lesson.' : 'Generate a rich, detailed markdown content explanation including technical definitions, examples, and deep explanation.';

    const draftPrompt = `
You are FCAgent ContentGenerator, an elite, charismatic AI tutor with the rigor of UC Berkeley's CS61A but the humor and storytelling ability of a top-tier science communicator.
Your task is to write a highly engaging, relatable, and human-like technical course draft in Chinese about the following unit.

Unit Outline:
- Title: ${unit.title}
- Type: ${unit.type || 'unit'}
- Description: ${unit.description}
- Objectives: ${unit.objectives.join(', ')}

Curriculum Context:
${projectContext}

Learner Profile:
- Target: ${learnerProfile.target}
- Programming Level: ${learnerProfile.programmingLevel}
- DSA Level: ${learnerProfile.dsaLevel}
- Learning Style: ${learnerProfile.learningStyle}

Search Results from Web:
${searchResult}

${projectDraftInstruction} Keep the draft dense and focused (under 1200 words in Chinese).
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
    const projectCritiqueInstruction = isProject ? 'Ensure the Project Spec is detailed, explaining tricky architectural edge cases and providing comprehensive walk-throughs of how different modules interact.' : 'Provide additional insights, explain tricky edge cases, and add comprehensive practical walk-through examples or "gotchas".';

    const critiquePrompt = `
You are FCAgent ContentCritic. Your task is to critique and significantly expand the course draft below to ensure it meets the rigorous academic and pedagogical standards of UC Berkeley's CS61A.
Ensure the content is technically deep, impeccably clear, conforms to the learning objectives, and has zero factual errors.
${projectCritiqueInstruction}

Objectives: ${unit.objectives.join(', ')}
Search Results Context:
${searchResult}

Original Draft:
${draftContent}

Provide the expanded and corrected course content in Chinese. Focus on technical depth and gotchas, keeping the total content rich but under 1500 words in Chinese. Do not format as JSON yet, output the refined Markdown draft.
`.trim();

    const critiqueRes = await provider.chat([
      { role: 'system', content: 'You are an elite technical reviewer and educator.' },
      { role: 'user', content: critiquePrompt }
    ], { temperature: 0.3 });

    const refinedDraft = critiqueRes.content || '';
    console.log('✅ Pass 2: 提炼与扩展完成。');

    // 4. Pass 3: Final Polishing, Quiz & Starter Code Generation (Refinement 2)
    console.log('💎 Pass 3: 格式化与精修 (Format & Polish)...');
    const projectFinalInstruction = isProject ? `
CS61A Pedagogical Rules for PROJECT STARTER_CODE:
- The exercise MUST be a robust multi-phase project skeleton (e.g. Phase 1, Phase 2) with clear TODOs and docstrings.
- The quiz MUST focus on testing the learner's understanding of the project architecture and module design, rather than isolated syntax.
- The \`testCode\` MUST be a comprehensive integration test that runs tests across the project skeleton.
` : `
CS61A Pedagogical Rules for STARTER_CODE:
- Must include a rich docstring (e.g. TSDoc or Python Docstring) explaining the problem.
- Must include "doctest" style input/output examples within the comment (e.g. \`>>> funcName(1)\\n2\`).
- Must use step-by-step TODO comments to scaffold the solution for the learner (e.g. \`// Step 1: Base case...\`, \`# Step 2: Recursive call...\`).
- Do NOT simply provide an empty function. Give them a robust skeleton!
`;

    const finalPrompt = `
You are FCAgent FinalPolisher. Format the refined learning materials into the final required three-part output format.
Ensure the final output reflects the premium quality of CS61A, infused with an engaging, narrative-driven human touch.

You must construct:
1. A JSON block containing a quiz and a programming exercise.
   - The Quiz MUST be scenario-based and interesting (e.g., helping a character solve a problem), not just dry conceptual questions.
   - The Exercise Starter Code MUST have thematic variable names and problem descriptions that tie directly into the Curriculum Context (${projectContext}). Make it feel like part of an epic quest.
   - Choose ANY programming language that best fits the learning objective (e.g. 'typescript', 'python', 'bash', 'rust', 'cpp', 'java', 'go', etc.).
   - You MUST also provide a \`testCode\` field in the exercise JSON. This code will be compiled/executed remotely along with the user's \`starterCode\`. The \`testCode\` must import/call the user's entrypoint, run the test cases, and print exactly one JSON line per test case in the format: \`{"name": "test name", "passed": true/false, "message": "optional error message", "expected": "...", "actual": "..."}\`.
   - For bash exercises, assertionMode should likely be 'stdout'. For others it can be 'return' or 'mutate-and-return'.
2. The final Markdown CONTENT (using the refined course content). Keep it dense and copy it directly from the refined draft without expanding it with unnecessary verbose prose.
3. The STARTER_CODE block for the exercise. This must be the raw code for the exercise.
${projectFinalInstruction}

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
    "hints": ["hint 1"],
    "testCode": "import json\\nfrom solution import actual_function_name\\n...print(json.dumps({'name': 'test 1', 'passed': True}))"
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
      const rawJson = jsonMatch[1].trim();
      let parsed: any;
      try {
        parsed = JSON.parse(rawJson);
      } catch (firstErr) {
        try {
          parsed = JSON.parse(sanitizeJsonString(rawJson));
        } catch (secondErr) {
          throw firstErr;
        }
      }
      
      const content = contentMatch ? contentMatch[1].trim() : '';
      let starterCode = starterCodeMatch ? starterCodeMatch[1].trim() : '';
      starterCode = starterCode.replace(/```[a-zA-Z]*\n?/g, '').replace(/```\n?/g, '').trim();

      const finalUnit = {
        ...unit,
        content: content || unit.content || '',
        quiz: parsed.quiz || unit.quiz || [],
        exercise: parsed.exercise ? { ...parsed.exercise, starterCode } : unit.exercise,
        passCriteria: unit.passCriteria || { quizMinScore: 1, exerciseMustPass: true },
      };

      await llmCache.set(cacheKey, finalUnit);
      return finalUnit;
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

  const score = passed ? 5 : exercisePassed ? Math.max(2, quizScore) : quizPassed ? 3 : 1;
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

  return `学习者目标：${profile.target}。当前 编程语言水平：${profile.programmingLevel}；DSA 水平：${profile.dsaLevel}。每周预计投入 ${profile.weeklyHours} 小时，计划总时长 ${profile.totalWeeks} 周，偏好${styleMap[profile.learningStyle] ?? '混合'}学习，节奏为${paceMap[profile.pace] ?? '正常'}。`;
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

export function sanitizeJsonString(jsonStr: string): string {
  let result = '';
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];

    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      if (inString) {
        escapeNext = true;
      }
      continue;
    }

    if (char === '"') {
      if (!inString) {
        inString = true;
        result += char;
      } else {
        let nextNonWhitespace = '';
        for (let j = i + 1; j < jsonStr.length; j++) {
          if (!/\s/.test(jsonStr[j])) {
            nextNonWhitespace = jsonStr[j];
            break;
          }
        }

        if (nextNonWhitespace === ':' || nextNonWhitespace === ',' || nextNonWhitespace === '}' || nextNonWhitespace === ']') {
          inString = false;
          result += char;
        } else {
          result += '\\"';
        }
      }
      continue;
    }

    result += char;
  }

  return result;
}
