import '@testing-library/jest-dom/vitest';
import { afterAll } from 'vitest';
import { deleteApp, getApps } from 'firebase/app';
import { getFirestore, terminate } from 'firebase/firestore';

afterAll(async () => {
  await Promise.all(
    getApps().map(async (app) => {
      await terminate(getFirestore(app)).catch(() => undefined);
      await deleteApp(app).catch(() => undefined);
    }),
  );
});
