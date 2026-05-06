'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { siteConfig } from '@/lib/theme-config'
import { getPageIcon, getSectionIcon } from '@/lib/page-icons'
import {
  activeTabForPath,
  classifyTree,
  filterTreeByTab,
} from '@/lib/docs-tabs'
import type { Node, Root } from 'fumadocs-core/page-tree'

interface DocsSidebarProps {
  tree: Root
}

export function DocsSidebar({ tree }: DocsSidebarProps) {
  const pathname = usePathname()
  const classification = useMemo(() => classifyTree(tree), [tree])
  const activeTab = activeTabForPath(classification, pathname)
  const visibleNodes = useMemo(
    () => filterTreeByTab(tree, activeTab),
    [tree, activeTab],
  )

  return (
    <aside className="hidden lg:block w-64 shrink-0">
      <nav className="sticky top-36 max-h-[calc(100vh-10rem)] overflow-y-auto pb-10 pr-4">
        {/* Quick links */}
        <div className="mb-6 pb-5 border-b border-border">
          <ul className="space-y-2">
            <li>
              <Link
                href="/docs"
                className="flex items-center gap-3 py-1 text-sm text-[var(--accent)] font-medium hover:opacity-80 transition-opacity"
              >
                <span className="flex items-center justify-center w-7 h-7 rounded-md bg-[var(--accent-muted)]">
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
                  className="flex items-center gap-3 py-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="flex items-center justify-center w-7 h-7 rounded-md bg-gray-100 dark:bg-gray-800">
                    <svg aria-hidden="true" className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                    </svg>
                  </span>
                  GitHub
                </a>
              </li>
            )}
            {siteConfig.links.support && (
              <li>
                <a
                  href={siteConfig.links.support}
                  className="flex items-center gap-3 py-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="flex items-center justify-center w-7 h-7 rounded-md bg-gray-100 dark:bg-gray-800">
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
        </div>

        <SidebarNodes nodes={visibleNodes} pathname={pathname} level={0} />
      </nav>
    </aside>
  )
}

interface SidebarNodesProps {
  nodes: Node[]
  pathname: string
  level: number
}

function SidebarNodes({ nodes, pathname, level }: SidebarNodesProps) {
  return (
    <div className="space-y-1">
      {nodes.map((node, index) => (
        <SidebarNode key={index} node={node} pathname={pathname} level={level} />
      ))}
    </div>
  )
}

interface SidebarNodeProps {
  node: Node
  pathname: string
  level: number
}

function SidebarNode({ node, pathname, level }: SidebarNodeProps) {
  if (node.type === 'separator') {
    const name = typeof node.name === 'string' ? node.name : ''
    const SectionIcon = getSectionIcon(name)
    return (
      <div className="pt-4 first:pt-0">
        <h5 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1.5">
          {SectionIcon ? (
            <SectionIcon
              aria-hidden="true"
              className="w-3.5 h-3.5 text-muted-foreground"
            />
          ) : null}
          {node.name}
        </h5>
      </div>
    )
  }

  if (node.type === 'folder') {
    return (
      <div>
        <span className="block py-1 text-sm font-medium text-muted-foreground">
          {node.name}
        </span>
        {node.children && (
          <ul className="ml-3 mt-1 space-y-0.5 border-l border-border pl-3">
            {node.children.map((child, index) => (
              <SidebarNode key={index} node={child} pathname={pathname} level={level + 1} />
            ))}
          </ul>
        )}
      </div>
    )
  }

  const isActive = pathname === node.url
  const PageIcon = getPageIcon(node.url)

  return (
    <li className="list-none">
      <Link
        href={node.url}
        className={cn(
          'flex items-center gap-2 py-1 px-2 text-sm transition-colors rounded-md',
          isActive
            ? 'text-[var(--accent)] font-medium bg-[var(--accent-muted)]'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <PageIcon
          aria-hidden="true"
          className={cn(
            'w-3.5 h-3.5 shrink-0',
            isActive ? 'text-[var(--accent)]' : 'text-muted-foreground',
          )}
        />
        <span>{node.name}</span>
      </Link>
    </li>
  )
}
