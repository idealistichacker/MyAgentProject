import type { Citation, QualityIssue, Source } from '../types.js';

export function buildSourcePackReadinessIssues(sources: Source[]): QualityIssue[] {
  const hasPrimarySource = sources.some((source) => source.trust === 'primary');
  const independentPublishers = new Set(sources.map((source) => normalizePublisher(source.publisher)));
  if (hasPrimarySource || independentPublishers.size >= 2) return [];
  return [{
    code: 'fact.sourcePack.insufficientIndependence',
    severity: 'error',
    message: 'Formal generation requires at least one primary source or two independent publishers. Configure Tavily or use a source provider with official documentation coverage.',
  }];
}

export function buildFactVerificationIssues(
  content: string,
  citations: Citation[],
  sources: Source[]
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  issues.push(...buildSourcePackReadinessIssues(sources));
  const normalizedContent = normalizeClaim(content);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const citationsByClaim = new Map<string, Citation[]>();

  for (const citation of citations) {
    const claimKey = normalizeClaim(citation.claim);
    const existing = citationsByClaim.get(claimKey) ?? [];
    existing.push(citation);
    citationsByClaim.set(claimKey, existing);
  }

  for (const [claimKey, claimCitations] of citationsByClaim) {
    const displayedClaim = claimCitations[0]?.claim ?? claimKey;
    if (!claimKey || !normalizedContent.includes(claimKey)) {
      issues.push({
        code: 'fact.claim.notInLesson',
        severity: 'error',
        message: `Cited fact claim is not copied verbatim from the lesson: "${displayedClaim}".`,
      });
      continue;
    }

    const supportingSources = [...new Set(claimCitations.map((citation) => citation.sourceId))]
      .map((sourceId) => sourceById.get(sourceId))
      .filter((source): source is Source => Boolean(source));
    const hasPrimarySource = supportingSources.some((source) => source.trust === 'primary');
    const independentPublishers = new Set(supportingSources.map((source) => normalizePublisher(source.publisher)));
    if (!hasPrimarySource && independentPublishers.size < 2) {
      issues.push({
        code: 'fact.claim.insufficientSupport',
        severity: 'error',
        message: `Fact claim needs one primary source or two independent publishers: "${displayedClaim}".`,
      });
    }
  }

  return issues;
}

function normalizeClaim(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizePublisher(value: string): string {
  return value.toLowerCase().replace(/^www\./, '').trim();
}
