'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import type { McpOAuthGrantSummary } from '@growthos/firebase-orm-models';
import {
  Activity,
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  Layers,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RevokeMcpConnectionButton } from '@/components/orgs/revoke-mcp-connection-button';
import { PageGuideButton } from '@/components/guides/page-guide-button';

export interface McpHubProps {
  orgId: string;
  projectId: string;
  projectName?: string;
  mcpUrl: string;
  grants: McpOAuthGrantSummary[];
  className?: string;
}

interface McpToolInfo {
  name: string;
  category: 'analytics' | 'retention' | 'customers' | 'actions' | 'setup';
  permission: string;
  description: string;
  examplePrompt: string;
  isAction?: boolean;
}

const MCP_TOOLS_CATALOG: McpToolInfo[] = [
  {
    name: 'list_metrics',
    category: 'analytics',
    permission: 'mcp.read',
    description: 'List every metric registered in the project active catalog, complete with semantic formulas and lineage.',
    examplePrompt: 'What metrics are available in our GrowthOS workspace?',
  },
  {
    name: 'describe_metric',
    category: 'analytics',
    permission: 'mcp.read',
    description: 'Detailed definition of one specific metric by name, including calculation logic, supported dimensions, and filters.',
    examplePrompt: 'Describe how Customer Acquisition Cost (CAC) is calculated.',
  },
  {
    name: 'query_metric',
    category: 'analytics',
    permission: 'mcp.read',
    description: 'Grounded query over one or more metrics across a specified date range, executing real warehouse aggregations.',
    examplePrompt: 'What was our blended CAC and ROAS over the past 30 days?',
  },
  {
    name: 'compare_periods',
    category: 'analytics',
    permission: 'mcp.read',
    description: 'Period-over-period comparison (e.g. Month-over-Month or Year-over-Year) with percentage delta calculation.',
    examplePrompt: 'Compare MRR and Net Churn this month vs last month.',
  },
  {
    name: 'decompose',
    category: 'analytics',
    permission: 'mcp.read',
    description: 'Dimensional breakdown of a metric by UTM campaign, source, device type, or geography.',
    examplePrompt: 'Break down total signups by campaign and channel for Q3.',
  },
  {
    name: 'query_cohort',
    category: 'retention',
    permission: 'mcp.read',
    description: 'Signup-month retention matrix and customer cohort payback survival curves.',
    examplePrompt: 'Show retention rates for the January 2026 acquisition cohort.',
  },
  {
    name: 'query_funnel',
    category: 'retention',
    permission: 'mcp.read',
    description: 'Per-stage distinct-customer counts for confirmed conversion funnels, with step drop-offs.',
    examplePrompt: 'What is our funnel conversion rate from landing page to paid subscription?',
  },
  {
    name: 'search_customers',
    category: 'customers',
    permission: 'mcp.read',
    description: 'Substring and entity search over Customer 360 profiles, subscription tiers, and touchpoints.',
    examplePrompt: 'Find paying enterprise customers who joined in the last 60 days.',
  },
  {
    name: 'list_insights',
    category: 'analytics',
    permission: 'mcp.read',
    description: 'Retrieve real-time tracking anomaly detections, creative fatigue alerts, and fired win rules.',
    examplePrompt: 'Are there any recent budget anomalies or tracking errors detected?',
  },
  {
    name: 'propose_action',
    category: 'actions',
    permission: 'automation.execute',
    description: 'Propose a simulated budget or campaign change with dry-run diff (human confirmation required).',
    examplePrompt: 'Propose a 15% budget increase on top-performing Google Ads campaigns.',
    isAction: true,
  },
  {
    name: 'approve_action',
    category: 'actions',
    permission: 'automation.approve',
    description: 'Human-in-the-loop authorization to execute an action in awaiting_approval state.',
    examplePrompt: 'Approve pending budget optimization action act_91823.',
    isAction: true,
  },
  {
    name: 'create_goal',
    category: 'actions',
    permission: 'dashboards.write',
    description: 'Create a new quarterly or annual conversion target pinning a metric to a target value and deadline.',
    examplePrompt: 'Set a goal to reach $100,000 MRR by end of Q4 2026.',
    isAction: true,
  },
  {
    name: 'create_segment',
    category: 'actions',
    permission: 'dashboards.write',
    description: 'Save a dynamic customer audience segment definition based on behavioral filter rules.',
    examplePrompt: 'Create a high-intent segment for accounts with >5 team members and active trials.',
    isAction: true,
  },
  {
    name: 'list_projects',
    category: 'setup',
    permission: 'mcp.read',
    description: 'List all active and archived projects in the organization with business profile and stack metadata.',
    examplePrompt: 'Show all projects configured in our organization.',
  },
  {
    name: 'create_project',
    category: 'setup',
    permission: 'project.manage',
    description: 'Create a new project workspace specifying name, business model, primary stack, and transaction type.',
    examplePrompt: 'Create a B2B SaaS project named "Acme Cloud" on Next.js.',
    isAction: true,
  },
  {
    name: 'update_project',
    category: 'setup',
    permission: 'project.manage',
    description: 'Update project settings including name, platform type, business model, primary stack, and timezone.',
    examplePrompt: 'Update the current project tech stack to Shopify.',
    isAction: true,
  },
  {
    name: 'archive_project',
    category: 'setup',
    permission: 'project.manage',
    description: 'Archive or restore a project workspace, safely updating its lifecycle state.',
    examplePrompt: 'Archive project proj_123 to clean up the workspace list.',
    isAction: true,
  },
  {
    name: 'list_goals',
    category: 'setup',
    permission: 'mcp.read',
    description: 'Retrieve all configured business goals, target values, deadlines, and tracking metrics for the project.',
    examplePrompt: 'List all active goals and targets set for this project.',
  },
  {
    name: 'delete_goal',
    category: 'setup',
    permission: 'dashboards.write',
    description: 'Permanently remove a configured business goal or milestone target by ID.',
    examplePrompt: 'Delete the outdated Q2 MRR target goal.',
    isAction: true,
  },
  {
    name: 'get_goal_progress',
    category: 'setup',
    permission: 'mcp.read',
    description: 'Evaluate live progress towards a specified goal against real warehouse aggregations.',
    examplePrompt: 'What is our current progress towards our $100k MRR goal?',
  },
  {
    name: 'audit_installation_gaps',
    category: 'setup',
    permission: 'mcp.read',
    description: 'Audit telemetry, webhook, and ad integration gaps based on project profile and requirement checklists.',
    examplePrompt: 'What integrations and tracking scripts are missing for our project setup?',
  },
  {
    name: 'get_setup_health',
    category: 'setup',
    permission: 'mcp.read',
    description: 'Get a synthesized readiness score, checklist counts, and setup health across all requirement categories.',
    examplePrompt: 'What is our overall setup health score and readiness status?',
  },
  {
    name: 'get_tracking_script',
    category: 'setup',
    permission: 'mcp.read',
    description: 'Generate personalized CDN tracking snippets, NPM installation code, or webhook endpoint payloads.',
    examplePrompt: 'Get the Web JS SDK tracking snippet for our Next.js landing pages.',
  },
  {
    name: 'get_installation_instructions',
    category: 'setup',
    permission: 'mcp.read',
    description: 'Fetch step-by-step developer implementation guides tailored for specific platforms and stacks.',
    examplePrompt: 'Give me the step-by-step installation guide for Shopify integration.',
  },
  {
    name: 'verify_installation',
    category: 'setup',
    permission: 'project.manage',
    description: 'Perform live telemetry ping verification or mark an integration checklist requirement verified.',
    examplePrompt: 'Verify whether the Web JS SDK has received live pageview events.',
    isAction: true,
  },
  {
    name: 'test_integration_event',
    category: 'setup',
    permission: 'project.manage',
    description: 'Inject a simulated test event (pageview, purchase, subscription) to validate pipeline end-to-end.',
    examplePrompt: 'Send a test purchase event for $49.00 to verify warehouse ingestion.',
    isAction: true,
  },
];

