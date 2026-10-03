'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  ChevronDown,
  HelpCircle,
  Search,
} from 'lucide-react';

export type FaqCategory = 'all' | 'attribution' | 'guardrails' | 'billing';

export interface FaqItem {
  id: string;
  category: 'attribution' | 'guardrails' | 'billing';
  question: string;
  answer: string;
}

export function LandingFaq(): React.ReactElement {
  const t = useTranslations('HomePage');
  const [selectedCategory, setSelectedCategory] = useState<FaqCategory>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({
    'faq-1': true,
  });

  const toggleItem = (id: string) => {
    setOpenItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const FAQ_ITEMS: FaqItem[] = [
    {
      id: 'faq-1',
      category: 'attribution',
      question: t('faq1Q'),
      answer: t('faq1A'),
    },
    {
      id: 'faq-2',
      category: 'guardrails',
      question: t('faq2Q'),
      answer: t('faq2A'),
    },
    {
      id: 'faq-3',
      category: 'attribution',
      question: t('faq3Q'),
      answer: t('faq3A'),
    },
    {
      id: 'faq-4',
      category: 'billing',
      question: t('faq4Q'),
      answer: t('faq4A'),
    },
    {
      id: 'faq-5',
      category: 'guardrails',
      question: t('faq5Q'),
      answer: t('faq5A'),
    },
    {
      id: 'faq-6',
      category: 'billing',
      question: t('faq6Q'),
      answer: t('faq6A'),
    },
  ];

  const filteredItems = FAQ_ITEMS.filter((item) => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch =
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <section id="faq" className="py-20 md:py-28 bg-muted/20 border-t border-border/40 relative" data-testid="landing-faq">
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-14">
          <Badge variant="purple" size="sm" className="mb-3">
            <HelpCircle className="h-3.5 w-3.5 me-1" />
            <span>{t('faqBadge')}</span>
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            {t('faqHeading')}
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground text-sm sm:text-base">
            {t('faqSubheading')}
          </p>

          {/* Search Bar */}
          <div className="mt-8 w-full max-w-md relative">
            <Search className="h-4 w-4 absolute left-3.5 rtl:left-auto rtl:right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={t('faqSearchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-border bg-card ps-10 pe-4 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all shadow-xs"
            />
          </div>

          {/* Category Filter Pills */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {[
              { id: 'all', label: t('faqCatAll') },
              { id: 'attribution', label: t('faqCatAttribution') },
              { id: 'guardrails', label: t('faqCatGuardrails') },
              { id: 'billing', label: t('faqCatBilling') },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id as FaqCategory)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                  selectedCategory === cat.id
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Accordion List */}
        <div className="space-y-4">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 text-xs text-muted-foreground">
              {t('faqNoResults')}
            </div>
          ) : (
            filteredItems.map((item) => {
              const isOpen = !!openItems[item.id];
              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-border/80 bg-card overflow-hidden transition-all duration-200 shadow-xs"
                >
                  <button
                    type="button"
                    onClick={() => toggleItem(item.id)}
                    className="w-full flex items-center justify-between p-5 text-start gap-4 hover:bg-muted/30 transition-colors"
                  >
                    <span className="text-sm font-bold text-foreground">
                      {item.question}
                    </span>
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-primary bg-primary/10' : ''
                      }`}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 text-xs text-muted-foreground leading-relaxed border-t border-border/40 animate-in fade-in">
                      {item.answer}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
