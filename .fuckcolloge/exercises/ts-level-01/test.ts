import assert from 'node:assert/strict';
import { parseRoster } from './solution.ts';

const assertionMode = "return";
const tests = [
  {
    "name": "empty roster",
    "input": [
      "[]"
    ],
    "expected": {
      "users": [],
      "errors": []
    }
  },
  {
    "name": "normalize and deduplicate tags",
    "input": [
      "[{\"id\":1,\"name\":\" Alice \",\"email\":\"ALICE@EXAMPLE.com\",\"tags\":[\"js\",\"js\",\"ts\"],\"role\":\"mentor\"}]"
    ],
    "expected": {
      "users": [
        {
          "id": 1,
          "name": "Alice",
          "email": "alice@example.com",
          "tags": [
            "js",
            "ts"
          ],
          "role": "mentor"
        }
      ],
      "errors": []
    }
  },
  {
    "name": "invalid records are reported",
    "input": [
      "[{\"id\":\"1\",\"email\":\"alice@example.com\"},{\"id\":0,\"name\":\"Bob\",\"email\":\"bob@example.com\"}]"
    ],
    "expected": {
      "users": [],
      "errors": [
        {
          "index": 0,
          "path": "id",
          "message": "id must be a positive integer"
        },
        {
          "index": 0,
          "path": "name",
          "message": "name must be a non-empty string"
        },
        {
          "index": 1,
          "path": "id",
          "message": "id must be a positive integer"
        }
      ]
    }
  },
  {
    "name": "optional fields get defaults",
    "input": [
      "[{\"id\":2,\"name\":\"Bob\",\"email\":\"bob@example.com\"}]"
    ],
    "expected": {
      "users": [
        {
          "id": 2,
          "name": "Bob",
          "email": "bob@example.com",
          "tags": [],
          "role": "student"
        }
      ],
      "errors": []
    }
  },
  {
    "name": "invalid tags and role",
    "input": [
      "[{\"id\":3,\"name\":\"Chen\",\"email\":\"chen@example.com\",\"tags\":[\"go\",123,\"go\"],\"role\":\"teacher\"}]"
    ],
    "expected": {
      "users": [],
      "errors": [
        {
          "index": 0,
          "path": "tags",
          "message": "tags must be an array of non-empty strings"
        },
        {
          "index": 0,
          "path": "role",
          "message": "role must be one of: student, mentor, admin"
        }
      ]
    }
  },
  {
    "name": "invalid JSON",
    "input": [
      "not json"
    ],
    "expected": {
      "users": [],
      "errors": [
        {
          "index": -1,
          "path": "$",
          "message": "input must be valid JSON"
        }
      ]
    }
  },
  {
    "name": "decoded value is not an array",
    "input": [
      "{}"
    ],
    "expected": {
      "users": [],
      "errors": [
        {
          "index": -1,
          "path": "$",
          "message": "input must be a JSON array"
        }
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
  const actualValue = parseRoster(...clonedInput as any[]);
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
