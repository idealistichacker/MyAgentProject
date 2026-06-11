import assert from 'node:assert/strict';
import { isValidParentheses } from './solution.ts';

const assertionMode = "return";
const tests = [
  {
    "name": "empty string",
    "input": [
      ""
    ],
    "expected": true
  },
  {
    "name": "simple valid",
    "input": [
      "()[]{}"
    ],
    "expected": true
  },
  {
    "name": "nested valid",
    "input": [
      "([{}])"
    ],
    "expected": true
  },
  {
    "name": "invalid order",
    "input": [
      "([)]"
    ],
    "expected": false
  },
  {
    "name": "missing close",
    "input": [
      "(()"
    ],
    "expected": false
  }
] as Array<{
  name: string;
  input: unknown[];
  expected: unknown;
}>;

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function cloneInput(input: unknown[]): unknown[] {
  return input.map((item) => {
    try {
      return JSON.parse(JSON.stringify(item));
    } catch {
      return item;
    }
  });
}

let passedCount = 0;

for (const test of tests) {
  const clonedInput = cloneInput(test.input);
  const actualValue = isValidParentheses(...clonedInput as any[]);
  const actual = assertionMode === 'mutate-and-return'
    ? { k: actualValue, nums: clonedInput[0] }
    : actualValue;

  try {
    assert.deepEqual(actual, test.expected);
    passedCount++;
    console.log(JSON.stringify({ name: test.name, passed: true }));
  } catch (error) {
    console.log(JSON.stringify({
      name: test.name,
      passed: false,
      message: error instanceof Error ? error.message : String(error),
      expected: safeStringify(test.expected),
      actual: safeStringify(actual),
    }));
  }
}

if (passedCount !== tests.length) {
  process.exitCode = 1;
}
