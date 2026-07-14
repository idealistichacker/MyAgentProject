export const TIMEOUTS = {
  // LLM API Request Timeouts (ms)
  LLM_DEFAULT: 300_000,
  LLM_LEARNING_PLAN: 120_000,
  LLM_REMEDIATION_OUTLINE: 300_000,
  LLM_PASS1_DRAFT: 180_000,
  LLM_PASS2_CRITIQUE: 180_000,
  LLM_PASS3_FINAL: 300_000,
  LLM_REMEDIATION_UNIT: 180_000,
  LLM_REPAIR: 300_000,
  LLM_DIAGNOSTICS: 60_000,

  // Web Search / System (ms)
  WEB_SEARCH: 15_000,
  EXEC_COMMAND: 10_000,

  // File State Lock (ms)
  FS_LOCK_WAIT: 10_000,

  // Local Code Runners (ms)
  RUNNER_COMPILE_PISTON: 10_000,
  RUNNER_RUN_PISTON: 5_000,
  RUNNER_COMPILE_RUST: 10_000,
  RUNNER_RUN_RUST: 5_000,
  RUNNER_RUN_BASH: 5_000,
  RUNNER_RUN_PYTHON: 5_000,
  RUNNER_RUN_TYPESCRIPT: 5_000,
};

export const LLM_POLICIES = {
  PASS3_FINAL: {
    timeoutMs: TIMEOUTS.LLM_PASS3_FINAL,
    maxTokens: 12_000,
    maxAttempts: 2,
    thinkingMode: 'disabled' as const,
  },
  ASSESSMENT_REPAIR: {
    timeoutMs: TIMEOUTS.LLM_REPAIR,
    maxTokens: 6_000,
    maxAttempts: 1,
    thinkingMode: 'disabled' as const,
  },
  CITATION_REPAIR: {
    timeoutMs: TIMEOUTS.LLM_REPAIR,
    maxTokens: 4_000,
    maxAttempts: 1,
    thinkingMode: 'disabled' as const,
  },
  ARTIFACT_REPAIR: {
    timeoutMs: TIMEOUTS.LLM_REPAIR,
    maxTokens: 12_000,
    maxAttempts: 1,
    thinkingMode: 'disabled' as const,
  },
};
