export interface AssessmentFeedbackFlowOptions {
  persistAssessment: () => void;
  presentAssessment: () => void;
  prepareRemediation: () => Promise<string>;
  onRemediationFailure: (error: unknown) => void;
}

export async function runAssessmentFeedbackFlow(
  options: AssessmentFeedbackFlowOptions
): Promise<string> {
  options.persistAssessment();
  options.presentAssessment();

  try {
    return await options.prepareRemediation();
  } catch (error) {
    options.onRemediationFailure(error);
    return '';
  }
}
