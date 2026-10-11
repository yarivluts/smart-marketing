import type { OnboardingStep } from '@growthos/firebase-orm-models';
import type { FlowEdgeSpec, FlowNodeSpec } from '@/components/viz/flow-diagram';
import { ONBOARDING_JOURNEY, journeyStateToVizStatus, onboardingJourneyStates, type OnboardingJourneyStep } from '@/lib/orgs/workspace-view';

/** Where one project's setup stands, from its stored wizard state and the records it has. */
export interface OnboardingFacts {
  /** The wizard's stored step, or null when it was never started. */
  step: OnboardingStep | null;
}

/** What each node says - the page supplies translated text, so this stays locale-free and testable. */
export interface OnboardingJourneyText {
  label: (step: OnboardingJourneyStep) => string;
  sublabel?: (step: OnboardingJourneyStep) => string | undefined;
  value?: (step: OnboardingJourneyStep) => string | undefined;
  edgeLabel?: (from: OnboardingJourneyStep, to: OnboardingJourneyStep) => string | undefined;
}

/**
 * The setup journey as a flow diagram: start -> pack -> source -> funnel -> starter board -> done,
 * each node coloured by where the stored wizard step says it stands (done green, current amber,
 * upcoming grey) and linking to the page that does or shows that step. `idPrefix` keeps node ids
 * unique when several projects' journeys share one diagram.
 */
export function buildOnboardingJourney(
  facts: OnboardingFacts,
  text: OnboardingJourneyText,
  hrefs: Partial<Record<OnboardingJourneyStep, string>> = {},
  idPrefix = '',
): { nodes: FlowNodeSpec[]; edges: FlowEdgeSpec[] } {
  const states = onboardingJourneyStates(facts.step);
  const nodes: FlowNodeSpec[] = ONBOARDING_JOURNEY.map((step) => ({
    id: `${idPrefix}${step}`,
    label: text.label(step),
    sublabel: text.sublabel?.(step),
    value: text.value?.(step),
    status: journeyStateToVizStatus(states[step]),
    href: hrefs[step],
  }));
  const edges: FlowEdgeSpec[] = ONBOARDING_JOURNEY.slice(1).map((step, index) => {
    const from = ONBOARDING_JOURNEY[index];
    return {
      source: `${idPrefix}${from}`,
      target: `${idPrefix}${step}`,
      label: text.edgeLabel?.(from, step),
      animated: states[step] === 'current',
      status: states[step] === 'done' ? 'ok' : states[step] === 'current' ? 'warn' : 'idle',
    };
  });
  return { nodes, edges };
}

/**
 * Lays a linear chain of nodes out left-to-right in rows of `perRow`, so a long journey wraps onto a
 * second row instead of shrinking every node until its text is unreadable.
 */
export function wrapIntoRows<T extends FlowNodeSpec>(nodes: readonly T[], perRow: number): (T & { column: number; row: number })[] {
  const width = Math.max(1, perRow);
  return nodes.map((node, index) => ({ ...node, column: index % width, row: Math.floor(index / width) }));
}
