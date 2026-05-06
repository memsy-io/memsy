'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  DOCS_TABS,
  type DocsTabId,
  activeTabForPath,
  classifyTree,
} from '@/lib/docs-tabs'
import type { Root } from 'fumadocs-core/page-tree'
import { useMemo } from 'react'
import { BookOpen, Code } from 'lucide-react'

interface DocsTabsProps {
  tree: Root
}

const TAB_ICONS: Record<DocsTabId, typeof BookOpen> = {
  guides: BookOpen,
  api: Code,
}

export function DocsTabs({ tree }: DocsTabsProps) {
  const pathname = usePathname()
  const classification = useMemo(() => classifyTree(tree), [tree])
  const active = activeTabForPath(classification, pathname)

  return (
    <nav
      className="border-b border-border bg-background"
      aria-label="Documentation sections"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ul className="flex gap-1 -mb-px">
          {DOCS_TABS.map((tab) => {
            const Icon = TAB_ICONS[tab.id]
            const isActive = active === tab.id
            return (
              <li key={tab.id}>
                <Link
                  href={tab.defaultUrl}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                    isActive
                      ? 'border-[var(--accent)] text-[var(--accent)]'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                  )}
                >
                  <Icon aria-hidden="true" className="w-4 h-4" />
                  {tab.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}
