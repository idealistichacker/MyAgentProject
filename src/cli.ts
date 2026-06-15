#!/usr/bin/env node
import { Command } from 'commander';
import { intro, outro, spinner, select, text, confirm, isCancel, cancel, note } from '@clack/prompts';
import color from 'picocolors';
import { buildAssessment, diagnoseLearner, generatePlan, generateUnitContent, getCurrentUnit, gradeQuiz } from './agents/pipeline.js';
import { createProvider } from './providers/types.js';
import fs from 'node:fs';
import { runExercise } from './runner/runnerFactory.js';
import {
  ensureProjectDirs,
  loadConfig,
  loadLearner,
  loadPlan,
  loadState,
  saveConfig,
  saveLearner,
  savePlan,
  saveState,
  writeTextFile,
} from './state/fsState.js';
import {
  getExerciseDir,
  getLessonPath,
  getSolutionPath,
  getExtensionForLanguage,
} from './utils/paths.js';
import type { LearnerProfile, LearningState, QuizQuestion } from './types.js';

const program = new Command();

program
  .name('fc')
  .description('FuckColloge CLI MVP: AI Native self-learning agent for CS/programming.')
  .version('0.1.0');

program.command('init')
  .description('Initialize FuckColloge project state')
  .option('--base-url <url>', 'OpenAI-compatible API base URL')
  .option('--model <model>', 'Model name')
  .option('--api-key <key>', 'API key')
  .option('--search-provider <provider>', 'Search provider: wikipedia | tavily')
  .option('--tavily-api-key <key>', 'Tavily API key')
  .action(async (options) => {
    intro(color.inverse(' 🚀 初始化 FuckColloge '));
    ensureProjectDirs();
    const config = loadConfig();

    let searchProvider = options.searchProvider ?? config.searchProvider;
    if (!options.searchProvider) {
      const providerSelection = await select({
        message: '选择搜索引擎 (Search Provider)',
        options: [
          { value: 'wikipedia', label: 'Wikipedia (免费自带)' },
          { value: 'tavily', label: 'Tavily (需要 TAVILY_API_KEY)' },
        ],
        initialValue: config.searchProvider,
      });
      if (!isCancel(providerSelection)) {
        searchProvider = providerSelection as 'wikipedia' | 'tavily';
      }
    }

    let tavilyApiKey = options.tavilyApiKey ?? config.tavilyApiKey;
    if (searchProvider === 'tavily' && !tavilyApiKey) {
      const keyInput = await text({
        message: '请输入你的 Tavily API Key:',
        placeholder: 'tvly-...',
      });
      if (!isCancel(keyInput)) {
        tavilyApiKey = keyInput as string;
      }
    }

    const next = {
      ...config,
      baseUrl: options.baseUrl ?? config.baseUrl,
      model: options.model ?? config.model,
      apiKey: options.apiKey ?? config.apiKey,
      searchProvider,
      tavilyApiKey,
    };
    saveConfig(next);
    note(
      `Provider: ${next.provider}\n` +
      `Base URL: ${next.baseUrl}\n` +
      `Model: ${next.model}\n` +
      `API key configured: ${next.apiKey ? 'yes' : 'no'}\n` +
      `Search Provider: ${next.searchProvider}\n` +
      `Tavily API key configured: ${next.tavilyApiKey ? 'yes' : 'no'}`,
      'Config Info'
    );
    outro(color.green('✔ FuckColloge initialized at .fuckcolloge/'));
  });

program.command('config')
  .description('Show current FCAgent provider config')
  .action(() => {
    const config = loadConfig();
    console.log(JSON.stringify({
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKeyConfigured: Boolean(config.apiKey),
      temperature: config.temperature,
      searchProvider: config.searchProvider,
      tavilyApiKeyConfigured: Boolean(config.tavilyApiKey),
    }, null, 2));
  });

