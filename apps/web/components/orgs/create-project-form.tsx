'use client';

import React, { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import {
  Globe,
  Smartphone,
  Layers,
  CreditCard,
  ShoppingBag,
  Download,
  Users,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import {
  PpCard,
  PpButton,
  PpIconChip,
  PpField,
  ppInputClass,
} from '@/components/pastel/primitives';
import { cn } from '@/lib/utils';
import type {
  PlatformType,
  BusinessModel,
  TransactionType,
  PrimaryStack,
} from '@/lib/projects/project-profile';

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
      {/* 1. Project Identity */}
      <PpCard title={t('nameLabel')}>
        <PpField label={t('nameLabel')} htmlFor="project-name">
          <input
            id="project-name"
            data-testid="project-name-input"
            required
            placeholder="e.g. Acme SaaS, Storefront, Mobile App"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={ppInputClass}
          />
        </PpField>
      </PpCard>

      {/* 2. Platform Type Selection */}
      <PpCard title={t('platformTypeLabel')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                className={cn(
                  'flex items-center gap-3.5 rounded-2xl border p-4 text-start transition-all duration-150 active:scale-[0.99]',
                  isSelected
                    ? 'border-pp-primary bg-pp-primary-fixed/20 shadow-sm ring-2 ring-pp-primary/30 text-pp-on-surface'
                    : 'border-pp-outline-variant/40 bg-pp-surface-container-lowest text-pp-on-surface-variant hover:border-pp-primary/50 hover:bg-pp-surface-container-low',
                )}
              >
                <PpIconChip
                  icon={Icon}
                  accent={isSelected ? 'primary' : 'neutral'}
                  size="sm"
                />
                <span className="font-pp-body text-pp-label-md font-semibold text-pp-on-surface">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </PpCard>

      {/* 3. Business / Monetization Model */}
      <PpCard title={t('businessModelLabel')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            {
              id: 'saas_subscription' as BusinessModel,
              label: t('modelSaas'),
              icon: CreditCard,
              desc: 'MRR, Churn & LTV',
            },
            {
              id: 'ecommerce_physical' as BusinessModel,
              label: t('modelEcomPhysical'),
              icon: ShoppingBag,
              desc: 'Orders, ROAS & Repeat Cohorts',
            },
            {
              id: 'digital_products' as BusinessModel,
              label: t('modelDigital'),
              icon: Download,
              desc: 'Downloads & Single Purchases',
            },
            {
              id: 'leadgen_b2b' as BusinessModel,
              label: t('modelLeadGen'),
              icon: Users,
              desc: 'Form Leads, Deals & PQL Pipeline',
            },
            {
              id: 'marketplace_hybrid' as BusinessModel,
              label: t('modelMarketplace'),
              icon: RefreshCw,
              desc: 'Mixed Transactions',
            },
          ].map((item) => {
            const Icon = item.icon;
            const isSelected = businessModel === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleModelSelect(item.id)}
                className={cn(
                  'flex items-start gap-3.5 rounded-2xl border p-4 text-start transition-all duration-150 active:scale-[0.99] min-w-0',
                  isSelected
                    ? 'border-pp-primary bg-pp-primary-fixed/20 shadow-sm ring-2 ring-pp-primary/30 text-pp-on-surface'
                    : 'border-pp-outline-variant/40 bg-pp-surface-container-lowest text-pp-on-surface-variant hover:border-pp-primary/50 hover:bg-pp-surface-container-low',
                )}
              >
                <PpIconChip
                  icon={Icon}
                  accent={isSelected ? 'primary' : 'neutral'}
                  size="sm"
                  className="mt-0.5"
                />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-pp-body text-pp-label-md font-semibold text-pp-on-surface flex items-center justify-between gap-1 break-words">
                    <span className="break-words">{item.label}</span>
                    {isSelected && (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-pp-primary" />
                    )}
                  </span>
                  <span className="text-pp-body-sm text-pp-on-surface-variant mt-0.5 break-words">
                    {item.desc}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </PpCard>

      {/* 4. Transaction Structure */}
      <PpCard title={t('transactionTypeLabel')}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
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
                className={cn(
                  'rounded-xl border px-3 py-2.5 text-center font-pp-body text-pp-label-sm font-semibold transition-all duration-150 active:scale-[0.98]',
                  isSelected
                    ? 'border-pp-primary bg-pp-primary text-pp-on-primary shadow-sm'
                    : 'border-pp-outline-variant/40 bg-pp-surface-container-lowest text-pp-on-surface-variant hover:bg-pp-surface-container hover:text-pp-on-surface',
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </PpCard>

      {/* 5. Tech Stack Presets */}
      <PpCard title={t('primaryStackLabel')}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
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
                className={cn(
                  'rounded-xl border px-3 py-2.5 text-center font-pp-body text-pp-label-sm font-semibold transition-all duration-150 active:scale-[0.98]',
                  isSelected
                    ? 'border-pp-primary bg-pp-primary-fixed text-pp-on-primary-fixed shadow-sm'
                    : 'border-pp-outline-variant/40 bg-pp-surface-container-lowest text-pp-on-surface-variant hover:bg-pp-surface-container hover:text-pp-on-surface',
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </PpCard>

      {error ? (
        <p role="alert" className="text-pp-body-sm font-medium text-pp-error">
          {t('genericError')}
        </p>
      ) : null}

      <div className="flex items-center justify-end pt-2">
        <PpButton
          type="submit"
          variant="primary"
          size="md"
          disabled={submitting || !name.trim()}
          className="w-full sm:w-auto"
        >
          {submitting ? t('creating') : t('submit')}
        </PpButton>
      </div>
    </form>
  );
}
