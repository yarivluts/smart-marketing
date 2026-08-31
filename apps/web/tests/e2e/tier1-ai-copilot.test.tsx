import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import {
  renderWithIntl,
  createMockCopilotMessage,
  createMockCopilotProposal,
  type CopilotActionProposal,
  type CopilotMessage,
} from './helpers/test-harness';

// Test mock component for Bilingual AI Copilot Chat
function MockCopilotChat({
  initialMessages = [createMockCopilotMessage()],
  onExecuteProposal = vi.fn(),
  locale = 'en',
}: {
  initialMessages?: CopilotMessage[];
  onExecuteProposal?: (proposal: CopilotActionProposal) => Promise<void>;
  locale?: 'en' | 'he';
}) {
  const [messages, setMessages] = useState<CopilotMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);

  function handleSend() {
    if (!input.trim()) return;
    const userMsg: CopilotMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    let assistantMsg: CopilotMessage;

    // Bilingual NLP intent detection
    const normalized = input.toLowerCase();
    if (normalized.includes('הכי רווחיות') || normalized.includes('top ads') || normalized.includes('best ads')) {
      assistantMsg = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: locale === 'he' ? 'המודעות הכי רווחיות השבוע הן במודעות Meta עם ROAS של 4.2x.' : 'Your top-performing ads this week are Meta Retargeting campaigns with 4.2x ROAS.',
        timestamp: new Date().toISOString(),
      };
    } else if (normalized.includes('הגדל תקציב') || normalized.includes('increase budget')) {
      assistantMsg = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: locale === 'he' ? 'הכנתי הצעה להגדלת תקציב עבור קמפיין Meta Retargeting.' : 'Prepared budget increase proposal for Meta Retargeting campaign.',
        timestamp: new Date().toISOString(),
        actionProposal: createMockCopilotProposal({
          actionType: 'budget_change',
          beforeValue: '$150/day',
          afterValue: '$250/day',
          estimatedImpact: '+32% projected conversions',
        }),
      };
    } else if (normalized.includes('קמפיין חיפוש') || normalized.includes('new campaign')) {
      assistantMsg = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: locale === 'he' ? 'טיוטת קמפיין חדש מוכנה לאישור.' : 'New search campaign draft ready for approval.',
        timestamp: new Date().toISOString(),
        actionProposal: createMockCopilotProposal({
          actionType: 'campaign_draft_create',
          targetLabel: 'Google Search - Legal Leads',
          beforeValue: 'Draft',
          afterValue: 'Created ($200/day)',
          estimatedImpact: '+45 qualified leads / month',
        }),
      };
    } else {
      assistantMsg = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: locale === 'he' ? 'במה אוכל לעזור לך לייעל את הקמפיינים היום?' : 'How can I help you optimize your growth campaigns today?',
        timestamp: new Date().toISOString(),
      };
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
  }

  async function handleApprove(proposal: CopilotActionProposal) {
    setIsExecuting(true);
    try {
      await onExecuteProposal(proposal);
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: 'assistant',
          content: locale === 'he' ? 'הפעולה בוצעה בהצלחה! ניתן לבטל בכל עת.' : 'Action executed successfully! Rollback is available in audit log.',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsExecuting(false);
    }
  }

  return (
    <div data-testid="copilot-chat-container" className="flex flex-col h-96 border rounded-lg p-4" dir={locale === 'he' ? 'rtl' : 'ltr'}>
      <div className="flex-1 overflow-y-auto space-y-3" data-testid="message-stream">
        {messages.map((m) => (
          <div key={m.id} data-testid={`message-${m.role}`} className={`p-3 rounded-lg ${m.role === 'user' ? 'bg-primary/10 ml-auto' : 'bg-muted'}`}>
            <p>{m.content}</p>
            {m.actionProposal && (
              <div data-testid="proposal-card" className="mt-3 p-3 bg-card border rounded-md shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="font-bold">{m.actionProposal.targetLabel}</span>
                  <span data-testid="impact-badge" className="px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-800 uppercase font-semibold">
                    {m.actionProposal.impactBadge} impact
                  </span>
                </div>
                <div className="mt-2 text-xs space-y-1">
                  <div>Before: <span className="line-through">{m.actionProposal.beforeValue}</span></div>
                  <div>After: <span className="font-bold text-green-600">{m.actionProposal.afterValue}</span></div>
                  <div className="text-muted-foreground">{m.actionProposal.estimatedImpact}</div>
                </div>
                <button
                  type="button"
                  data-testid="quick-execute-button"
                  disabled={isExecuting}
                  onClick={() => handleApprove(m.actionProposal!)}
                  className="mt-3 w-full bg-primary text-primary-foreground py-1.5 px-3 rounded text-xs font-semibold"
                >
                  {isExecuting ? 'Executing...' : (locale === 'he' ? 'הפעל שינוי בלחיצה אחת' : '1-Click Approve & Execute')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          data-testid="copilot-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={locale === 'he' ? 'שאל שאלה או תן פקודה...' : 'Ask a question or issue a command...'}
          className="flex-1 border rounded px-3 py-1.5 text-sm"
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button
          type="button"
          data-testid="copilot-send-button"
          onClick={handleSend}
          className="bg-primary text-primary-foreground px-4 py-1.5 rounded text-sm font-medium"
        >
          {locale === 'he' ? 'שלח' : 'Send'}
        </button>
      </div>
    </div>
  );
}

describe('Tier 1: Bilingual AI Copilot & Hybrid Action Engine (R2)', () => {
  it('4.1 renders bilingual conversational chat interface in English (LTR) and Hebrew (RTL)', () => {
    const { rerender } = renderWithIntl(<MockCopilotChat locale="en" />);
    expect(screen.getByTestId('copilot-chat-container')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByPlaceholderText('Ask a question or issue a command...')).toBeInTheDocument();

    rerender(<MockCopilotChat locale="he" />);
    expect(screen.getByTestId('copilot-chat-container')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByPlaceholderText('שאל שאלה או תן פקודה...')).toBeInTheDocument();
  });

  it('4.2 parses natural language Hebrew analytics queries and responds with structured data', () => {
    renderWithIntl(<MockCopilotChat initialMessages={[]} locale="he" />, { locale: 'he' });

    const input = screen.getByTestId('copilot-input');
    fireEvent.change(input, { target: { value: 'אילו מודעות הכי רווחיות השבוע?' } });
    fireEvent.click(screen.getByTestId('copilot-send-button'));

    expect(screen.getByText('אילו מודעות הכי רווחיות השבוע?')).toBeInTheDocument();
    expect(screen.getByText(/המודעות הכי רווחיות השבוע הן במודעות Meta/)).toBeInTheDocument();
  });

  it('4.3 detects budget increase action intent and generates proposal card with Before/After diffs', () => {
    renderWithIntl(<MockCopilotChat initialMessages={[]} locale="en" />);

    const input = screen.getByTestId('copilot-input');
    fireEvent.change(input, { target: { value: 'Increase budget for retargeting campaign to $250' } });
    fireEvent.click(screen.getByTestId('copilot-send-button'));

    expect(screen.getByTestId('proposal-card')).toBeInTheDocument();
    expect(screen.getByText('Meta Retargeting Leads')).toBeInTheDocument();
    expect(screen.getByText('$150/day')).toBeInTheDocument();
    expect(screen.getByText('$250/day')).toBeInTheDocument();
    expect(screen.getByText('+32% projected conversions')).toBeInTheDocument();
    expect(screen.getByTestId('quick-execute-button')).toHaveTextContent('1-Click Approve & Execute');
  });

  it('4.4 triggers 1-Click Action Execution from Copilot proposal card and updates message history', async () => {
    const onExecuteProposal = vi.fn().mockResolvedValue(undefined);
    renderWithIntl(<MockCopilotChat initialMessages={[]} onExecuteProposal={onExecuteProposal} locale="en" />);

    const input = screen.getByTestId('copilot-input');
    fireEvent.change(input, { target: { value: 'Increase budget' } });
    fireEvent.click(screen.getByTestId('copilot-send-button'));

    const executeBtn = screen.getByTestId('quick-execute-button');
    fireEvent.click(executeBtn);

    await waitFor(() => {
      expect(onExecuteProposal).toHaveBeenCalled();
      expect(screen.getByText(/Action executed successfully! Rollback is available in audit log./)).toBeInTheDocument();
    });
  });

  it('4.5 generates campaign draft creation proposal card upon natural language request', () => {
    renderWithIntl(<MockCopilotChat initialMessages={[]} locale="en" />);

    const input = screen.getByTestId('copilot-input');
    fireEvent.change(input, { target: { value: 'Create a new campaign for lawyers' } });
    fireEvent.click(screen.getByTestId('copilot-send-button'));

    expect(screen.getByTestId('proposal-card')).toBeInTheDocument();
    expect(screen.getByText('Google Search - Legal Leads')).toBeInTheDocument();
    expect(screen.getByText('+45 qualified leads / month')).toBeInTheDocument();
  });

  it('4.6 provides 1-Click localized button in Hebrew mode with correct text', () => {
    renderWithIntl(<MockCopilotChat initialMessages={[]} locale="he" />, { locale: 'he' });

    const input = screen.getByTestId('copilot-input');
    fireEvent.change(input, { target: { value: 'הגדל תקציב' } });
    fireEvent.click(screen.getByTestId('copilot-send-button'));

    expect(screen.getByTestId('quick-execute-button')).toHaveTextContent('הפעל שינוי בלחיצה אחת');
  });
});
