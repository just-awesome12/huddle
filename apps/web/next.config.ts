import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Photo uploads travel through Server Actions as FormData
      // (Phase 5.3). The client compresses to ≤1MB before submit;
      // 4mb leaves headroom for FormData overhead and the other
      // fields without inviting huge bodies. Default is 1mb.
      bodySizeLimit: '4mb',
    },
  },
};

export default nextConfig;
