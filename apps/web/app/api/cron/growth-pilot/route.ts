import { NextResponse, type NextRequest } from 'next/server';
import { verifySchedulerRequest } from '@/lib/cron/verify-scheduler';
import { publicWebOrigin } from '@/lib/integrations/meta';
import { resolveAdStudioAutopilotDeps, resolveAdStudioImageDeps, resolveAdStudioLlm, resolveAdStudioVideoDeps, runScheduledGrowthPilots } from '@/lib/ad-studio/engine';

// Cloud Run allows ten minutes; the run stops taking new work after eight so the last unit can finish.
export const maxDuration = 600;
const BUDGET_MS = 8 * 60_000;

/**
 * Cloud Scheduler's call (every ten minutes) that keeps every Growth Pilot moving without an open
 * tab: reads sites, writes landing pages and audiences, makes ads - each on behalf of the person who
 * started the pilot, within their project's daily AI limits. Publishing and turning ads on are never
 * done here. Only the scheduler's own Google-signed identity token is accepted.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await verifySchedulerRequest(request.headers.get('authorization')))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const llm = resolveAdStudioLlm();
  if (!llm) return NextResponse.json({ error: 'provider_failed', code: 'not_configured' }, { status: 503 });
  const autopilot = resolveAdStudioAutopilotDeps(resolveAdStudioVideoDeps(), resolveAdStudioImageDeps());
  const runs = await runScheduledGrowthPilots({ llm, autopilot, publicWebUrl: publicWebOrigin(request.url), budgetMs: BUDGET_MS });
  return NextResponse.json({ pilots: runs.length, units: runs.reduce((total, run) => total + run.units, 0), runs });
}
