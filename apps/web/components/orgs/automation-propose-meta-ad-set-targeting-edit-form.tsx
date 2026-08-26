'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AutomationTargetView } from '@/lib/orgs/automation-view';

export interface AutomationProposeMetaAdSetTargetingEditFormProps {
  orgId: string;
  projectId: string;
  /** Only targets with at least one Meta ad set created (a `campaign_draft_create` action already executed) — see `AutomationTargetView.metaAdSetResourceNames`. */
  targets: AutomationTargetView[];
}

function linesOf(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Proposes a KAN-73 follow-up `meta_ad_set_targeting_edit` action — replaces the whole targeting spec (countries/age range/genders) of a Meta ad set an earlier `campaign_draft_create` action already created ("ad-set targeting-spec edits"). Unlike `AutomationProposeMetaAdSetEditForm`'s independently-optional budget/status fields, this always submits the whole spec at once (see `MetaAdSetTargetingEdit`'s own doc comment). */
export function AutomationProposeMetaAdSetTargetingEditForm({
  orgId,
  projectId,
  targets,
}: AutomationProposeMetaAdSetTargetingEditFormProps): React.ReactElement | null {
  const t = useTranslations('Automation');
  const router = useRouter();
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const [adSetResourceName, setAdSetResourceName] = useState(targets[0]?.metaAdSetResourceNames?.[0] ?? '');
  const [countries, setCountries] = useState('');
  const [ageMin, setAgeMin] = useState('18');
  const [ageMax, setAgeMax] = useState('65');
  const [genderMale, setGenderMale] = useState(false);
  const [genderFemale, setGenderFemale] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (targets.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('proposeMetaAdSetTargetingEditNoTargetsNote')}</p>;
  }

  const selectedTarget = targets.find((target) => target.id === targetId) ?? targets[0];
  const adSetOptions = selectedTarget.metaAdSetResourceNames ?? [];

  function handleTargetChange(nextTargetId: string): void {
    setTargetId(nextTargetId);
    const nextTarget = targets.find((target) => target.id === nextTargetId);
    setAdSetResourceName(nextTarget?.metaAdSetResourceNames?.[0] ?? '');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const countryList = linesOf(countries);
    if (countryList.length === 0) {
      setError(t('proposeMetaAdSetTargetingEditCountriesRequiredError'));
      return;
    }
    const parsedAgeMin = Number(ageMin);
    const parsedAgeMax = Number(ageMax);
    if (!Number.isFinite(parsedAgeMin) || !Number.isFinite(parsedAgeMax) || parsedAgeMin > parsedAgeMax) {
      setError(t('proposeMetaAdSetTargetingEditInvalidAgeError'));
      return;
    }
    const genders: Array<'male' | 'female'> = [...(genderMale ? (['male'] as const) : []), ...(genderFemale ? (['female'] as const) : [])];

    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/automation/actions/meta-ad-set-targeting-edits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId,
          adSetResourceName,
          targeting: {
            countries: countryList,
            ageMin: parsedAgeMin,
            ageMax: parsedAgeMax,
            ...(genders.length > 0 ? { genders } : {}),
          },
        }),
      });
      if (!response.ok) {
        setError(t('proposeMetaAdSetTargetingEditError'));
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="meta-ad-set-targeting-edit-target">
            {t('proposeMetaAdSetTargetingEditTargetLabel')}
          </label>
          <select
            id="meta-ad-set-targeting-edit-target"
            value={selectedTarget.id}
            onChange={(event) => handleTargetChange(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="meta-ad-set-targeting-edit-ad-set">
            {t('proposeMetaAdSetTargetingEditAdSetLabel')}
          </label>
          <select
            id="meta-ad-set-targeting-edit-ad-set"
            value={adSetResourceName}
            onChange={(event) => setAdSetResourceName(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {adSetOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="meta-ad-set-targeting-edit-age-min">
            {t('proposeDraftAgeMinLabel')}
          </label>
          <Input
            id="meta-ad-set-targeting-edit-age-min"
            type="number"
            min={13}
            max={65}
            value={ageMin}
            onChange={(event) => setAgeMin(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="meta-ad-set-targeting-edit-age-max">
            {t('proposeDraftAgeMaxLabel')}
          </label>
          <Input
            id="meta-ad-set-targeting-edit-age-max"
            type="number"
            min={13}
            max={65}
            value={ageMax}
            onChange={(event) => setAgeMax(event.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t('proposeDraftGendersLabel')}</span>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={genderMale} onChange={(event) => setGenderMale(event.target.checked)} />
            {t('proposeDraftGenderMaleOption')}
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={genderFemale} onChange={(event) => setGenderFemale(event.target.checked)} />
            {t('proposeDraftGenderFemaleOption')}
          </label>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="meta-ad-set-targeting-edit-countries">
          {t('proposeDraftCountriesLabel')}
        </label>
        <textarea
          id="meta-ad-set-targeting-edit-countries"
          rows={3}
          value={countries}
          onChange={(event) => setCountries(event.target.value)}
          className="rounded-md border border-input bg-background p-2 text-sm"
          placeholder={t('proposeDraftCountriesPlaceholder')}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {t('proposeMetaAdSetTargetingEditButton')}
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
