import { requiredRegisterSchemaPermission, requiredSetFunnelPermission } from './mcp-admin-tools';

/**
 * `register_schema`'s dry run writes nothing, so it needs only `mcp.read`;
 * committing needs `schema.write` (KAN-175).
 *
 * Gating the preview at write level made the safety net exactly as hard to
 * reach as the operation it protects against. An integrator with a
 * read/ingest key hit "This API key does not carry the schema.write scope"
 * on their first dry run — the one call that was supposed to let them check
 * their work *before* asking for write access.
 *
 * The disclosure objection was considered and rejected on evidence, not
 * preference: `list_schemas` needs only `mcp.read` and already returns every
 * active schema's name, kind, version and fields, so a dry run's "would this
 * name conflict" reveals strictly less over the same namespace.
 */
describe('requiredRegisterSchemaPermission', () => {
  it('requires only mcp.read for a dry run', () => {
    expect(requiredRegisterSchemaPermission({ kind: 'event', name: 'x', dry_run: true })).toBe('mcp.read');
  });

  it('requires schema.write to actually create the schema', () => {
    expect(requiredRegisterSchemaPermission({ kind: 'event', name: 'x' })).toBe('schema.write');
    expect(requiredRegisterSchemaPermission({ kind: 'event', name: 'x', dry_run: false })).toBe('schema.write');
  });

  /**
   * The security-relevant half. Anything that is not a literal `true` must
   * fall through to `schema.write`: this runs on raw, caller-supplied args
   * before any parsing, so a truthy-but-not-true value must never be able to
   * talk its way into the cheaper scope — and, since the handler only takes
   * the preview branch on `=== true` as well, a coercion here would hand out
   * `mcp.read` for a call that then really writes.
   */
  it.each([['string', 'true'], ['number', 1], ['object', {}], ['array', []], ['null', null], ['undefined', undefined]])(
    'does not accept a truthy %s as a dry run',
    (_label, value) => {
      expect(requiredRegisterSchemaPermission({ kind: 'event', name: 'x', dry_run: value })).toBe('schema.write');
    },
  );

  it('tolerates junk args without throwing, since the permission check runs before validation', () => {
    expect(requiredRegisterSchemaPermission(null)).toBe('schema.write');
    expect(requiredRegisterSchemaPermission(undefined)).toBe('schema.write');
    expect(requiredRegisterSchemaPermission('not an object')).toBe('schema.write');
  });
});

/**
 * `set_funnel` (KAN-199) follows the same dry-run split, with
 * `project.configure` as its write permission: which events make up the
 * funnel is the project describing itself, and `project.manage` (what the web
 * wizard's route checks) is withheld from API keys.
 */
describe('requiredSetFunnelPermission', () => {
  it('requires only mcp.read for a dry run', () => {
    expect(requiredSetFunnelPermission({ steps: ['a', 'b'], dry_run: true })).toBe('mcp.read');
  });

  it('requires project.configure to actually save the funnel', () => {
    expect(requiredSetFunnelPermission({ steps: ['a', 'b'] })).toBe('project.configure');
    expect(requiredSetFunnelPermission({ steps: ['a', 'b'], dry_run: false })).toBe('project.configure');
  });

  it.each([['string', 'true'], ['number', 1], ['object', {}], ['null', null]])('does not accept a truthy %s as a dry run', (_label, value) => {
    expect(requiredSetFunnelPermission({ steps: ['a', 'b'], dry_run: value })).toBe('project.configure');
  });

  it('tolerates junk args without throwing', () => {
    expect(requiredSetFunnelPermission(null)).toBe('project.configure');
    expect(requiredSetFunnelPermission('not an object')).toBe('project.configure');
  });
});
