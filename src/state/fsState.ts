import { TIMEOUTS } from '../timeouts.js';
import fs from 'node:fs';
import path from 'node:path';
import {
  getConfigPath,
  getExercisesDir,
  getFcDir,
  getJobsDir,
  getLessonsDir,
  getLocksDir,
  getLogsDir,
  getManifestsDir,
  getRecoveryDir,
  getLearnerPath,
  getPlanPath,
  getPreviewsDir,
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
    getJobsDir(),
    getManifestsDir(),
    getLocksDir(),
    getRecoveryDir(),
    getPreviewsDir(),
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
  writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
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
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  );
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(tempPath, 'w');
    fs.writeFileSync(descriptor, content, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    renameAtomicFileWithRetry(tempPath, filePath);
  } catch (error) {
    if (descriptor !== undefined) {
      fs.closeSync(descriptor);
    }
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    throw error;
  }
}

export function renameAtomicFileWithRetry(
  sourcePath: string,
  destinationPath: string,
  dependencies: {
    rename?: (source: string, destination: string) => void;
    sleep?: (milliseconds: number) => void;
  } = {}
): void {
  const rename = dependencies.rename ?? fs.renameSync;
  const sleep = dependencies.sleep ?? sleepSync;
  const maximumAttempts = 5;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      rename(sourcePath, destinationPath);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const retryable = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
      if (!retryable || attempt === maximumAttempts) throw error;
      sleep(25 * (2 ** (attempt - 1)));
    }
  }
}

function sleepSync(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

export function withFileLock<T>(
  lockPath: string,
  action: () => T,
  options: { timeoutMs?: number; staleMs?: number } = {}
): T {
  const timeoutMs = options.timeoutMs ?? TIMEOUTS.FS_LOCK_WAIT;
  const staleMs = options.staleMs ?? 60_000;
  const startedAt = Date.now();
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  while (true) {
    try {
      const descriptor = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(descriptor, `${process.pid}:${Date.now()}\n`, 'utf8');
      fs.closeSync(descriptor);
      break;
    } catch (error: unknown) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'EEXIST') {
        throw error;
      }
      const modifiedAt = fs.statSync(lockPath).mtimeMs;
      if (Date.now() - modifiedAt > staleMs) {
        fs.unlinkSync(lockPath);
        continue;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(`Timed out waiting for file lock: ${lockPath}`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }

  try {
    return action();
  } finally {
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  }
}

export function ensureExerciseDirs(): void {
  fs.mkdirSync(getExercisesDir(), { recursive: true });
}
