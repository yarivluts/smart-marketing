import type { InstallationVerification } from './types.js';

const STATUS_MARK: Record<string, string> = {
  receiving: 'OK  ',
  stale: 'WAIT',
  quarantined: 'FAIL',
  registered_no_data: 'NONE',
  not_registered: 'MISS',
};

/** The installation check as plain text: one line per schema with its status and the fix. */
export function formatVerification(result: InstallationVerification): string {
  const lines = [
    'GrowthOS installation check',
    `Project:     ${result.project.name} (${result.project.id})`,
    `Environment: ${result.environment.name}`,
    `Key:         ${result.key.prefix}... (${result.key.kind})${result.key.allowedOrigins.length ? ` origins: ${result.key.allowedOrigins.join(', ')}` : ''}`,
    '',
  ];
  if (result.report.schemas.length === 0)
    lines.push('No schemas registered or received yet. Pass --expect with the names you send.');
  const width = Math.max(4, ...result.report.schemas.map((schema) => schema.name.length));
  for (const schema of result.report.schemas) {
    const last = schema.lastAcceptedAt ? `last ${schema.lastAcceptedAt}` : 'never received';
    const quarantine = schema.openQuarantined ? `, ${schema.openQuarantined} in quarantine` : '';
    lines.push(
      `  [${STATUS_MARK[schema.status] ?? '?   '}] ${schema.name.padEnd(width)}  ${schema.status} (${last}${quarantine})`,
    );
    if (schema.fix) lines.push(`         ${''.padEnd(width)}  -> ${schema.fix}`);
  }
  lines.push(
    '',
    result.report.status === 'ok'
      ? 'Status: OK - everything expected is arriving.'
      : 'Status: needs attention (see above).',
  );
  return lines.join('\n');
}