program.command('diagnose')
  .description('Create or update learner profile')
  .option('--target <text>', 'Learning target')
  .option('--programming-level <level>', 'zero | basic | small-projects | comfortable')
  .option('--dsa-level <level>', 'none | heard | some-practice | systematic')
  .option('--weekly-hours <hours>', '<2 | 2-5 | 5-10 | 10+')
  .option('--total-weeks <weeks>', '1-4 | 5-8 | 9-12 | 12+')
  .option('--learning-style <style>', 'explain-first | example-first | practice-first | project-first')
  .option('--code-practice <value>', 'yes | sometimes | no')
  .option('--pace <pace>', 'fast | normal | steady')
  .option('--goal <text>', 'Near-term goal')
  .action(async (options) => {
    ensureProjectDirs();

    const existing = loadLearner();
    const rawProfile: LearnerProfile = {
      ...(existing ?? {}),
      target: options.target ?? existing?.target ?? '数据结构与算法入门',
      programmingLevel: (options.programmingLevel ?? existing?.programmingLevel ?? 'basic') as LearnerProfile['programmingLevel'],
      dsaLevel: (options.dsaLevel ?? existing?.dsaLevel ?? 'none') as LearnerProfile['dsaLevel'],
      weeklyHours: (options.weeklyHours ?? existing?.weeklyHours ?? '2-5') as LearnerProfile['weeklyHours'],
      totalWeeks: (options.totalWeeks ?? existing?.totalWeeks ?? '5-8') as LearnerProfile['totalWeeks'],
      learningStyle: (options.learningStyle ?? existing?.learningStyle ?? 'example-first') as LearnerProfile['learningStyle'],
      codePractice: (options.codePractice ?? existing?.codePractice ?? 'yes') as LearnerProfile['codePractice'],
      pace: (options.pace ?? existing?.pace ?? 'normal') as LearnerProfile['pace'],
      nearTermGoal: options.goal ?? existing?.nearTermGoal ?? '',
      rawAnswers: existing?.rawAnswers ?? {},
      summary: existing?.summary ?? '',
    };

    const provider = loadConfig().apiKey ? await createProvider(loadConfig()) : undefined;

    if (!options.target && !options.programmingLevel && !options.dsaLevel && !options.weeklyHours && !options.totalWeeks && !options.learningStyle && !options.codePractice && !options.pace && !options.goal) {
      await fillDiagnosisWithPrompts(rawProfile, provider);
    }

    const s = spinner();
    s.start('AI 助教正在分析你的学习画像并生成学习策略...');
    const profile = await diagnoseLearner(rawProfile, provider);
    saveLearner(profile);
    s.stop(color.green('✔ 画像诊断完成！'));

    note(profile.summary, 'AI 助教寄语 (Summary)');
  });

program.command('plan')
  .description('Generate learning plan from learner profile')
  .action(async () => {
    intro(color.inverse(' 📅 生成学习计划 '));
    ensureProjectDirs();
    const learner = loadLearner();
    if (!learner) {
      cancel('No learner profile found. Run `fc diagnose` first.');
      process.exitCode = 1;
      return;
    }

    const provider = loadConfig().apiKey ? await createProvider(loadConfig()) : undefined;
    const s = spinner();
    s.start('FCAgent CurriculumPlanner 正在为你生成定制化大纲...');
    const plan = await generatePlan(learner, provider);
    savePlan(plan);
    s.stop(color.green(`✔ 计划生成成功！共计 ${plan.units.length} 个单元。`));
    
    plan.units.forEach(unit => {
      const typeLabel = unit.type === 'project' ? color.magenta(color.bold(' 🚀 [PROJECT] ')) : '';
      console.log(`${color.cyan('•')} ${color.bold(unit.id)}:${typeLabel} ${unit.title}`);
    });
    outro(color.gray('执行 `fc start` 开始第一个单元的学习吧！'));
  });

