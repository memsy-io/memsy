'use client'

import { useState, useRef } from 'react'
import { cn } from '@/lib/utils'

interface PreProps extends React.HTMLAttributes<HTMLPreElement> {
  children: React.ReactNode
  'data-language'?: string
}

export function Pre({ children, className, 'data-language': language, ...props }: PreProps) {
  const [copied, setCopied] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)

  const handleCopy = async () => {
    const code = preRef.current?.textContent
    if (code) {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="group relative my-6">
      {/* Container with border and rounded corners */}
      <div className="relative rounded-lg border border-border bg-muted/30 dark:bg-[#0d0d0f] overflow-hidden">
        {/* Code content */}
        <pre
          ref={preRef}
          className={cn(
            'overflow-x-auto p-4 text-sm leading-relaxed',
            className
          )}
          {...props}
        >
          {children}
        </pre>

        {/* Copy button - positioned in top right */}
        <button
          onClick={handleCopy}
          className={cn(
            'absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all',
            'text-muted-foreground hover:text-foreground',
            'bg-background/80 hover:bg-background border border-border/50',
            'opacity-0 group-hover:opacity-100',
            copied && 'opacity-100 text-green-600 dark:text-green-400'
          )}
        >
          {copied ? (
            <>
              <CheckIcon className="w-3.5 h-3.5" />
              Copied
            </>
          ) : (
            <>
              <CopyIcon className="w-3.5 h-3.5" />
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}
