import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createNextIntlPlugin from 'next-intl/plugin';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for containerized (Cloud Run) deploys.
  output: 'standalone',
  // Trace files from the monorepo root so workspace deps are included.
  outputFileTracingRoot: path.join(dirname, '../../'),
  // Linting is enforced by the dedicated `lint` turbo task / CI, not the build.
  eslint: {
    ignoreDuringBuilds: true,
  },
  transpilePackages: ['@growthos/shared'],
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
