// The local Firestore emulator's gRPC channel occasionally corrupts a
// freshly-opened watch stream (the same documented flake `packages/firebase-
// orm-models`'s and `apps/web`'s `vitest.config.ts` ride out via a 30s
// testTimeout + automatic retries) — surfaces as a bogus RESOURCE_EXHAUSTED
// error that can stall a request for tens of seconds while the SDK backs off
// and retries. This suite's e2e specs hit a real emulator the same way, so
// they need the same tolerance; unaffected tests never fail once, so this
// never masks a real assertion failure.
jest.retryTimes(3, { logErrorsBeforeRetry: true });