program.command('start [unitId]')
  .description('Start a learning unit and generate lesson/exercise files')
  .action(async (unitId?: string) => {
    intro(color.inverse(' 📖 开始学习单元 '));
    ensureProjectDirs();
    const plan = loadPlan();
    if (!plan) {
      cancel('No learning plan found. Run `fc plan` first.');
      process.exitCode = 1;
      return;
    }

    let unit = getCurrentUnit(plan, unitId);
    const isFallback = unit.content?.includes('基础预备版本') || unit.exercise?.description?.includes('占位练习');
    if (!unit.content || !unit.exercise || isFallback) {
      const s = spinner();
      s.start(`FCAgent 正在全网检索并生成 [${unit.id}] 的课件与练习...`);
      const provider = loadConfig().apiKey ? await createProvider(loadConfig()) : undefined;
      unit = await generateUnitContent(unit, plan, provider);
      const index = plan.units.findIndex(u => u.id === unit.id);
      if (index !== -1) {
        plan.units[index] = unit;
        savePlan(plan);
      }
      s.stop(color.green('✔ 课件与练习生成完毕！'));
    } else {
      console.log(color.green('✔ 课件已就绪。'));
    }

    const extension = getExtensionForLanguage(unit.exercise?.language ?? 'typescript');
    writeTextFile(getLessonPath(unit.id), unit.content || '');
    if (unit.exercise) {
      writeTextFile(getSolutionPath(unit.id, extension), unit.exercise.starterCode);
    }

    note(
      `单元: ${unit.id}: ${unit.title}\n` +
      `讲义: ${getLessonPath(unit.id)}\n` +
      `练习: ${getSolutionPath(unit.id, extension)}`,
      '学习指南'
    );
    
    outro(`去阅读讲义并完成练习吧，完成后执行 ${color.cyan('`fc submit`')} 提交！`);
  });

program.command('lesson [unitId]')
  .description('Print current lesson markdown')
  .action((unitId?: string) => {
    const plan = loadPlan();
    if (!plan) {
      console.error('No learning plan found. Run `fc plan` first.');
      process.exitCode = 1;
      return;
    }

    const unit = getCurrentUnit(plan, unitId);
    console.log(unit.content);
  });

program.command('submit [unitId]')
  .description('Submit solution file and run exercise tests')
  .option('--quiz <answers>', 'Quiz answers, e.g. q1=B,q2=O(n),q3=因为 slow 是索引')
  .action(async (unitId, options) => {
    intro(color.inverse(' 📤 提交练习与评估 '));
    ensureProjectDirs();
    const plan = loadPlan();
    if (!plan) {
      cancel('No learning plan found. Run `fc plan` first.');
      process.exitCode = 1;
      return;
    }

    const unit = getCurrentUnit(plan, unitId);
    if (!unit.exercise) {
      cancel('Unit exercise not generated. Run `fc start` first.');
      process.exitCode = 1;
      return;
    }

    const state = loadState() ?? createInitialState(unit.id);
    const attemptCount = (state.attempts[unit.id]?.count ?? 0) + 1;

    let quizAnswers: Record<string, string> = {};
    if (process.stdin.isTTY && !options.quiz) {
      quizAnswers = await askQuizAnswers(unit.quiz || []);
    } else {
      quizAnswers = parseQuizAnswers(options.quiz);
    }

    const quizResults = gradeQuiz(unit.quiz || [], quizAnswers);
    const quizMinScore = unit.passCriteria?.quizMinScore ?? 1;
    const quizScore = quizResults.filter((r) => r.passed).length;
    const quizPassed = quizScore >= quizMinScore;

    if (!quizPassed) {
      console.log(color.yellow('\n⚠️ 有前置知识测试未通过！你需要先完全掌握这些概念才能解锁后续的代码评测哦！\n请复习本单元的讲义后再重新执行 `fc submit` 解锁练习。'));
      process.exitCode = 1;
      return;
    }

    const s = spinner();
    s.start('正在运行本地测试断言...');
    const exerciseDir = getExerciseDir(unit.id);
    const runResult = await runExercise(unit.id, unit.exercise, exerciseDir);
    s.stop(color.green('✔ 本地测试执行完毕'));
    
    s.start('FCAgent AssessmentReviewer 正在多维分析你的表现...');
    const provider = loadConfig().apiKey ? await createProvider(loadConfig()) : undefined;
    let learnerCode = '';
    try {
      const extension = getExtensionForLanguage(unit.exercise.language);
      learnerCode = fs.readFileSync(getSolutionPath(unit.id, extension), 'utf-8');
    } catch (err) {
      console.warn('Could not read solution code:', err);
    }
    const assessment = await buildAssessment(unit, runResult.testResults, quizResults, learnerCode, provider, attemptCount);
    s.stop(color.green('✔ 诊断分析完成'));

    state.currentUnitId = unit.id;
    state.attempts[unit.id] = {
      count: (state.attempts[unit.id]?.count ?? 0) + 1,
      lastSubmittedAt: assessment.createdAt,
    };
    state.assessments.push(assessment);
    state.lastAssessmentId = assessment.id;
    state.updatedAt = assessment.createdAt;
    
    if (assessment.passed) {
      if (!state.completedUnitIds.includes(unit.id)) {
        state.completedUnitIds.push(unit.id);
      }
    }
    saveState(state);

    printAssessment(assessment, runResult.stdout, runResult.stderr);
    
    if (assessment.passed) {
      outro(color.green('🎉 恭喜通关本单元！执行 `fc next` 进入下一关！'));
    } else {
      if ((state.attempts[unit.id]?.count ?? 0) >= 5) {
        note(color.yellow(`💡 提示：检测到当前单元已尝试了 ${(state.attempts[unit.id]?.count ?? 0)} 次。如果你感到吃力，可以输入 \`fc skip\` 跳过本地测试与 Quiz，直接进入下一 Unit 的学习。你跳过的单元会被妥善记录在逃课账本中，随时可以回来复习哦！`), '逃课提示');
      }
      outro(color.yellow('再接再厉，请根据诊断建议修改代码后再次 `fc submit`！'));
    }
  });

