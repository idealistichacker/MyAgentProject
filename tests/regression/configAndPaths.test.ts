import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { providerConfigSchema } from '../../src/types.js';
import {
  getLessonPath,
  getPreviewUnitDir,
  getUnitArtifactName,
} from '../../src/utils/paths.js';

test('strict quality gate defaults on and accepts an explicit opt-out', () => {
  assert.equal(providerConfigSchema.parse({}).qualityGateEnabled, true);
  assert.equal(providerConfigSchema.parse({ qualityGateEnabled: false }).qualityGateEnabled, false);
});

test('artifact paths include a filesystem-safe topic and stable unit id', () => {
  assert.equal(
    getUnitArtifactName('unit-4', '所有权 / 借用：实战?'),
    '所有权-借用-实战-unit-4'
  );

  const rustLesson = getLessonPath('unit-1', 'Rust 所有权');
  const pythonLesson = getLessonPath('unit-1', 'Python JSON');
  assert.notEqual(rustLesson, pythonLesson);
  assert.equal(path.basename(rustLesson), 'Rust-所有权-unit-1.md');
  assert.equal(path.basename(pythonLesson), 'Python-JSON-unit-1.md');

  assert.notEqual(
    getPreviewUnitDir('unit-1', 'Rust 所有权'),
    getPreviewUnitDir('unit-1', 'Python JSON')
  );
});
