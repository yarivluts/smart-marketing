import type * as React from 'react';
import type { ShellIconType } from './shell-icons';

export type NavClusterKey =
  | 'favorites'
  | 'executiveOverview'
  | 'marketingCockpit'
  | 'economicsCohorts'
  | 'mrrIntelligence'
  | 'productTelemetry'
  | 'dataIntegrations';

export type { ShellIconType };

export interface NavShellItem {
  id?: string;
  href: string;
  label: string;
  description?: string;
  icon: ShellIconType;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'success' | 'warning' | 'alert' | 'destructive';
  cluster?: NavClusterKey;
}

export interface NavShellSection {
  clusterKey?: NavClusterKey;
  heading?: string;
  items: NavShellItem[];
}

export interface WorkspaceOrg {
  id: string;
  name: string;
  slug?: string;
}

export interface WorkspaceProject {
  id: string;
  name: string;
  env?: string;
}

export interface NavShellProps {
  brandName?: string;
  organizations?: WorkspaceOrg[];
  currentOrgId?: string;
  projects?: WorkspaceProject[];
  currentProjectId?: string;
  currentEnv?: string;
  userEmail?: string;
  sections: NavShellSection[];
  mobileTabItems?: NavShellItem[];
  missingIntegrationsCount?: number;
  onMobileMenuToggle?: () => void;
  isMobileMenuOpen?: boolean;
  children: React.ReactNode;
}

export interface CommandPaletteItem {
  id: string;
  title: string;
  description: string;
  category: string;
  categoryKey?: string;
  href: string;
  icon: ShellIconType;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'success' | 'warning' | 'alert' | 'destructive';
  type?: 'route' | 'board' | 'metric' | 'segment' | 'campaign' | 'goal' | 'win_rule' | 'customer';
}

export interface CommandPaletteProps {
  orgId?: string;
  projectId?: string;
  customItems?: CommandPaletteItem[];
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerClassName?: string;
}
