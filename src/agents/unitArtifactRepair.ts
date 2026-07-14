import type { ChatResponse, ToolCall } from '../providers/types.js';
import type { Source } from '../types.js';
import { GeneratedUnitQualityError } from './generatedUnitQuality.js';
import {
  unitArtifactTool,
  type GeneratedUnitArtifact,
  type UnitAssessmentRepair,
  type UnitCitationRepair,
} from './structuredOutput.js';

export function isAssessmentOnlyQualityError(error: unknown): error is GeneratedUnitQualityError {
  return error instanceof GeneratedUnitQualityError
    && error.issues.length > 0
    && error.issues.every((issue) => issue.code.startsWith('quiz.'));
}

export function isAssessmentRepairableQualityError(error: unknown): error is GeneratedUnitQualityError {
  return error instanceof GeneratedUnitQualityError
    && error.issues.length > 0
    && error.issues.every((issue) => issue.code.startsWith('quiz.'));
}

export function isObjectiveCoverageQualityError(error: unknown): error is GeneratedUnitQualityError {
  return error instanceof GeneratedUnitQualityError
    && error.issues.length > 0
    && error.issues.every((issue) => issue.code.startsWith('objective.'));
}

export function isCitationOnlyQualityError(error: unknown): error is GeneratedUnitQualityError {
  return error instanceof GeneratedUnitQualityError
    && error.issues.length > 0
    && error.issues.every((issue) => issue.code.startsWith('fact.'));
}

export function mergeAssessmentRepair(
  artifact: GeneratedUnitArtifact,
  repair: UnitAssessmentRepair
): ChatResponse {
  const toolCall: ToolCall = {
    id: 'assessment-repair',
    type: 'function',
    function: {
      name: unitArtifactTool.function.name,
      arguments: JSON.stringify({
        ...artifact,
        quiz: repair.quiz,
        objectiveCoverage: repair.objectiveCoverage,
      }),
    },
  };
  return { content: null, tool_calls: [toolCall] };
}

export function normalizeAssessmentRepairEvidence(
  artifact: GeneratedUnitArtifact,
  repair: UnitAssessmentRepair
): UnitAssessmentRepair {
  const normalizedArtifact = normalizeGeneratedArtifactEvidence({
    ...artifact,
    quiz: repair.quiz,
    objectiveCoverage: repair.objectiveCoverage,
  });

  return {
    quiz: repair.quiz,
    objectiveCoverage: normalizedArtifact.objectiveCoverage,
  };
}

export function normalizeGeneratedArtifactEvidence(
  artifact: GeneratedUnitArtifact
): GeneratedUnitArtifact {
  const evidenceCandidates = extractEvidenceCandidates(artifact.content);
  const validAssessmentIds = new Set([
    ...artifact.quiz.map((question) => question.id),
    ...artifact.exercise.testCases.map((testCase) => testCase.name),
  ]);

  return {
    ...artifact,
    objectiveCoverage: artifact.objectiveCoverage.map((coverage) => {
      const mappedQuizIds = artifact.quiz
        .filter((question) => question.objectiveIds.includes(coverage.objectiveId))
        .map((question) => question.id);
      const assessmentIds = [...new Set([
        ...coverage.assessmentIds.filter((id) => validAssessmentIds.has(id)),
        ...mappedQuizIds,
      ])];
      return {
        ...coverage,
        lessonEvidence: selectVerbatimEvidence(artifact.content, coverage.lessonEvidence, evidenceCandidates),
        exampleEvidence: selectVerbatimEvidence(artifact.content, coverage.exampleEvidence, evidenceCandidates),
        assessmentIds,
      };
    }),
  };
}

export function mergeCitationRepair(
  artifact: GeneratedUnitArtifact,
  repair: UnitCitationRepair
): ChatResponse {
  const toolCall: ToolCall = {
    id: 'citation-repair',
    type: 'function',
    function: {
      name: unitArtifactTool.function.name,
      arguments: JSON.stringify({ ...artifact, citations: repair.citations }),
    },
  };
  return { content: null, tool_calls: [toolCall] };
}

