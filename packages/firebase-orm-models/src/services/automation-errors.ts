/**
 * Shared error classes for KAN-71's automation action pipeline
 * (`automation.service.ts`, `automation-guardrail.service.ts`,
 * `automation-kill-switch.service.ts`) and its executor
 * (`../automation-runtime`) — split out from `automation.service.ts` so the
 * executor can throw/catch them without importing the service module that
 * itself depends on the executor, mirroring `resource-library.service.ts`'s
 * `ProjectNotFoundError` being reused by `cost-guardrail.service.ts` rather
 * than redefined.
 */

export class AutomationTargetNotFoundError extends Error {
  constructor(targetId: string) {
    super(`Automation target "${targetId}" has not been seeded for this project/environment.`);
    this.name = 'AutomationTargetNotFoundError';
  }
}

export class AutomationActionNotFoundError extends Error {
  constructor() {
    super('Automation action not found.');
    this.name = 'AutomationActionNotFoundError';
  }
}

export class InvalidAutomationActionError extends Error {
  constructor(reason: string) {
    super(`Invalid automation action: ${reason}`);
    this.name = 'InvalidAutomationActionError';
  }
}

export class AutomationActionInvalidStateError extends Error {
  constructor(fromStatus: string, attemptedTransition: string) {
    super(`Cannot ${attemptedTransition} an automation action in status "${fromStatus}".`);
    this.name = 'AutomationActionInvalidStateError';
  }
}

export class AutomationKillSwitchEngagedError extends Error {
  constructor() {
    super('Automation is paused for this organization (kill switch engaged).');
    this.name = 'AutomationKillSwitchEngagedError';
  }
}
