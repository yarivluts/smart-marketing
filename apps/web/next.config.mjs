import createNextIntlPlugin from 'next-intl/plugin';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Linting is enforced by the dedicated `lint` turbo task / CI, not the build.
  eslint: {
    ignoreDuringBuilds: true,
  },
  transpilePackages: ['@growthos/shared'],
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
