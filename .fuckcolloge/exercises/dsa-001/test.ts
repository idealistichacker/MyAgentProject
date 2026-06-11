import assert from 'node:assert/strict';
import { removeDuplicates } from './solution.ts';

const assertionMode = "mutate-and-return";
const tests = [
  {
    "name": "empty array",
    "input": [
      []
    ],
    "expected": {
      "k": 0,
      "nums": []
    }
  },
  {
    "name": "single element",
    "input": [
      [
        1
      ]
    ],
    "expected": {
      "k": 1,
      "nums": [
        1
      ]
    }
  },
  {
    "name": "all duplicates",
    "input": [
      [
        1,
        1,
        1
      ]
    ],
    "expected": {
      "k": 1,
      "nums": [
        1,
        1,
        1
      ]
    }
  },
  {
    "name": "mixed duplicates",
    "input": [
      [
        1,
        1,
        2,
        2,
        3
      ]
    ],
    "expected": {
      "k": 3,
      "nums": [
        1,
        2,
        3,
        2,
        3
      ]
    }
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
  const actualValue = removeDuplicates(...clonedInput as any[]);
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