program.command('assess')
  .description('Print latest assessment')
  .action(() => {
    const state = loadState();
    const assessment = state?.assessments.find((item) => item.id === state.lastAssessmentId) ?? state?.assessments.at(-1);
    if (!assessment) {
      console.log(color.gray('No assessment found yet. Run `fc submit` first.'));
      return;
    }
    printAssessment(assessment);
  });

program.command('next')
  .description('Move to next unit if current unit passed')
  .action(() => {
    const plan = loadPlan();
    const state = loadState();
    if (!plan || !state) {
      console.error(color.red('No plan/state found. Run `fc plan` and `fc submit` first.'));
      process.exitCode = 1;
      return;
    }

    const latest = [...state.assessments]
      .reverse()
      .find((item) => item.unitId === state.currentUnitId);
    if (!latest?.passed) {
      console.log(color.yellow('当前单元尚未通过。请查看诊断反馈并重新 `fc submit`。'));
      return;
    }

    const currentIndex = plan.currentIndex;
    if (currentIndex + 1 >= plan.units.length) {
      console.log(color.green(color.bold('🎉 太棒了！你已经打通了本次动态学习计划的全部关卡！')));
      return;
    }

    plan.currentIndex = currentIndex + 1;
    plan.updatedAt = new Date().toISOString();
    savePlan(plan);

    const nextUnit = plan.units[plan.currentIndex];
    state.currentUnitId = nextUnit.id;
    state.updatedAt = plan.updatedAt;
    saveState(state);

    intro(color.inverse(' ⏭️ 前往下一关 '));
    note(`即将开始：${nextUnit.id}: ${nextUnit.title}`, 'Next Unit');
    outro(`执行 ${color.cyan('`fc start`')} 开始新征程！`);
  });

program.command('skip')
  .description('Skip current unit and record it for later review')
  .action(() => {
    const plan = loadPlan();
    const state = loadState();
    if (!plan || !state) {
      console.error(color.red('No plan/state found. Run `fc plan` first.'));
      process.exitCode = 1;
      return;
    }

    const currentUnitId = state.currentUnitId;
    if (!state.skippedUnitIds) {
      state.skippedUnitIds = [];
    }
    if (!state.skippedUnitIds.includes(currentUnitId)) {
      state.skippedUnitIds.push(currentUnitId);
    }

    const currentIndex = plan.currentIndex;
    if (currentIndex + 1 >= plan.units.length) {
      console.log(color.green(color.bold('已经是最后一关了，如果你想重温，可以考虑重置计划！')));
      saveState(state);
      return;
    }

    plan.currentIndex = currentIndex + 1;
    plan.updatedAt = new Date().toISOString();
    savePlan(plan);

    const nextUnit = plan.units[plan.currentIndex];
    state.currentUnitId = nextUnit.id;
    state.updatedAt = plan.updatedAt;
    saveState(state);

    intro(color.inverse(' ⏭️ 跳过当前关卡 '));
    note(`当前关卡 ${currentUnitId} 已加入逃课账本。\n即将开始：${nextUnit.id}: ${nextUnit.title}`, 'Next Unit');
    outro(`执行 ${color.cyan('`fc start`')} 开始新征程！`);
  });

