import { BadRequestException } from '@nestjs/common';
import { METRIC_FILTER_OPERATORS, TIME_GRAINS, COMPARE_PERIODS, type CompilerFilter, type MetricQueryRequest, type MetricQueryTimeRange } from '@growthos/shared';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Plan `12 §3`'s example accepts either one metric name or an array of names. */
function parseMetrics(value: unknown): string[] {
  if (isNonEmptyString(value)) {
    return [value];
  }
  if (Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString)) {
    return value;
  }
  throw new BadRequestException('Request body must include a non-empty "metric" string or array of strings.');
}

function parseDimensions(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value) && value.every(isNonEmptyString)) {
    return value;
  }
  throw new BadRequestException('"dimensions" must be an array of non-empty strings.');
}

/** Plan `12 §3`'s filter shape uses `op`, not `operator` — `CompilerFilter` (the compiler's own vocabulary) uses `operator`, so this is where the two are reconciled. */
function parseFilters(value: unknown): CompilerFilter[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new BadRequestException('"filters" must be an array.');
  }
  return value.map((entry, index) => {
    if (!isPlainObject(entry) || !isNonEmptyString(entry.field) || !isNonEmptyString(entry.op) || !isNonEmptyString(entry.value)) {
      throw new BadRequestException(`filters[${index}] must be an object with non-empty "field", "op", and "value".`);
    }
    if (!(METRIC_FILTER_OPERATORS as readonly string[]).includes(entry.op)) {
      throw new BadRequestException(`filters[${index}] has an unknown "op" value "${String(entry.op)}".`);
    }
    return { field: entry.field, operator: entry.op as CompilerFilter['operator'], value: entry.value };
  });
}

function parseTime(value: unknown): MetricQueryTimeRange {
  if (!isPlainObject(value) || !isNonEmptyString(value.start) || !isNonEmptyString(value.end) || !isNonEmptyString(value.grain)) {
    throw new BadRequestException('Request body must include a "time" object with non-empty "start", "end", and "grain".');
  }
  if (!(TIME_GRAINS as readonly string[]).includes(value.grain)) {
    throw new BadRequestException(`"time.grain" must be one of: ${TIME_GRAINS.join(', ')}.`);
  }
  if (value.compare !== undefined) {
    if (!isNonEmptyString(value.compare) || !(COMPARE_PERIODS as readonly string[]).includes(value.compare)) {
      throw new BadRequestException(`"time.compare" must be one of: ${COMPARE_PERIODS.join(', ')}.`);
    }
  }
  return {
    start: value.start,
    end: value.end,
    grain: value.grain as MetricQueryTimeRange['grain'],
    ...(value.compare ? { compare: value.compare as MetricQueryTimeRange['compare'] } : {}),
  };
}

/** Parses `POST /v1/metrics/query`'s body (plan `12 §3`) into a `MetricQueryRequest` the compiler understands. Structural/type problems here are always the caller's fault (400) — unknown metric names, unregistered dimensions, and the like are the compiler's own job to reject once the request reaches it. */
export function parseMetricQueryRequestBody(body: unknown): MetricQueryRequest {
  if (!isPlainObject(body)) {
    throw new BadRequestException('Request body must be a JSON object.');
  }
  return {
    metrics: parseMetrics(body.metric),
    dimensions: parseDimensions(body.dimensions),
    filters: parseFilters(body.filters),
    time: parseTime(body.time),
  };
}
