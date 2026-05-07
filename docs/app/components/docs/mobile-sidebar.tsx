'use client'

import { useEffect, useMemo, useRef, useCallback, TouchEvent, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { siteConfig } from '@/lib/theme-config'
import { getPageIcon, getSectionIcon } from '@/lib/page-icons'
import {
  DOCS_TABS,
  activeTabForPath,
  classifyTree,
  filterTreeByTab,
  type DocsTabId,
} from '@/lib/docs-tabs'
import { BookOpen, Code } from 'lucide-react'
import type { Root, Node } from 'fumadocs-core/page-tree'

const MOBILE_TAB_ICONS: Record<DocsTabId, typeof BookOpen> = {
  guides: BookOpen,
  api: Code,
}

interface MobileSidebarProps {
  tree: Root
  isOpen: boolean
  onClose: () => void
}

/**
 * Mobile sidebar with slide-in drawer animation
 * - Swipe right to close
 * - Tap backdrop to close
 * - Escape key to close
 * - Auto-close on navigation
 */
export function MobileSidebar({ tree, isOpen, onClose }: MobileSidebarProps) {
  const pathname = usePathname()
  const panelRef = useRef<HTMLDivElement>(null)
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null)
  const touchMove = useRef<{ x: number; y: number } | null>(null)

  const classification = useMemo(() => classifyTree(tree), [tree])
  const activeTab = activeTabForPath(classification, pathname)
  const visibleNodes = useMemo(
    () => filterTreeByTab(tree, activeTab),
    [tree, activeTab],
  )

  // Close on route change
  useEffect(() => {
    onClose()
  }, [pathname, onClose])

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Swipe handlers
  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0]
    touchStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    }
    touchMove.current = null
  }, [])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const touch = e.touches[0]
    touchMove.current = {
      x: touch.clientX,
      y: touch.clientY,
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (!touchStart.current || !touchMove.current) return

    const deltaX = touchMove.current.x - touchStart.current.x
    const deltaY = touchMove.current.y - touchStart.current.y
    const timeElapsed = Date.now() - touchStart.current.time

    // Calculate velocity
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
    const velocity = distance / timeElapsed

    // Swipe left to close (when panel is on left side)
    const threshold = 50
    const velocityThreshold = 0.3

    if (
      Math.abs(deltaX) > Math.abs(deltaY) && // Horizontal swipe
      deltaX < -threshold && // Swiping left
      velocity > velocityThreshold
    ) {
      onClose()
    }

    touchStart.current = null
    touchMove.current = null
  }, [onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 lg:hidden',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sliding panel */}
      <div
        ref={panelRef}
        className={cn(
          'fixed top-0 left-0 bottom-0 w-80 max-w-[85vw] bg-background border-r border-border z-50 transform transition-transform duration-300 ease-out lg:hidden',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-border">
          <Link href="/" className="font-semibold text-lg" onClick={onClose}>
            {siteConfig.name}
          </Link>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close menu"
          >
            <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="h-[calc(100%-4rem)] overflow-y-auto p-4">
          {/* Section tabs */}
          <div className="mb-4 flex gap-1 border-b border-border -mx-1 px-1">
            {DOCS_TABS.map((tab) => {
              const Icon = MOBILE_TAB_ICONS[tab.id]
              const isActive = activeTab === tab.id
              return (
                <Link
                  key={tab.id}
                  href={tab.defaultUrl}
                  onClick={onClose}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                    isActive
                      ? 'border-[var(--accent)] text-[var(--accent)]'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon aria-hidden="true" className="w-4 h-4" />
                  {tab.label}
                </Link>
              )
            })}
          </div>

          {/* Page tree navigation */}
          <MobileSidebarNodes nodes={visibleNodes} pathname={pathname} onNavigate={onClose} />

          {/* Quick links — pinned to the bottom */}
          <div className="mt-8 pt-5 border-t border-border">
            <ul className="space-y-1">
              <li>
                <Link
                  href="/docs"
                  onClick={onClose}
                  className="flex items-center gap-3 py-2 px-2 text-sm text-[var(--accent)] font-medium hover:bg-[var(--accent-muted)] rounded-md transition-colors min-h-[44px]"
                >
                  <span className="flex items-center justify-center w-7 h-7 rounded-md bg-[var(--accent-muted)]">
                    <svg aria-hidden="true" className="w-4 h-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
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
                    className="flex items-center gap-3 py-2 px-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors min-h-[44px]"
                  >
                    <span className="flex items-center justify-center w-7 h-7 rounded-md bg-muted">
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
                    className="flex items-center gap-3 py-2 px-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors min-h-[44px]"
                  >
                    <span className="flex items-center justify-center w-7 h-7 rounded-md bg-muted">
                      <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </span>
                    Support
                  </a>
                </li>
              )}
            </ul>
          </div>
        </nav>
      </div>
    </>
  )
}

interface MobileSidebarNodesProps {
  nodes: Node[]
  pathname: string
  onNavigate: () => void
}

function MobileSidebarNodes({ nodes, pathname, onNavigate }: MobileSidebarNodesProps) {
  return (
    <div className="space-y-1">
      {nodes.map((node, index) => (
        <MobileSidebarNode key={index} node={node} pathname={pathname} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

interface MobileSidebarNodeProps {
  node: Node
  pathname: string
  onNavigate: () => void
}

function MobileSidebarNode({ node, pathname, onNavigate }: MobileSidebarNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  if (node.type === 'separator') {
    const name = typeof node.name === 'string' ? node.name : ''
    const SectionIcon = getSectionIcon(name)
    return (
      <div className="pt-4 first:pt-0">
        <h5 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1.5 px-2">
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
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          className="flex items-center justify-between w-full py-2 px-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-inset"
        >
          <span>{node.name}</span>
          <svg
            aria-hidden="true"
            className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-90')}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        {isExpanded && node.children && (
          <ul className="ml-3 mt-1 space-y-0.5 border-l border-border pl-3">
            {node.children.map((child, index) => (
              <MobileSidebarNode key={index} node={child} pathname={pathname} onNavigate={onNavigate} />
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
        onClick={onNavigate}
        className={cn(
          'flex items-center gap-3 py-2 px-2 text-sm transition-colors rounded-md min-h-[44px]',
          isActive
            ? 'text-[var(--accent)] font-medium bg-[var(--accent-muted)]'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted',
        )}
      >
        <PageIcon
          aria-hidden="true"
          className={cn(
            'w-4 h-4 shrink-0',
            isActive ? 'text-[var(--accent)]' : 'text-muted-foreground',
          )}
        />
        <span>{node.name}</span>
      </Link>
    </li>
  )
}
