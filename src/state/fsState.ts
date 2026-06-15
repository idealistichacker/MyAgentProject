import fs from 'node:fs';
import path from 'node:path';
import {
  getConfigPath,
  getExercisesDir,
  getFcDir,
  getLessonsDir,
  getLogsDir,
  getLearnerPath,
  getPlanPath,
  getStatePath,
  getTmpDir,
} from '../utils/paths.js';
import {
  learnerProfileSchema,
  type LearnerProfile,
  planSchema,
  providerConfigSchema,
  stateSchema,
  type LearningPlan,
  type LearningState,
  type ProviderConfig,
} from '../types.js';

export const defaultProviderConfig: ProviderConfig = {
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKey: '',
  temperature: 0.2,
  searchProvider: 'wikipedia',
};

export function ensureProjectDirs(): void {
  for (const dir of [
    getFcDir(),
    getLessonsDir(),
    getExercisesDir(),
    getLogsDir(),
    getTmpDir(),
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

export function writeJson<T>(filePath: string, value: T): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function loadConfig(): ProviderConfig {
  const fromFile = readJson<Partial<ProviderConfig>>(getConfigPath(), {});
  const merged = {
    ...defaultProviderConfig,
    ...fromFile,
    apiKey: fromFile.apiKey ?? process.env.FC_API_KEY ?? '',
    baseUrl: fromFile.baseUrl ?? process.env.FC_BASE_URL ?? defaultProviderConfig.baseUrl,
    model: fromFile.model ?? process.env.FC_MODEL ?? defaultProviderConfig.model,
    searchProvider: fromFile.searchProvider ?? process.env.FC_SEARCH_PROVIDER ?? defaultProviderConfig.searchProvider,
    tavilyApiKey: fromFile.tavilyApiKey ?? process.env.FC_TAVILY_API_KEY ?? undefined,
  };
  return providerConfigSchema.parse(merged);
}

export function saveConfig(config: ProviderConfig): void {
  writeJson(getConfigPath(), providerConfigSchema.parse(config));
}

export function loadLearner(): LearnerProfile | undefined {
  if (!fs.existsSync(getLearnerPath())) {
    return undefined;
  }
  return learnerProfileSchema.parse(readJson<unknown>(getLearnerPath(), {}));
}

export function saveLearner(profile: LearnerProfile): void {
  writeJson(getLearnerPath(), learnerProfileSchema.parse(profile));
}

export function loadPlan(): LearningPlan | undefined {
  if (!fs.existsSync(getPlanPath())) {
    return undefined;
  }
  return planSchema.parse(readJson<unknown>(getPlanPath(), {}));
}

export function savePlan(plan: LearningPlan): void {
  writeJson(getPlanPath(), planSchema.parse(plan));
}

export function loadState(): LearningState | undefined {
  if (!fs.existsSync(getStatePath())) {
    return undefined;
  }
  return stateSchema.parse(readJson<unknown>(getStatePath(), {}));
}

export function saveState(state: LearningState): void {
  writeJson(getStatePath(), stateSchema.parse(state));
}

export function writeTextFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

export function ensureExerciseDirs(): void {
  fs.mkdirSync(getExercisesDir(), { recursive: true });
}