program.command('review')
  .description('Review skipped units')
  .action(() => {
    const state = loadState();
    if (!state) {
      console.error(color.red('No state found.'));
      process.exitCode = 1;
      return;
    }

    intro(color.inverse(' 📚 逃课复习 (Review) '));
    if (!state.skippedUnitIds || state.skippedUnitIds.length === 0) {
      outro(color.green('🎉 太棒了，你没有任何跳过的关卡！'));
      return;
    }

    console.log(color.yellow('你有以下关卡尚未完成并跳过：'));
    state.skippedUnitIds.forEach(id => console.log(`- ${id}`));
    console.log('');
    outro(color.gray('提示：未来我们会在这里支持选择一个跳过的关卡重新进行挑战。'));
  });

program.command('status')
  .description('Show current learning state')
  .action(() => {
    const plan = loadPlan();
    const state = loadState();
    const learner = loadLearner();

    intro(color.inverse(' 📊 学习状态面板 (Dashboard) '));

    if (plan && state) {
      const totalUnits = plan.units.length;
      const completedUnits = state.completedUnitIds.length;
      console.log(color.bold('学习进度: ') + createProgressBar(completedUnits, totalUnits));
      
      const currentUnit = plan.units[plan.currentIndex];
      const typeLabel = currentUnit?.type === 'project' ? color.magenta(color.bold(' 🚀 [PROJECT] ')) : '';
      console.log(color.bold('当前单元: ') + color.yellow(currentUnit?.title ?? 'None') + typeLabel);
      
      const passRate = state.assessments.length > 0 
        ? Math.floor((state.assessments.filter(a => a.passed).length / state.assessments.length) * 100)
        : 0;
      console.log(color.bold('综合通过率: ') + color.green(`${passRate}%`));
      console.log('');
    } else {
      console.log(color.gray('还没有生成学习计划，使用 `fc diagnose` 和 `fc plan` 开始吧！\n'));
    }

    outro('💪 Keep going!');
  });

function pLimit(concurrency: number) {
  const queue: (() => void)[] = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      queue.shift()!();
    }
  };

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const run = async () => {
        activeCount++;
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          next();
        }
      };

      if (activeCount < concurrency) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
}

program.command('generate-all')
  .description('Pre-generate all lessons and exercise skeletons in the plan for quick offline browsing')
  .action(async () => {
    intro(color.inverse(' 🚀 全量课件并发预生成 (Generate All - Optimized) '));
    ensureProjectDirs();
    const plan = loadPlan();
    if (!plan) {
      cancel('No learning plan found. Run `fc plan` first.');
      process.exitCode = 1;
      return;
    }
    const provider = loadConfig().apiKey ? await createProvider(loadConfig()) : undefined;
    if (!provider) {
      cancel('Provider not configured. Run `fc init` and set an API key.');
      process.exitCode = 1;
      return;
    }

    const s = spinner();
    let generatedCount = 0;
    s.start(`正在检查需生成的单元...`);

    const tasks = plan.units.map((unit, i) => {
      return { unit, index: i };
    }).filter(({ unit }) => {
      const isFallback = unit.content?.includes('基础预备版本') || unit.exercise?.description?.includes('占位练习');
      return !unit.content || !unit.exercise || isFallback;
    });

    if (tasks.length === 0) {
      s.stop(color.green('✔ 所有单元已生成完毕，无需重复生成！'));
      outro('你可以去 `.fuckcolloge/lessons/` 和 `.fuckcolloge/exercises/` 尽情浏览啦！');
      return;
    }

    s.stop(`需要生成 ${tasks.length} 个单元。受限于模型提供商并发控制，降级为单线程稳健生成 (并发度: 1)...`);

    const limit = pLimit(1); // 允许最大并发数为 1 避免 ECONNRESET
    let completed = 0;

    const promises = tasks.map(({ unit, index }, taskNum) => {
      return limit(async () => {
        // 错峰启动，避免一开始全部触发请求
        await new Promise(r => setTimeout(r, taskNum * 3000));
        
        console.log(color.cyan(`⏳ [${unit.id}] 开始生成...`));
        const updatedUnit = await generateUnitContent(unit, plan, provider);
        
        plan.units[index] = updatedUnit;
        savePlan(plan); // savePlan is synchronous writeFileSync, so it's safe
        
        const extension = getExtensionForLanguage(updatedUnit.exercise?.language ?? 'typescript');
        writeTextFile(getLessonPath(updatedUnit.id), updatedUnit.content || '');
        if (updatedUnit.exercise) {
          writeTextFile(getSolutionPath(updatedUnit.id, extension), updatedUnit.exercise.starterCode);
        }
        
        completed++;
        generatedCount++;
        console.log(color.green(`✅ [${updatedUnit.id}] 生成完毕 (${completed}/${tasks.length})`));
      });
    });

    await Promise.all(promises);
    console.log(color.green(`\n✔ 预生成完毕！本次共并发生成 ${generatedCount} 个新单元。`));
    outro('你可以去 `.fuckcolloge/lessons/` 和 `.fuckcolloge/exercises/` 尽情浏览啦！');
  });