export function McpHub({
  orgId,
  projectId,
  projectName: _projectName = 'GrowthOS Project',
  mcpUrl,
  grants,
  className = '',
}: McpHubProps): React.ReactElement {
  const t = useTranslations('McpHub');
  const tApi = useTranslations('ApiKeys');

  const [activeTab, setActiveTab] = React.useState<
    'claude' | 'cursor' | 'antigravity' | 'headless' | 'tools' | 'tester' | 'grants'
  >('claude');

  const [copiedUrl, setCopiedUrl] = React.useState(false);
  const [copiedConfig, setCopiedConfig] = React.useState<string | null>(null);

  // Tools filtering
  const [toolSearch, setToolSearch] = React.useState('');
  const [toolCategory, setToolCategory] = React.useState<string>('all');

  // Live tester state
  const [testerAction, setTesterAction] = React.useState<'ping' | 'tools' | null>(null);
  const [testerLoading, setTesterLoading] = React.useState(false);
  const [testerResult, setTesterResult] = React.useState<{
    success: boolean;
    status: number;
    latencyMs: number;
    body: string;
  } | null>(null);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // fallback if clipboard denied
    }
  };

  const handleCopySnippet = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedConfig(id);
      setTimeout(() => setCopiedConfig(null), 2000);
    } catch {
      // fallback
    }
  };

  // Run live in-browser handshake tester
  const runLiveTest = async (type: 'ping' | 'tools') => {
    setTesterAction(type);
    setTesterLoading(true);
    setTesterResult(null);

    const startTime = performance.now();
    const payload =
      type === 'ping'
        ? { jsonrpc: '2.0', id: 'handshake_1', method: 'ping' }
        : { jsonrpc: '2.0', id: 'tools_1', method: 'tools/list' };

    try {
      const res = await fetch(mcpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const latencyMs = Math.round(performance.now() - startTime);
      let dataText = '';
      try {
        const json = await res.json();
        dataText = JSON.stringify(json, null, 2);
      } catch {
        dataText = await res.text();
      }

      setTesterResult({
        success: res.ok || res.status === 401 || res.status === 403,
        status: res.status,
        latencyMs,
        body: dataText || `HTTP ${res.status}`,
      });
    } catch (err: unknown) {
      const latencyMs = Math.round(performance.now() - startTime);
      const message = err instanceof Error ? err.message : String(err);
      setTesterResult({
        success: false,
        status: 0,
        latencyMs,
        body: JSON.stringify({ error: 'Network Error', detail: message }, null, 2),
      });
    } finally {
      setTesterLoading(false);
    }
  };

  // Filtered tools
  const filteredTools = React.useMemo(() => {
    return MCP_TOOLS_CATALOG.filter((tool) => {
      const matchesCategory =
        toolCategory === 'all' || tool.category === toolCategory;

      const q = toolSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        tool.name.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        tool.permission.toLowerCase().includes(q) ||
        tool.examplePrompt.toLowerCase().includes(q);

      return matchesCategory && matchesSearch;
    });
  }, [toolCategory, toolSearch]);

  const activeGrantsCount = grants.filter((g) => !g.revokedAt).length;

  // JSON snippets
  const claudeDesktopConfig = JSON.stringify(
    {
      mcpServers: {
        growthos: {
          command: 'npx',
          args: ['-y', 'mcp-remote', mcpUrl, '--header', 'Authorization:Bearer ${GROWTHOS_MCP_API_KEY}'],
          env: {
            GROWTHOS_MCP_API_KEY: 'gos_live_YOUR_API_KEY_HERE',
          },
        },
      },
    },
    null,
    2,
  );

  const cursorConfig = JSON.stringify(
    {
      mcpServers: {
        growthos: {
          url: mcpUrl,
          headers: {
            Authorization: 'Bearer YOUR_GROWTHOS_API_KEY',
          },
        },
      },
    },
    null,
    2,
  );

  const antigravityConfig = JSON.stringify(
    {
      mcpServers: {
        growthos: {
          serverUrl: mcpUrl,
          authHeader: 'Authorization: Bearer YOUR_GROWTHOS_API_KEY',
        },
      },
    },
    null,
    2,
  );

  const pythonSnippet = `from modelcontextprotocol import ClientSession
import httpx

async with httpx.AsyncClient() as http_client:
    response = await http_client.post(
        "${mcpUrl}",
        headers={"Authorization": "Bearer YOUR_GROWTHOS_API_KEY"},
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
    )
    print(response.json())`;

  const nodeSnippet = `import { connectGrowthOsMcpClient, fetchWeeklyMetricDigest } from '@growthos/mcp-headless-example';

const client = await connectGrowthOsMcpClient({
  mcpUrl: '${mcpUrl}',
  bearerToken: process.env.GROWTHOS_MCP_API_KEY,
});

const digest = await fetchWeeklyMetricDigest(client, { metric: 'cac' });
console.log(digest);
await client.close();`;

  const curlSnippet = `curl -X POST ${mcpUrl} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_GROWTHOS_API_KEY" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;

  return (
    <div className={`flex flex-col gap-8 ${className}`}>
      {/* Top Hero Card */}
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card/95 to-primary/5 p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary border border-primary/20">
                <Bot className="h-3.5 w-3.5" />
                {t('protocolBadge')}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Streamable HTTP
              </span>
              {activeGrantsCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {activeGrantsCount} Active Grants
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                {t('title')}
              </h1>
              <PageGuideButton pageKey="mcp" />
            </div>
            <p className="text-sm text-muted-foreground md:text-base leading-relaxed">
              {t('subtitle')}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab('tester')}
                className="gap-2 border-primary/20 hover:border-primary/40"
              >
                <Activity className="h-4 w-4 text-primary" />
                {t('testConnection')}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setActiveTab('tools')}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" />
                {t('tabTools')} ({MCP_TOOLS_CATALOG.length})
              </Button>
            </div>
          </div>
        </div>

        {/* Server URL Bar */}
        <div className="mt-6 flex flex-col gap-2 rounded-xl border border-border bg-background/80 p-3.5 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Terminal className="h-4 w-4" />
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-xs font-medium text-muted-foreground">{t('endpointLabel')}</span>
              <code className="truncate text-xs font-mono font-semibold text-foreground md:text-sm">
                {mcpUrl}
              </code>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyUrl}
            className="shrink-0 gap-1.5 text-xs"
          >
            {copiedUrl ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            {copiedUrl ? t('copied') : t('copyUrl')}
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-2 overflow-x-auto">
        <button
          type="button"
          data-testid="tab-claude"
          onClick={() => setActiveTab('claude')}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
            activeTab === 'claude'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Bot className="h-4 w-4" />
          {t('tabClaude')}
        </button>
        <button
          type="button"
          data-testid="tab-cursor"
          onClick={() => setActiveTab('cursor')}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
            activeTab === 'cursor'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Code2 className="h-4 w-4" />
          {t('tabCursor')}
        </button>
        <button
          type="button"
          data-testid="tab-antigravity"
          onClick={() => setActiveTab('antigravity')}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
            activeTab === 'antigravity'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          {t('tabAntigravity')}
        </button>
        <button
          type="button"
          data-testid="tab-headless"
          onClick={() => setActiveTab('headless')}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
            activeTab === 'headless'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Terminal className="h-4 w-4" />
          {t('tabHeadless')}
        </button>
        <button
          type="button"
          data-testid="tab-tools"
          onClick={() => setActiveTab('tools')}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
            activeTab === 'tools'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Layers className="h-4 w-4" />
          {t('tabTools')}
        </button>
        <button
          type="button"
          data-testid="tab-tester"
          onClick={() => setActiveTab('tester')}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
            activeTab === 'tester'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Activity className="h-4 w-4" />
          {t('tabTester')}
        </button>
        <button
          type="button"
          data-testid="tab-grants"
          onClick={() => setActiveTab('grants')}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
            activeTab === 'grants'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          {t('tabGrants')}
          {grants.length > 0 && (
            <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-xs text-primary-foreground">
              {grants.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: Claude Desktop */}
      {activeTab === 'claude' && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-bold text-foreground">{t('claudeHeading')}</h2>
            <p className="text-sm text-muted-foreground">{t('claudeSubheading')}</p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Method 1: Native Connector */}
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  1
                </span>
                <h3 className="font-semibold text-foreground">{t('claudeMethod1Title')}</h3>
              </div>

              <ol className="flex flex-col gap-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-foreground">
                    1
                  </span>
                  <span>{t('claudeMethod1Step1')}</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-foreground">
                    2
                  </span>
                  <span>{t('claudeMethod1Step2')}</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-foreground">
                    3
                  </span>
                  <span>{t('claudeMethod1Step3')}</span>
                </li>
              </ol>

              <div className="mt-auto pt-4 border-t border-border/60 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">No secrets required</span>
                <Button size="sm" variant="outline" onClick={handleCopyUrl} className="gap-1.5 text-xs">
                  {copiedUrl ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {t('copyUrl')}
                </Button>
              </div>
            </div>

            {/* Method 2: Config file */}
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  2
                </span>
                <h3 className="font-semibold text-foreground">{t('claudeMethod2Title')}</h3>
              </div>
              <p className="text-xs text-muted-foreground">{t('claudeMethod2Desc')}</p>

              <div className="relative rounded-lg border border-border bg-muted/60 p-3 font-mono text-xs overflow-x-auto">
                <pre>{claudeDesktopConfig}</pre>
                <button
                  type="button"
                  onClick={() => handleCopySnippet(claudeDesktopConfig, 'claude')}
                  className="absolute top-2 right-2 flex items-center gap-1 rounded bg-background/90 px-2 py-1 text-xs text-foreground border border-border shadow-xs hover:bg-background"
                >
                  {copiedConfig === 'claude' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedConfig === 'claude' ? t('copied') : t('copyUrl')}
                </button>
              </div>

              <div className="mt-auto pt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>Restart Claude Desktop after updating</span>
                <a
                  href={`/orgs/${orgId}/projects/${projectId}/keys`}
                  className="text-primary hover:underline flex items-center gap-1 font-medium"
                >
                  Mint API Key <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Cursor */}
      {activeTab === 'cursor' && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-bold text-foreground">{t('cursorHeading')}</h2>
            <p className="text-sm text-muted-foreground">{t('cursorSubheading')}</p>
          </div>

          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
            <ol className="flex flex-col gap-2.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary">
                  1
                </span>
                <span>{t('cursorStep1')}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary">
                  2
                </span>
                <span>{t('cursorStep2')}</span>
              </li>
            </ol>

            <div className="relative rounded-lg border border-border bg-muted/60 p-3 font-mono text-xs overflow-x-auto">
              <pre>{cursorConfig}</pre>
              <button
                type="button"
                onClick={() => handleCopySnippet(cursorConfig, 'cursor')}
                className="absolute top-2 right-2 flex items-center gap-1 rounded bg-background/90 px-2 py-1 text-xs text-foreground border border-border shadow-xs hover:bg-background"
              >
                {copiedConfig === 'cursor' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedConfig === 'cursor' ? t('copied') : t('copyUrl')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Antigravity & Gemini */}
      {activeTab === 'antigravity' && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-bold text-foreground">{t('antigravityHeading')}</h2>
            <p className="text-sm text-muted-foreground">{t('antigravitySubheading')}</p>
          </div>

          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">{t('antigravityStep1')}</p>

            <div className="relative rounded-lg border border-border bg-muted/60 p-3 font-mono text-xs overflow-x-auto">
              <pre>{antigravityConfig}</pre>
              <button
                type="button"
                onClick={() => handleCopySnippet(antigravityConfig, 'antigravity')}
                className="absolute top-2 right-2 flex items-center gap-1 rounded bg-background/90 px-2 py-1 text-xs text-foreground border border-border shadow-xs hover:bg-background"
              >
                {copiedConfig === 'antigravity' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedConfig === 'antigravity' ? t('copied') : t('copyUrl')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Headless & SDK */}
      {activeTab === 'headless' && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-bold text-foreground">{t('headlessHeading')}</h2>
            <p className="text-sm text-muted-foreground">{t('headlessSubheading')}</p>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <span>Authentication Requirement</span>
            </div>
            <p className="mt-1">{t('headlessNotice')}</p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* TypeScript SDK */}
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">TypeScript / Node.js</span>
                <button
                  type="button"
                  onClick={() => handleCopySnippet(nodeSnippet, 'node')}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {copiedConfig === 'node' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedConfig === 'node' ? t('copied') : t('copyUrl')}
                </button>
              </div>
              <div className="rounded-lg border border-border bg-muted/60 p-3 font-mono text-xs overflow-x-auto">
                <pre>{nodeSnippet}</pre>
              </div>
            </div>

            {/* Python SDK */}
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Python SDK</span>
                <button
                  type="button"
                  onClick={() => handleCopySnippet(pythonSnippet, 'python')}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {copiedConfig === 'python' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedConfig === 'python' ? t('copied') : t('copyUrl')}
                </button>
              </div>
              <div className="rounded-lg border border-border bg-muted/60 p-3 font-mono text-xs overflow-x-auto">
                <pre>{pythonSnippet}</pre>
              </div>
            </div>

            {/* Curl Command */}
            <div className="col-span-1 lg:col-span-2 flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">cURL Streamable HTTP POST</span>
                <button
                  type="button"
                  onClick={() => handleCopySnippet(curlSnippet, 'curl')}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {copiedConfig === 'curl' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedConfig === 'curl' ? t('copied') : t('copyUrl')}
                </button>
              </div>
              <div className="rounded-lg border border-border bg-muted/60 p-3 font-mono text-xs overflow-x-auto">
                <pre>{curlSnippet}</pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Tool Catalog Explorer */}
      {activeTab === 'tools' && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-bold text-foreground">{t('toolsHeading')}</h2>
            <p className="text-sm text-muted-foreground">{t('toolsSubheading')}</p>
          </div>

          {/* Search & Category Filter */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={toolSearch}
                onChange={(e) => setToolSearch(e.target.value)}
                placeholder={t('toolsSearchPlaceholder')}
                className="w-full rounded-lg border border-input bg-background pl-9 pr-4 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setToolCategory('all')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  toolCategory === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {t('toolsFilterAll')}
              </button>
              <button
                type="button"
                onClick={() => setToolCategory('analytics')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  toolCategory === 'analytics'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {t('toolsFilterAnalytics')}
              </button>
              <button
                type="button"
                onClick={() => setToolCategory('retention')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  toolCategory === 'retention'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {t('toolsFilterRetention')}
              </button>
              <button
                type="button"
                onClick={() => setToolCategory('customers')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  toolCategory === 'customers'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {t('toolsFilterCustomers')}
              </button>
              <button
                type="button"
                onClick={() => setToolCategory('actions')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  toolCategory === 'actions'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {t('toolsFilterActions')}
              </button>
              <button
                type="button"
                onClick={() => setToolCategory('setup')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  toolCategory === 'setup'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {t('toolsFilterSetup')}
              </button>
            </div>
          </div>

          {/* Tools Grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredTools.map((tool) => (
              <div
                key={tool.name}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-xs transition-shadow hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="rounded bg-primary/10 px-2 py-1 font-mono text-xs font-bold text-primary">
                    {tool.name}
                  </code>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                      tool.isAction
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                        : 'bg-muted text-muted-foreground border-border'
                    }`}
                  >
                    {tool.permission}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  {tool.description}
                </p>

                <div className="mt-auto pt-3 border-t border-border/60 flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {t('toolExamplePrompt')}
                  </span>
                  <p className="rounded bg-muted/40 p-2 text-xs italic text-foreground font-sans">
                    &ldquo;{tool.examplePrompt}&rdquo;
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 6: Live Handshake Tester */}
      {activeTab === 'tester' && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-bold text-foreground">{t('testerHeading')}</h2>
            <p className="text-sm text-muted-foreground">{t('testerSubheading')}</p>
          </div>

          <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="default"
                size="sm"
                onClick={() => runLiveTest('ping')}
                disabled={testerLoading}
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                {testerLoading && testerAction === 'ping' ? t('testerRunning') : t('testerPingAction')}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => runLiveTest('tools')}
                disabled={testerLoading}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${testerLoading && testerAction === 'tools' ? 'animate-spin' : ''}`} />
                {testerLoading && testerAction === 'tools' ? t('testerRunning') : t('testerListAction')}
              </Button>
            </div>

            {testerResult && (
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2">
                    {testerResult.status === 200 ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : testerResult.status === 401 || testerResult.status === 403 ? (
                      <CheckCircle2 className="h-5 w-5 text-amber-500" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-destructive" />
                    )}
                    <span className="font-semibold text-sm text-foreground">
                      {testerResult.status === 200
                        ? t('testerStatusSuccess')
                        : testerResult.status === 401 || testerResult.status === 403
                          ? t('testerStatusAuthRequired')
                          : t('testerStatusError')}
                    </span>
                  </div>

                  <span className="text-xs text-muted-foreground font-mono">
                    {t('testerLatency')} {testerResult.latencyMs}ms
                  </span>
                </div>

                <div className="rounded border border-border bg-background p-3 font-mono text-xs overflow-x-auto max-h-72">
                  <pre>{testerResult.body}</pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 7: Active OAuth Grants */}
      {activeTab === 'grants' && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-bold text-foreground">{t('grantsHeading')}</h2>
            <p className="text-sm text-muted-foreground">{t('grantsSubheading')}</p>
          </div>

          {grants.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 px-4 text-center">
              <ShieldCheck className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground">{t('grantsEmpty')}</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                Connect Claude Desktop or claude.ai via OAuth to see authorized applications here.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {grants.map((grant) => (
                <div
                  key={grant.id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{grant.clientId}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                            grant.revokedAt
                              ? 'bg-destructive/10 text-destructive border-destructive/20'
                              : grant.isActive
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                          }`}
                        >
                          {grant.revokedAt
                            ? t('grantsStatusRevoked')
                            : grant.isActive
                              ? t('grantsStatusActive')
                              : t('grantsStatusPending')}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>{tApi('mcpConnectionGrantedLabel', { createdAt: grant.createdAt })}</span>
                        {grant.lastUsedAt && (
                          <span>• {tApi('mcpConnectionLastUsedLabel', { lastUsedAt: grant.lastUsedAt })}</span>
                        )}
                        <span>• Scopes: <code className="font-mono">{grant.scope}</code></span>
                      </div>
                    </div>
                  </div>

                  {!grant.revokedAt && (
                    <div className="shrink-0 pt-2 sm:pt-0">
                      <RevokeMcpConnectionButton orgId={orgId} projectId={projectId} grantId={grant.id} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
