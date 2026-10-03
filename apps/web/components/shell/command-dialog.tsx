'use client';

import * as React from 'react';
import { CommandPalette } from './command-palette';
import type { CommandPaletteItem, CommandPaletteProps } from './nav-types';

export type CommandItem = CommandPaletteItem;
export type CommandDialogProps = CommandPaletteProps;

/**
 * Backwards-compatible Milestone 1 CommandDialog wrapper.
 * Provides the canonical Milestone 1 search items when customItems is not supplied.
 */
export function CommandDialog({
  orgId,
  projectId,
  customItems,
  ...rest
}: CommandDialogProps): React.ReactElement {
  const base = orgId && projectId ? `/orgs/${orgId}/projects/${projectId}` : '';

  const defaultLegacyItems: CommandPaletteItem[] = React.useMemo(() => {
    return [
      {
        id: 'campaigns',
        title: 'Ads & Performance Cockpit',
        description: 'Multi-network ROAS, ad creative fatigue, and budgets',
        category: 'Growth Cockpits',
        href: base ? `${base}/campaigns` : '/campaigns',
        icon: 'Megaphone',
        badge: 'Live',
      },
      {
        id: 'funnel',
        title: 'Conversion Funnel Flow',
        description: 'Step-by-step conversion tracking and drop-off analytics',
        category: 'Analytics',
        href: base ? `${base}/funnel` : '/funnel',
        icon: 'Target',
      },
      {
        id: 'tv',
        title: 'TV War Room Live',
        description: 'Real-time operational dashboard for office displays',
        category: 'Operations',
        href: base ? `${base}/tv` : '/tv',
        icon: 'Tv',
      },
      {
        id: 'automation-copilot',
        title: 'Automation & AI Hub',
        description: 'Actionable marketing playbooks and auto-pilot execution',
        category: 'AI & Automation',
        href: base ? `${base}/automation` : '/automation',
        icon: 'Bot',
        badge: 'Copilot',
      },
      {
        id: 'billing',
        title: 'Billing & Usage',
        description: 'Subscription plan, invoice records, and team limits',
        category: 'Operations',
        href: base ? `${base}/billing` : '/billing',
        icon: 'Receipt',
      },
      {
        id: 'members',
        title: 'Team & Access Control',
        description: 'Organization members, role assignments, and invitations',
        category: 'Operations',
        href: base ? `${base}/members` : '/members',
        icon: 'Users',
      },
      {
        id: 'settings',
        title: 'Project Settings',
        description: 'General configuration, API keys, and event schemas',
        category: 'Operations',
        href: base ? `${base}/settings` : '/settings',
        icon: 'Settings',
      },
    ];
  }, [base]);

  return (
    <CommandPalette
      orgId={orgId}
      projectId={projectId}
      customItems={customItems ?? defaultLegacyItems}
      {...rest}
    />
  );
}
