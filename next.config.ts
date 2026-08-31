import type { NextConfig } from 'next';

const isGitHubPages = process.env.GITHUB_PAGES === 'true';

const nextConfig: NextConfig = isGitHubPages
  ? {
      output: 'export',
      basePath: '/hvac-pro-calculator',
      assetPrefix: '/hvac-pro-calculator',
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;
