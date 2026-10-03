'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Building2, CheckCircle2, ArrowRight, Loader2, AlertCircle, Shield, Zap, Server } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { PpButton, PpIconChip, PpPill, ppInputClass } from '@/components/pastel/primitives';

export function CreateOrganizationForm(): React.ReactElement {
  const t = useTranslations('NewOrgPage');
  const locale = useLocale();
  const isRtl = locale === 'he';
  const router = useRouter();

  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  // Generate URL slug from name
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'workspace';

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch('/api/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      const { organizationId } = (await response.json()) as { organizationId: string };
      router.push(`/orgs/${organizationId}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full flex flex-col lg:flex-row gap-8 items-start">
      {/* Form Column (Left) */}
      <form className="w-full lg:w-3/5 flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
        {/* Organization Name Field */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-pp-label-md font-semibold text-pp-on-surface" htmlFor="org-name">
              {t('nameLabel')}
            </label>
            <span className="text-pp-label-sm text-pp-on-surface-variant">Legal entity or brand</span>
          </div>
          <div className="relative flex items-center">
            <input
              id="org-name"
              name="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Stripe, Linear, Acme Corp"
              className={ppInputClass}
            />
            <Building2 className="absolute end-4 h-5 w-5 text-pp-outline pointer-events-none" />
          </div>
        </div>

        {/* Workspace Slug & Ingestion Endpoint Preview */}
        <div className="space-y-2">
          <label className="text-pp-label-md font-semibold text-pp-on-surface" htmlFor="org-slug">
            {t('slugLabel')}
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-pp-surface-container px-4 py-2.5">
            <div className="flex items-center gap-1 text-pp-body-md">
              <span className="text-pp-outline font-medium">growthos.io/orgs/</span>
              <span className="font-bold text-pp-primary">{slug}</span>
            </div>
            <PpPill accent="mint">
              <CheckCircle2 className="h-3 w-3" />
              <span>{t('slugAvailable')}</span>
            </PpPill>
          </div>
        </div>

        {/* Error Alert Box */}
        {error ? (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-2xl bg-pp-error-container p-3.5 text-pp-body-sm text-pp-on-error-container font-medium"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{t('genericError')}</span>
          </div>
        ) : null}

        {/* Submit CTA */}
        <div className="pt-2">
          <PpButton
            type="submit"
            variant="primary"
            disabled={submitting || !name.trim()}
            className="w-full sm:w-auto h-12 px-8 rounded-full font-pp-display text-pp-body-lg font-bold shadow-pp-candy active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <span>{t('submit')}</span>
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </>
            )}
          </PpButton>
        </div>
      </form>

      {/* Feature Highlights Column (Right) */}
      <div className="w-full lg:w-2/5 flex flex-col gap-4 border-t lg:border-t-0 lg:border-s border-pp-surface-container pt-6 lg:pt-0 lg:ps-8">
        <div className="p-4 rounded-2xl bg-pp-surface-container-low flex items-start gap-3.5">
          <PpIconChip icon={Server} accent="primary" size="md" />
          <div>
            <h4 className="font-pp-display text-pp-label-md font-bold text-pp-on-surface">
              {t('featurePodTitle')}
            </h4>
            <p className="text-pp-body-sm text-pp-on-surface-variant mt-0.5">
              {t('featurePodDesc')}
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-pp-surface-container-low flex items-start gap-3.5">
          <PpIconChip icon={Shield} accent="mint" size="md" />
          <div>
            <h4 className="font-pp-display text-pp-label-md font-bold text-pp-on-surface">
              {t('featureRbacTitle')}
            </h4>
            <p className="text-pp-body-sm text-pp-on-surface-variant mt-0.5">
              {t('featureRbacDesc')}
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-pp-surface-container-low flex items-start gap-3.5">
          <PpIconChip icon={Zap} accent="amber" size="md" />
          <div>
            <h4 className="font-pp-display text-pp-label-md font-bold text-pp-on-surface">
              {t('featureStreamTitle')}
            </h4>
            <p className="text-pp-body-sm text-pp-on-surface-variant mt-0.5">
              {t('featureStreamDesc')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
