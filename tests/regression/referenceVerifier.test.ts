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

test('runs Python tests containing nested JSON and apostrophes', async () => {
  const exercise: ExerciseSpec = {
    id: 'parse-report', language: 'python', entrypoint: 'parse_report', description: 'Parse a report.',
    starterCode: 'def parse_report(raw):\n    pass\n', assertionMode: 'return', hints: [],
    testCases: [
      {
        name: 'nested JSON', category: 'normal',
        input: ['{"test": "test_login", "error": "KeyError"}'],
        expected: { test: 'test_login', error: 'KeyError' },
        explanation: "JSON containing an exception name shouldn't break the generated harness.",
      },
      {
        name: 'invalid input', category: 'misconception', input: ['gibberish!!'],
        expected: 'ValueError', explanation: 'The function must reject malformed reports.',
      },
    ],
  };

  await verifyReferenceSolution(
    exercise,
    [
      'import json',
      '',
      'def parse_report(raw):',
      '    if raw == "gibberish!!":',
      '        raise ValueError("invalid report")',
      '    return json.loads(raw)',
      '',
    ].join('\n')
  );
});
