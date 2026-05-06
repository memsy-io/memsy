import { createMDX } from 'fumadocs-mdx/next'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    // Pin the workspace root to this site, since sibling package-lock.json files
    // elsewhere in the repo confuse Turbopack's auto-detection.
    root: import.meta.dirname,
  },
}

const withMDX = createMDX()

export default withMDX(nextConfig)
