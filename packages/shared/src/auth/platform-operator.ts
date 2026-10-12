/**
 * GrowthOS platform operators: the people who run the service, as opposed to the customers who use
 * it. They set what a project may spend on AI (Ad Studio daily limits) and see infrastructure
 * details (model ids, storage, ffmpeg) that mean nothing to a customer (KAN-363).
 *
 * No platform-scoped role binding is provisioned yet (see `findActiveMembership`), so operators are
 * an explicit allowlist of sign-in emails in `GROWTHOS_PLATFORM_OPERATORS` (comma separated). Unset
 * means nobody: a customer can never raise their own limits by default.
 */
export function platformOperatorEmails(env: Readonly<Record<string, string | undefined>> = process.env): ReadonlySet<string> {
  return new Set(
    (env.GROWTHOS_PLATFORM_OPERATORS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.includes('@')),
  );
}

export function isPlatformOperator(email: string | null | undefined, env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  if (!email) return false;
  return platformOperatorEmails(env).has(email.trim().toLowerCase());
}
