import { z } from 'zod';
import { getSeedUnit } from '../curriculum/seed.js';
import { exerciseSchema, projectSpecSchema, quizQuestionSchema } from '../types.js';
import type { AssessmentResult, LearningPlan, SeedUnit } from '../types.js';
import type { LLMProvider } from '../providers/types.js';
import { ToolManager, WebSearchTool } from './tools.js';
import { loadConfig } from '../state/fsState.js';
import { llmCache } from '../utils/cache.js';
import color from 'picocolors';
import { buildFallbackProjectSpec } from './fallbacks.js';
import { 
  parseJsonFromText, 
  extractRequiredSection, 
  extractOptionalSection, 
  stripCodeFence 
} from './generatedUnitParser.js';
import { 
  assertGeneratedUnitQuality, 
  normalizeExerciseLanguage, 
  NATIVE_RUNNER_LANGUAGES 
} from './generatedUnitQuality.js';

const exerciseMetadataSchema = exerciseSchema
  .omit({ starterCode: true, testCode: true })
  .extend({
    testCode: z.string().optional(),
  });

const generatedUnitMetadataSchema = z.object({
  quiz: z.array(quizQuestionSchema).min(1).max(5),
  exercise: exerciseMetadataSchema,
  project: projectSpecSchema.optional(),
});

export function ensureUnitFullyPopulated(unit: SeedUnit): SeedUnit {
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
    project: merged.project ?? (merged.type === 'project' ? buildFallbackProjectSpec(merged) : undefined),
    passCriteria: merged.passCriteria || { quizMinScore: 1, exerciseMustPass: true }
  };
}

