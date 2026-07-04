/** The kind of principal a role binding can grant access to (plan 08 §5.1). */
export const PRINCIPAL_TYPES = ['user', 'service_account'] as const;
export type PrincipalType = (typeof PRINCIPAL_TYPES)[number];

/** A principal being checked against the policy engine. */
export interface Principal {
  type: PrincipalType;
  id: string;
}
