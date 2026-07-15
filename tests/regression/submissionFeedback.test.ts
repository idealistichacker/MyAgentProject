import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runAssessmentFeedbackFlow } from '../../src/assessment/feedbackFlow.js';
import { inspectSubmissionFiles } from '../../src/runner/submissionInspection.js';
import { ensureProjectDirs, writeTextFile } from '../../src/state/fsState.js';

test('persists and presents assessment before remediation and contains remediation failures', async () => {
  const events: string[] = [];
  let releaseRemediation!: () => void;
  const remediationBlocked = new Promise<void>((resolve) => {
    releaseRemediation = resolve;
  });

  const flow = runAssessmentFeedbackFlow({
    persistAssessment: () => events.push('persisted'),
    presentAssessment: () => events.push('presented'),
    prepareRemediation: async () => {
      events.push('remediation-started');
      await remediationBlocked;
      throw new Error('provider timeout');
    },
    onRemediationFailure: () => events.push('remediation-warning'),
  });

  assert.deepEqual(events, ['persisted', 'presented', 'remediation-started']);
  releaseRemediation();
  assert.equal(await flow, '');
  assert.deepEqual(events, ['persisted', 'presented', 'remediation-started', 'remediation-warning']);
});

test('inspects the themed solution path and detects an unchanged starter', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-submission-inspection-'));
  const previousDirectory = process.cwd();
  process.chdir(workspace);
  try {
    ensureProjectDirs();
    const first = inspectSubmissionFiles('unit-1', 'Rust 所有权', 'python');
    writeTextFile(first.starterPath, 'def solve():\n    pass\n');
    writeTextFile(first.solutionPath, 'def solve():\n    pass\n');

    const unchanged = inspectSubmissionFiles('unit-1', 'Rust 所有权', 'python');
    assert.match(unchanged.solutionPath, /Rust-所有权-unit-1[\\/]solution\.py$/);
    assert.equal(unchanged.matchesStarter, true);

    writeTextFile(unchanged.solutionPath, 'def solve():\n    return 42\n');
    assert.equal(inspectSubmissionFiles('unit-1', 'Rust 所有权', 'python').matchesStarter, false);
  } finally {
    process.chdir(previousDirectory);
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