const inFlightRequests = new Map<string, Promise<SeedUnit>>();

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

  if (inFlightRequests.has(cacheKey)) {
    console.log(color.magenta(`\n⚡ [DEDUPE] 复用正在生成的请求: ${unit.title}`));
    return inFlightRequests.get(cacheKey)!;
  }

  const promise = (async () => {
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

    // 2. Pass 1: Generate Initial Draft
    console.log('📝 Pass 1: 生成初稿 (Drafting)...');
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
Use only the supplied curriculum context, learner profile, and search excerpts. Prioritize technical accuracy, concrete examples, and a clean learning arc. Once you have enough context, return the final draft.
Do not format as JSON yet, just generate a deep markdown document draft.
`.trim();

    const draftRes = await provider.chat([
      { role: 'system', content: 'You are a highly-qualified computer science educator, teaching at the level of CS61A.' },
      { role: 'user', content: draftPrompt }
    ], { temperature: 0.45 });

    const draftContent = draftRes.content || '';
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
- Prefer TypeScript, Python, Bash, or Rust so the local runner can execute the exercise without a cloud dependency.
- The JSON metadata MUST include a "project" object. Treat it as a real CS61A-style project spec, not a marketing summary.
- The project object must include:
  - id, title, narrative, drivingQuestion
  - at least 2 deliverables
  - at least 3 milestones with learnerTasks and acceptanceCriteria
  - files that reference PROJECT.md and the generated solution file
  - at least 3 rubric items with points and evidence
  - extensionIdeas for ambitious learners
` : `
CS61A Pedagogical Rules for STARTER_CODE:
- Must include a rich docstring (e.g. TSDoc or Python Docstring) explaining the problem.
- Must include "doctest" style input/output examples within the comment (e.g. \`>>> funcName(1)\\n2\`).
- Must use step-by-step TODO comments to scaffold the solution for the learner (e.g. \`// Step 1: Base case...\`, \`# Step 2: Recursive call...\`).
- Do NOT simply provide an empty function. Give them a robust skeleton!
`;

    const projectMetadataTemplate = isProject ? `,
  "project": {
    "id": "project-unit-id",
    "title": "Project title",
    "narrative": "Why this project matters and how it connects the previous units.",
    "drivingQuestion": "A precise design question the learner must answer.",
    "deliverables": ["working implementation", "short design note"],
    "milestones": [
      {
        "id": "phase-1",
        "title": "Phase 1: ...",
        "goal": "...",
        "learnerTasks": ["..."],
        "acceptanceCriteria": ["..."]
      }
    ],
    "files": [
      { "path": "PROJECT.md", "purpose": "Project spec" },
      { "path": "solution.ts", "purpose": "Main implementation file" }
    ],
    "rubric": [
      { "criterion": "Correctness", "points": 4, "evidence": "..." }
    ],
    "extensionIdeas": ["..."],
    "checkpointQuestions": ["What is the core invariant of Phase 1?"]
  }` : '';

    const finalPrompt = `
You are FCAgent FinalPolisher. Format the refined learning materials into the final required output format.
Ensure the final output reflects the premium quality of CS61A, infused with an engaging, narrative-driven human touch.

You must construct:
1. A JSON metadata block containing a quiz and programming exercise metadata.
   - The Quiz MUST be scenario-based and interesting (e.g., helping a character solve a problem), not just dry conceptual questions.
   - The Exercise Starter Code MUST have thematic variable names and problem descriptions that tie directly into the Curriculum Context (${projectContext}). Make it feel like part of an epic quest.
   - Prefer one of these locally supported languages unless the objective truly requires otherwise: ${NATIVE_RUNNER_LANGUAGES.join(', ')}.
   - Do NOT include starterCode inside the JSON. Put raw code only in STARTER_CODE.
   - If you choose a non-local language, provide raw test code in TEST_CODE. Otherwise omit TEST_CODE and rely on testCases.
   - Include at least 3 meaningful testCases: a normal case, an edge case, and a misconception-catching case.
   - For bash exercises, assertionMode should likely be 'stdout'. For others it can be 'return' or 'mutate-and-return'.
2. The final Markdown CONTENT (using the refined course content). Keep it dense and copy it directly from the refined draft without expanding it with unnecessary verbose prose.
3. The STARTER_CODE block for the exercise. This must be raw code only.
4. Optional TEST_CODE block for non-local languages only.
${projectFinalInstruction}

The output MUST contain these sections, using your generated exercise code and quiz instead of the template examples:
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
      { "name": "normal case", "input": ["actual_input"], "expected": "actual_output" },
      { "name": "edge case", "input": [""], "expected": "" },
      { "name": "misconception guard", "input": ["tricky_input"], "expected": "correct_output" }
    ],
    "hints": ["hint 1", "hint 2"],
    "difficulty": "medium",
    "conceptTags": ["tag1", "tag2"],
    "commonPitfalls": ["forgetting base case"],
    "estimatedMinutes": 15
  }${projectMetadataTemplate}
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

### TEST_CODE
(Only include this section for non-local languages. It must print exactly one JSON line per test case.)

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
      const finalUnit = buildGeneratedUnit(unit, responseContent);

      await llmCache.set(cacheKey, finalUnit);
      return finalUnit;
    } catch (parseErr) {
      console.warn('Response parsing failed. Asking the model for one structured repair...');
      const repairedUnit = await repairGeneratedUnit(unit, responseContent, provider);
      await llmCache.set(cacheKey, repairedUnit);
      return repairedUnit;
    }
    }
  })();

  inFlightRequests.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

export async function generateRemediationUnit(
  failedUnit: SeedUnit,
  assessment: AssessmentResult,
  plan: LearningPlan,
  provider?: LLMProvider
): Promise<SeedUnit> {
  const outline = buildRemediationOutline(failedUnit, assessment);
  if (!provider) {
    return ensureUnitFullyPopulated(outline);
  }

  const cacheKey = `remediation:${JSON.stringify({
    unitId: failedUnit.id,
    mistakeTypes: assessment.mistakeTypes,
    failedTests: assessment.testResults.filter((item) => !item.passed).map((item) => item.name),
    failedQuizzes: assessment.quizResults.filter((item) => !item.passed).map((item) => item.id),
    learnerLevel: plan.learnerProfile.programmingLevel,
  })}`;
  const cachedUnit = await llmCache.get<SeedUnit>(cacheKey);
  if (cachedUnit) {
    console.log(color.magenta(`\n⚡ [LLM Cache HIT] 恢复补救单元: ${cachedUnit.title}`));
    return cachedUnit;
  }

  if (inFlightRequests.has(cacheKey)) {
    console.log(color.magenta(`\n⚡ [DEDUPE] 复用正在生成的补救单元请求: ${outline.title}`));
    return inFlightRequests.get(cacheKey)!;
  }

  const promise = (async () => {
    const remediationPrompt = `
You are FCAgent RemediationPlanner, an expert CS teaching assistant.
Create a compact, high-leverage remediation unit in Chinese for a learner who failed the current unit.
The remediation must be shorter than a normal unit, but it must be concrete, runnable, and diagnostic.

Learner profile:
${JSON.stringify(plan.learnerProfile, null, 2)}

Failed unit:
${JSON.stringify({
    id: failedUnit.id,
    title: failedUnit.title,
    description: failedUnit.description,
    objectives: failedUnit.objectives,
    exercise: failedUnit.exercise
      ? {
          language: failedUnit.exercise.language,
          entrypoint: failedUnit.exercise.entrypoint,
          description: failedUnit.exercise.description,
        }
      : undefined,
  }, null, 2)}

Assessment result:
${JSON.stringify({
    score: assessment.score,
    mistakeTypes: assessment.mistakeTypes,
    failedTests: assessment.testResults.filter((item) => !item.passed),
    failedQuizzes: assessment.quizResults.filter((item) => !item.passed),
    diagnosis: assessment.diagnosis,
  }, null, 2)}

Design rules:
- This is a micro-remediation unit, not a replacement for the failed unit.
- Teach the smallest missing mental model that would unlock the failed unit.
- Use a fresh drill exercise that is easier than the failed exercise but targets the same misconception.
- Prefer ${NATIVE_RUNNER_LANGUAGES.join(', ')} so the runner stays local.
- Include at least 3 testCases and at least 2 hints.
- Do not include starterCode inside JSON. Put raw starter code only in STARTER_CODE.

Return exactly this format:
\`\`\`json
{
  "quiz": [
    { "id": "q1", "type": "choice", "question": "...", "options": ["A", "B", "C", "D"], "answer": "A", "explanation": "..." }
  ],
  "exercise": {
    "id": "ex-${outline.id}",
    "language": "typescript",
    "entrypoint": "actualFunctionName",
    "description": "...",
    "assertionMode": "return",
    "testCases": [
      { "name": "normal case", "input": [], "expected": true },
      { "name": "edge case", "input": [], "expected": true },
      { "name": "misconception guard", "input": [], "expected": false }
    ],
    "hints": ["...", "..."],
    "difficulty": "easy",
    "conceptTags": ["core-concept"],
    "commonPitfalls": ["..."],
    "estimatedMinutes": 10
  }
}
\`\`\`

### CONTENT
# ${outline.title}
...

### STARTER_CODE
...
`.trim();

  try {
    const response = await provider.chat([
      { role: 'system', content: 'You generate compact, structured remediation units for CS learners. Return only the requested sections.' },
      { role: 'user', content: remediationPrompt },
    ], { temperature: 0.2 });

    const remediationUnit = buildGeneratedUnit(outline, response.content || '');
    await llmCache.set(cacheKey, remediationUnit);
    return remediationUnit;
  } catch (err) {
    console.warn('Failed to generate remediation unit. Asking for one structured repair...', err);
    try {
      const repairedUnit = await repairGeneratedUnit(outline, remediationPrompt, provider);
      await llmCache.set(cacheKey, repairedUnit);
      return repairedUnit;
    } catch (repairErr) {
      console.warn('Failed to repair remediation unit, falling back to local scaffold.', repairErr);
      return ensureUnitFullyPopulated(outline);
    }
  }
  })();

  inFlightRequests.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

