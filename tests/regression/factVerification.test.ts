import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFactVerificationIssues, buildSourcePackReadinessIssues } from '../../src/agents/factVerification.js';
import { GeneratedUnitQualityError } from '../../src/agents/generatedUnitQuality.js';
import { qualityReportFromGenerationError } from '../../src/generation/orchestrator.js';
import type { Citation, Source } from '../../src/types.js';

const timestamp = '2026-07-13T00:00:00.000Z';
const claim = '递归函数必须具有能够终止调用的基本情况。';

function source(id: string, publisher: string, trust: Source['trust']): Source {
  return {
    id,
    url: `https://${publisher}/recursion/${id}`,
    title: `${publisher} recursion reference`,
    publisher,
    retrievedAt: timestamp,
    hash: `${id}-hash`,
    trust,
    freshness: 'fresh',
    excerpt: 'A recursion definition and its terminating base case are described in this reference excerpt.',
  };
}

test('accepts a verbatim fact claim supported by one primary source', () => {
  const sources = [source('primary', 'docs.example.edu', 'primary')];
  const citations: Citation[] = [{ sourceId: 'primary', claim }];

  assert.deepEqual(buildFactVerificationIssues(`## 递归\n${claim}`, citations, sources), []);
});

test('accepts the same fact claim from two independent publishers', () => {
  const sources = [
    source('left', 'publisher-a.example', 'secondary'),
    source('right', 'publisher-b.example', 'background'),
  ];
  const citations: Citation[] = [
    { sourceId: 'left', claim },
    { sourceId: 'right', claim },
  ];

  assert.deepEqual(buildFactVerificationIssues(`## 递归\n${claim}`, citations, sources), []);
});

test('rejects unsupported or non-verbatim fact claims', () => {
  const sources = [source('only', 'wikipedia.org', 'background')];
  const citations: Citation[] = [{ sourceId: 'only', claim }];
  const issues = buildFactVerificationIssues('## 递归\n这里没有逐字事实声明。', citations, sources);

  assert.ok(buildSourcePackReadinessIssues(sources).some((issue) => issue.code === 'fact.sourcePack.insufficientIndependence'));
  assert.ok(issues.some((issue) => issue.code === 'fact.claim.notInLesson'));
  assert.ok(issues.some((issue) => issue.code === 'fact.sourcePack.insufficientIndependence'));
});

test('converts uncertain facts into a failed generation quality report', () => {
  const issues = buildSourcePackReadinessIssues([source('only', 'wikipedia.org', 'background')]);
  const report = qualityReportFromGenerationError(new GeneratedUnitQualityError(issues));

  assert.equal(report?.passed, false);
  assert.equal(report?.checks[0], 'fact claim verification');
  assert.equal(report?.issues[0]?.code, 'fact.sourcePack.insufficientIndependence');
});
