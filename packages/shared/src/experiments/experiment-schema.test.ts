import { describe, expect, it } from 'vitest';
import {
  EXPERIMENT_CONVERSION_SCHEMA_KIND,
  EXPERIMENT_CONVERSION_SCHEMA_NAME,
  EXPERIMENT_EXPOSURE_SCHEMA_KIND,
  EXPERIMENT_EXPOSURE_SCHEMA_NAME,
  EXPERIMENT_SCHEMA_FIELDS,
} from './experiment-schema';

describe('experiment schemas', () => {
  it('registers as event schemas named experiment_exposure and experiment_conversion', () => {
    expect(EXPERIMENT_EXPOSURE_SCHEMA_KIND).toBe('event');
    expect(EXPERIMENT_EXPOSURE_SCHEMA_NAME).toBe('experiment_exposure');
    expect(EXPERIMENT_CONVERSION_SCHEMA_KIND).toBe('event');
    expect(EXPERIMENT_CONVERSION_SCHEMA_NAME).toBe('experiment_conversion');
  });

  it('requires experiment_key and variant_key on both events, neither flagged PII', () => {
    const byName = Object.fromEntries(EXPERIMENT_SCHEMA_FIELDS.map((field) => [field.name, field]));
    expect(byName.experiment_key).toMatchObject({ type: 'string', isRequired: true, isPii: false, isIdentityKey: false });
    expect(byName.variant_key).toMatchObject({ type: 'string', isRequired: true, isPii: false, isIdentityKey: false });
  });
});