export function retainSupportedCitationClaims(
  repair: UnitCitationRepair,
  sources: Source[]
): UnitCitationRepair {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const citationsByClaim = new Map<string, UnitCitationRepair['citations']>();
  for (const citation of repair.citations) {
    const existing = citationsByClaim.get(citation.claim) ?? [];
    existing.push(citation);
    citationsByClaim.set(citation.claim, existing);
  }

  const citations = [...citationsByClaim.values()].flatMap((claimCitations) => {
    const supportingSources = [...new Set(claimCitations.map((citation) => citation.sourceId))]
      .map((sourceId) => sourceById.get(sourceId))
      .filter((source): source is Source => Boolean(source));
    const hasPrimarySource = supportingSources.some((source) => source.trust === 'primary');
    const independentPublishers = new Set(supportingSources.map((source) => source.publisher.toLowerCase()));
    return hasPrimarySource || independentPublishers.size >= 2 ? claimCitations : [];
  });

  return { citations };
}

export function buildAssessmentRepairPrompt(
  objectives: string[],
  artifact: GeneratedUnitArtifact,
  validationError: GeneratedUnitQualityError,
  round: number
): string {
  const fallbackRule = round > 1
    ? '- This is the final repair round. Convert any persistently conflicting choice question into a diagnostic short-answer question with a concrete rubric instead of returning another near-duplicate option set.'
    : '- Prefer rewriting the named conflicting options around fundamentally different misconceptions.';

  return `
Repair only the quiz and objectiveCoverage fields of this learning unit.
Do not regenerate the lesson, exercise, citations, starter code, tests, or reference solution.

Repair round: ${round}

Exact objective IDs (copy these values verbatim; never translate or paraphrase them):
${JSON.stringify(objectives, null, 2)}

Validation failures from the previous candidate:
${validationError.issues.map((issue) => `- ${issue.code}: ${issue.message}`).join('\n')}

Current quiz candidate:
${JSON.stringify(artifact.quiz, null, 2)}

Current objective coverage (preserve valid verbatim evidence):
${JSON.stringify(artifact.objectiveCoverage, null, 2)}

Valid assessment IDs include repaired quiz IDs and these exercise test names:
${JSON.stringify(artifact.exercise.testCases.map((testCase) => testCase.name), null, 2)}

Rules:
- Preserve unaffected questions exactly; rewrite only questions named by validation failures unless objective coverage requires another change.
- Every exact objective ID must be assessed by at least one quiz question.
- objectiveIds and objectiveCoverage.objectiveId must use only the exact values listed above.
- Preserve valid lessonEvidence and exampleEvidence exactly as supplied.
- Choice options must be meaningfully different, not lexical variations of the same sentence.
- Every choice question must have exactly one defensible correct answer. A less concise, less idiomatic, or differently ordered but still correct solution is not a valid distractor.
- For each quiz.choice.distractor.tooSimilar failure, rewrite the specific option pair named in the validation message around different misconceptions rather than making cosmetic wording changes.
${fallbackRule}
- Every incorrect option needs one unique misconception rationale and corrective feedback.
- Call submit_unit_assessment_repair exactly once.
`.trim();
}

export function buildCitationRepairPrompt(
  artifact: GeneratedUnitArtifact,
  sources: Source[],
  validationError: GeneratedUnitQualityError,
  claimCandidates: string[],
  round: number
): string {
  const sourcePack = sources.map(({ id, title, publisher, trust, excerpt }) => ({
    id,
    title,
    publisher,
    trust,
    excerpt,
  }));

  return `
Repair only the citations field of this learning unit.
Do not rewrite the lesson, quiz, exercise, objective coverage, tests, or reference solution.

Repair round: ${round}

Validation failures:
${validationError.issues.map((issue) => `- ${issue.code}: ${issue.message}`).join('\n')}

Allowed verbatim lesson claims (citation.claim must equal one of these strings exactly):
${JSON.stringify(claimCandidates, null, 2)}

Available source pack:
${JSON.stringify(sourcePack, null, 2)}

Current invalid citations:
${JSON.stringify(artifact.citations, null, 2)}

Rules:
- Every citation.claim must be one exact contiguous sentence copied verbatim from the Chinese lesson content.
- citation.claim must equal one allowed claim exactly; do not translate, paraphrase, remove Markdown, or change punctuation.
- Do not use an English source excerpt as citation.claim unless that exact English sentence also appears in the lesson.
- Use only source IDs from the source pack.
- Each distinct claim needs support from one primary source or two independent non-primary publishers. Repeat the exact same claim with both source IDs when two publishers are required.
- Cite only factual instructional statements that the selected source excerpt genuinely supports.
- Return a concise set of 1 to 6 well-supported claims.
- If support is uncertain, return one allowed claim supported by a primary source rather than adding weak citations.
- Call submit_unit_citation_repair exactly once.
`.trim();
}

