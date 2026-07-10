import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyFieldMapping, validateMappingRules } from './engine';
import type { MappingRuleInput } from './types';

const shopifyOrderCreate = JSON.parse(
  readFileSync(path.join(process.cwd(), 'src/mapping-engine/__fixtures__/shopify-order-create.json'), 'utf8'),
) as Record<string, unknown>;

/**
 * The plan doc's own KAN-54 acceptance criterion (`13 §E9.2`): "Shopify
 * `orders/create` sample -> `order_completed` event mapped in tests." A
 * mapping author would build this exact rule set for a Shopify inbound
 * webhook endpoint (KAN-53) targeting a registered `order_completed` event
 * schema with fields `order_id` (string), `total_price` (number), and
 * `email` (string, PII).
 */
describe('Shopify orders/create -> order_completed (KAN-54 AC)', () => {
  const rules: MappingRuleInput[] = [
    { targetField: 'event_id', transform: 'template', template: 'shopify-order-{{id}}' },
    { targetField: 'event', transform: 'static', staticValue: 'order_completed' },
    { targetField: 'ts', transform: 'rename', sourcePath: 'created_at' },
    { targetField: 'properties.order_id', transform: 'cast', sourcePath: 'id', castType: 'string' },
    { targetField: 'properties.total_price', transform: 'cast', sourcePath: 'total_price', castType: 'number' },
    { targetField: 'properties.email', transform: 'rename', sourcePath: 'customer.email' },
    { targetField: 'properties.first_line_item_sku', transform: 'rename', sourcePath: 'line_items[0].sku' },
  ];

  it('validates as a complete event mapping', () => {
    const { reasons } = validateMappingRules('event', rules);
    expect(reasons).toEqual([]);
  });

  it('maps the sample Shopify orders/create payload to a valid order_completed event record', () => {
    const { rules: validatedRules, reasons } = validateMappingRules('event', rules);
    expect(reasons).toEqual([]);

    const result = applyFieldMapping(validatedRules, shopifyOrderCreate);

    expect(result.errors).toEqual([]);
    expect(result.record).toEqual({
      event_id: 'shopify-order-820982911946154500',
      event: 'order_completed',
      ts: '2024-03-15T09:32:00-05:00',
      properties: {
        order_id: '820982911946154500',
        total_price: 398,
        email: 'jon@example.com',
        first_line_item_sku: 'IPOD2008GREEN',
      },
    });
  });
});
