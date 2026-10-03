'use client';

import React, { useState } from 'react';
import {
  Laptop,
  Smartphone,
  Tablet,
  UploadCloud,
  Wand2,
  X,
} from 'lucide-react';

export interface VisualDomStudioProps {
  isOpen?: boolean;
  onClose?: () => void;
  targetUrl?: string;
  orgId?: string;
  projectId?: string;
  onPublish?: (variant: { variantId: string; headline: string }) => Promise<void> | void;
  onGenerateAiVariant?: (prompt: string) => Promise<string> | string;
}

export function VisualDomStudio({
  isOpen = true,
  onClose,
  targetUrl = 'https://easysign.io/pricing',
  orgId,
  projectId,
  onPublish,
  onGenerateAiVariant,
}: VisualDomStudioProps) {
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [activeVariant, setActiveVariant] = useState<'A' | 'B'>('B');
  const [activeTab, setActiveTab] = useState<'styles' | 'ai' | 'figma' | 'code'>('ai');
  const [headlineText, setHeadlineText] = useState(
    'Secure, Court-Admissible Signatures for Modern Legal Teams.'
  );
  const [aiPrompt, setAiPrompt] = useState(
    'Rewrite this headline to match our Meta Ad copy targeting Legal Teams and add a subtext guarantee badge.'
  );
  const [isPublished, setIsPublished] = useState(false);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md"
      data-testid="visual-dom-studio"
    >
      {/* Studio Header Bar */}
      <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground">Visual DOM Studio</span>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                PROMPT-TO-DOM
              </span>
            </div>
            <span className="text-xs text-muted-foreground font-mono">{targetUrl}</span>
          </div>
        </div>

        {/* Center: Viewport & Variant Selector */}
        <div className="flex items-center gap-4">
          {/* Viewport controls */}
          <div className="flex items-center rounded-full border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setViewport('desktop')}
              className={`rounded-full p-1.5 transition-colors ${
                viewport === 'desktop' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
              title="Desktop View"
            >
              <Laptop className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewport('tablet')}
              className={`rounded-full p-1.5 transition-colors ${
                viewport === 'tablet' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
              title="Tablet View"
            >
              <Tablet className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewport('mobile')}
              className={`rounded-full p-1.5 transition-colors ${
                viewport === 'mobile' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
              title="Mobile View"
            >
              <Smartphone className="h-4 w-4" />
            </button>
          </div>

          {/* Variant Selector */}
          <div className="flex items-center rounded-full border border-border bg-muted/40 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveVariant('A')}
              className={`rounded-full px-3 py-1 transition-all ${
                activeVariant === 'A' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              Control A
            </button>
            <button
              type="button"
              onClick={() => setActiveVariant('B')}
              className={`rounded-full px-3 py-1 transition-all ${
                activeVariant === 'B' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              Variant B (AI)
            </button>
          </div>
        </div>

        {/* Right: Publish Actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={async () => {
              setIsPublished(true);
              setTimeout(() => setIsPublished(false), 3000);
              if (onPublish) {
                await onPublish({ variantId: activeVariant, headline: headlineText });
              } else if (orgId && projectId && orgId !== 'demo-org') {
                try {
                  await fetch(`/api/orgs/${orgId}/projects/${projectId}/automation/actions/campaign-drafts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      draftName: `Visual DOM Variant ${activeVariant}`,
                      proposedChanges: { headline: headlineText, targetUrl },
                    }),
                  });
                } catch (err) {
                  console.error('Failed to publish DOM variant', err);
                }
              }
            }}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity shadow-sm"
          >
            <UploadCloud className="h-4 w-4" />
            {isPublished ? 'Published Live!' : 'Save & Publish Live'}
          </button>
        </div>
      </header>

      {/* Main Studio Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Inspector Panel */}
        <aside className="w-80 md:w-96 border-r border-border bg-card flex flex-col h-full overflow-y-auto">
          {/* Sub-tabs */}
          <div className="flex border-b border-border text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('ai')}
              className={`flex-1 py-3 text-center transition-colors border-b-2 ${
                activeTab === 'ai' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              }`}
            >
              AI Rewrite
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('styles')}
              className={`flex-1 py-3 text-center transition-colors border-b-2 ${
                activeTab === 'styles' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              }`}
            >
              Visual Styles
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('code')}
              className={`flex-1 py-3 text-center transition-colors border-b-2 ${
                activeTab === 'code' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              }`}
            >
              DOM Code
            </button>
          </div>

          <div className="p-5 space-y-6 flex-1">
            {activeTab === 'ai' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-bold text-foreground">AI DOM Copilot</h3>
                </div>

                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="w-full h-28 rounded-xl border border-border bg-muted/30 p-3 text-xs focus:ring-1 focus:ring-primary focus:border-primary resize-none text-foreground"
                  placeholder="Ask AI to rephrase, swap CTAs, or restyle..."
                />

                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1.5">
                  <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                    AI Suggested Content
                  </span>
                  <p className="text-xs italic font-medium text-foreground">
                    "{headlineText}"
                  </p>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    if (onGenerateAiVariant) {
                      const res = await onGenerateAiVariant(aiPrompt);
                      if (res) {
                        setHeadlineText(res);
                        return;
                      }
                    }
                    setHeadlineText(
                      'AI-Powered Digital Contracts Signed in 30 Seconds Guaranteed.'
                    );
                  }}
                  className="w-full rounded-xl bg-primary py-2 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
                >
                  ⚡ Apply AI Variant to DOM
                </button>
              </div>
            )}

            {activeTab === 'styles' && (
              <div className="space-y-4 text-xs">
                <h3 className="font-bold text-foreground">Selected Element: &lt;h1&gt;</h3>
                <div className="space-y-2">
                  <label className="text-muted-foreground">Typography Family</label>
                  <select className="w-full rounded-lg border border-border bg-background p-2">
                    <option>Plus Jakarta Sans</option>
                    <option>Inter</option>
                    <option>System UI</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-muted-foreground">Font Weight</label>
                  <select className="w-full rounded-lg border border-border bg-background p-2">
                    <option>Bold (700)</option>
                    <option>SemiBold (600)</option>
                    <option>Regular (400)</option>
                  </select>
                </div>
              </div>
            )}

            {activeTab === 'code' && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-foreground">Mutation Diff (JSON)</h3>
                <pre className="rounded-xl bg-slate-950 p-3 font-mono text-[11px] text-emerald-400 overflow-x-auto">
{`{
  "target": "h1#hero-headline",
  "action": "replaceText",
  "value": "${headlineText}"
}`}
                </pre>
              </div>
            )}
          </div>
        </aside>

        {/* Live DOM Canvas Frame */}
        <main className="flex-1 bg-muted/20 p-6 flex items-center justify-center overflow-auto">
          <div
            className={`rounded-2xl border border-border bg-card shadow-lg transition-all duration-300 overflow-hidden flex flex-col ${
              viewport === 'desktop'
                ? 'w-full max-w-5xl h-[90%]'
                : viewport === 'tablet'
                ? 'w-[768px] h-[85%]'
                : 'w-[375px] h-[75%]'
            }`}
          >
            {/* Mock browser header */}
            <div className="flex h-10 items-center justify-between border-b border-border bg-muted/40 px-4">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </div>
              <span className="font-mono text-[11px] text-muted-foreground">
                {targetUrl}
              </span>
              <div className="w-8" />
            </div>

            {/* Simulated Live Website DOM */}
            <div className="flex-1 p-8 md:p-12 overflow-y-auto space-y-8 text-center flex flex-col justify-center">
              <div className="inline-flex mx-auto items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                ⚡ Variant B Active
              </div>

              <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight text-foreground max-w-2xl mx-auto ring-2 ring-primary/40 rounded-xl p-3 bg-primary/5 transition-all">
                {headlineText}
              </h1>

              <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                Streamline contract turnaround from days to minutes with legally compliant biometric verification and instant audit trails.
              </p>

              <div className="flex items-center justify-center gap-4 pt-4">
                <button
                  type="button"
                  className="rounded-xl bg-primary px-6 py-3 text-xs font-bold text-primary-foreground shadow-sm"
                >
                  Start 14-Day Free Trial
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-border bg-card px-6 py-3 text-xs font-bold text-foreground"
                >
                  Book Live Demo
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
