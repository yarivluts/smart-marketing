import { NextResponse, type NextRequest } from 'next/server';
import type { MetricDefinitionInput } from '@growthos/firebase-orm-models';
import { parseJsonBody } from '@/lib/http/parse-json-body';

export type ParsedMetricDefRequest =
  | { name: string; definition: MetricDefinitionInput; dimensions: string[]; error?: undefined }
  | { name?: undefined; definition?: undefined; dimensions?: undefined; error: NextResponse };

function parseDefinitionBody(value: unknown): MetricDefinitionInput | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;

  if (record.kind === 'formula') {
    if (typeof record.formula !== 'string') {
      return undefined;
    }
    return { kind: 'formula', formula: record.formula };
  }

  if (record.kind === 'aggregation') {
    const aggregation = record.aggregation;
    if (typeof aggregation !== 'object' || aggregation === null) {
      return undefined;
    }
    const aggRecord = aggregation as Record<string, unknown>;
    if (typeof aggRecord.function !== 'string' || typeof aggRecord.table !== 'string') {
      return undefined;
    }
    const rawFilters = aggRecord.filters;
    if (!Array.isArray(rawFilters)) {
      return undefined;
    }
    const filters: { field: string; operator: string; value: string }[] = [];
    for (const entry of rawFilters) {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        typeof (entry as Record<string, unknown>).field !== 'string' ||
        typeof (entry as Record<string, unknown>).operator !== 'string' ||
        typeof (entry as Record<string, unknown>).value !== 'string'
      ) {
        return undefined;
      }
      const filterRecord = entry as Record<string, unknown>;
      filters.push({ field: filterRecord.field as string, operator: filterRecord.operator as string, value: filterRecord.value as string });
    }
    return {
      kind: 'aggregation',
      aggregation: {
        function: aggRecord.function,
        table: aggRecord.table,
        ...(typeof aggRecord.column === 'string' ? { column: aggRecord.column } : {}),
        filters,
      },
    };
  }

  return undefined;
}

/** Shared JSON-body parsing + validation for the register and evolve metric-def routes — both accept the identical `{name, definition, dimensions}` shape. Deeper validation (name pattern, formula references, breaking rules) happens in `@growthos/firebase-orm-models`'s `metric-registry.service.ts`. */
export async function parseMetricDefRequestBody(request: NextRequest): Promise<ParsedMetricDefRequest> {
  const parsed = await parseJsonBody<{ name?: unknown; definition?: unknown; dimensions?: unknown }>(request);
  if (parsed.error) {
    return { error: parsed.error };
  }

  const { name, definition: rawDefinition, dimensions: rawDimensions } = parsed.body;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return { error: NextResponse.json({ error: 'name_required' }, { status: 400 }) };
  }

  const definition = parseDefinitionBody(rawDefinition);
  if (!definition) {
    return { error: NextResponse.json({ error: 'invalid_definition' }, { status: 400 }) };
  }

  if (!Array.isArray(rawDimensions) || rawDimensions.some((dimension) => typeof dimension !== 'string')) {
    return { error: NextResponse.json({ error: 'invalid_dimensions' }, { status: 400 }) };
  }

  return { name: name.trim(), definition, dimensions: rawDimensions as string[] };
}
