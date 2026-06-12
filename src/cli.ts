#!/usr/bin/env node
import { Command } from 'commander';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { buildAssessment, diagnoseLearner, generatePlan, generateUnitContent, getCurrentUnit, gradeQuiz } from './agents/pipeline.js';
import { getSeedUnit } from './curriculum/seed.js';
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
import type { LearnerProfile, LearningPlan, LearningState, QuizQuestion } from './types.js';

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
  .action((options) => {
    ensureProjectDirs();
    const config = loadConfig();
    const next = {
      ...config,
      baseUrl: options.baseUrl ?? config.baseUrl,
      model: options.model ?? config.model,
      apiKey: options.apiKey ?? config.apiKey,
    };
    saveConfig(next);
    console.log('FuckColloge initialized at .fuckcolloge/');
    console.log(`Provider: ${next.provider}`);
    console.log(`Base URL: ${next.baseUrl}`);
    console.log(`Model: ${next.model}`);
    console.log(`API key configured: ${next.apiKey ? 'yes' : 'no'}`);
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

    if (!options.target && !options.programmingLevel && !options.dsaLevel && !options.weeklyHours && !options.totalWeeks && !options.learningStyle && !options.codePractice && !options.pace && !options.goal) {
      await fillDiagnosisWithPrompts(rawProfile);
    }

    const provider = loadConfig().apiKey ? await createProvider(loadConfig()) : undefined;
    const profile = await diagnoseLearner(rawProfile, provider);
    saveLearner(profile);

    console.log('Learner profile saved to .fuckcolloge/learner.json');
    console.log(profile.summary);
  });

program.command('plan')
  .description('Generate learning plan from learner profile')
  .action(async () => {
    ensureProjectDirs();
    const learner = loadLearner();
    if (!learner) {
      console.error('No learner profile found. Run `fc diagnose` first.');
      process.exitCode = 1;
      return;
    }

    const provider = loadConfig().apiKey ? await createProvider(loadConfig()) : undefined;
    console.log('FCAgent CurriculumPlanner is generating your plan...');
    const plan = await generatePlan(learner, provider);
    savePlan(plan);
    console.log(`Learning plan saved to .fuckcolloge/plan.json with ${plan.units.length} units.`);
    for (const unit of plan.units) {
      console.log(`- ${unit.id}: ${unit.title}`);
    }
  });

program.command('start [unitId]')
  .description('Start a learning unit and generate lesson/exercise files')
  .action(async (unitId?: string) => {
    ensureProjectDirs();
    const plan = loadPlan();
    if (!plan) {
      console.error('No learning plan found. Run `fc plan` first.');
      process.exitCode = 1;
      return;
    }

    let unit = getCurrentUnit(plan, unitId);
    const isFallback = unit.content?.includes('基础预备版本') || unit.exercise?.description?.includes('占位练习');
    if (!unit.content || !unit.exercise || isFallback) {
      console.log(`FCAgent ContentGenerator is generating content and exercises for unit ${unit.id}...`);
      const provider = loadConfig().apiKey ? await createProvider(loadConfig()) : undefined;
      unit = await generateUnitContent(unit, plan.learnerProfile, provider);
      const index = plan.units.findIndex(u => u.id === unit.id);
      if (index !== -1) {
        plan.units[index] = unit;
        savePlan(plan);
      }
    }

    const extension = getExtensionForLanguage(unit.exercise?.language ?? 'typescript');
    writeTextFile(getLessonPath(unit.id), unit.content || '');
    if (unit.exercise) {
      writeTextFile(getSolutionPath(unit.id, extension), unit.exercise.starterCode);
    }

    console.log(`Started ${unit.id}: ${unit.title}`);
    console.log(`Lesson: ${getLessonPath(unit.id)}`);
    console.log(`Solution: ${getSolutionPath(unit.id, extension)}`);
    console.log(`Edit solution${extension}, then run \`fc submit\`.`);
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
    ensureProjectDirs();
    const plan = loadPlan();
    if (!plan) {
      console.error('No learning plan found. Run `fc plan` first.');
      process.exitCode = 1;
      return;
    }

    const unit = getCurrentUnit(plan, unitId);
    if (!unit.exercise) {
      console.error('Unit exercise not generated. Run `fc start` first.');
      process.exitCode = 1;
      return;
    }

    const exerciseDir = getExerciseDir(unit.id);
    const runResult = await runExercise(unit.id, unit.exercise, exerciseDir);
    const quizAnswers = process.stdin.isTTY
      ? await askQuizAnswers(unit.quiz || [])
      : parseQuizAnswers(options.quiz);

    const quizResults = gradeQuiz(unit.quiz || [], quizAnswers);
    console.log('FCAgent AssessmentReviewer is analyzing your performance...');
    const provider = loadConfig().apiKey ? await createProvider(loadConfig()) : undefined;
    let learnerCode = '';
    try {
      const extension = getExtensionForLanguage(unit.exercise.language);
      learnerCode = fs.readFileSync(getSolutionPath(unit.id, extension), 'utf-8');
    } catch (err) {
      console.warn('Could not read solution code:', err);
    }
    const assessment = await buildAssessment(unit, runResult.testResults, quizResults, learnerCode, provider);

    const state = loadState() ?? createInitialState(unit.id);
    state.currentUnitId = unit.id;
    state.attempts[unit.id] = {
      count: (state.attempts[unit.id]?.count ?? 0) + 1,
      lastSubmittedAt: assessment.createdAt,
    };
    state.assessments.push(assessment);
    state.lastAssessmentId = assessment.id;
    state.updatedAt = assessment.createdAt;
    saveState(state);

    printAssessment(assessment, runResult.stdout, runResult.stderr);
  });

