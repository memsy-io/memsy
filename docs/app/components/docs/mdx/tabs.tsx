'use client'

import {
  useState,
  useEffect,
  useMemo,
  createContext,
  Children,
  isValidElement,
  useId,
} from 'react'
import { cn } from '@/lib/utils'

interface TabsContextValue {
  activeTab: string
  setActiveTab: (tab: string) => void
  tabsId: string
}

const TabsContext = createContext<TabsContextValue | null>(null)

interface TabsProps {
  children: React.ReactNode
  defaultValue?: string
  /**
   * Override the auto-derived sync group. Tabs blocks with the same groupId
   * stay synchronized — selecting "Python" in one selects it in all of them
   * across the page (and persists across navigation via localStorage).
   *
   * If omitted, the group is derived from the sorted, lowercased tab titles —
   * so two `<Tabs>` blocks with items ["Python","Node","cURL"] auto-sync,
   * while a separate ["pip","uv","poetry","pipenv"] block stays independent.
   */
  groupId?: string
}

const STORAGE_PREFIX = 'memsy-docs:tabs:'
const SYNC_EVENT = 'memsy-docs:tabs:change'

interface SyncDetail {
  groupId: string
  value: string
}

export function Tabs({ children, defaultValue, groupId: explicitGroupId }: TabsProps) {
  const tabsId = useId()

  const tabs = useMemo(() => {
    const list: { title: string; content: React.ReactNode }[] = []
    Children.forEach(children, (child) => {
      if (isValidElement<TabProps>(child) && child.props.title) {
        list.push({ title: child.props.title, content: child.props.children })
      }
    })
    return list
  }, [children])

  const titleSet = useMemo(() => new Set(tabs.map((t) => t.title)), [tabs])

  const groupId = useMemo(() => {
    if (explicitGroupId) return explicitGroupId
    return tabs
      .map((t) => t.title.toLowerCase())
      .slice()
      .sort()
      .join('|')
  }, [explicitGroupId, tabs])

  const [activeTab, setActiveTabState] = useState(defaultValue || '')

  // Hydrate from localStorage on mount only — keeps server render and first
  // client render identical (avoids hydration mismatch); the post-mount effect
  // then swaps to the stored choice if present.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(STORAGE_PREFIX + groupId)
      if (stored && titleSet.has(stored)) setActiveTabState(stored)
    } catch {
      // localStorage may be blocked (Safari private mode, etc.) — ignore.
    }
  }, [groupId, titleSet])

  useEffect(() => {
    if (typeof window === 'undefined') return
    function onChange(e: Event) {
      const detail = (e as CustomEvent<SyncDetail>).detail
      if (!detail || detail.groupId !== groupId) return
      if (!titleSet.has(detail.value)) return
      setActiveTabState((prev) => (prev === detail.value ? prev : detail.value))
    }
    window.addEventListener(SYNC_EVENT, onChange)
    return () => window.removeEventListener(SYNC_EVENT, onChange)
  }, [groupId, titleSet])

  const currentActiveTab = activeTab || (tabs[0]?.title ?? '')

  // User-driven change: update local state, persist, and broadcast to peers.
  const selectTab = (title: string) => {
    setActiveTabState(title)
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STORAGE_PREFIX + groupId, title)
    } catch {
      /* ignore */
    }
    window.dispatchEvent(
      new CustomEvent<SyncDetail>(SYNC_EVENT, {
        detail: { groupId, value: title },
      }),
    )
  }

  return (
    <TabsContext.Provider value={{ activeTab: currentActiveTab, setActiveTab: selectTab, tabsId }}>
      <div className="my-6">
        {/* Tab list */}
        <div role="tablist" aria-label="Tabs" className="flex border-b border-border">
          {tabs.map((tab, index) => {
            const isActive = currentActiveTab === tab.title
            const tabId = `${tabsId}-tab-${index}`
            const panelId = `${tabsId}-panel-${index}`

            return (
              <button
                key={tab.title}
                role="tab"
                id={tabId}
                aria-selected={isActive}
                aria-controls={panelId}
                tabIndex={isActive ? 0 : -1}
                onClick={() => selectTab(tab.title)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') {
                    e.preventDefault()
                    const nextIndex = (index + 1) % tabs.length
                    selectTab(tabs[nextIndex].title)
                  } else if (e.key === 'ArrowLeft') {
                    e.preventDefault()
                    const prevIndex = (index - 1 + tabs.length) % tabs.length
                    selectTab(tabs[prevIndex].title)
                  }
                }}
                className={cn(
                  'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2',
                  isActive
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.title}
              </button>
            )
          })}
        </div>

        {/* Tab panels */}
        {tabs.map((tab, index) => {
          const isActive = currentActiveTab === tab.title
          const tabId = `${tabsId}-tab-${index}`
          const panelId = `${tabsId}-panel-${index}`

          return (
            <div
              key={tab.title}
              role="tabpanel"
              id={panelId}
              aria-labelledby={tabId}
              hidden={!isActive}
              tabIndex={0}
              className={cn('pt-4 [&>pre]:mt-0', !isActive && 'hidden')}
            >
              {tab.content}
            </div>
          )
        })}
      </div>
    </TabsContext.Provider>
  )
}

interface TabProps {
  title: string
  children: React.ReactNode
}

// Tab is now just a data container, rendering is handled by Tabs
export function Tab({ title: _title, children: _children }: TabProps) {
  // This component is used for data extraction only
  // Actual rendering happens in Tabs component
  return null
}
