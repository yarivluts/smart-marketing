'use client';

import { useTranslations } from 'next-intl';
import type { PluginConfigFieldSchema } from '@growthos/firebase-orm-models';
import { Input } from '@/components/ui/input';

export type PluginConfigFieldValue = string | boolean;

export interface PluginConfigFieldsProps {
  /** Prefixes every field's `id`/`htmlFor` so an install form and an edit form on the same page never collide. */
  idPrefix: string;
  configSchema: Record<string, PluginConfigFieldSchema>;
  values: Record<string, PluginConfigFieldValue>;
  fieldErrors: Record<string, string>;
  onChange: (name: string, value: PluginConfigFieldValue) => void;
}

/**
 * One typed widget per `config_schema` entry — a checkbox bound to an
 * actual boolean for `boolean` fields, typed text/number inputs otherwise
 * — with inline required-field validation feedback. Extracted out of
 * `InstallPluginForm` (KAN-48) so `EditPluginInstallConfigForm` (KAN-125)
 * can render an already-installed plugin's config through the exact same
 * widgets rather than a second, easy-to-drift copy.
 */
export function PluginConfigFields({ idPrefix, configSchema, values, fieldErrors, onChange }: PluginConfigFieldsProps): React.ReactElement | null {
  const t = useTranslations('ProjectPlugins');
  const entries = Object.entries(configSchema);
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium">{t('configHeading')}</span>
      {entries.map(([name, field]) => (
        <div key={name} className="flex flex-col gap-1.5">
          {field.type === 'boolean' ? (
            <label className="flex items-center gap-2 text-sm font-medium" htmlFor={`${idPrefix}-${name}`}>
              <input
                id={`${idPrefix}-${name}`}
                type="checkbox"
                checked={values[name] === true}
                onChange={(event) => onChange(name, event.target.checked)}
              />
              <span>
                {name}
                {field.required ? <span className="text-destructive"> {t('configFieldRequiredMarker')}</span> : null}
              </span>
            </label>
          ) : (
            <>
              <label className="text-sm font-medium" htmlFor={`${idPrefix}-${name}`}>
                {name}
                {field.required ? <span className="text-destructive"> {t('configFieldRequiredMarker')}</span> : null}
              </label>
              <Input
                id={`${idPrefix}-${name}`}
                type={field.type === 'number' ? 'number' : 'text'}
                required={field.required}
                aria-invalid={Boolean(fieldErrors[name])}
                value={typeof values[name] === 'string' ? (values[name] as string) : ''}
                onChange={(event) => onChange(name, event.target.value)}
              />
            </>
          )}
          {fieldErrors[name] ? (
            <p role="alert" className="text-xs text-destructive">
              {fieldErrors[name]}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * Parses a `PluginConfigFields` form's own working values into the shape
 * `installPlugin`/`updatePluginInstallConfig` expect — a `boolean` field
 * always resolves to a real boolean (never the literal text "true"/
 * "false"), a `number` field coerces its raw string, and a blank/omitted
 * required field is collected as a validation error instead of silently
 * passing an empty string through to the server. Shared by
 * `InstallPluginForm` and `EditPluginInstallConfigForm` so the two can
 * never parse a config form differently.
 */
export function parsePluginConfigFieldValues(
  configSchema: Record<string, PluginConfigFieldSchema>,
  values: Record<string, PluginConfigFieldValue>,
  requiredErrorMessage: string,
): { parsedConfig: Record<string, unknown>; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const parsedConfig: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(configSchema)) {
    const raw = values[name];
    if (field.type === 'boolean') {
      parsedConfig[name] = raw === true;
      continue;
    }
    if (raw === undefined || raw === '') {
      if (field.required) {
        fieldErrors[name] = requiredErrorMessage;
      }
      continue;
    }
    parsedConfig[name] = field.type === 'number' ? Number(raw) : raw;
  }
  return { parsedConfig, fieldErrors };
}
