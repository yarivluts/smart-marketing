'use client';

import * as React from 'react';
import { usePathname } from '@/i18n/navigation';
import { Header } from './header';
import { Sidebar } from './sidebar';
import { MobileDrawer, MobileBottomBar } from './mobile-nav';
import { ShellProvider, useShell } from './shell-context';
import { SHELL_ICONS, type ShellIconName } from './shell-icons';
import type { NavShellItem, NavShellSection, NavShellProps } from './nav-types';
import { McpCopilotChatBubble } from '@/components/ai/mcp-copilot-chat-bubble';

export { SHELL_ICONS, type ShellIconName, type NavShellItem, type NavShellSection, type NavShellProps };

export function bestMatchingHref(pathname: string, hrefs: readonly string[]): string | undefined {
  let best: string | undefined;
  for (const href of hrefs) {
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (!best || href.length > best.length)) {
      best = href;
    }
  }
  return best;
}

function NavShellContent({
  brandName = 'GrowthOS',
  organizations = [],
  currentOrgId,
  projects = [],
  currentProjectId,
  currentEnv = 'dev',
  userEmail,
  sections,
  mobileTabItems = [],
  children,
}: NavShellProps): React.ReactElement {
  const pathname = usePathname();

  const allHrefs = React.useMemo(() => {
    return [
      ...sections.flatMap((s) => s.items.map((i) => i.href)),
      ...mobileTabItems.map((i) => i.href),
    ];
  }, [sections, mobileTabItems]);

  const activeHref = bestMatchingHref(pathname, allHrefs);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Floating Top Header */}
      <Header
        brandName={brandName}
        organizations={organizations}
        currentOrgId={currentOrgId}
        projects={projects}
        currentProjectId={currentProjectId}
        currentEnv={currentEnv}
        userEmail={userEmail}
      />

      <div className="flex flex-1">
        {/* Desktop Sticky Sidebar */}
        <Sidebar
          organizations={organizations}
          currentOrgId={currentOrgId}
          projects={projects}
          currentProjectId={currentProjectId}
          currentEnv={currentEnv}
          sections={sections}
          activeHref={activeHref}
        />

        {/* Mobile Slide-Over Drawer */}
        <MobileDrawer
          organizations={organizations}
          currentOrgId={currentOrgId}
          projects={projects}
          currentProjectId={currentProjectId}
          currentEnv={currentEnv}
          sections={sections}
          activeHref={activeHref}
        />

        {/* Main Content Area */}
        <main id="main-content" className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 pb-[88px] lg:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Shortcut Tab Bar */}
      <MobileBottomBar mobileTabItems={mobileTabItems} activeHref={activeHref} />

      {/* Global AI Copilot Floating Chat Bubble with direct MCP access */}
      {currentOrgId && currentProjectId && (
        <McpCopilotChatBubble orgId={currentOrgId} projectId={currentProjectId} />
      )}
    </div>
  );
}

function NavShellContainer(props: NavShellProps): React.ReactElement {
  let hasOuterShell = false;
  try {
    useShell();
    hasOuterShell = true;
  } catch {
    hasOuterShell = false;
  }

  if (hasOuterShell) {
    return <NavShellContent {...props} />;
  }

  return (
    <ShellProvider initialMobileMenuOpen={props.isMobileMenuOpen}>
      <NavShellContent {...props} />
    </ShellProvider>
  );
}

export function NavShell(props: NavShellProps): React.ReactElement {
  return <NavShellContainer {...props} />;
}
