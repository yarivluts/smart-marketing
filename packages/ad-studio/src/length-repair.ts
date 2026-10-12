import { z } from 'zod/v4';
import type { AdStudioUsageKind } from '@growthos/firebase-orm-models';
import { buildLengthRepairPrompt, overLengthItems, type AdStudioLengthRepairItem } from '@growthos/shared';
import { meteredCall, type AdStudioCallContext } from './metering';

const RepairedSchema = z.object({
  items: z.array(z.object({ id: z.string().describe('The item id, unchanged.'), text: z.string().describe('The shortened text, within its max.') })),
});

/**
 * Shortens generated fields that came back over their placement limit, in one low-effort call
 * metered under the same kind as the generation it repairs. Returns the replacements by id; only
 * results that actually fit are returned. Best effort: when nothing is over, no call is made, and
 * when the repair itself fails (quota, provider), the callers' word-boundary fitting still applies.
 */
export async function repairOverLength(
  ctx: AdStudioCallContext,
  kind: AdStudioUsageKind,
  briefId: string,
  language: string,
  items: readonly AdStudioLengthRepairItem[],
): Promise<Map<string, string>> {
  const over = overLengthItems(items);
  if (over.length === 0) return new Map();
  const limits = new Map(over.map((item) => [item.id, item.max]));
  try {
    const prompt = buildLengthRepairPrompt(over, language);
    const repaired = await meteredCall(ctx, kind, briefId, () => ctx.llm.generateJson({ ...prompt, schema: RepairedSchema, effort: 'low' }));
    const fixed = new Map<string, string>();
    for (const item of repaired.items) {
      const max = limits.get(item.id);
      const text = item.text.trim();
      if (max !== undefined && text.length > 0 && text.length <= max) fixed.set(item.id, text);
    }
    return fixed;
  } catch {
    return new Map();
  }
}
