import assert from 'node:assert/strict';
import test from 'node:test';
import { assertGeneratedUnitQuality } from '../../src/agents/generatedUnitQuality.js';
import { SEED_CURRICULUM } from '../../src/curriculum/seed.js';

test('requires normal, edge, and misconception exercise tests for generated units', () => {
  const unit = structuredClone(SEED_CURRICULUM[0]);
  assert.ok(unit.content);
  assert.ok(unit.quiz);
  assert.ok(unit.exercise);

  assert.throws(
    () => assertGeneratedUnitQuality(
      unit,
      unit.content ?? '',
      unit.quiz ?? [],
      unit.exercise!,
      unit.project,
      [],
      [],
      []
    ),
    /normal test case/
  );
});
