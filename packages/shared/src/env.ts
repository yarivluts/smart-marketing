/** Deployment environments in the org -> project -> environment hierarchy. */
export const ENVIRONMENTS = ['dev', 'staging', 'prod'] as const;

export type Environment = (typeof ENVIRONMENTS)[number];

export function isEnvironment(value: string): value is Environment {
  return (ENVIRONMENTS as readonly string[]).includes(value);
}
