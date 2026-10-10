import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import React from 'react';
import type { AuditLogChainEntryRef, AuditLogChainVerification } from '@growthos/firebase-orm-models';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { AuditChainStatus, MAX_LISTED_FORKS, auditEntryAnchorId } from './audit-chain-status';
import he from '@/messages/he.json';

function ref(id: string, action: string, createdAt = '2026-08-16T19:50:09.516Z'): AuditLogChainEntryRef {
  return { id, action, createdAt, actorType: 'user', actorId: 'user-1' };
}

const actorName = (actorType: string, actorId: string): string => (actorType === 'user' && actorId === 'user-1' ? 'Dana Admin' : actorId);

/** Prod org JGTxet9aGXV6xUPWYidR's real verdict shape once forks are classified (12 forks, 717 entries). */
const branched: AuditLogChainVerification = {
  valid: true,
  entryCount: 717,
  forks: Array.from({ length: 12 }, (_, index) =>
    index === 0
      ? { parent: ref('jiqRyCSe68Ly3bLsdNg8', 'plugin.install', '2026-08-16T19:50:09.408Z'), branches: [ref('SvPQ2D8Ge0OCF2iY8BaV', 'metric_def.register'), ref('tgYhv3hJTivCYu8rTFCV', 'metric_def.register')] }
      : { parent: ref(`parent-${index}`, 'schema_def.register'), branches: [ref(`a-${index}`, 'metric_def.register'), ref(`b-${index}`, 'metric_def.register')] },
  ),
};

describe('AuditChainStatus', () => {
  it('states an intact chain plainly', () => {
    renderWithIntl(<AuditChainStatus chain={{ valid: true, entryCount: 3, forks: [] }} visibleEntryIds={new Set()} actorName={actorName} />);
    const status = screen.getByTestId('audit-chain-status');
    expect(status).toHaveAttribute('data-state', 'intact');
    expect(status).toHaveTextContent('Chain verified — 3 entries, no tampering detected.');
  });

  it('presents concurrent-append forks as verified, explains them, and never claims tampering', () => {
    renderWithIntl(<AuditChainStatus chain={branched} visibleEntryIds={new Set(['tgYhv3hJTivCYu8rTFCV'])} actorName={actorName} />);
    const status = screen.getByTestId('audit-chain-status');
    expect(status).toHaveAttribute('data-state', 'branched');
    expect(status).not.toHaveAttribute('role', 'alert');
    expect(status).toHaveTextContent('Chain verified - 717 entries, none changed or removed from the middle of the log.');
    expect(status).toHaveTextContent('At 12 points, several changes were saved at the same moment');
    expect(status).toHaveTextContent('(12 entries sit on a side branch)');
    expect(status).toHaveTextContent('is not a sign of tampering');
    expect(status.textContent).not.toMatch(/may have been tampered|failed/i);

    const forks = screen.getByTestId('audit-chain-forks');
    expect(within(forks).getAllByRole('listitem')).toHaveLength(MAX_LISTED_FORKS);
    expect(forks).toHaveTextContent('After plugin.install (');
    // An entry shown in the timeline links to it; one outside the shown window is named but not linked.
    expect(within(forks).getByRole('link', { name: 'tgYhv3hJTivCYu8rTFCV' })).toHaveAttribute('href', `#${auditEntryAnchorId('tgYhv3hJTivCYu8rTFCV')}`);
    expect(within(forks).queryByRole('link', { name: 'SvPQ2D8Ge0OCF2iY8BaV' })).toBeNull();
    expect(forks).toHaveTextContent('SvPQ2D8Ge0OCF2iY8BaV');
    expect(status).toHaveTextContent('7 more branch points not listed.');
  });

  it('identifies an edited entry, says what it means and what to do', () => {
    const chain: AuditLogChainVerification = {
      valid: false,
      entryCount: 717,
      reason: 'hash_mismatch',
      brokenAtEntryId: 'tgYhv3hJTivCYu8rTFCV',
      brokenEntry: ref('tgYhv3hJTivCYu8rTFCV', 'metric_def.register'),
      forks: [],
    };
    renderWithIntl(<AuditChainStatus chain={chain} visibleEntryIds={new Set(['tgYhv3hJTivCYu8rTFCV'])} actorName={actorName} />);
    const status = screen.getByRole('alert');
    expect(status).toHaveAttribute('data-state', 'broken');
    expect(status).toHaveTextContent('Integrity check failed: this entry was changed after it was recorded.');
    const details = screen.getByTestId('audit-chain-broken-entry');
    expect(within(details).getByRole('link', { name: 'tgYhv3hJTivCYu8rTFCV' })).toHaveAttribute('href', '#audit-entry-tgYhv3hJTivCYu8rTFCV');
    expect(details).toHaveTextContent('metric_def.register');
    expect(details).toHaveTextContent('Dana Admin');
    expect(details).toHaveTextContent('UTC');
    expect(status).toHaveTextContent('changed directly in the database');
    expect(status).toHaveTextContent("What to do: don't edit or delete any more entries");
  });

  it('explains a chain break and notes when the entry is outside the shown window', () => {
    const chain: AuditLogChainVerification = {
      valid: false,
      entryCount: 50,
      reason: 'chain_break',
      brokenAtEntryId: 'old-entry',
      brokenEntry: ref('old-entry', 'api_key.revoke'),
      forks: [],
    };
    renderWithIntl(<AuditChainStatus chain={chain} visibleEntryIds={new Set()} actorName={actorName} />);
    const status = screen.getByRole('alert');
    expect(status).toHaveTextContent('Integrity check failed: the entry recorded just before this one is missing or was changed.');
    expect(status).toHaveTextContent('Changes saved at the same moment cannot cause this.');
    expect(within(status).queryByRole('link')).toBeNull();
    expect(status).toHaveTextContent('old-entry');
    expect(status).toHaveTextContent('(older than the entries shown below)');
  });

  it('renders every state from the Hebrew translation file', () => {
    const { unmount } = renderWithIntl(<AuditChainStatus chain={branched} visibleEntryIds={new Set()} actorName={actorName} />, { locale: 'he' });
    expect(screen.getByTestId('audit-chain-status')).toHaveTextContent(he.AuditLog.chainBranchedTitle.replace('{count}', '717'));
    expect(screen.getByTestId('audit-chain-status')).toHaveTextContent(he.AuditLog.chainBranchedDetails);
    unmount();

    renderWithIntl(
      <AuditChainStatus
        chain={{ valid: false, entryCount: 2, reason: 'chain_break', brokenAtEntryId: 'x', brokenEntry: ref('x', 'board.create'), forks: [] }}
        visibleEntryIds={new Set()}
        actorName={actorName}
      />,
      { locale: 'he' },
    );
    expect(screen.getByRole('alert')).toHaveTextContent(he.AuditLog.chainBrokenChainBreakTitle);
    expect(screen.getByRole('alert')).toHaveTextContent(he.AuditLog.chainBrokenNextSteps);
  });
});
