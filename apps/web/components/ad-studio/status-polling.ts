/**
 * Polls `refresh` every `intervalMs` after the previous call has finished - never two at once. A
 * fixed `setInterval` used to fire a new status call every 4 s even while the last one was still
 * running (the AI check inside it can take 15 s), so calls piled up by the dozen in production, ran
 * the same work in parallel and queued the clip players' own requests behind them. `onTick` runs
 * once a second (the elapsed-time clock). Returns the stop function.
 */
export function startStatusPolling(refresh: () => Promise<void>, intervalMs: number, onTick?: () => void): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const loop = (): void => {
    timer = setTimeout(() => {
      timer = null;
      void refresh()
        .catch(() => undefined)
        .finally(() => {
          if (!stopped) loop();
        });
    }, intervalMs);
  };
  loop();
  const tick = onTick ? setInterval(onTick, 1000) : null;
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (tick) clearInterval(tick);
  };
}
