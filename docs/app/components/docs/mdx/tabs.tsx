'use client'

import { useState, createContext, useContext, Children, isValidElement, useId } from 'react'
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
}

export function Tabs({ children, defaultValue }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultValue || '')
  const tabsId = useId()

  // Extract tab titles and content from children
  const tabs: { title: string; content: React.ReactNode }[] = []
  Children.forEach(children, (child) => {
    if (isValidElement<TabProps>(child) && child.props.title) {
      tabs.push({
        title: child.props.title,
        content: child.props.children,
      })
    }
  })

  // Set default active tab if not set
  const currentActiveTab = activeTab || (tabs[0]?.title ?? '')

  return (
    <TabsContext.Provider value={{ activeTab: currentActiveTab, setActiveTab, tabsId }}>
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
                onClick={() => setActiveTab(tab.title)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') {
                    e.preventDefault()
                    const nextIndex = (index + 1) % tabs.length
                    setActiveTab(tabs[nextIndex].title)
                  } else if (e.key === 'ArrowLeft') {
                    e.preventDefault()
                    const prevIndex = (index - 1 + tabs.length) % tabs.length
                    setActiveTab(tabs[prevIndex].title)
                  }
                }}
                className={cn(
                  'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2',
                  isActive
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
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
export function Tab({ title, children }: TabProps) {
  // This component is used for data extraction only
  // Actual rendering happens in Tabs component
  return null
}