program.parseAsync(process.argv);

async function fillDiagnosisWithPrompts(profile: LearnerProfile, provider?: any): Promise<void> {
  intro(color.inverse(' 👤 画像诊断 (Learner Diagnosis) '));
  
  const wantDiagnosis = await confirm({
    message: '需要进行对话以细化你的学习画像吗？(选择 No 将使用默认或上次配置极速跳过)',
    initialValue: true,
  });
  if (isCancel(wantDiagnosis)) { cancel('已取消'); process.exit(0); }

  if (!wantDiagnosis) {
    outro(color.green('✔ 已极速跳过画像诊断，使用默认配置！'));
    return;
  }

  const rawTarget = await text({
    message: '你的学习目标是什么？',
    placeholder: profile.target || '数据结构与算法入门',
    defaultValue: profile.target || '数据结构与算法入门'
  });
  if (isCancel(rawTarget)) { cancel('已取消'); process.exit(0); }
  
  let finalTarget = rawTarget as string;
  if (provider) {
    const doGrill = await confirm({
      message: `"${finalTarget}" 这个目标看起来可能有些宏大。需要和我聊几句，通过 3~5 轮对话帮你将它细化拆解得更精准可执行吗？`,
      initialValue: true,
    });
    if (!isCancel(doGrill) && doGrill) {
      finalTarget = await grillTarget(finalTarget, provider);
    }
  }
  profile.target = finalTarget;

  const programmingLevel = await select({
    message: '编程语言水平？',
    initialValue: profile.programmingLevel,
    options: [
      { value: 'zero', label: '零基础' },
      { value: 'basic', label: '基础了解' },
      { value: 'small-projects', label: '写过小项目' },
      { value: 'comfortable', label: '熟练' }
    ]
  });
  if (isCancel(programmingLevel)) { cancel('已取消'); process.exit(0); }
  profile.programmingLevel = programmingLevel as LearnerProfile['programmingLevel'];

  const dsaLevel = await select({
    message: '数据结构与算法水平？',
    initialValue: profile.dsaLevel,
    options: [
      { value: 'none', label: '完全没学过' },
      { value: 'heard', label: '听说过概念' },
      { value: 'some-practice', label: '刷过一些题' },
      { value: 'systematic', label: '系统学习过' }
    ]
  });
  if (isCancel(dsaLevel)) { cancel('已取消'); process.exit(0); }
  profile.dsaLevel = dsaLevel as LearnerProfile['dsaLevel'];

  const weeklyHours = await select({
    message: '每周可投入时间？',
    initialValue: profile.weeklyHours,
    options: [
      { value: '<2', label: '少于2小时' },
      { value: '2-5', label: '2-5小时' },
      { value: '5-10', label: '5-10小时' },
      { value: '10+', label: '10小时以上' }
    ]
  });
  if (isCancel(weeklyHours)) { cancel('已取消'); process.exit(0); }
  profile.weeklyHours = weeklyHours as LearnerProfile['weeklyHours'];

  const totalWeeks = await select({
    message: '预计总学习时长（周）？',
    initialValue: profile.totalWeeks || '5-8',
    options: [
      { value: '1-4', label: '1-4周（速成）' },
      { value: '5-8', label: '5-8周（常规）' },
      { value: '9-12', label: '9-12周（稳健）' },
      { value: '12+', label: '12周以上（长期）' }
    ]
  });
  if (isCancel(totalWeeks)) { cancel('已取消'); process.exit(0); }
  profile.totalWeeks = totalWeeks as LearnerProfile['totalWeeks'];

  const learningStyle = await select({
    message: '学习偏好？',
    initialValue: profile.learningStyle,
    options: [
      { value: 'explain-first', label: '先看理论解释' },
      { value: 'example-first', label: '先看示例代码' },
      { value: 'practice-first', label: '直接动手做题' },
      { value: 'project-first', label: '以项目驱动' }
    ]
  });
  if (isCancel(learningStyle)) { cancel('已取消'); process.exit(0); }
  profile.learningStyle = learningStyle as LearnerProfile['learningStyle'];

  const codePractice = await select({
    message: '是否愿意写代码练习？',
    initialValue: profile.codePractice,
    options: [
      { value: 'yes', label: '当然愿意' },
      { value: 'sometimes', label: '有时候愿意' },
      { value: 'no', label: '只看不写' }
    ]
  });
  if (isCancel(codePractice)) { cancel('已取消'); process.exit(0); }
  profile.codePractice = codePractice as LearnerProfile['codePractice'];

  const pace = await select({
    message: '学习节奏？',
    initialValue: profile.pace,
    options: [
      { value: 'fast', label: '快节奏' },
      { value: 'normal', label: '正常' },
      { value: 'steady', label: '稳扎稳打' }
    ]
  });
  if (isCancel(pace)) { cancel('已取消'); process.exit(0); }
  profile.pace = pace as LearnerProfile['pace'];

  const nearTermGoal = await text({
    message: '近期目标？(选填)',
    placeholder: profile.nearTermGoal ?? '',
    defaultValue: profile.nearTermGoal ?? ''
  });
  if (isCancel(nearTermGoal)) { cancel('已取消'); process.exit(0); }
  profile.nearTermGoal = nearTermGoal as string;

  console.log('');
}

