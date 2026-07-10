import { z } from 'zod';
import {
  citationSchema,
  exerciseSchema,
  objectiveCoverageSchema,
  projectSpecSchema,
  quizQuestionSchema,
  seedUnitSchema,
} from '../types.js';
import type { ChatResponse, ToolDefinition } from '../providers/types.js';

const generatedQuizQuestionSchema = quizQuestionSchema.extend({
  objectiveIds: z.array(z.string()).min(1),
  misconception: z.string().min(1),
  rubric: z.string().min(1),
}).superRefine((question, context) => {
  if (question.type === 'choice' && (!question.options || question.options.length < 2)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Choice questions need at least two options.' });
  }
});

const generatedExerciseSchema = exerciseSchema.extend({
  testCases: z.array(z.object({
    name: z.string().min(1),
    category: z.enum(['normal', 'edge', 'misconception']),
    input: z.array(z.unknown()),
    expected: z.unknown(),
    explanation: z.string().optional(),
  })).min(3),
  hints: z.array(z.string().min(1)).min(2),
  conceptTags: z.array(z.string().min(1)).min(1),
  commonPitfalls: z.array(z.string().min(1)).min(1),
  estimatedMinutes: z.number().int().min(1).max(240),
});

export const generatedUnitArtifactSchema = z.object({
  content: z.string().min(1),
  quiz: z.array(generatedQuizQuestionSchema).min(1).max(5),
  exercise: generatedExerciseSchema,
  project: projectSpecSchema.optional(),
  objectiveCoverage: z.array(objectiveCoverageSchema).min(1),
  citations: z.array(citationSchema).min(1),
  referenceSolution: z.string().min(1),
});

export type GeneratedUnitArtifact = z.infer<typeof generatedUnitArtifactSchema>;

const planSubmissionSchema = z.object({
  units: z.array(seedUnitSchema).min(2).max(11),
});

const assessmentReviewSchema = z.object({
  diagnosis: z.string().min(1),
  nextAction: z.string().min(1),
});

export const unitArtifactTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'submit_unit_artifact',
    description: 'Submit one complete, validated learning-unit artifact.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['content', 'quiz', 'exercise', 'objectiveCoverage', 'citations', 'referenceSolution'],
      properties: {
        content: { type: 'string', description: 'Chinese Markdown lesson content.' },
        quiz: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'type', 'question', 'answer', 'explanation'],
            properties: {
              id: { type: 'string' },
              type: { type: 'string', enum: ['choice', 'short-answer'] },
              question: { type: 'string' },
              options: { type: 'array', items: { type: 'string' } },
              answer: { type: 'string' },
              explanation: { type: 'string' },
              objectiveIds: { type: 'array', minItems: 1, items: { type: 'string' } },
              misconception: { type: 'string' },
              rubric: { type: 'string' },
            },
          },
        },
        exercise: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'language', 'entrypoint', 'description', 'starterCode', 'assertionMode', 'testCases', 'hints', 'difficulty', 'conceptTags', 'commonPitfalls', 'estimatedMinutes'],
          properties: {
            id: { type: 'string' },
            language: { type: 'string' },
            entrypoint: { type: 'string' },
            description: { type: 'string' },
            starterCode: { type: 'string' },
            testCode: { type: 'string' },
            assertionMode: { type: 'string', enum: ['return', 'mutate-and-return', 'stdout'] },
            testCases: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'category', 'input', 'expected'],
                properties: {
                  name: { type: 'string' },
                  category: { type: 'string', enum: ['normal', 'edge', 'misconception'] },
                  input: { type: 'array' },
                  expected: {},
                  explanation: { type: 'string' },
                },
              },
            },
            hints: { type: 'array', items: { type: 'string' } },
            difficulty: { type: 'string', enum: ['introductory', 'practice', 'challenge'] },
            conceptTags: { type: 'array', minItems: 1, items: { type: 'string' } },
            commonPitfalls: { type: 'array', minItems: 1, items: { type: 'string' } },
            estimatedMinutes: { type: 'integer', minimum: 1, maximum: 240 },
          },
        },
        project: { type: 'object' },
        objectiveCoverage: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['objectiveId', 'lessonEvidence', 'exampleEvidence', 'assessmentIds'],
            properties: {
              objectiveId: { type: 'string' },
              lessonEvidence: { type: 'string' },
              exampleEvidence: { type: 'string' },
              assessmentIds: { type: 'array', minItems: 1, items: { type: 'string' } },
            },
          },
        },
        citations: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['sourceId', 'claim'],
            properties: { sourceId: { type: 'string' }, claim: { type: 'string' } },
          },
        },
        referenceSolution: { type: 'string', description: 'Correct solution used only for pre-publication verification.' },
      },
    },
  },
};

export const planSubmissionTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'submit_learning_plan',
    description: 'Submit a complete learning-plan outline after research is complete.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['units'],
      properties: {
        units: {
          type: 'array',
          minItems: 2,
          maxItems: 11,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'type', 'title', 'description', 'prerequisites', 'objectives'],
            properties: {
              id: { type: 'string' },
              type: { type: 'string', enum: ['unit', 'project', 'remediation'] },
              title: { type: 'string' },
              description: { type: 'string' },
              prerequisites: { type: 'array', items: { type: 'string' } },
              objectives: { type: 'array', items: { type: 'string' } },
              remediationForUnitId: { type: 'string' },
              nextIfPassed: { type: 'string' },
              nextIfFailed: { type: 'string' },
            },
          },
        },
      },
    },
  },
};

export const assessmentReviewTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'submit_assessment_review',
    description: 'Submit a concise learner assessment review.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['diagnosis', 'nextAction'],
      properties: {
        diagnosis: { type: 'string' },
        nextAction: { type: 'string' },
      },
    },
  },
};

export function parseUnitArtifact(response: ChatResponse): GeneratedUnitArtifact {
  return generatedUnitArtifactSchema.parse(parseNamedToolArguments(response, unitArtifactTool.function.name));
}

export function parsePlanSubmission(response: ChatResponse): z.infer<typeof planSubmissionSchema> {
  return planSubmissionSchema.parse(parseNamedToolArguments(response, planSubmissionTool.function.name));
}

export function parseAssessmentReview(response: ChatResponse): z.infer<typeof assessmentReviewSchema> {
  return assessmentReviewSchema.parse(parseNamedToolArguments(response, assessmentReviewTool.function.name));
}

export function parseNamedToolArguments(response: ChatResponse, name: string): unknown {
  const call = response.tool_calls?.find((candidate) => candidate.function.name === name);
  if (!call) {
    throw new Error(`Provider did not call required structured-output tool "${name}".`);
  }

  try {
    return JSON.parse(call.function.arguments);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Provider returned invalid arguments for "${name}": ${message}`);
  }
}
