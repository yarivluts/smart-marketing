'use client';

import { useTranslations, useLocale } from 'next-intl';

const FALLBACK_EN: Record<string, string> = {
  openGuideTooltip: 'Page Guide & Marketing Terms',
  modalBadge: 'Growth Guide for Beginners',
  tabOverview: 'Overview & Concept',
  tabTerms: 'Key Terms & Glossary',
  tabTheory: 'Marketing Theory',
  tabActions: 'How to Use & Playbook',
  whatItIsHeading: 'What is this page?',
  whyYouCareHeading: 'Why should you care?',
  summaryHeading: 'Plain Language Summary',
  termsHeading: 'Essential Marketing Terms Made Simple',
  termAnalogy: 'Simple Analogy',
  termWhyMatters: 'Why it matters',
  termFormula: 'Formula / Example',
  theoryHeading: 'Growth Economics & Underlying Theory',
  coreConceptLabel: 'Core Concept',
  principlesLabel: 'Economic Principles',
  pitfallsLabel: 'Common Mistakes to Avoid',
  benchmarkLabel: 'Typical Industry Benchmark',
  actionsHeading: 'Actionable Step-by-Step Playbook',
  dailyRoutineLabel: 'What to Check',
  redFlagsLabel: 'Warning Signs & Red Flags',
  recommendedActionsLabel: 'Recommended Actions',
  askCopilot: 'Ask AI Copilot about this page',
  close: 'Close guide',
  searchTermsPlaceholder: 'Search marketing terms on this page...',
  noTermsFound: 'No matching terms found.',
  pageNotRegistered: 'Guide is being prepared for this screen.',
  generalHelp: 'General Platform Guide',
};

export function useSafeGuideIntl(): {
  t: (key: string) => string;
  locale: 'en' | 'he';
} {
  let locale: 'en' | 'he' = 'en';
  let t = (key: string): string => FALLBACK_EN[key] || key;

  try {
    const nextLocale = useLocale();
    if (nextLocale === 'he' || nextLocale === 'en') {
      locale = nextLocale;
    }
  } catch {
    // Context not present (e.g. non-i18n unit test harness)
  }

  try {
    const nextT = useTranslations('PageGuides');
    t = (key: string) => {
      try {
        return nextT(key);
      } catch {
        return FALLBACK_EN[key] || key;
      }
    };
  } catch {
    // Context not present (e.g. non-i18n unit test harness)
  }

  return { t, locale };
}