async function grillTarget(initialTarget: string, provider: any): Promise<string> {
  const messages = [
    { 
      role: 'system', 
      content: `你是一位专业且犀利的 AI 学习导师（Persona：天才少女导师，语气可爱但一针见血）。
用户的初始学习目标是："${initialTarget}"。这是一个通常比较宏大或模糊的目标。
你需要通过 3 到 5 轮的对话，每次问一个最核心、最尖锐的澄清问题，逼迫用户细化他们的实际背景、业务场景或具体需求。

交互规则：
1. 每次只问一个问题。保持简短（两三句话内）。不要列出长篇大论。
2. 当你认为用户的目标已经被充分细化，明确到了可以生成针对性课程（例如明确了技术栈、业务场景、前置基础）时，或者对话已经超过了 4 轮，请必须在你的回复开头加上 "[CLEAR]" 标记，然后直接给出一个经过提炼重写的**最终学习目标**（一句话总结），并结束追问。`
    },
    {
      role: 'user',
      content: `你好导师！我的初步学习目标是："${initialTarget}"。请向我提出第一个问题，帮我细化它。`
    }
  ];

  let currentTarget = initialTarget;
  intro(color.inverse(' 🧠 目标拆解雷达启动 '));

  for (let i = 0; i < 5; i++) {
    const s = spinner();
    s.start('导师思考中...');
    const res = await provider.chat(messages, { temperature: 0.7 });
    s.stop();
    
    let reply: string = res.content || '';
    
    if (reply.includes('[CLEAR]')) {
      const finalTarget = reply.replace(/\\[CLEAR\\]|\[CLEAR\]/g, '').trim();
      note(finalTarget, '🎯 最终细化的学习目标');
      return finalTarget;
    }
    
    console.log(`\n${color.cyan('导师')}：${reply}\n`);
    
    const userReply = await text({
      message: '回答导师 (输入内容)：'
    });
    
    if (isCancel(userReply)) {
      cancel('对话终止，使用当前进度作为目标');
      return currentTarget;
    }
    
    messages.push({ role: 'assistant', content: reply });
    messages.push({ role: 'user', content: userReply as string });
    currentTarget = userReply as string;
  }
  
  note(currentTarget, '🎯 对话结束，使用最新目标');
  return currentTarget;
}

