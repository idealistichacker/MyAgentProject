import assert from 'node:assert/strict';
import test from 'node:test';
import {
  categoryForStatus,
  isRetryableProviderError,
  normalizeProviderError,
  ProviderRequestError,
} from '../../src/providers/errors.js';

test('classifies permanent and transient provider errors', () => {
  assert.equal(categoryForStatus(401), 'authentication');
  assert.equal(categoryForStatus(429), 'rate-limit');
  assert.equal(categoryForStatus(503), 'provider-5xx');
  assert.equal(isRetryableProviderError(new ProviderRequestError('auth', { category: 'authentication' })), false);
  assert.equal(isRetryableProviderError(new ProviderRequestError('limited', { category: 'rate-limit' })), true);
});

test('normalizes timeout errors for retry policy', () => {
  const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
  assert.equal(normalizeProviderError(timeout).category, 'timeout');
});
