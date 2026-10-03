'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, ArrowRight } from 'lucide-react';

export interface ProjectSettingsFormProps {
  orgId: string;
  projectId: string;
  initialName: string;
  initialVertical: string;
  initialPlatformType?: string;
  initialBusinessModel?: string;
  initialTransactionType?: string;
  initialPrimaryStack?: string;
}

/**
 * The admin surface for a project's own `name`/`vertical`
 * and its core business classification & platform options.
 */
export function ProjectSettingsForm({
  orgId,
  projectId,
  initialName,
  initialVertical,
  initialPlatformType = 'web',
  initialBusinessModel = 'saas_subscription',
  initialTransactionType = 'monthly_recurring',
  initialPrimaryStack = 'custom_web',
}: ProjectSettingsFormProps): React.ReactElement {
  const t = useTranslations('ProjectSettings');
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [vertical, setVertical] = useState(initialVertical);
  const [platformType, setPlatformType] = useState(initialPlatformType);
  const [businessModel, setBusinessModel] = useState(initialBusinessModel);
  const [transactionType, setTransactionType] = useState(initialTransactionType);
  const [primaryStack, setPrimaryStack] = useState(initialPrimaryStack);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSaved(false);

    if (!name.trim()) {
      setError(t('nameRequiredError'));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          vertical,
          platformType,
          businessModel,
          transactionType,
          primaryStack,
        }),
      });
      if (!response.ok) {
        setError(t('saveError'));
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="project-settings-name">
          {t('nameLabel')}
        </label>
        <Input id="project-settings-name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="project-settings-vertical">
          {t('verticalLabel')}
        </label>
        <Input id="project-settings-vertical" value={vertical} onChange={(event) => setVertical(event.target.value)} />
        <p className="text-xs text-muted-foreground">{t('verticalHelp')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="project-settings-platform">
            Platform Type
          </label>
          <select
            id="project-settings-platform"
            value={platformType}
            onChange={(e) => setPlatformType(e.target.value)}
            className="h-9 text-xs rounded-md border border-border bg-background px-2"
          >
            <option value="web">Web / SaaS / Storefront</option>
            <option value="mobile">Mobile App (iOS / Android)</option>
            <option value="hybrid">Omnichannel (Web + Mobile)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="project-settings-model">
            Business & Monetization Model
          </label>
          <select
            id="project-settings-model"
            value={businessModel}
            onChange={(e) => {
              setBusinessModel(e.target.value);
              setVertical(e.target.value);
            }}
            className="h-9 text-xs rounded-md border border-border bg-background px-2"
          >
            <option value="saas_subscription">SaaS & Recurring Subscriptions</option>
            <option value="ecommerce_physical">E-Commerce (Physical Goods)</option>
            <option value="digital_products">Digital Products & Downloads</option>
            <option value="leadgen_b2b">B2B Lead Generation</option>
            <option value="marketplace_hybrid">Marketplace & Hybrid</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="project-settings-tx">
            Transaction Structure
          </label>
          <select
            id="project-settings-tx"
            value={transactionType}
            onChange={(e) => setTransactionType(e.target.value)}
            className="h-9 text-xs rounded-md border border-border bg-background px-2"
          >
            <option value="monthly_recurring">Monthly Recurring (MRR)</option>
            <option value="annual_recurring">Annual Recurring (ARR)</option>
            <option value="one_time">One-Time Checkout</option>
            <option value="hybrid_mixed">Hybrid Mixed</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="project-settings-stack">
            Primary Tech Stack
          </label>
          <select
            id="project-settings-stack"
            value={primaryStack}
            onChange={(e) => setPrimaryStack(e.target.value)}
            className="h-9 text-xs rounded-md border border-border bg-background px-2"
          >
            <option value="shopify">Shopify Storefront</option>
            <option value="woocommerce">WooCommerce / WordPress</option>
            <option value="stripe">Stripe Billing & Checkout</option>
            <option value="custom_web">Custom Web (Next.js / Node / React)</option>
            <option value="mobile_native">Mobile Native (React Native / Flutter)</option>
            <option value="hubspot_salesforce">B2B CRM (HubSpot / Salesforce)</option>
          </select>
        </div>
      </div>

      {/* Quick Setup Checklist Jump */}
      <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span>Connection Requirements & Setup Guides</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Review your tailored integration checklist, copy code snippets and run automated connection tests.
          </p>
        </div>
        <Link
          href={`/orgs/${orgId}/projects/${projectId}/setup-checklist`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shrink-0"
        >
          <span>Open Checklist</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {saved && !error ? <p className="text-sm text-muted-foreground">{t('saved')}</p> : null}

      <div>
        <Button type="submit" disabled={submitting}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
