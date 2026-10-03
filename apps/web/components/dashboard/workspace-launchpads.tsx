'use client';

import * as React from 'react';
import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Globe,
  Layers,
  Plus,
  Search,
  Smartphone,
  X,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  computeWorkspaceReadiness,
  type WorkspaceCardData,
} from '@/lib/projects/workspace-readiness';
import {
  type BusinessModel,
  type PlatformType,
  type PrimaryStack,
} from '@/lib/projects/project-profile';

export { computeWorkspaceReadiness, type WorkspaceCardData };

export interface WorkspaceLaunchpadsProps {
  workspaces: WorkspaceCardData[];
  loading?: boolean;
}

export function WorkspaceLaunchpads({
  workspaces,
  loading = false,
}: WorkspaceLaunchpadsProps): React.ReactElement {
  const t = useTranslations('DashboardPage');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'setup_required'>('all');

  const filteredWorkspaces = useMemo(() => {
    return workspaces.filter((ws) => {
      // Status filter
      if (statusFilter === 'ready' && !ws.setupReadiness.isReady) {
        return false;
      }
      if (statusFilter === 'setup_required' && ws.setupReadiness.isReady) {
        return false;
      }

      // Search query filter
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();
      return (
        ws.organizationName.toLowerCase().includes(q) ||
        (ws.projectName && ws.projectName.toLowerCase().includes(q)) ||
        ws.role.toLowerCase().includes(q) ||
        ws.platformType.toLowerCase().includes(q) ||
        ws.businessModel.toLowerCase().includes(q) ||
        ws.primaryStack.toLowerCase().includes(q)
      );
    });
  }, [workspaces, searchQuery, statusFilter]);

  const readyCount = useMemo(
    () => workspaces.filter((ws) => ws.setupReadiness.isReady).length,
    [workspaces],
  );
  const setupRequiredCount = useMemo(
    () => workspaces.filter((ws) => !ws.setupReadiness.isReady).length,
    [workspaces],
  );

  function getPlatformLabel(platform: PlatformType): string {
    switch (platform) {
      case 'mobile':
        return t('platformMobile');
      case 'hybrid':
        return t('platformHybrid');
      case 'web':
      default:
        return t('platformWeb');
    }
  }

  function getModelLabel(model: BusinessModel): string {
    switch (model) {
      case 'ecommerce_physical':
        return t('modelEcommerce');
      case 'digital_products':
        return t('modelDigital');
      case 'leadgen_b2b':
        return t('modelLeadgen');
      case 'marketplace_hybrid':
        return t('modelMarketplace');
      case 'saas_subscription':
      default:
        return t('modelSaas');
    }
  }

  function getStackLabel(stack: PrimaryStack): string {
    switch (stack) {
      case 'shopify':
        return t('stackShopify');
      case 'woocommerce':
        return t('stackWoocommerce');
      case 'hubspot_salesforce':
        return t('stackHubspot');
      case 'mobile_native':
        return t('stackMobile');
      case 'custom_web':
        return t('stackCustom');
      case 'stripe':
      default:
        return t('stackStripe');
    }
  }

  return (
    <section className="flex flex-col gap-5" aria-busy={loading} aria-label="Workspaces Section">
      {/* Top Header & Global Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {t('organizationsHeading')}
          </h2>
          <Badge variant="secondary" size="sm">
            <span dir="ltr">{workspaces.length}</span>
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/orgs"
            className="text-sm font-medium text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            {t('allOrganizations')}
          </Link>
          <Button asChild size="sm" className="bg-brand-gradient text-white shadow-soft">
            <Link href="/orgs/new" className="flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              <span>{t('createOrganization')}</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Real-Time Search & Filter Pills Bar (when workspaces exist) */}
      {workspaces.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2 rounded-2xl border border-border/70 bg-card/50 backdrop-blur-sm">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchWorkspacesPlaceholder')}
              className="ps-9 pe-8 h-9 text-xs rounded-xl bg-background/80"
              aria-label={t('searchWorkspacesPlaceholder')}
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search query"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                statusFilter === 'all'
                  ? 'bg-primary text-primary-foreground shadow-soft'
                  : 'bg-secondary/70 text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <span>{t('filterAll')}</span>
              <span
                dir="ltr"
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  statusFilter === 'all'
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {workspaces.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('ready')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                statusFilter === 'ready'
                  ? 'bg-primary text-primary-foreground shadow-soft'
                  : 'bg-secondary/70 text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <span>{t('filterReady')}</span>
              <span
                dir="ltr"
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  statusFilter === 'ready'
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {readyCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('setup_required')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                statusFilter === 'setup_required'
                  ? 'bg-primary text-primary-foreground shadow-soft'
                  : 'bg-secondary/70 text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <span>{t('filterSetupRequired')}</span>
              <span
                dir="ltr"
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  statusFilter === 'setup_required'
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                }`}
              >
                {setupRequiredCount}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Areas */}
      {loading ? (
        <div className="rounded-xl border border-border bg-card/50 p-8 text-center text-muted-foreground">
          <p>{t('loadingOrganizations')}</p>
        </div>
      ) : workspaces.length === 0 ? (
        <Card className="bg-brand-wash flex flex-col items-start gap-4 p-8 rounded-2xl border-dashed">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-semibold text-lg text-foreground">
              {t('noActiveOrganizations')}
            </h3>
            <p className="text-muted-foreground text-sm max-w-md mt-1">
              {t('noOrganizations')}
            </p>
          </div>
          <Button asChild className="bg-brand-gradient text-white shadow-soft mt-2">
            <Link href="/orgs/new" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              <span>{t('createFirstOrganization')}</span>
            </Link>
          </Button>
        </Card>
      ) : filteredWorkspaces.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 p-10 rounded-2xl border border-dashed border-border bg-card/40 text-center">
          <Search className="h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm font-medium text-muted-foreground">
            {t('noWorkspacesFound')}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
            }}
          >
            {t('clearSearch')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredWorkspaces.map((ws) => {
            const readiness = ws.setupReadiness;
            const progressColor =
              readiness.percentage === 100
                ? 'bg-emerald-500'
                : readiness.percentage >= 50
                ? 'bg-primary'
                : 'bg-amber-500';

            const projectHref = ws.projectId
              ? `/orgs/${ws.organizationId}/projects/${ws.projectId}`
              : `/orgs/${ws.organizationId}`;

            return (
              <Card
                key={ws.id}
                className="group relative flex flex-col justify-between p-6 rounded-2xl border border-border/80 bg-card hover:-translate-y-1 hover:shadow-soft-lg hover:border-primary/40 transition-all duration-200"
              >
                <div>
                  {/* Org Initials & Status Badge */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-lg shadow-soft group-hover:scale-105 transition-transform">
                      {ws.organizationName.slice(0, 2).toUpperCase()}
                    </div>
                    <Badge variant="emerald" dot size="sm">
                      {t('statusActive')}
                    </Badge>
                  </div>

                  {/* Organization Name Link (preserves existing test assertions) */}
                  <h3 className="text-lg font-bold text-foreground transition-colors line-clamp-1">
                    <Link
                      href={`/orgs/${ws.organizationId}`}
                      className="hover:text-primary transition-colors"
                    >
                      {ws.organizationName}
                    </Link>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('roleLabel', { role: ws.role })}
                  </p>

                  {/* Structured Project Profile Badges */}
                  <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                    {/* Platform Badge */}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-secondary text-secondary-foreground border border-border/50">
                      {ws.platformType === 'mobile' ? (
                        <Smartphone className="h-3 w-3" />
                      ) : (
                        <Globe className="h-3 w-3" />
                      )}
                      <span>{getPlatformLabel(ws.platformType)}</span>
                    </span>

                    {/* Business Model Badge */}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                      <Layers className="h-3 w-3" />
                      <span>{getModelLabel(ws.businessModel)}</span>
                    </span>

                    {/* Tech Stack Badge */}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                      <span>{getStackLabel(ws.primaryStack)}</span>
                    </span>
                  </div>

                  {/* Setup Checklist Readiness Meter */}
                  <div className="mt-4 pt-3.5 border-t border-border/50">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        <span>{t('readinessScore')}</span>
                      </span>
                      <span className="text-muted-foreground font-medium">
                        {t('readyCount', {
                          verified: readiness.readyCount,
                          total: readiness.totalCount,
                          percent: readiness.percentage,
                        })}
                      </span>
                    </div>

                    <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                        style={{ width: `${readiness.percentage}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* 1-Click Launchpad Navigation & Secondary Links */}
                <div className="mt-6 flex items-center justify-between border-t border-border/50 pt-4 gap-2">
                  <Link
                    href={`/orgs/${ws.organizationId}`}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    <span>{t('openWorkspace')}</span>
                  </Link>

                  <Button asChild size="sm" className="bg-brand-gradient text-white shadow-soft h-8 text-xs">
                    <Link href={projectHref} className="flex items-center gap-1">
                      <span>{t('launchWorkspace')}</span>
                      <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                    </Link>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