function buildRemediationOutline(failedUnit: SeedUnit, assessment: AssessmentResult): SeedUnit {
  const remediationId = `remed-${failedUnit.id}`;
  const failedTestNames = assessment.testResults
    .filter((item) => !item.passed)
    .map((item) => item.name);
  const failedQuizIds = assessment.quizResults
    .filter((item) => !item.passed)
    .map((item) => item.id);
  const focus = [
    ...assessment.mistakeTypes,
    ...failedTestNames,
    ...failedQuizIds,
  ].filter(Boolean).join('、') || '核心概念和边界条件';

  return {
    id: remediationId,
    type: 'remediation',
    title: `补救单元：${failedUnit.title} 的关键误区拆解`,
    description: `针对 ${failedUnit.title} 的失败反馈，聚焦 ${focus}，用一个更小的练习补齐关键心智模型。`,
    prerequisites: [failedUnit.id],
    objectives: [
      `复盘 ${failedUnit.title} 中暴露的关键误区`,
      '用更小的输入规模重建正确的推理步骤',
      '通过 micro-drill 后回到原单元重新提交',
    ],
    references: [],
    remediationForUnitId: failedUnit.id,
    nextIfPassed: failedUnit.id,
    nextIfFailed: remediationId,
    passCriteria: { quizMinScore: 1, exerciseMustPass: true },
    content: [
      `# 补救单元：${failedUnit.title} 的关键误区拆解`,
      '',
      `你刚才在《${failedUnit.title}》里遇到了阻力。系统检测到的主要信号是：${focus}。`,
      '',
      '这个补救单元不会重复整章内容，而是把问题缩小到一个更容易观察的检查点：先说清楚输入、输出和不变量，再用最小测试证明自己真的理解了规则。',
      '',
      '## 复盘方式',
      '',
      '1. 先阅读失败测试名和诊断反馈。',
      '2. 写下你以为代码会返回什么。',
      '3. 再运行小练习，用测试结果校正推理。',
      '4. 通过后执行 `fc next` 回到原单元继续挑战。',
    ].join('\n'),
    quiz: [
      {
        id: 'q1',
        type: 'choice',
        question: '补救单元最应该优先修复什么？',
        options: ['把原题答案背下来', '找出失败测试暴露的最小误区', '跳过所有测试', '只修改输出格式'],
        answer: '找出失败测试暴露的最小误区',
        explanation: '补救单元的目标是修复心智模型，而不是记答案。',
      },
    ],
    exercise: {
      id: `ex-${remediationId}`,
      language: 'typescript',
      entrypoint: 'chooseRemediationMove',
      description: '根据失败信号选择下一步补救动作。',
      assertionMode: 'return',
      starterCode: `export function chooseRemediationMove(signal: string): string {
  // TODO: Step 1 - normalize the signal so casing does not distract you.
  // TODO: Step 2 - if it mentions a test, inspect the smallest failing input.
  // TODO: Step 3 - if it mentions a concept, restate the invariant in your own words.
  return 'restate-invariant';
}
`,
      testCases: [
        { name: 'test failure asks for smallest input', input: ['failed test: edge case'], expected: 'inspect-smallest-input' },
        { name: 'concept gap asks for invariant', input: ['concept-gap'], expected: 'restate-invariant' },
        { name: 'execution error asks for runner signal', input: ['execution-error'], expected: 'read-runner-message' },
      ],
      hints: [
        '失败测试名通常告诉你应该先缩小哪个输入。',
        '概念错误通常要先重述不变量，再改代码。',
      ],
    },
  };
}

