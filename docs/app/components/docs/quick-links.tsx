'use client'

import Link from 'next/link'
import { siteConfig } from '@/lib/theme-config'

interface QuickLinksProps {
  /** Mobile-tuned variants need bigger tap targets. */
  variant?: 'desktop' | 'mobile'
  /** Mobile sidebar wants to close the drawer when a link is tapped. */
  onNavigate?: () => void
}

const STYLE = {
  desktop: {
    item: 'flex items-center gap-3 py-1 text-sm transition-colors',
    active: 'text-[var(--accent)] font-medium hover:opacity-80 transition-opacity',
    muted: 'text-muted-foreground hover:text-foreground',
    iconWrap: 'flex items-center justify-center w-7 h-7 rounded-md',
    accentIconBg: 'bg-[var(--accent-muted)]',
    mutedIconBg: 'bg-gray-100 dark:bg-gray-800',
  },
  mobile: {
    item: 'flex items-center gap-3 py-2 px-2 text-sm rounded-md transition-colors min-h-[44px]',
    active: 'text-[var(--accent)] font-medium hover:bg-[var(--accent-muted)]',
    muted: 'text-muted-foreground hover:text-foreground hover:bg-muted',
    iconWrap: 'flex items-center justify-center w-7 h-7 rounded-md',
    accentIconBg: 'bg-[var(--accent-muted)]',
    mutedIconBg: 'bg-muted',
  },
} as const

export function QuickLinks({ variant = 'desktop', onNavigate }: QuickLinksProps) {
  const s = STYLE[variant]

  return (
    <ul className={variant === 'desktop' ? 'space-y-2' : 'space-y-1'}>
      <li>
        <Link href="/docs" onClick={onNavigate} className={`${s.item} ${s.active}`}>
          <span className={`${s.iconWrap} ${s.accentIconBg}`}>
            <svg
              aria-hidden="true"
              className="w-4 h-4 text-[var(--accent)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          </span>
          Documentation
        </Link>
      </li>

      {siteConfig.links.github && (
        <li>
          <a
            href={siteConfig.links.github}
            target="_blank"
            rel="noopener noreferrer"
            className={`${s.item} ${s.muted}`}
          >
            <span className={`${s.iconWrap} ${s.mutedIconBg}`}>
              <svg aria-hidden="true" className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
            GitHub
          </a>
        </li>
      )}

      {siteConfig.links.support && (
        <li>
          <a href={siteConfig.links.support} className={`${s.item} ${s.muted}`}>
            <span className={`${s.iconWrap} ${s.mutedIconBg}`}>
              <svg
                aria-hidden="true"
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </span>
            Support
          </a>
        </li>
      )}
    </ul>
  )
}
