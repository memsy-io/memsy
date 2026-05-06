/**
 * Memsy Python SDK — Unmint theme configuration.
 */

export const siteConfig = {
  name: 'Memsy Python SDK',
  description:
    'Official Python SDK for Memsy — persistent memory for AI agents and applications.',
  url: 'https://docs.memsy.io',

  logo: {
    srcLight: '/logo_light.jpeg',
    srcDark: '/logo_dark.jpeg',
    alt: 'Memsy',
    width: 32,
    height: 32,
  },

  links: {
    // TODO: replace <ORG> once the public GitHub repo is live.
    github: 'https://github.com/memsy-io/python-sdk',
    discord: '',
    twitter: '',
    support: 'mailto:cloudops@memsy.io',
  },

  footer: {
    copyright: `© ${new Date().getFullYear()} Memsy. All rights reserved.`,
    links: [
      { label: 'Sign In', href: 'https://app.memsy.io' },
      { label: 'PyPI', href: 'https://pypi.org/project/memsy/' },
      // TODO: replace <ORG>.
      { label: 'GitHub', href: 'https://github.com/memsy-io/python-sdk' },
    ],
  },
}

export const themeConfig = {
  colors: {
    light: {
      accent: '#ff3d7f',
      accentForeground: '#ffffff',
      accentMuted: 'rgba(255, 61, 127, 0.1)',
    },
    dark: {
      accent: '#ff3d7f',
      accentForeground: '#ffffff',
      accentMuted: 'rgba(255, 61, 127, 0.08)',
    },
  },

  codeBlock: {
    light: {
      background: '#fafafa',
      titleBar: '#f3f3f4',
    },
    dark: {
      background: '#0e0e10',
      titleBar: '#141416',
    },
  },

  ogImage: {
    gradient: 'linear-gradient(135deg, #050506 0%, #1c1c1f 50%, #ff3d7f 100%)',
    titleColor: '#ffffff',
    sectionColor: '#ff3d7f',
    // TODO: replace with the real absolute logo URL once deployed.
    logoUrl: 'https://docs.memsy.io/logo_dark.jpeg',
  },
}

export function getCSSVariables(mode: 'light' | 'dark') {
  const colors = themeConfig.colors[mode]
  return {
    '--accent': colors.accent,
    '--accent-foreground': colors.accentForeground,
    '--accent-muted': colors.accentMuted,
  }
}

export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return siteConfig.url
}
