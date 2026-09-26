import '@testing-library/jest-dom/vitest';

// jsdom has no layout engine. The chart (recharts) and flow-diagram (@xyflow/react) components
// measure their container through ResizeObserver and read transforms through DOMMatrixReadOnly;
// these no-op stand-ins let them mount in component tests (sizes read as 0, which the components
// handle), while real rendering is verified in a browser.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
if (typeof (globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly === 'undefined') {
  (globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly = class {
    m22 = 1;
    constructor(_transform?: string) {}
  };
}