async function askQuizAnswers(quiz: QuizQuestion[]): Promise<Record<string, string>> {
  const answers: Record<string, string> = {};
  if (quiz.length === 0) return answers;

  console.log(color.bgCyan(color.black(' 小测验 (Quiz) ')));
  
  for (const question of quiz) {
    if (question.options?.length) {
      const answer = await select({
        message: question.question,
        options: question.options.map((opt, i) => ({ value: opt, label: `${i + 1}) ${opt}` })),
      });
      if (isCancel(answer)) { cancel('已取消'); process.exit(0); }
      answers[question.id] = answer as string;
    } else {
      const answer = await text({
        message: question.question,
      });
      if (isCancel(answer)) { cancel('已取消'); process.exit(0); }
      answers[question.id] = answer as string;
    }
  }
  console.log(color.green('✔ 测验作答完毕！\n'));
  return answers;
}

function parseQuizAnswers(raw?: string): Record<string, string> {
  if (!raw) {
    return {};
  }

  return Object.fromEntries(
    raw.split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...rest] = part.split('=');
        return [key.trim(), rest.join('=').trim()];
      })
  );
}

function createInitialState(unitId: string): LearningState {
  const now = new Date().toISOString();
  return {
    currentUnitId: unitId,
    completedUnitIds: [],
    skippedUnitIds: [],
    attempts: {},
    assessments: [],
    updatedAt: now,
  };
}

function printAssessment(
  assessment: NonNullable<LearningState['assessments'][number]>,
  stdout = '',
  stderr = ''
): void {
  const isPassed = assessment.passed;
  note(
    `得分: ${assessment.score}/${assessment.maxScore}\n` +
    `诊断: ${assessment.diagnosis}\n` +
    `建议: ${assessment.nextAction}`,
    isPassed ? color.green('✔ 评估通过 (Passed)') : color.red('✘ 评估未通过 (Failed)')
  );

  if (assessment.quizResults.length > 0) {
    console.log(color.bold('测验结果:'));
    for (const result of assessment.quizResults) {
      console.log(`  ${result.passed ? color.green('✔') : color.red('✘')} ${result.id}`);
    }
  }

  if (assessment.testResults.length > 0) {
    console.log('\n' + color.bold('测试断言结果:'));
    for (const result of assessment.testResults) {
      console.log(`  ${result.passed ? color.green('✔') : color.red('✘')} ${result.name}`);
      if (!result.passed) {
        if (result.message) console.log(`    ${color.gray('msg:')} ${result.message}`);
        if (result.expected !== undefined) console.log(`    ${color.gray('exp:')} ${JSON.stringify(result.expected)}`);
        if (result.actual !== undefined) console.log(`    ${color.gray('act:')} ${JSON.stringify(result.actual)}`);
      }
    }
  }

  if (stderr) {
    console.log('\n' + color.bold('标准错误 (Stderr):'));
    console.log(color.red(stderr));
  }

  if (stdout && assessment.testResults.length === 0) {
    console.log('\n' + color.bold('标准输出 (Stdout):'));
    console.log(color.gray(stdout));
  }
}

function createProgressBar(current: number, total: number, length = 30) {
  const percent = total > 0 ? Math.floor((current / total) * 100) : 0;
  const filled = total > 0 ? Math.floor((current / total) * length) : 0;
  const empty = length - filled;
  const bar = color.cyan('█'.repeat(filled)) + color.gray('░'.repeat(empty));
  return `[${bar}] ${percent}% (${current}/${total})`;
}
