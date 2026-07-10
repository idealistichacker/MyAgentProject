import test from 'node:test';
import { verifyReferenceSolution } from '../../src/runner/referenceVerifier.js';
import type { ExerciseSpec } from '../../src/types.js';

test('runs a TypeScript reference solution against all generated tests', async () => {
  const exercise: ExerciseSpec = {
    id: 'addition', language: 'typescript', entrypoint: 'add', description: 'Add two numbers.',
    starterCode: 'export function add(left: number, right: number): number { return 0; }',
    assertionMode: 'return', hints: ['Use +.', 'Return the result.'],
    testCases: [
      { name: 'normal', category: 'normal', input: [1, 2], expected: 3 },
      { name: 'edge', category: 'edge', input: [0, 0], expected: 0 },
      { name: 'misconception', category: 'misconception', input: [-1, 1], expected: 0 },
    ],
  };
  await verifyReferenceSolution(
    exercise,
    'export function add(left: number, right: number): number { return left + right; }\n'
  );
});
