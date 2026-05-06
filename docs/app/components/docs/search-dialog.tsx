'use client'

import { useDocsSearch } from 'fumadocs-core/search/client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

export function SearchTrigger() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(true)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          'flex items-center gap-3 px-4 py-2.5 rounded-lg w-full max-w-md',
          'bg-muted/50 border border-border/50',
          'text-sm text-muted-foreground hover:text-foreground hover:bg-muted hover:border-border',
          'transition-all'
        )}
      >
        <SearchIcon className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left">Search documentation...</span>
        <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded bg-background/80 text-xs font-mono text-muted-foreground/60 border border-border/40">
          <span>⌘</span>K
        </kbd>
      </button>

      {mounted && open && createPortal(
        <SearchDialog onClose={() => setOpen(false)} />,
        document.body
      )}
    </>
  )
}

interface SearchDialogProps {
  onClose: () => void
}

// Highlight matching text in a string
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) {
    return <>{text}</>
  }

  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-800/50 text-inherit rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

function SearchDialog({ onClose }: SearchDialogProps) {
  const router = useRouter()
  const { search, setSearch, query } = useDocsSearch({ type: 'fetch' })
  const [selectedIndex, setSelectedIndex] = useState(0)
  const resultsRef = useRef<HTMLUListElement>(null)

  const results = query.data && query.data !== 'empty' ? query.data : []

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [results])

  const handleSelect = useCallback(
    (url: string) => {
      router.push(url)
      onClose()
    },
    [router, onClose]
  )

  // Keyboard navigation
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }

      if (results.length === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % results.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + results.length) % results.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (results[selectedIndex]) {
          handleSelect(results[selectedIndex].url)
        }
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [onClose, results, selectedIndex, handleSelect])

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current) {
      const selectedItem = resultsRef.current.children[selectedIndex] as HTMLElement
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, paddingTop: '10%' }}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 dark:bg-black/70"
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        className="relative w-full max-w-2xl mx-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-dialog-title"
      >
        <div className="bg-background border border-border rounded-xl shadow-2xl overflow-hidden">
          <h2 id="search-dialog-title" className="sr-only">Search documentation</h2>
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 border-b border-border">
            <SearchIcon className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" />
            <input
              type="text"
              aria-label="Search documentation"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 py-4 bg-transparent text-foreground placeholder:text-muted-foreground text-base border-none outline-none focus:outline-none focus:ring-0 focus:border-none"
              style={{ outline: 'none', boxShadow: 'none' }}
              autoFocus
            />
            <kbd className="px-2 py-1 rounded bg-muted text-xs text-muted-foreground font-mono border border-border">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto">
            {search.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <p>Start typing to search...</p>
              </div>
            ) : query.isLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                <p>Searching...</p>
              </div>
            ) : results.length > 0 ? (
              <ul ref={resultsRef} role="listbox" aria-label="Search results" className="py-2">
                {results.map((result, index) => {
                  // Build breadcrumb path
                  const breadcrumbPath = result.breadcrumbs && result.breadcrumbs.length > 0
                    ? `Documentation > ${result.breadcrumbs.join(' > ')}`
                    : 'Documentation'

                  return (
                    <li key={result.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(result.url)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        role="option"
                        aria-selected={selectedIndex === index}
                        className={cn(
                          'w-full px-4 py-3 text-left transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]',
                          selectedIndex === index
                            ? 'bg-gray-100 dark:bg-gray-800'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                        )}
                      >
                        {/* Title */}
                        <div className="font-semibold text-foreground">
                          <HighlightedText text={result.content} query={search} />
                        </div>
                        {/* Breadcrumb path */}
                        <div className="text-sm text-muted-foreground mt-0.5">
                          {breadcrumbPath}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                <p>No results found for &quot;{search}&quot;</p>
              </div>
            )}
          </div>

          {/* Footer with keyboard hints */}
          {results.length > 0 && (
            <div className="flex items-center gap-4 px-4 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono">↑</kbd>
                <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono">↓</kbd>
                <span className="ml-1">to navigate</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono">↵</kbd>
                <span className="ml-1">to select</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono">esc</kbd>
                <span className="ml-1">to close</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  )
}
