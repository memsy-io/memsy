'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { TOCItemType } from 'fumadocs-core/toc'

interface DocsTOCProps {
  toc: TOCItemType[]
}

export function DocsTOC({ toc }: DocsTOCProps) {
  const [activeId, setActiveId] = useState<string>('')

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      { rootMargin: '-100px 0px -66%' }
    )

    const headings = document.querySelectorAll('h2, h3')
    headings.forEach((heading) => observer.observe(heading))

    return () => {
      headings.forEach((heading) => observer.unobserve(heading))
    }
  }, [])

  if (!toc || toc.length === 0) return null

  return (
    <aside className="hidden xl:block w-56 shrink-0">
      <nav className="sticky top-36 max-h-[calc(100vh-10rem)] overflow-y-auto">
        <p className="text-sm font-semibold text-foreground mb-4">On this page</p>
        <ul className="space-y-2 text-sm">
          {toc.map((item) => (
            <li key={item.url}>
              <a
                href={item.url}
                className={cn(
                  'block py-1 transition-colors',
                  item.depth === 3 && 'pl-4',
                  activeId === item.url.slice(1)
                    ? 'text-[var(--accent)] font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