program.command('assess')
  .description('Print latest assessment')
  .action(() => {
    const state = loadState();
    const assessment = state?.assessments.find((item) => item.id === state.lastAssessmentId) ?? state?.assessments.at(-1);
    if (!assessment) {
      console.log('No assessment found yet. Run `fc submit` first.');
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
      console.error('No plan/state found. Run `fc plan` and `fc submit` first.');
      process.exitCode = 1;
      return;
    }

    const latest = [...state.assessments]
      .reverse()
      .find((item) => item.unitId === state.currentUnitId);
    if (!latest?.passed) {
      console.log('Current unit is not passed yet. Review feedback and resubmit.');
      return;
    }

    const currentIndex = plan.currentIndex;
    if (currentIndex + 1 >= plan.units.length) {
      console.log('You have completed all units in the dynamic learning plan. Congratulations!');
      return;
    }

    plan.currentIndex = currentIndex + 1;
    plan.updatedAt = new Date().toISOString();
    savePlan(plan);

    const nextUnit = plan.units[plan.currentIndex];
    state.currentUnitId = nextUnit.id;
    state.updatedAt = plan.updatedAt;
    saveState(state);

    console.log(`Moved to ${nextUnit.id}: ${nextUnit.title}`);
    console.log('Run `fc start` to generate the lesson and solution file.');
  });

program.command('status')
  .description('Show current learning state')
  .action(() => {
    const plan = loadPlan();
    const state = loadState();
    const learner = loadLearner();

    console.log(JSON.stringify({ learner, plan, state }, null, 2));
  });

program.parseAsync(process.argv);

async function fillDiagnosisWithPrompts(profile: LearnerProfile): Promise<void> {
  const rl = readline.createInterface({ input, output });
  profile.target = await prompt(rl, '你的学习目标是什么？', profile.target || '数据结构与算法入门');
  profile.programmingLevel = await prompt(rl, '编程语言水平？[zero/basic/small-projects/comfortable]', profile.programmingLevel) as LearnerProfile['programmingLevel'];
  profile.dsaLevel = await prompt(rl, '数据结构与算法水平？[none/heard/some-practice/systematic]', profile.dsaLevel) as LearnerProfile['dsaLevel'];
  profile.weeklyHours = await prompt(rl, '每周可投入时间？[<2/2-5/5-10/10+]', profile.weeklyHours) as LearnerProfile['weeklyHours'];
  profile.totalWeeks = await prompt(rl, '预计总学习时长（周）？[1-4/5-8/9-12/12+]', profile.totalWeeks || '5-8') as LearnerProfile['totalWeeks'];
  profile.learningStyle = await prompt(rl, '学习偏好？[explain-first/example-first/practice-first/project-first]', profile.learningStyle) as LearnerProfile['learningStyle'];
  profile.codePractice = await prompt(rl, '是否愿意写代码练习？[yes/sometimes/no]', profile.codePractice) as LearnerProfile['codePractice'];
  profile.pace = await prompt(rl, '学习节奏？[fast/normal/steady]', profile.pace) as LearnerProfile['pace'];
  profile.nearTermGoal = await prompt(rl, '近期目标？可直接回车跳过', profile.nearTermGoal ?? '');
  rl.close();
}

function prompt(rl: readline.Interface, question: string, defaultValue: string): Promise<string> {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  return rl.question(`${question}${suffix}: `);
}

async function askQuizAnswers(quiz: QuizQuestion[]): Promise<Record<string, string>> {
  const answers: Record<string, string> = {};
  const rl = readline.createInterface({ input, output });

  for (const question of quiz) {
    const options = question.options?.length
      ? ` ${question.options.map((option, index) => `${index + 1}) ${option}`).join(' | ')}`
      : '';
    answers[question.id] = await prompt(rl, `${question.question}${options}`, '');
  }

  rl.close();
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
  console.log('\n=== Assessment ===');
  console.log(`Unit: ${assessment.unitId}`);
  console.log(`Passed: ${assessment.passed ? 'yes' : 'no'}`);
  console.log(`Score: ${assessment.score}/${assessment.maxScore}`);
  console.log(`Mistake types: ${assessment.mistakeTypes.join(', ') || 'none'}`);
  console.log(`Diagnosis: ${assessment.diagnosis}`);
  console.log(`Next action: ${assessment.nextAction}`);

  console.log('\nQuiz results:');
  for (const result of assessment.quizResults) {
    console.log(`- ${result.id}: ${result.passed ? 'pass' : 'fail'}`);
  }

  console.log('\nTest results:');
  for (const result of assessment.testResults) {
    console.log(`- ${result.name}: ${result.passed ? 'pass' : 'fail'}`);
    if (!result.passed) {
      if (result.message) console.log(`  message: ${result.message}`);
      if (result.expected !== undefined) console.log(`  expected: ${JSON.stringify(result.expected)}`);
      if (result.actual !== undefined) console.log(`  actual: ${JSON.stringify(result.actual)}`);
    }
  }

  if (stderr) {
    console.log('\nStderr:');
    console.log(stderr);
  }

  if (stdout && assessment.testResults.length === 0) {
    console.log('\nStdout:');
    console.log(stdout);
  }
}
