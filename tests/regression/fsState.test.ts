import assert from 'node:assert/strict';
import test from 'node:test';
import { renameAtomicFileWithRetry } from '../../src/state/fsState.js';

test('retries transient Windows atomic rename failures with bounded backoff', () => {
  let attempts = 0;
  const delays: number[] = [];

  renameAtomicFileWithRetry('source.tmp', 'target.json', {
    rename: () => {
      attempts += 1;
      if (attempts < 3) {
        throw Object.assign(new Error('file temporarily busy'), { code: 'EPERM' });
      }
    },
    sleep: (milliseconds) => delays.push(milliseconds),
  });

  assert.equal(attempts, 3);
  assert.deepEqual(delays, [25, 50]);
});

test('does not retry non-transient atomic rename failures', () => {
  let attempts = 0;

  assert.throws(() => renameAtomicFileWithRetry('source.tmp', 'target.json', {
    rename: () => {
      attempts += 1;
      throw Object.assign(new Error('invalid path'), { code: 'EINVAL' });
    },
    sleep: () => undefined,
  }), /invalid path/);
  assert.equal(attempts, 1);
});
