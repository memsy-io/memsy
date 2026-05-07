'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { getPageIcon, getSectionIcon } from '@/lib/page-icons'
import { QuickLinks } from './quick-links'
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
        <SidebarNodes nodes={visibleNodes} pathname={pathname} level={0} />

        <div className="mt-8 pt-5 border-t border-border">
          <QuickLinks variant="desktop" />
        </div>
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
