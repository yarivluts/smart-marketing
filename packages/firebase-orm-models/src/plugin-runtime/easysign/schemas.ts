import type { SchemaFieldInput } from '../../services/schema-registry.service';
import {
  DuplicateSchemaDefinitionError,
  registerSchemaDefinition,
} from '../../services/schema-registry.service';

/** Event schema names for EasySign lifecycle telemetry (KAN-81). */
export const EASYSIGN_DOCUMENT_CREATED_EVENT_NAME = 'easysign.document_created';
export const EASYSIGN_SIGNING_VIEWED_EVENT_NAME = 'easysign.signing_viewed';
export const EASYSIGN_DOCUMENT_SIGNED_EVENT_NAME = 'easysign.document_signed';
export const EASYSIGN_DOCUMENT_DECLINED_EVENT_NAME = 'easysign.document_declined';

const DOCUMENT_CREATED_FIELDS: SchemaFieldInput[] = [
  { name: 'documentId', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
  { name: 'ownerUid', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
  { name: 'signingTier', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'isEncrypted', type: 'boolean', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'fileCount', type: 'number', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'fieldCount', type: 'number', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'timestamp', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
];

const SIGNING_VIEWED_FIELDS: SchemaFieldInput[] = [
  { name: 'documentId', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
  { name: 'signerIpHash', type: 'string', isRequired: false, isPii: true, isIdentityKey: false },
  { name: 'userAgent', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'timestamp', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
];

const DOCUMENT_SIGNED_FIELDS: SchemaFieldInput[] = [
  { name: 'documentId', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
  { name: 'ownerUid', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
  { name: 'signingTier', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'signerPhoneHash', type: 'string', isRequired: false, isPii: true, isIdentityKey: true },
  { name: 'isEncrypted', type: 'boolean', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'signingDurationSec', type: 'number', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'padesSigned', type: 'boolean', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'timestamp', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
];

const DOCUMENT_DECLINED_FIELDS: SchemaFieldInput[] = [
  { name: 'documentId', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
  { name: 'reason', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'timestamp', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
];

export const EASYSIGN_SCHEMAS = [
  {
    name: EASYSIGN_DOCUMENT_CREATED_EVENT_NAME,
    fields: DOCUMENT_CREATED_FIELDS,
  },
  {
    name: EASYSIGN_SIGNING_VIEWED_EVENT_NAME,
    fields: SIGNING_VIEWED_FIELDS,
  },
  {
    name: EASYSIGN_DOCUMENT_SIGNED_EVENT_NAME,
    fields: DOCUMENT_SIGNED_FIELDS,
  },
  {
    name: EASYSIGN_DOCUMENT_DECLINED_EVENT_NAME,
    fields: DOCUMENT_DECLINED_FIELDS,
  },
] as const;

/**
 * Registers all 4 EasySign lifecycle schemas for a given project in the SchemaRegistry.
 * Safe to call idempotently (ignores DuplicateSchemaDefinitionError).
 */
export async function ensureEasySignSchemasRegistered(
  organizationId: string,
  projectId: string,
  createdByUserId = 'system:easysign-plugin',
): Promise<void> {
  await Promise.all(
    EASYSIGN_SCHEMAS.map(async ({ name, fields }) => {
      try {
        await registerSchemaDefinition({
          organizationId,
          projectId,
          name,
          kind: 'event',
          fields,
          createdByUserId,
        });
      } catch (err) {
        if (err instanceof DuplicateSchemaDefinitionError) {
          return;
        }
        throw err;
      }
    }),
  );
}


