import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractOptionalSection,
  stripCodeFence,
  parseJsonFromText,
  sanitizeJsonString,
  extractRequiredSection,
} from '../agents/generatedUnitParser.js';

test('extractOptionalSection extracts text between headings', () => {
  const text = `
### CONTENT
This is the content.
### STARTER_CODE
This is the code.
  `;
  const content = extractOptionalSection(text, 'CONTENT');
  assert.equal(content, 'This is the content.');
});

test('extractRequiredSection throws if missing', () => {
  assert.throws(() => extractRequiredSection('### FOO\nbar', 'CONTENT'), /Missing CONTENT section/);
});

test('stripCodeFence removes markdown code fences', () => {
  const text = '```typescript\nconst a = 1;\n```';
  assert.equal(stripCodeFence(text), 'const a = 1;');
});

test('sanitizeJsonString escapes unescaped inner quotes', () => {
  // A string that has an inner unescaped quote
  const raw = `{"description": "He said "hello" to me"}`;
  const sanitized = sanitizeJsonString(raw);
  assert.equal(sanitized, `{"description": "He said \\"hello\\" to me"}`);
});

test('parseJsonFromText handles dirty JSON via fallback', () => {
  const text = `
Here is your JSON:
\`\`\`json
{"description": "He said "hello""}
\`\`\`
  `;
  const obj = parseJsonFromText<{ description: string }>(text);
  assert.equal(obj.description, 'He said "hello"');
});
