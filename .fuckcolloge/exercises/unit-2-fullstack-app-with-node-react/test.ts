import assert from 'node:assert/strict';
import { applyTaskCommand } from './solution.ts';

const assertionMode = "return";
const tests = [
  {
    "name": "test 1",
    "input": [
      "{\"action\":\"list\",\"user\":{\"id\":1},\"state\":{\"tasks\":[{\"id\":1,\"ownerId\":1,\"title\":\"A\",\"done\":false,\"createdAt\":\"t1\"},{\"id\":2,\"ownerId\":2,\"title\":\"B\",\"done\":true,\"createdAt\":\"t2\"}],\"nextId\":3,\"clock\":\"t3\"}}"
    ],
    "expected": "{\"status\":200,\"body\":[{\"id\":1,\"ownerId\":1,\"title\":\"A\",\"done\":false,\"createdAt\":\"t1\"}]}"
  },
  {
    "name": "test 2",
    "input": [
      "{\"action\":\"create\",\"user\":{\"id\":2},\"body\":{\"title\":\"  Write tests  \"},\"state\":{\"tasks\":[],\"nextId\":4,\"clock\":\"t0\"}}"
    ],
    "expected": "{\"status\":201,\"body\":{\"id\":4,\"ownerId\":2,\"title\":\"Write tests\",\"done\":false,\"createdAt\":\"t0\"}}"
  },
  {
    "name": "test 3",
    "input": [
      "{\"action\":\"update\",\"user\":{\"id\":1},\"body\":{\"title\":\"Buy milk\",\"done\":true},\"state\":{\"tasks\":[{\"id\":1,\"ownerId\":1,\"title\":\"Milk\",\"done\":false,\"createdAt\":\"t1\"},{\"id\":2,\"ownerId\":1,\"title\":\"Eggs\",\"done\":false,\"createdAt\":\"t2\"}],\"nextId\":3,\"clock\":\"t3\"}}"
    ],
    "expected": "{\"status\":200,\"body\":{\"task\":{\"id\":1,\"ownerId\":1,\"title\":\"Buy milk\",\"done\":true,\"createdAt\":\"t1\"}}}"
  },
  {
    "name": "test 4",
    "input": [
      "{\"action\":\"toggle\",\"user\":{\"id\":1},\"body\":{\"id\":2},\"state\":{\"tasks\":[{\"id\":1,\"ownerId\":1,\"title\":\"A\",\"done\":false,\"createdAt\":\"t1\"},{\"id\":2,\"ownerId\":1,\"title\":\"B\",\"done\":false,\"createdAt\":\"t2\"}],\"nextId\":3,\"clock\":\"t3\"}}"
    ],
    "expected": "{\"status\":200,\"body\":{\"task\":{\"id\":2,\"ownerId\":1,\"title\":\"B\",\"done\":true,\"createdAt\":\"t2\"}}}"
  },
  {
    "name": "test 5",
    "input": [
      "{\"action\":\"delete\",\"user\":{\"id\":1},\"body\":{\"id\":1},\"state\":{\"tasks\":[{\"id\":1,\"ownerId\":1,\"title\":\"A\",\"done\":false,\"createdAt\":\"t1\"},{\"id\":2,\"ownerId\":2,\"title\":\"B\",\"done\":false,\"createdAt\":\"t2\"}],\"nextId\":3,\"clock\":\"t3\"}}"
    ],
    "expected": "{\"status\":200,\"body\":{\"ok\":true}}"
  },
  {
    "name": "test 6",
    "input": [
      "{\"action\":\"update\",\"user\":{\"id\":1},\"body\":{\"id\":2,\"title\":\"Steal task\"},\"state\":{\"tasks\":[{\"id\":1,\"ownerId\":1,\"title\":\"A\",\"done\":false,\"createdAt\":\"t1\"},{\"id\":2,\"ownerId\":2,\"title\":\"B\",\"done\":false,\"createdAt\":\"t2\"}],\"nextId\":3,\"clock\":\"t3\"}}"
    ],
    "expected": "{\"status\":403,\"error\":\"forbidden\"}"
  },
  {
    "name": "test 7",
    "input": [
      "{\"action\":\"create\",\"user\":{\"id\":1},\"body\":{\"title\":\"\"},\"state\":{\"tasks\":[],\"nextId\":1,\"clock\":\"t0\"}}"
    ],
    "expected": "{\"status\":400,\"error\":\"invalid title\"}"
  },
  {
    "name": "test 8",
    "input": [
      "not json"
    ],
    "expected": "{\"status\":400,\"error\":\"invalid json\"}"
  },
  {
    "name": "test 9",
    "input": [
      "{\"action\":\"complete\",\"user\":{\"id\":1},\"body\":{},\"state\":{\"tasks\":[],\"nextId\":1,\"clock\":\"t0\"}}"
    ],
    "expected": "{\"status\":400,\"error\":\"invalid action\"}"
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
  const actualValue = applyTaskCommand(...clonedInput as any[]);
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