export function extractCitationClaimCandidates(content: string): string[] {
  const candidates: string[] = [];
  let inCodeFence = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const trimmedLine = rawLine.trim();
    if (trimmedLine.startsWith('```')) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (
      inCodeFence
      || !trimmedLine
      || /^[-*_]{3,}$/.test(trimmedLine)
      || /^#{1,6}\s+/.test(trimmedLine)
    ) continue;

    const line = trimmedLine
      .replace(/^[-*+]\s+/, '')
      .replace(/^\d+[.)、]\s*/, '');
    if (/[:：]$/.test(line)) continue;
    const sentences = line.match(/[^。！？!?]+[。！？!?]?/g) ?? [];
    for (const sentence of sentences) {
      const candidate = sentence.trim();
      const compactLength = candidate.replace(/\s/g, '').length;
      if (
        compactLength >= 12
        && compactLength <= 220
        && /[\u3400-\u9fff]/u.test(candidate)
        && content.includes(candidate)
      ) {
        candidates.push(candidate);
      }
    }
  }

  return [...new Set(candidates)].slice(0, 60);
}

export function extractEvidenceCandidates(content: string): string[] {
  const candidates: string[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine || trimmedLine.startsWith('```') || /^[-*_]{3,}$/.test(trimmedLine)) continue;
    const line = trimmedLine.replace(/^#{1,6}\s+/, '').replace(/^[-*+]\s+/, '');
    candidates.push(line);
    candidates.push(...(line.match(/[^。！？!?]+[。！？!?]?/g) ?? []).map((sentence) => sentence.trim()));
  }
  return [...new Set(candidates.filter((candidate) => candidate.length >= 4 && content.includes(candidate)))];
}

export function fallbackConflictingChoicesToShortAnswer(
  artifact: GeneratedUnitArtifact,
  validationError: GeneratedUnitQualityError
): UnitAssessmentRepair | undefined {
  if (!validationError.issues.every((issue) => issue.code === 'quiz.choice.distractor.tooSimilar')) {
    return undefined;
  }
  const conflictingIds = new Set(validationError.issues.flatMap((issue) => {
    const match = issue.message.match(/Choice quiz "([^"]+)"/);
    return match?.[1] ? [match[1]] : [];
  }));
  if (conflictingIds.size === 0) return undefined;

  return {
    quiz: artifact.quiz.map((question) => conflictingIds.has(question.id) && question.type === 'choice'
      ? {
          ...question,
          type: 'short-answer' as const,
          question: `${question.question}\n请直接写出正确做法并说明理由。`,
          options: undefined,
          distractorRationales: [],
          rubric: question.rubric?.trim() || '回答必须给出正确结论，并解释其与常见误区的区别。',
        }
      : question),
    objectiveCoverage: artifact.objectiveCoverage,
  };
}

function selectVerbatimEvidence(content: string, evidence: string, candidates: string[]): string {
  if (content.includes(evidence)) return evidence;
  const normalizedEvidence = normalizeEvidence(evidence);
  const matches = candidates.filter((candidate) => {
    const normalizedCandidate = normalizeEvidence(candidate);
    return normalizedCandidate.length >= 4
      && (normalizedEvidence.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedEvidence));
  });
  return matches.sort((left, right) => normalizeEvidence(right).length - normalizeEvidence(left).length)[0] ?? evidence;
}

function normalizeEvidence(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`*_>#\s]/g, '')
    .replace(/["'“”‘’；;]/g, '')
    .trim();
}
