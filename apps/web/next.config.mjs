/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Linting is enforced by the dedicated `lint` turbo task / CI, not the build.
  eslint: {
    ignoreDuringBuilds: true,
  },
  transpilePackages: ['@growthos/shared'],
};

export default nextConfig;