function buildGeneratedUnit(unit: SeedUnit, responseContent: string): SeedUnit {
  const parsed = generatedUnitMetadataSchema.parse(parseJsonFromText(responseContent));
  const content = extractRequiredSection(responseContent, 'CONTENT');
  const starterCode = stripCodeFence(extractRequiredSection(responseContent, 'STARTER_CODE'));
  const testCodeSection = extractOptionalSection(responseContent, 'TEST_CODE');
  const language = normalizeExerciseLanguage(parsed.exercise.language);
  const isNativeLanguage = NATIVE_RUNNER_LANGUAGES.includes(language as typeof NATIVE_RUNNER_LANGUAGES[number]);
  const testCode = isNativeLanguage
    ? undefined
    : stripCodeFence(parsed.exercise.testCode ?? testCodeSection ?? '');

  const exercise = exerciseSchema.parse({
    ...parsed.exercise,
    language,
    starterCode,
    testCode: testCode || undefined,
  });
  const project = unit.type === 'project'
    ? projectSpecSchema.parse(parsed.project)
    : undefined;

  assertGeneratedUnitQuality(unit, content, parsed.quiz, exercise, project);

  return {
    ...unit,
    content,
    quiz: parsed.quiz,
    exercise,
    project,
    passCriteria: unit.passCriteria || { quizMinScore: 1, exerciseMustPass: true },
  };
}

