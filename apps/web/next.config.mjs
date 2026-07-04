/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Linting is enforced by the dedicated `lint` turbo task / CI, not the build.
  eslint: {
    ignoreDuringBuilds: true,
  },
  transpilePackages: ['@growthos/shared'],
  // @sentry/nextjs's server tracing pulls in OpenTelemetry instrumentation,
  // which uses require-in-the-middle's dynamic requires under the hood.
  // Webpack can't statically analyze those; this is a known, harmless warning.
  webpack: (config) => {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /require-in-the-middle/ },
    ];
    return config;
  },
};

export default nextConfig;
