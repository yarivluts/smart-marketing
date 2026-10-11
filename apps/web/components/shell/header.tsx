'use client';

import * as React from 'react';
import {
  Sparkles,
  Menu,
  X,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from './language-switcher';
import { CommandDialog } from './command-dialog';
import { WorkspaceSwitcher, type WorkspaceOrg, type WorkspaceProject } from './workspace-switcher';
import { cn } from '@/lib/utils';

export interface HeaderProps {
  brandName?: string;
  organizations?: WorkspaceOrg[];
  currentOrgId?: string;
  projects?: WorkspaceProject[];
  currentProjectId?: string;
  currentEnv?: string;
  userEmail?: string;
  onMobileMenuToggle?: () => void;
  isMobileMenuOpen?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function Header({
  brandName = 'GrowthOS',
  organizations = [],
  currentOrgId,
  projects = [],
  currentProjectId,
  currentEnv = 'dev',
  userEmail,
  onMobileMenuToggle,
  isMobileMenuOpen = false,
  className,
  children,
}: HeaderProps): React.ReactElement {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-16 w-full items-center justify-between gap-4 border-b border-border/80 bg-glass px-4 sm:px-6 backdrop-blur-md shadow-soft transition-all',
        className,
      )}
    >
      {/* Brand & Left Navigation */}
      <div className="flex items-center gap-4 min-w-0">
        {onMobileMenuToggle ? (
          <button
            type="button"
            onClick={onMobileMenuToggle}
            aria-label={isMobileMenuOpen ? 'Close navigation' : 'Open navigation'}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-input bg-card text-foreground md:hidden shadow-soft hover:bg-muted"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        ) : null}

        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-soft transition-transform group-hover:scale-105">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="hidden sm:inline-block font-bold text-lg tracking-tight bg-brand-gradient bg-clip-text text-transparent">
            {brandName}
          </span>
        </Link>

        {organizations.length > 0 || projects.length > 0 ? (
          <div className="hidden lg:block w-56">
            <WorkspaceSwitcher
              organizations={organizations}
              currentOrgId={currentOrgId}
              projects={projects}
              currentProjectId={currentProjectId}
              currentEnv={currentEnv}
            />
          </div>
        ) : null}

        {children}
      </div>

      {/* Center Search (Desktop) */}
      <div className="hidden md:flex flex-1 max-w-md mx-2">
        <CommandDialog orgId={currentOrgId} projectId={currentProjectId} />
      </div>

      {/* Right Controls & Profile */}
      <div className="flex items-center gap-2.5 shrink-0">
        <LanguageSwitcher compact />

        {userEmail ? (
          <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-card/80 ps-2 pe-3 py-1 text-xs shadow-soft">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
              {userEmail.charAt(0).toUpperCase()}
            </div>
            <span className="hidden sm:inline-block max-w-[120px] truncate text-muted-foreground font-medium">
              {userEmail}
            </span>
          </div>
        ) : null}
      </div>
    </header>
  );
}
