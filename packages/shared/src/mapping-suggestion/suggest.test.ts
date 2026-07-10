import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mappingTargetFields } from '../mapping-engine';
import { suggestFieldMappingRules } from './suggest';

const shopifyOrderCreate: unknown = JSON.parse(
  readFileSync(path.join(process.cwd(), 'src/mapping-engine/__fixtures__/shopify-order-create.json'), 'utf8'),
);

describe('suggestFieldMappingRules', () => {
  it('proposes a rename/cast rule for each target field it can confidently match, and skips the rest', () => {
    const targetFields = mappingTargetFields('event', [
      { name: 'order_id', type: 'string', is_required: true },
      { name: 'email', type: 'string', is_required: true },
      { name: 'total_amount', type: 'number', is_required: true },
      { name: 'currency', type: 'string', is_required: true },
      { name: 'status', type: 'string', is_required: false },
      { name: 'nonexistent_field', type: 'string', is_required: false },
    ]);

    const suggestions = suggestFieldMappingRules(targetFields, shopifyOrderCreate);
    const byTarget = new Map(suggestions.map((s) => [s.targetField, s]));

    // event_id <- id: no exact-name match (order id vs "id"), but "id" is contained in "eventid",
    // and the value (a number) needs a cast to the envelope's required string type.
    expect(byTarget.get('event_id')).toMatchObject({ transform: 'cast', sourcePath: 'id', castType: 'string' });

    // ts <- created_at: no name overlap at all except via the curated ts/created synonym, cast from
    // an ISO date string.
    expect(byTarget.get('ts')).toMatchObject({ transform: 'cast', sourcePath: 'created_at', castType: 'timestamp' });

    // properties.order_id <- id (not customer.id): "id" scores higher against "order_id" than
    // "customer.id" does, since "order" and "customer" share no tokens.
    expect(byTarget.get('properties.order_id')).toMatchObject({ transform: 'cast', sourcePath: 'id', castType: 'string' });

    // properties.email <- the root email, not customer.email: an exact name match beats a nested
    // same-named field every time.
    expect(byTarget.get('properties.email')).toMatchObject({ transform: 'rename', sourcePath: 'email' });

    // properties.total_amount <- total_price: shares the "total" token and needs a numeric cast
    // from Shopify's string-typed price.
    expect(byTarget.get('properties.total_amount')).toMatchObject({ transform: 'cast', sourcePath: 'total_price', castType: 'number' });

    expect(byTarget.get('properties.currency')).toMatchObject({ transform: 'rename', sourcePath: 'currency' });
    expect(byTarget.get('properties.status')).toMatchObject({ transform: 'rename', sourcePath: 'financial_status' });

    // No field in the sample resembles this one at all.
    expect(byTarget.has('properties.nonexistent_field')).toBe(false);

    for (const suggestion of suggestions) {
      expect(suggestion.confidence).toBeGreaterThanOrEqual(0.2);
      expect(suggestion.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('never proposes a candidate whose value cannot actually satisfy the target type', () => {
    const targetFields = [{ targetField: 'value', type: 'number' as const }];
    // "amount" can't cast to a number at all, so it's excluded even though its name is closer to
    // "value" — "amount_cents" is the only eligible candidate left.
    const suggestions = suggestFieldMappingRules(targetFields, { amount: 'not-a-number', amount_cents: 500 });
    expect(suggestions).toEqual([{ targetField: 'value', transform: 'rename', sourcePath: 'amount_cents', confidence: 0.2 }]);
  });

  it('proposes nothing when the sample has no scalar leaves at all', () => {
    expect(suggestFieldMappingRules([{ targetField: 'id', type: 'string' }], {})).toEqual([]);
  });

  it('respects a custom minConfidence threshold', () => {
    const targetFields = [{ targetField: 'properties.totally_unrelated_field', type: 'string' as const }];
    const suggestions = suggestFieldMappingRules(targetFields, { some_string: 'value' }, 0);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].confidence).toBeLessThan(0.2);
  });
});
