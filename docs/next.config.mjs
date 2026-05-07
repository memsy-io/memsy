import { createMDX } from 'fumadocs-mdx/next'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    // Pin the workspace root to this site, since sibling package-lock.json files
    // elsewhere in the repo confuse Turbopack's auto-detection.
    root: import.meta.dirname,
  },
  async redirects() {
    return [
      { source: '/docs/memsy-client', destination: '/docs/reference/python/memsy-client', permanent: true },
      { source: '/docs/async-memsy-client', destination: '/docs/reference/python/async-memsy-client', permanent: true },
      { source: '/docs/control-client', destination: '/docs/reference/python/control-client', permanent: true },
      { source: '/docs/models', destination: '/docs/reference/python/models', permanent: true },
      { source: '/docs/exceptions', destination: '/docs/reference/python/exceptions', permanent: true },
    ]
  },
}

const withMDX = createMDX()

export default withMDX(nextConfig)