async function repairGeneratedUnit(
  unit: SeedUnit,
  brokenResponse: string,
  provider: LLMProvider
): Promise<SeedUnit> {
  const projectRepairRules = unit.type === 'project'
    ? '- Since this is a project unit, JSON must include a project object with at least 2 deliverables, 3 milestones, 2 files, 3 rubric items, and extensionIdeas.'
    : '';
  const projectRepairTemplate = unit.type === 'project'
    ? `,
  "project": {
    "id": "project-${unit.id}",
    "title": "${unit.title}",
    "narrative": "...",
    "drivingQuestion": "...",
    "deliverables": ["...", "..."],
    "milestones": [
      {
        "id": "phase-1",
        "title": "Phase 1: ...",
        "goal": "...",
        "learnerTasks": ["...", "..."],
        "acceptanceCriteria": ["...", "..."]
      },
      {
        "id": "phase-2",
        "title": "Phase 2: ...",
        "goal": "...",
        "learnerTasks": ["...", "..."],
        "acceptanceCriteria": ["...", "..."]
      },
      {
        "id": "phase-3",
        "title": "Phase 3: ...",
        "goal": "...",
        "learnerTasks": ["...", "..."],
        "acceptanceCriteria": ["...", "..."]
      }
    ],
    "files": [
      { "path": "PROJECT.md", "purpose": "Project spec" },
      { "path": "solution.ts", "purpose": "Main implementation file" }
    ],
    "rubric": [
      { "criterion": "Correctness", "points": 4, "evidence": "..." },
      { "criterion": "Design", "points": 3, "evidence": "..." },
      { "criterion": "Learning Trace", "points": 3, "evidence": "..." }
    ],
    "extensionIdeas": ["...", "..."],
    "checkpointQuestions": ["..."]
  }`
    : '';

  const repairPrompt = `
The previous FCAgent unit generation response could not be parsed or failed quality validation.
Repair it into the exact required format below. Keep the same educational intent, but make it valid, runnable, and concise.

Rules:
- Prefer these local runner languages: ${NATIVE_RUNNER_LANGUAGES.join(', ')}.
- JSON must not include starterCode.
- Include at least 3 testCases and at least 2 hints.
- CONTENT must be a useful Chinese markdown lesson, at least 400 Chinese characters.
- STARTER_CODE must be raw code only and contain the exercise entrypoint.
- Include TEST_CODE only if the language is not ${NATIVE_RUNNER_LANGUAGES.join(', ')}.
${projectRepairRules}

Required format:
\`\`\`json
{
  "quiz": [
    { "id": "q1", "type": "choice", "question": "...", "options": ["A", "B", "C", "D"], "answer": "A", "explanation": "..." }
  ],
  "exercise": {
    "id": "ex-${unit.id}",
    "language": "typescript",
    "entrypoint": "actualFunctionName",
    "description": "...",
    "assertionMode": "return",
    "testCases": [
      { "name": "normal case", "input": [], "expected": true },
      { "name": "edge case", "input": [], "expected": true },
      { "name": "misconception guard", "input": [], "expected": false }
    ],
    "hints": ["...", "..."],
    "difficulty": "medium",
    "conceptTags": ["tag"],
    "commonPitfalls": ["..."],
    "estimatedMinutes": 15
  }${projectRepairTemplate}
}
\`\`\`

### CONTENT
# ${unit.title}
...

### STARTER_CODE
...

Broken response:
${brokenResponse}
`.trim();

  console.log(color.yellow(`\n⚠️ [RETRY] 正在尝试修复 LLM 返回的无效数据 (Retrying 1/1)...`));
  const repairRes = await provider.chat([
    { role: 'system', content: 'You repair malformed curriculum generation output. Return only the requested sections.' },
    { role: 'user', content: repairPrompt },
  ], { temperature: 0.1 });

  return buildGeneratedUnit(unit, repairRes.content || '');
}
