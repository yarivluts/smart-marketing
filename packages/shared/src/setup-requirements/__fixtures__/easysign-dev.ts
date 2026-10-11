import type { SetupEnvironmentRef, SetupSchemaObservation } from '../types';

/**
 * EasySign's reference integration as it stood on 2026-09-26 (org JGTxet9aGXV6xUPWYidR, project
 * LYierelkF0eKnLmIrS9u): landing-page touchpoints, signups, the document lifecycle and a customer
 * entity flowing in dev, nothing in staging or prod yet, no ad spend and no billing stream (its
 * billing is not Stripe and it has not sent subscription changes yet). Production cannot be
 * queried from a test, so the scenario is encoded here, in the exact shape the Firestore-backed
 * collector produces.
 */
export const EASYSIGN_ENVIRONMENTS: SetupEnvironmentRef[] = [
  { id: 'env-prod', name: 'prod' },
  { id: 'env-dev', name: 'dev' },
  { id: 'env-staging', name: 'staging' },
];

function accepted(schemaName: string, kind: SetupSchemaObservation['kind'], lastAcceptedAt: string): SetupSchemaObservation {
  return { environmentId: 'env-dev', kind, schemaName, registered: true, lastAcceptedAt, openQuarantinedCount: 0, quarantineReasons: [] };
}

export const EASYSIGN_DEV_OBSERVATIONS: SetupSchemaObservation[] = [
  accepted('touchpoint', 'event', '2026-09-25T16:11:58.000Z'),
  accepted('signup', 'event', '2026-09-25T16:12:04.000Z'),
  accepted('document_created', 'event', '2026-09-25T16:13:10.000Z'),
  accepted('document_sent', 'event', '2026-09-25T16:13:40.000Z'),
  accepted('document_signed', 'event', '2026-09-25T16:15:02.000Z'),
  accepted('customer', 'entity', '2026-09-25T16:12:05.000Z'),
  // Registered project-wide, so every environment knows the schemas exist; nothing landed outside dev.
  ...['env-prod', 'env-staging'].flatMap((environmentId) =>
    [
      ['touchpoint', 'event'],
      ['signup', 'event'],
      ['document_created', 'event'],
      ['document_sent', 'event'],
      ['document_signed', 'event'],
      ['customer', 'entity'],
    ].map(([schemaName, kind]) => ({
      environmentId,
      kind: kind as SetupSchemaObservation['kind'],
      schemaName,
      registered: true,
      lastAcceptedAt: null,
      openQuarantinedCount: 0,
      quarantineReasons: [],
    })),
  ),
];
