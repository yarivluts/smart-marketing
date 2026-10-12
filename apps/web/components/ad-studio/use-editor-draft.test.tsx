import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook } from '@testing-library/react';
import React from 'react';
import { useRefreshSafeDraft, useUnsavedChangesGuard } from './use-editor-draft';

type Scene = { id: string; text: string };

/** A tiny editor: a draft, the last saved value, and the hook between them and the server value. */
function useEditor(server: Scene[]) {
  const [draft, setDraft] = React.useState(server);
  const [savedJson, setSavedJson] = React.useState(JSON.stringify(server));
  const dirty = JSON.stringify(draft) !== savedJson;
  const sync = useRefreshSafeDraft(server, {
    savedJson,
    dirty,
    reset: (value) => {
      setDraft(value);
      setSavedJson(JSON.stringify(value));
    },
  });
  return { draft, setDraft, dirty, ...sync };
}

describe('useRefreshSafeDraft', () => {
  it('keeps unsaved edits when a refresh sends the same server value as a new array', () => {
    const { result, rerender } = renderHook(({ server }) => useEditor(server), { initialProps: { server: [{ id: 'a', text: 'saved' }] } });
    act(() => result.current.setDraft([{ id: 'a', text: 'my edit' }]));
    rerender({ server: [{ id: 'a', text: 'saved' }] });
    expect(result.current.draft).toEqual([{ id: 'a', text: 'my edit' }]);
    expect(result.current.serverChanged).toBe(false);
  });

  it('takes a new server value when there is nothing unsaved', () => {
    const { result, rerender } = renderHook(({ server }) => useEditor(server), { initialProps: { server: [{ id: 'a', text: 'v1' }] } });
    rerender({ server: [{ id: 'a', text: 'v2' }] });
    expect(result.current.draft).toEqual([{ id: 'a', text: 'v2' }]);
    expect(result.current.dirty).toBe(false);
  });

  it('keeps the draft and flags the change when the server moved on under unsaved edits; reload takes it', () => {
    const { result, rerender } = renderHook(({ server }) => useEditor(server), { initialProps: { server: [{ id: 'a', text: 'v1' }] } });
    act(() => result.current.setDraft([{ id: 'a', text: 'my edit' }]));
    rerender({ server: [{ id: 'a', text: 'v2 from autopilot' }] });
    expect(result.current.draft).toEqual([{ id: 'a', text: 'my edit' }]);
    expect(result.current.serverChanged).toBe(true);
    act(() => result.current.reload());
    expect(result.current.draft).toEqual([{ id: 'a', text: 'v2 from autopilot' }]);
    expect(result.current.serverChanged).toBe(false);
    expect(result.current.dirty).toBe(false);
  });
});

function Guarded({ dirty }: { dirty: boolean }): React.ReactElement {
  useUnsavedChangesGuard(dirty, 'Leave without saving?');
  return (
    <div>
      <a href="/en/orgs/o/projects/p/ad-studio?brief=b&step=create">Next step</a>
      <a href="https://example.com/docs">Docs</a>
      <a href="#scene-2">Scene 2</a>
    </div>
  );
}

describe('useUnsavedChangesGuard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('asks before following an in-app link while dirty, and blocks it when the person stays', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { getByText } = render(<Guarded dirty />);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    getByText('Next step').dispatchEvent(click);
    expect(confirm).toHaveBeenCalledWith('Leave without saving?');
    expect(click.defaultPrevented).toBe(true);
  });

  it('lets the link through when the person confirms, and ignores other sites and in-page anchors', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { getByText } = render(<Guarded dirty />);
    const next = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    getByText('Next step').dispatchEvent(next);
    expect(next.defaultPrevented).toBe(false);
    confirm.mockClear();
    fireEvent.click(getByText('Docs'));
    fireEvent.click(getByText('Scene 2'));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('does nothing when clean, and stops guarding once the editor unmounts', () => {
    const confirm = vi.spyOn(window, 'confirm');
    const clean = render(<Guarded dirty={false} />);
    fireEvent.click(clean.getByText('Next step'));
    expect(confirm).not.toHaveBeenCalled();
    clean.unmount();
    const dirty = render(<Guarded dirty />);
    dirty.unmount();
    const after = render(<Guarded dirty={false} />);
    fireEvent.click(after.getByText('Next step'));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks the browser to confirm closing the tab while dirty', () => {
    render(<Guarded dirty />);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
