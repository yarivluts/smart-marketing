'use client';

import React, { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Globe, Smartphone, Layers, CreditCard, ShoppingBag, Download, Users, RefreshCw, CheckCircle2 } from 'lucide-react';
import type { PlatformType, BusinessModel, TransactionType, PrimaryStack } from '@/lib/projects/project-profile';

export interface CreateProjectFormProps {
  orgId: string;
}

export function CreateProjectForm({ orgId }: CreateProjectFormProps): React.ReactElement {
  const t = useTranslations('NewProjectPage');
  const router = useRouter();

  const [name, setName] = useState('');
  const [platformType, setPlatformType] = useState<PlatformType>('web');
  const [businessModel, setBusinessModel] = useState<BusinessModel>('saas_subscription');
  const [transactionType, setTransactionType] = useState<TransactionType>('monthly_recurring');
  const [primaryStack, setPrimaryStack] = useState<PrimaryStack>('custom_web');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  // Auto-sync sensible transaction defaults when business model changes
  const handleModelSelect = (model: BusinessModel) => {
    setBusinessModel(model);
    if (model === 'ecommerce_physical' || model === 'digital_products') {
      setTransactionType('one_time');
      if (model === 'ecommerce_physical') setPrimaryStack('shopify');
    } else if (model === 'saas_subscription') {
      setTransactionType('monthly_recurring');
      setPrimaryStack('stripe');
    } else if (model === 'leadgen_b2b') {
      setTransactionType('one_time');
      setPrimaryStack('hubspot_salesforce');
    }
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!name.trim()) return;

    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          platformType,
          businessModel,
          transactionType,
          primaryStack,
          vertical: businessModel,
        }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      const { projectId } = (await response.json()) as { projectId: string };
      router.push(`/orgs/${orgId}/projects/${projectId}/setup-checklist`);
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
      {/* Project Identity */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-foreground" htmlFor="project-name">
          {t('nameLabel')}
        </label>
        <Input
          id="project-name"
          data-testid="project-name-input"
          required
          placeholder="e.g. Acme SaaS, Storefront, Mobile App"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-11 text-base bg-background/80"
        />
      </div>

      {/* Platform Type Selection */}
      <div className="flex flex-col gap-2.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('platformTypeLabel')}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { id: 'web' as PlatformType, label: t('platformWeb'), icon: Globe },
            { id: 'mobile' as PlatformType, label: t('platformMobile'), icon: Smartphone },
            { id: 'hybrid' as PlatformType, label: t('platformHybrid'), icon: Layers },
          ].map((item) => {
            const Icon = item.icon;
            const isSelected = platformType === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPlatformType(item.id)}
                className={`flex items-center gap-3 p-3.5 rounded-xl border text-start transition-all cursor-pointer ${
                  isSelected
                    ? 'border-primary bg-primary/10 text-foreground ring-2 ring-primary/20 shadow-sm'
                    : 'border-border/70 hover:border-border hover:bg-muted/40 text-muted-foreground'
                }`}
              >
                <div className={`p-2 rounded-lg ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Business / Monetization Model */}
      <div className="flex flex-col gap-2.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('businessModelLabel')}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { id: 'saas_subscription' as BusinessModel, label: t('modelSaas'), icon: CreditCard, desc: 'MRR, Churn & LTV' },
            { id: 'ecommerce_physical' as BusinessModel, label: t('modelEcomPhysical'), icon: ShoppingBag, desc: 'Orders, ROAS & Repeat Cohorts' },
            { id: 'digital_products' as BusinessModel, label: t('modelDigital'), icon: Download, desc: 'Downloads & Single Purchases' },
            { id: 'leadgen_b2b' as BusinessModel, label: t('modelLeadGen'), icon: Users, desc: 'Form Leads, Deals & PQL Pipeline' },
            { id: 'marketplace_hybrid' as BusinessModel, label: t('modelMarketplace'), icon: RefreshCw, desc: 'Mixed Transactions' },
          ].map((item) => {
            const Icon = item.icon;
            const isSelected = businessModel === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleModelSelect(item.id)}
                className={`flex items-start gap-3 p-3.5 rounded-xl border text-start transition-all cursor-pointer ${
                  isSelected
                    ? 'border-primary bg-primary/10 text-foreground ring-2 ring-primary/20 shadow-sm'
                    : 'border-border/70 hover:border-border hover:bg-muted/40 text-muted-foreground'
                }`}
              >
                <div className={`p-2 rounded-lg mt-0.5 ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    {item.label}
                    {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                  </span>
                  <span className="text-xs text-muted-foreground">{item.desc}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Transaction Structure */}
      <div className="flex flex-col gap-2.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('transactionTypeLabel')}
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { id: 'monthly_recurring' as TransactionType, label: t('txMonthly') },
            { id: 'annual_recurring' as TransactionType, label: t('txAnnual') },
            { id: 'one_time' as TransactionType, label: t('txOneTime') },
            { id: 'hybrid_mixed' as TransactionType, label: t('txHybrid') },
          ].map((item) => {
            const isSelected = transactionType === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTransactionType(item.id)}
                className={`px-3 py-2.5 rounded-lg border text-xs font-medium text-center transition-all cursor-pointer ${
                  isSelected
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border hover:bg-muted text-muted-foreground'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tech Stack Presets */}
      <div className="flex flex-col gap-2.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('primaryStackLabel')}
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { id: 'shopify' as PrimaryStack, label: t('stackShopify') },
            { id: 'woocommerce' as PrimaryStack, label: t('stackWoo') },
            { id: 'stripe' as PrimaryStack, label: t('stackStripe') },
            { id: 'custom_web' as PrimaryStack, label: t('stackCustom') },
            { id: 'mobile_native' as PrimaryStack, label: t('stackMobile') },
            { id: 'hubspot_salesforce' as PrimaryStack, label: t('stackCrm') },
          ].map((item) => {
            const isSelected = primaryStack === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPrimaryStack(item.id)}
                className={`px-3 py-2 rounded-lg border text-xs font-medium text-center transition-all cursor-pointer ${
                  isSelected
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border/70 hover:bg-muted text-muted-foreground'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t('genericError')}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={submitting || !name.trim()} className="h-11 font-semibold">
        {submitting ? t('creating') : t('submit')}
      </Button>
    </form>
  );
}
