/** The Ad Studio stepper: Brief -> Plan -> Create -> Review -> Publish. */
export type AdStudioStepId = 'brief' | 'plan' | 'create' | 'review' | 'publish';
export type AdStudioStepState = 'done' | 'current' | 'next' | 'locked';

export interface AdStudioStepFacts {
  /** A rendered image or clip exists. */
  hasMedia: boolean;
  /** A saved script or saved image ideas exist - written by hand or by the AI. */
  hasContent: boolean;
  /** The latest autopilot run, if any. */
  run: { status: string; planApproved: boolean } | null;
  /** Creatives ready to publish, and ads already published. */
  publishable: number;
  published: number;
}

export interface AdStudioStepPlan {
  states: Record<AdStudioStepId, AdStudioStepState>;
  /** The step to open when the URL names none: the one that needs attention next. */
  defaultStep: AdStudioStepId;
  /** An autopilot run that is rendering now. */
  rendering: boolean;
  planConfirmed: boolean;
}

/**
 * Which steps are open and where to start. The plan counts as confirmed once the autopilot's plan was
 * approved, a run finished, media exists, or the person saved a script or image ideas themselves -
 * so someone who writes by hand can go on to render in Review without running the autopilot.
 * Review opens as soon as there is something to render or review.
 */
export function planAdStudioSteps(facts: AdStudioStepFacts): AdStudioStepPlan {
  const { hasMedia, hasContent, run, publishable, published } = facts;
  const planConfirmed = Boolean(run && (run.planApproved || run.status === 'done')) || hasMedia || hasContent;
  const rendering = run?.status === 'running' && run.planApproved;
  const reviewOpen = hasMedia || (planConfirmed && hasContent);
  const states: Record<AdStudioStepId, AdStudioStepState> = {
    brief: 'done',
    plan: planConfirmed ? 'done' : 'current',
    create: !planConfirmed ? 'locked' : rendering ? 'current' : hasMedia ? 'done' : 'next',
    review: reviewOpen ? (published ? 'done' : 'next') : 'locked',
    publish: publishable === 0 ? 'locked' : published ? 'done' : 'next',
  };
  const defaultStep: AdStudioStepId = !planConfirmed ? 'plan' : rendering ? 'create' : hasMedia ? 'review' : hasContent && !run ? 'review' : 'create';
  return { states, defaultStep, rendering: Boolean(rendering), planConfirmed };
}

/** The step to show: the one asked for when it is open, otherwise the default. */
export function resolveAdStudioStep(plan: AdStudioStepPlan, requested: string | undefined): AdStudioStepId {
  const ids = Object.keys(plan.states) as AdStudioStepId[];
  const asked = ids.find((id) => id === requested);
  return asked && plan.states[asked] !== 'locked' ? asked : plan.defaultStep;
}
