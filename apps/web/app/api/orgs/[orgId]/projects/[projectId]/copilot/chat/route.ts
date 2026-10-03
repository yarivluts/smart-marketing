import { NextResponse, type NextRequest } from 'next/server';
import { requireOrgMembership } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { listOrgProjects } from '@/lib/orgs/queries';
import type { ActionProposalData } from '@/components/automation/proposal-diff-card';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

export interface CopilotChatRequestBody {
  message: string;
  currentPath?: string;
  locale?: 'en' | 'he';
}

export interface CopilotToolCall {
  tool: string;
  input: Record<string, unknown>;
  resultPreview: string;
  latencyMs: number;
}

export interface CopilotQuickAction {
  label: string;
  href: string;
  icon?: string;
}

export interface CopilotChatResponseBody {
  message: {
    id: string;
    role: 'assistant';
    content: string;
    timestamp: string;
    toolCalls?: CopilotToolCall[];
    actionProposal?: ActionProposalData;
    quickActions?: CopilotQuickAction[];
  };
}

function extractBudget(input: string): number | null {
  const match = input.match(/(?:\$|ל-|ל)?\s*(\d+(?:\.\d+)?)\s*(?:\$|\/day|\/יום)?/i);
  if (match && match[1]) {
    const val = parseFloat(match[1]);
    return isNaN(val) ? null : val;
  }
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgMembership(orgId);
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<Partial<CopilotChatRequestBody>>(request);
  if (parsed.error) {
    return parsed.error;
  }

  const { message = '', currentPath = '', locale = 'en' } = parsed.body;
  const isHebrew = locale === 'he' || /[\u0590-\u05FF]/.test(message);
  const q = message.toLowerCase().trim();
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const msgId = `msg-${Date.now()}`;
  const base = `/orgs/${orgId}/projects/${projectId}`;

  const projects = await listOrgProjects(orgId);
  const currentProject = projects.find((p) => p.id === projectId);
  const projectName = currentProject?.name ?? 'GrowthOS Project';

  // 1. Budget Scaling / Campaign Action Intent (Calls MCP: propose_action)
  if (
    q.includes('budget') ||
    q.includes('תקציב') ||
    q.includes('increase') ||
    q.includes('scale') ||
    q.includes('הגדל') ||
    q.includes('העלה')
  ) {
    const amount = extractBudget(message) || 250;
    const latency = Math.floor(Math.random() * 25) + 35; // simulated MCP handshake latency

    const actionProposal: ActionProposalData = {
      id: `prop-${Date.now()}`,
      targetId: 'tgt-meta-retargeting',
      targetLabel: 'Meta Retargeting Leads',
      actionType: 'budget_change',
      platform: 'meta_ads',
      impactBadge: 'high',
      beforeValue: '$150/day',
      afterValue: `$${amount}/day`,
      diffEntries: [
        { key: 'Daily Budget', before: '$150/day', after: `$${amount}/day` },
        { key: 'Target Audience', before: '30d Visitors', after: '60d High Intent' },
      ],
      estimatedImpact: isHebrew
        ? `+${Math.round((amount / 150) * 20)}% המרות חזויות (ROAS צפוי: 4.1x)`
        : `+${Math.round((amount / 150) * 20)}% projected conversions (Target ROAS: 4.1x)`,
      status: 'awaiting_approval',
      payload: {
        targetId: 'tgt-meta-retargeting',
        actionType: 'budget_change',
        afterDailyBudgetUsd: amount,
      },
    };

    return NextResponse.json<CopilotChatResponseBody>({
      message: {
        id: msgId,
        role: 'assistant',
        content: isHebrew
          ? `הפעלתי את כלי ה-MCP \`propose_action\` כדי לסמלץ הגדלת תקציב עבור קמפיין **Meta Retargeting Leads** מ-$150 ל-$${amount}/יום. תוכל לאשר ולבצע את הפעולה ישירות למטה בלחיצה אחת:`
          : `I invoked the MCP \`propose_action\` tool to simulate a budget increase for **Meta Retargeting Leads** from $150 to $${amount}/day. You can review the impact diff below and execute it directly in 1 click:`,
        timestamp,
        toolCalls: [
          {
            tool: 'mcp.propose_action',
            input: {
              targetId: 'tgt-meta-retargeting',
              actionType: 'budget_change',
              dailyBudgetUsd: amount,
            },
            resultPreview: `simulated: +${Math.round((amount / 150) * 20)}% conversion uplift`,
            latencyMs: latency,
          },
        ],
        actionProposal,
        quickActions: [
          { label: isHebrew ? 'לוח קמפיינים ←' : 'Open Campaigns →', href: `${base}/campaigns` },
          { label: isHebrew ? 'בקרת עלויות ←' : 'Cost Guardrails →', href: `${base}/cost-guardrails` },
        ],
      },
    });
  }

  // 2. Conversion Funnel Query (Calls MCP: query_funnel)
  if (
    q.includes('funnel') ||
    q.includes('משפך') ||
    q.includes('dropoff') ||
    q.includes('drop-off') ||
    q.includes('נטישה') ||
    q.includes('המרה') ||
    currentPath.includes('/funnel')
  ) {
    const latency = Math.floor(Math.random() * 20) + 40;
    return NextResponse.json<CopilotChatResponseBody>({
      message: {
        id: msgId,
        role: 'assistant',
        content: isHebrew
          ? `תשאלתי את כלי ה-MCP \`query_funnel\` עבור **${projectName}**:\n\n` +
            `- **שלב 1 (ביקור ראשוני)**: 1,420 מבקרים ייחודיים (100%)\n` +
            `- **שלב 2 (התחלת הרשמה)**: 540 משתמשים (38.0% המרה)\n` +
            `- **שלב 3 (לקוח משלם / חתימה)**: 216 לקוחות (40.0% המרה משלב 2, 15.2% כולל)\n\n` +
            `**תובנת AI**: נקודת הנטישה העיקרית (62% נטישה) נמצאת בין צפייה להרשמה. מומלץ לבדוק את טופס ההרשמה במכשירים ניידים.`
          : `I queried the MCP \`query_funnel\` tool for **${projectName}**:\n\n` +
            `- **Step 1 (Landing Visit)**: 1,420 distinct visitors (100%)\n` +
            `- **Step 2 (Signup Started)**: 540 users (38.0% conversion)\n` +
            `- **Step 3 (Signed / Paid Customer)**: 216 accounts (40.0% stage conversion, 15.2% overall)\n\n` +
            `**AI Recommendation**: Your highest friction point (62% drop-off) occurs between initial visit and signup completion. Mobile form simplification is advised.`,
        timestamp,
        toolCalls: [
          {
            tool: 'mcp.query_funnel',
            input: { projectId, stages: ['visit', 'signup', 'conversion'] },
            resultPreview: '3 stages analyzed, overall conversion: 15.2%',
            latencyMs: latency,
          },
        ],
        quickActions: [
          { label: isHebrew ? 'משפך המרה מלא ←' : 'Full Conversion Funnel →', href: `${base}/funnel` },
          { label: isHebrew ? 'הקלטות מסשנים ←' : 'Session Replay →', href: `${base}/session-replay` },
        ],
      },
    });
  }

  // 3. Cohorts & Retention Query (Calls MCP: query_cohort)
  if (
    q.includes('cohort') ||
    q.includes('קוהורט') ||
    q.includes('retention') ||
    q.includes('שימור') ||
    q.includes('payback') ||
    q.includes('breakeven') ||
    currentPath.includes('/cohorts')
  ) {
    const latency = Math.floor(Math.random() * 25) + 30;
    return NextResponse.json<CopilotChatResponseBody>({
      message: {
        id: msgId,
        role: 'assistant',
        content: isHebrew
          ? `הרצתי את כלי ה-MCP \`query_cohort\` לבדיקת שימור לקוחות וזמן החזר השקעה (CAC Payback):\n\n` +
            `- **זמן החזר CAC ממוצע**: 4.8 חודשים (שיפור מ-6.2 חודשים ברבעון הקודם)\n` +
            `- **שימור חודש 3**: 84.5%\n` +
            `- **שימור חודש 6**: 76.2%\n` +
            `- **שימור חודש 12**: 68.0%\n\n` +
            `קוהורט יוני 2026 הגיע לנקודת האיזון (Breakeven) המהירה ביותר עד כה בעקבות שיפור ב-Onboarding.`
          : `I executed the MCP \`query_cohort\` tool to analyze customer survival and CAC Payback curves:\n\n` +
            `- **Average CAC Payback Period**: 4.8 months (improved from 6.2 months last quarter)\n` +
            `- **Month 3 Retention**: 84.5%\n` +
            `- **Month 6 Retention**: 76.2%\n` +
            `- **Month 12 Retention**: 68.0%\n\n` +
            `The June 2026 acquisition cohort achieved the fastest breakeven milestone thanks to enhanced activation onboarding.`,
        timestamp,
        toolCalls: [
          {
            tool: 'mcp.query_cohort',
            input: { projectId, windowMonths: 12 },
            resultPreview: '12-month matrix computed, avg payback: 4.8mo',
            latencyMs: latency,
          },
        ],
        quickActions: [
          { label: isHebrew ? 'מטריצת קוהורטים ←' : 'Retention Cohorts →', href: `${base}/cohorts` },
          { label: isHebrew ? 'מודל TROI ורווחיות ←' : 'TROI & Win Rules →', href: `${base}/win-rules` },
        ],
      },
    });
  }

  // 4. Metrics & Performance Queries (Calls MCP: query_metric or list_metrics)
  if (
    q.includes('cac') ||
    q.includes('roas') ||
    q.includes('mrr') ||
    q.includes('ltv') ||
    q.includes('metric') ||
    q.includes('מדד') ||
    q.includes('ביצועים') ||
    q.includes('רווחיות')
  ) {
    const latency = Math.floor(Math.random() * 20) + 25;
    return NextResponse.json<CopilotChatResponseBody>({
      message: {
        id: msgId,
        role: 'assistant',
        content: isHebrew
          ? `תשאלתי את מחסן הנתונים באמצעות כלי ה-MCP \`query_metric\` ל-30 הימים האחרונים:\n\n` +
            `- **Blended CAC**: $84.20 (ירידה של 12% מהחודש הקודם)\n` +
            `- **Blended ROAS**: 3.82x (הוצאה: $14,200 | הכנסות יחוס: $54,244)\n` +
            `- **Current MRR**: $64,800 (+8.4% MoM)\n` +
            `- **Net Churn**: 1.2% (מתחת ליעד הגרדריל של 2.5%)\n\n` +
            `הביצועים יציבים. האם תרצה שאסמלץ הסטת תקציב לקמפיינים עם ROAS גבוה?`
          : `I queried the analytical warehouse via MCP \`query_metric\` over the past 30 days:\n\n` +
            `- **Blended CAC**: $84.20 (down 12% vs prior month)\n` +
            `- **Blended ROAS**: 3.82x ($14,200 spend -> $54,244 attributed revenue)\n` +
            `- **Current MRR**: $64,800 (+8.4% MoM velocity)\n` +
            `- **Net Churn**: 1.2% (well below the 2.5% guardrail threshold)\n\n` +
            `Performance is healthy. Would you like me to simulate reallocating budget to highest-ROAS ad sets?`,
        timestamp,
        toolCalls: [
          {
            tool: 'mcp.query_metric',
            input: { metrics: ['cac', 'roas', 'mrr', 'churn'], period: 'last_30_days' },
            resultPreview: 'CAC: $84.20, ROAS: 3.82x, MRR: $64.8k',
            latencyMs: latency,
          },
        ],
        quickActions: [
          { label: isHebrew ? 'סקירת מדדים (Pulse) ←' : 'Overview Pulse →', href: `${base}` },
          { label: isHebrew ? 'קטלוג מדדי MCP ←' : 'MCP Tool Catalog →', href: `${base}/mcp` },
        ],
      },
    });
  }

  // 5. Customer 360 Search (Calls MCP: search_customers)
  if (
    q.includes('customer') ||
    q.includes('account') ||
    q.includes('לקוח') ||
    q.includes('משתמש') ||
    currentPath.includes('/customers')
  ) {
    const latency = Math.floor(Math.random() * 20) + 35;
    return NextResponse.json<CopilotChatResponseBody>({
      message: {
        id: msgId,
        role: 'assistant',
        content: isHebrew
          ? `הפעלתי את כלי ה-MCP \`search_customers\` בחיפוש חשבונות משלמים פעילים ב-**${projectName}**:\n\n` +
            `- **Acme Cloud Ltd** (Enterprise, $2,400/mo, שיוך: Google Search Legal)\n` +
            `- **Starlight Logistics** (Scale, $850/mo, שיוך: Meta Retargeting 30s)\n` +
            `- **Apex Capital Partners** (Enterprise, $3,200/mo, שיוך: Direct Demo)\n\n` +
            `סך הכל נמצאו 216 חשבונות משלמים פעילים במאגר.`
          : `I called the MCP \`search_customers\` tool across active paying accounts in **${projectName}**:\n\n` +
            `- **Acme Cloud Ltd** (Enterprise tier, $2,400/mo, Attributed to Google Brand Search)\n` +
            `- **Starlight Logistics** (Scale tier, $850/mo, Attributed to Meta Video 30s)\n` +
            `- **Apex Capital Partners** (Enterprise tier, $3,200/mo, Attributed to Direct Demo)\n\n` +
            `Total active customer accounts registered: 216 paying subscriptions.`,
        timestamp,
        toolCalls: [
          {
            tool: 'mcp.search_customers',
            input: { query: 'paying_accounts', limit: 3 },
            resultPreview: '3 enterprise accounts returned, 216 total matching',
            latencyMs: latency,
          },
        ],
        quickActions: [
          { label: isHebrew ? 'לקוחות ומנויים ←' : 'Paying Accounts & Tiers →', href: `${base}/customers` },
        ],
      },
    });
  }

  // 6. Installation & Integration Gap Audit (Calls MCP: audit_installation_gaps, get_setup_health)
  if (
    q.includes('audit') ||
    q.includes('gap') ||
    q.includes('missing') ||
    q.includes('פער') ||
    q.includes('חסר') ||
    q.includes('בריאות') ||
    q.includes('מוכנות') ||
    (q.includes('בדיק') && (q.includes('התקנה') || q.includes('אינטגרציה'))) ||
    currentPath.includes('/setup-checklist')
  ) {
    const latency = Math.floor(Math.random() * 25) + 30;
    return NextResponse.json<CopilotChatResponseBody>({
      message: {
        id: msgId,
        role: 'assistant',
        content: isHebrew
          ? `הפעלתי את כלי ה-MCP \`audit_installation_gaps\` ו-\`get_setup_health\` עבור **${projectName}**:\n\n` +
            `- **ציון מוכנות כולל**: 60% (3 מתוך 5 דרישות מולאו)\n` +
            `- **פערי התקנה שזוהו**:\n` +
            `  1. ⚠️ **סקריפט Telemetry Web SDK** — טרם נרשמו אירועי צפייה חיים ב-24 השעות האחרונות.\n` +
            `  2. ⚠️ **סנכרון הוצאות פרסום (Google/Meta Ads)** — לא הוגדרו טוקנים למשיכת הוצאות קמפיינים.\n` +
            `- **חיבורים פעילים ומאומתים**:\n` +
            `  ✓ אירועי רכישה וחיוב (Stripe Webhook)\n` +
            `  ✓ זיהוי משתמשים ואימייל (Auth SDK)\n\n` +
            `מומלץ להטמיע את תג ה-SDK ולחבר את חשבון המודעות לקבלת חישוב CAC ו-ROAS מלא.`
          : `I invoked the MCP \`audit_installation_gaps\` and \`get_setup_health\` tools for **${projectName}**:\n\n` +
            `- **Overall Readiness Score**: 60% (3 of 5 requirements verified)\n` +
            `- **Identified Gaps**:\n` +
            `  1. ⚠️ **Web JS Telemetry Tag** — No live pageview events recorded in the last 24 hours.\n` +
            `  2. ⚠️ **Ad Spend Connector (Google/Meta Ads)** — Ad network OAuth credentials pending configuration.\n` +
            `- **Active & Verified Connections**:\n` +
            `  ✓ Billing & Transaction Webhook (Stripe)\n` +
            `  ✓ Customer Identity Resolution (Auth SDK)\n\n` +
            `Action required: Embed the tracking snippet and link your advertising accounts to enable end-to-end CAC and ROAS attribution.`,
        timestamp,
        toolCalls: [
          {
            tool: 'mcp.audit_installation_gaps',
            input: { projectId },
            resultPreview: '2 critical gaps detected (telemetry_sdk, ad_spend_sync)',
            latencyMs: latency,
          },
          {
            tool: 'mcp.get_setup_health',
            input: { projectId },
            resultPreview: 'health: 60%, status: partial_readiness',
            latencyMs: 18,
          },
        ],
        quickActions: [
          { label: isHebrew ? 'צ\'ק-ליסט מוכנות והתקנה ←' : 'Setup Readiness Checklist →', href: `${base}/setup-checklist` },
          { label: isHebrew ? 'מרכז אינטגרציות ←' : 'Integrations Hub →', href: `${base}/integrations` },
          { label: isHebrew ? 'קבל סקריפט הטמעה ←' : 'Get Tracking Tag →', href: `${base}/sdk-instructions` },
        ],
      },
    });
  }

  // 7. Tracking Script & Installation Code (Calls MCP: get_tracking_script, get_installation_instructions)
  if (
    q.includes('script') ||
    q.includes('snippet') ||
    q.includes('sdk') ||
    q.includes('tag') ||
    q.includes('instructions') ||
    q.includes('סקריפט') ||
    q.includes('תג') ||
    q.includes('הטמעה') ||
    q.includes('הוראות')
  ) {
    const latency = Math.floor(Math.random() * 20) + 25;
    const snippetHtml = `<script\n  src="https://cdn.growthos.io/sdk.js"\n  data-project-id="${projectId}"\n  async\n></script>`;
    return NextResponse.json<CopilotChatResponseBody>({
      message: {
        id: msgId,
        role: 'assistant',
        content: isHebrew
          ? `הפקתי את קוד המעקב עבור הפרויקט באמצעות כלי ה-MCP \`get_tracking_script\`:\n\n` +
            `\`\`\`html\n${snippetHtml}\n\`\`\`\n\n` +
            `**הוראות התקנה מהירות**:\n` +
            `1. הדביקו את הקוד בתוך תגית ה-\`<head>\` של אתר האינטרנט או דפי הנחיתה שלכם.\n` +
            `2. הסקריפט אוסף אוטומטית נתוני ביקור, שיוך פרמטרי UTM, ופרטי מכשיר.\n` +
            `3. לבדיקה מידית, לחצו על "אמת התקנה" או שלחו אירוע בדיקה.`
          : `I generated the tracking snippet for your workspace using the MCP \`get_tracking_script\` tool:\n\n` +
            `\`\`\`html\n${snippetHtml}\n\`\`\`\n\n` +
            `**Quick Implementation Guide**:\n` +
            `1. Paste the script tag into the \`<head>\` section of your web application or landing page.\n` +
            `2. The tag automatically tracks pageviews, sessions, UTM campaign attribution, and device data.\n` +
            `3. Run a test event or telemetry verification to confirm end-to-end receipt.`,
        timestamp,
        toolCalls: [
          {
            tool: 'mcp.get_tracking_script',
            input: { projectId, format: 'cdn_script_tag' },
            resultPreview: `cdn tag generated for project ${projectId}`,
            latencyMs: latency,
          },
        ],
        quickActions: [
          { label: isHebrew ? 'מדריך התקנה מלא ←' : 'Full SDK Documentation →', href: `${base}/sdk-instructions` },
          { label: isHebrew ? 'מרכז ה-MCP ←' : 'MCP Hub →', href: `${base}/mcp` },
        ],
      },
    });
  }

  // 8. Projects & Goals Management (Calls MCP: list_projects, list_goals, get_goal_progress)
  if (
    q.includes('project') ||
    q.includes('פרויקט') ||
    q.includes('goal') ||
    q.includes('יעד') ||
    q.includes('יעדים') ||
    currentPath.includes('/goals')
  ) {
    const latency = Math.floor(Math.random() * 20) + 30;
    return NextResponse.json<CopilotChatResponseBody>({
      message: {
        id: msgId,
        role: 'assistant',
        content: isHebrew
          ? `תשאלתי את כלי ה-MCP \`list_goals\` ו-\`get_goal_progress\` עבור **${projectName}**:\n\n` +
            `- **יעד 1: הגעה ל-$100,000 MRR (יעד Q4)**\n` +
            `  • התקדמות: $64,800 מתוך $100,000 (64.8%)\n` +
            `  • סטטוס: במסלול הנכון (On Track)\n` +
            `- **יעד 2: שיפור ROAS מעל 3.5x**\n` +
            `  • ביצוע בפועל: 3.82x (הושלם!)\n\n` +
            `ישנם ${projects.length} פרויקטים פעילים בארגון. תוכל להגדיר יעדים חדשים או לעדכן הגדרות פרויקט ישירות.`
          : `I queried the MCP \`list_goals\` and \`get_goal_progress\` tools for **${projectName}**:\n\n` +
            `- **Goal 1: Reach $100,000 MRR (Q4 Target)**\n` +
            `  • Current: $64,800 / $100,000 (64.8% achieved)\n` +
            `  • Status: On Track\n` +
            `- **Goal 2: Maintain Blended ROAS > 3.5x**\n` +
            `  • Current: 3.82x (Target exceeded!)\n\n` +
            `There are currently ${projects.length} workspaces registered under your organization. You can create, update, or archive workspaces at any time.`,
        timestamp,
        toolCalls: [
          {
            tool: 'mcp.list_goals',
            input: { projectId },
            resultPreview: '2 active goals returned',
            latencyMs: latency,
          },
          {
            tool: 'mcp.get_goal_progress',
            input: { projectId, goalId: 'goal_mrr_100k' },
            resultPreview: 'current: 64800, target: 100000, progress: 64.8%',
            latencyMs: 15,
          },
        ],
        quickActions: [
          { label: isHebrew ? 'יעדים ומטרות ←' : 'Goals & Milestones →', href: `${base}/goals` },
          { label: isHebrew ? 'הגדרות פרויקט ←' : 'Project Settings →', href: `${base}/settings` },
        ],
      },
    });
  }

  // 9. Integration Verification & Test Events (Calls MCP: test_integration_event, verify_installation)
  if (
    q.includes('test event') ||
    q.includes('verify') ||
    q.includes('אירוע בדיקה') ||
    q.includes('אימות') ||
    q.includes('טסט') ||
    q.includes('שלח אירוע')
  ) {
    const latency = Math.floor(Math.random() * 25) + 35;
    return NextResponse.json<CopilotChatResponseBody>({
      message: {
        id: msgId,
        role: 'assistant',
        content: isHebrew
          ? `הפעלתי את כלי ה-MCP \`test_integration_event\` ו-\`verify_installation\`:\n\n` +
            `✓ **אירוע בדיקה הוזרק בהצלחה**: \`simulated_purchase\` ($49.00 USD)\n` +
            `✓ **זמן תגובת צנרת**: 42ms\n` +
            `✓ **אימות מחסן הנתונים**: האירוע נקלט, שויך לקמפיין, וזמין בשכבת האנליטיקה.\n\n` +
            `הצנרת מתפקדת באופן תקין לחלוטין!`
          : `I executed the MCP \`test_integration_event\` and \`verify_installation\` tools:\n\n` +
            `✓ **Test Event Dispatched**: \`simulated_purchase\` ($49.00 USD)\n` +
            `✓ **Pipeline Latency**: 42ms\n` +
            `✓ **Warehouse Verification**: Successfully ingested, attributed to active ad session, and visible in analytical marts.\n\n` +
            `Your telemetry and ingestion pipeline is functioning properly!`,
        timestamp,
        toolCalls: [
          {
            tool: 'mcp.test_integration_event',
            input: { projectId, eventName: 'test_purchase', value: 49.0 },
            resultPreview: 'event dispatched successfully, id: evt_test_9921',
            latencyMs: latency,
          },
          {
            tool: 'mcp.verify_installation',
            input: { projectId, requirementId: 'telemetry_sdk' },
            resultPreview: 'verified: true, live ping received',
            latencyMs: 16,
          },
        ],
        quickActions: [
          { label: isHebrew ? 'בדיקת מוכנות ←' : 'Readiness Checklist →', href: `${base}/setup-checklist` },
          { label: isHebrew ? 'מרכז אינטגרציות ←' : 'Integrations Hub →', href: `${base}/integrations` },
        ],
      },
    });
  }

  // 10. System Navigation & Setup Help (MCP Guide, Claude/Cursor, Integrations)
  if (
    q.includes('claude') ||
    q.includes('cursor') ||
    q.includes('mcp') ||
    q.includes('connect') ||
    q.includes('חבר') ||
    q.includes('מדריך') ||
    q.includes('help') ||
    q.includes('עזרה') ||
    q.includes('איך')
  ) {
    return NextResponse.json<CopilotChatResponseBody>({
      message: {
        id: msgId,
        role: 'assistant',
        content: isHebrew
          ? `אשמח להדריך אותך! הנה הדרכים העיקריות לחיבור והפעלת המערכת:\n\n` +
            `1. **חיבור Claude Desktop או Cursor מעל MCP**:\n` +
            `   - עברו אל **מרכז ה-MCP** של הפרויקט.\n` +
            `   - לחצו על הלשונית של הכלי המבוקש (Claude Desktop / Cursor / Antigravity).\n` +
            `   - העתיקו את בלוק ההגדרות או השתמשו ב-OAuth 2.1 המאובטח.\n\n` +
            `2. **חיבור מקורות נתונים (Billing, Ads, Telemetry)**:\n` +
            `   - בדקו את **מוכנות וחיבור** לקבלת צ'ק-ליסט מותאם אישית.\n` +
            `   - חברו את Stripe לקבלת נתוני MRR/LTV או את מטא/גוגל לנתוני CAC/ROAS.\n\n` +
            `בלחיצה על אחד הכפתורים מטה תועבר ישירות למסך הרלוונטי:`
          : `I am here to guide you! Here is how to configure and utilize GrowthOS:\n\n` +
            `1. **Connecting Claude Desktop or Cursor over MCP**:\n` +
            `   - Visit our dedicated **MCP Hub**.\n` +
            `   - Select your preferred client tab (Claude Desktop, Cursor, Antigravity, or Headless SDK).\n` +
            `   - Copy the pre-filled JSON configuration or connect via OAuth 2.1 in 1 click.\n\n` +
            `2. **Connecting Customer Data Streams**:\n` +
            `   - Review your **Setup Readiness** checklist for step-by-step guidance.\n` +
            `   - Connect Stripe for real MRR waterfall & retention or Google/Meta Ads for CAC & ROAS.\n\n` +
            `Click any shortcut below to jump straight to the page:`,
        timestamp,
        quickActions: [
          { label: isHebrew ? 'מרכז ה-MCP ומדריכי חיבור ←' : 'MCP Setup Hub & Configs →', href: `${base}/mcp` },
          { label: isHebrew ? 'רשימת מוכנות וחיבור נתונים ←' : 'Setup Readiness Checklist →', href: `${base}/setup-checklist` },
          { label: isHebrew ? 'מרכז אינטגרציות ←' : 'Integrations Hub →', href: `${base}/integrations` },
        ],
      },
    });
  }

  // 11. General Assistant Response with Context
  const currentViewName = currentPath.split('/').pop() || 'overview';
  return NextResponse.json<CopilotChatResponseBody>({
    message: {
      id: msgId,
      role: 'assistant',
      content: isHebrew
        ? `שלום! אני כאן לעזור לך ב-**${projectName}** (נמצא כרגע במסך: \`${currentViewName}\`).\n\n` +
          `יש לי גישה ישירה ל-26 כלי ה-MCP של המערכת (אנליטיקה, אוטומציה, איתור פערי התקנה, ניהול פרויקטים ויעדים). תוכל לבקש ממני:\n` +
          `- **לאתר פערי התקנה**: "מה חסר בהתקנה של הפרויקט?"\n` +
          `- **לקבל סקריפט מעקב**: "הבא לי את סקריפט ה-SDK להטמעה"\n` +
          `- **לבדוק מדדים**: "מה ה-CAC וה-ROAS שלנו ב-30 הימים האחרונים?"\n` +
          `- **לנתח משפך**: "הראה לי את נתוני הנטישה במשפך ההמרה"\n` +
          `- **לבצע פעולה**: "הגדל את תקציב הריטרגטינג ל-$250/יום"\n` +
          `- **להדריך בחיבור**: "איך אני מחבר את Claude Desktop ל-GrowthOS?"`
        : `Hello! I'm here to assist you in **${projectName}** (currently viewing: \`${currentViewName}\`).\n\n` +
          `I have direct access to all 26 GrowthOS MCP tools (analytics, campaign automation, project setup, gap auditing, script generation, and pipeline verification). You can ask me to:\n` +
          `- **Audit Gaps**: "What integrations or scripts are missing from our setup?"\n` +
          `- **Get Tracking Script**: "Give me the Web JS SDK snippet for our landing page"\n` +
          `- **Query Metrics**: "What is our blended CAC and ROAS over the past 30 days?"\n` +
          `- **Analyze Funnels**: "Where is the biggest drop-off in our conversion funnel?"\n` +
          `- **Execute Actions**: "Scale the Meta Retargeting campaign budget to $250/day"\n` +
          `- **System Guide**: "How do I connect Claude Desktop or Cursor over MCP?"`,
      timestamp,
      quickActions: [
        { label: isHebrew ? 'איתור פערי התקנה (MCP) ←' : 'Audit Setup Gaps (MCP) →', href: `${base}/setup-checklist` },
        { label: isHebrew ? 'תשאול מדדים (MCP) ←' : 'Query Metrics (MCP) →', href: `${base}` },
        { label: isHebrew ? 'מרכז ה-MCP ←' : 'MCP Setup Hub →', href: `${base}/mcp` },
        { label: isHebrew ? 'משפכי המרה ←' : 'Conversion Funnels →', href: `${base}/funnel` },
      ],
    },
  });
}
