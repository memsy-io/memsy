'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface CodeBlockProps {
  children: React.ReactNode
  title?: string
  className?: string
}

export function CodeBlock({ children, title, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const code = document.querySelector('.code-block-content')?.textContent
    if (code) {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className={cn('my-6 rounded-lg overflow-hidden border border-border', className)}>
      {title && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-border">
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
          <button
            onClick={handleCopy}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}
      <div className="code-block-content bg-[#fafafa] dark:bg-[#1a1a1f] overflow-x-auto">
        {children}
      </div>
    </div>
  )
}
