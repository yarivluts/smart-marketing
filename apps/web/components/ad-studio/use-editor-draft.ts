'use client';

import * as React from 'react';

/**
 * Keeps an editor's unsaved draft when the page refreshes underneath it.
 *
 * Every Ad Studio panel calls `router.refresh()` after it saves, so each editor keeps receiving its
 * server value as a new object even when nothing in it changed. Resetting the draft on every new
 * prop silently threw away unsaved edits. Now a server value is applied only when it differs from
 * what the editor last saved and the editor has no unsaved edits; otherwise the draft stays and
 * `serverChanged` says the saved version moved on, with `reload` to take it.
 */
export function useRefreshSafeDraft<T>(
  serverValue: T,
  state: { savedJson: string; dirty: boolean; reset: (value: T) => void },
): { serverChanged: boolean; reload: () => void } {
  const serverJson = JSON.stringify(serverValue);
  const latest = React.useRef(state);
  latest.current = state;
  const [serverChanged, setServerChanged] = React.useState(false);

  React.useEffect(() => {
    const { savedJson, dirty, reset } = latest.current;
    if (serverJson === savedJson) {
      setServerChanged(false);
      return;
    }
    if (dirty) {
      setServerChanged(true);
      return;
    }
    reset(JSON.parse(serverJson) as T);
    setServerChanged(false);
  }, [serverJson]);

  const reload = React.useCallback(() => {
    latest.current.reset(JSON.parse(serverJson) as T);
    setServerChanged(false);
  }, [serverJson]);

  return { serverChanged, reload };
}

// Every mounted editor with unsaved edits, and the warning to show, shared by one set of listeners.
const dirtyEditors = new Map<symbol, string>();

function anyDirtyMessage(): string | null {
  for (const message of dirtyEditors.values()) return message;
  return null;
}

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (dirtyEditors.size === 0) return;
  event.preventDefault();
  // Older browsers need a return value to show their (generic) prompt.
  event.returnValue = '';
}

/** In-app links navigate on the client, where beforeunload never fires: ask before following one. */
function onClickCapture(event: MouseEvent): void {
  const message = anyDirtyMessage();
  if (!message || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return;
  if (url.pathname === window.location.pathname && url.search === window.location.search) return;
  if (!window.confirm(message)) {
    event.preventDefault();
    event.stopPropagation();
  }
}

/**
 * While `dirty`, warns before the person leaves: closing or reloading the tab (the browser's own
 * prompt) and following any in-app link - the stepper, "next step", "back to ads" (`message`).
 */
export function useUnsavedChangesGuard(dirty: boolean, message: string): void {
  const id = React.useRef(Symbol('editor'));
  React.useEffect(() => {
    if (!dirty) return;
    const key = id.current;
    if (dirtyEditors.size === 0) {
      window.addEventListener('beforeunload', onBeforeUnload);
      document.addEventListener('click', onClickCapture, true);
    }
    dirtyEditors.set(key, message);
    return () => {
      dirtyEditors.delete(key);
      if (dirtyEditors.size === 0) {
        window.removeEventListener('beforeunload', onBeforeUnload);
        document.removeEventListener('click', onClickCapture, true);
      }
    };
  }, [dirty, message]);
}
