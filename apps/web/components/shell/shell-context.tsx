'use client';

import * as React from 'react';
import { DEFAULT_FAVORITE_ITEM_IDS } from '@/config/nav-config';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'growthos_sidebar_collapsed';
const PINNED_ITEMS_STORAGE_KEY = 'growthos_pinned_nav_items';

export interface ShellContextValue {
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  setCollapsed: (collapsed: boolean) => void;
  pinnedItemIds: string[];
  togglePin: (itemId: string) => void;
  isPinned: (itemId: string) => boolean;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

const ShellContext = React.createContext<ShellContextValue | null>(null);

export interface ShellProviderProps {
  children: React.ReactNode;
  defaultCollapsed?: boolean;
  initialPinnedItemIds?: string[];
  initialMobileMenuOpen?: boolean;
}

export function ShellProvider({
  children,
  defaultCollapsed = false,
  initialPinnedItemIds = DEFAULT_FAVORITE_ITEM_IDS,
  initialMobileMenuOpen = false,
}: ShellProviderProps): React.ReactElement {
  const [isCollapsed, setIsCollapsedState] = React.useState<boolean>(defaultCollapsed);
  const [pinnedItemIds, setPinnedItemIds] = React.useState<string[]>(initialPinnedItemIds);
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState<boolean>(initialMobileMenuOpen);

  // Initialize from localStorage on mount
  React.useEffect(() => {
    try {
      const savedCollapsed = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
      if (savedCollapsed !== null) {
        setIsCollapsedState(savedCollapsed === 'true');
      }

      const savedPinned = window.localStorage.getItem(PINNED_ITEMS_STORAGE_KEY);
      if (savedPinned) {
        const parsed = JSON.parse(savedPinned);
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
          setPinnedItemIds(parsed);
        }
      }
    } catch {
      // Ignore localStorage errors (SSR / privacy mode / disabled storage)
    }
  }, []);

  const setCollapsed = React.useCallback((collapsed: boolean) => {
    setIsCollapsedState(collapsed);
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
    } catch {
      // Ignore localStorage error
    }
  }, []);

  const toggleCollapsed = React.useCallback(() => {
    setIsCollapsedState((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        // Ignore localStorage error
      }
      return next;
    });
  }, []);

  const togglePin = React.useCallback((itemId: string) => {
    setPinnedItemIds((prev) => {
      const next = prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId];
      try {
        window.localStorage.setItem(PINNED_ITEMS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore localStorage error
      }
      return next;
    });
  }, []);

  const isPinned = React.useCallback(
    (itemId: string) => pinnedItemIds.includes(itemId),
    [pinnedItemIds],
  );

  const value = React.useMemo<ShellContextValue>(
    () => ({
      isCollapsed,
      toggleCollapsed,
      setCollapsed,
      pinnedItemIds,
      togglePin,
      isPinned,
      commandPaletteOpen,
      setCommandPaletteOpen,
      mobileMenuOpen,
      setMobileMenuOpen,
    }),
    [
      isCollapsed,
      toggleCollapsed,
      setCollapsed,
      pinnedItemIds,
      togglePin,
      isPinned,
      commandPaletteOpen,
      mobileMenuOpen,
    ],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
  const context = React.useContext(ShellContext);
  if (!context) {
    throw new Error('useShell must be used within a ShellProvider');
  }
  return context;
}
