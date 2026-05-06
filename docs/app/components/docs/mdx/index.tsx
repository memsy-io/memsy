import type { MDXComponents } from 'mdx/types'
import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'

// Component imports
import { Card, CardGroup } from './card'
import { Info, Tip, Warning, Note, Check } from './callout'
import { Steps, Step } from './steps'
import { Tabs, Tab } from './tabs'
import { Accordion, AccordionGroup } from './accordion'
import { CodeBlock } from './code-block'
import { Frame } from './frame'
import { YouTube } from './youtube'
import { Pre } from './pre'

// Re-export for direct imports
export { Card, CardGroup } from './card'
export { Info, Tip, Warning, Note, Check } from './callout'
export { Steps, Step } from './steps'
export { Tabs, Tab } from './tabs'
export { Accordion, AccordionGroup } from './accordion'
export { CodeBlock } from './code-block'
export { Frame } from './frame'
export { YouTube } from './youtube'
export { Pre } from './pre'

export function getMDXComponents(): MDXComponents {
  return {
    // Custom components
    Card,
    CardGroup,
    Info,
    Tip,
    Warning,
    Note,
    Check,
    Steps,
    Step,
    Tabs,
    Tab,
    Accordion,
    AccordionGroup,
    CodeBlock,
    Frame,
    YouTube,

    // HTML element overrides
    h1: ({ children, id }) => (
      <h1 id={id} className="scroll-m-20 text-4xl font-bold tracking-tight mt-8 mb-4 first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children, id }) => (
      <h2 id={id} className="scroll-m-20 text-2xl font-semibold tracking-tight mt-10 mb-4 pb-2 border-b border-border">
        <a href={`#${id}`} className="hover:underline">
          {children}
        </a>
      </h2>
    ),
    h3: ({ children, id }) => (
      <h3 id={id} className="scroll-m-20 text-xl font-semibold tracking-tight mt-8 mb-4">
        <a href={`#${id}`} className="hover:underline">
          {children}
        </a>
      </h3>
    ),
    h4: ({ children, id }) => (
      <h4 id={id} className="scroll-m-20 text-lg font-semibold tracking-tight mt-6 mb-4">
        {children}
      </h4>
    ),
    p: ({ children }) => (
      <p className="leading-7 text-muted-foreground [&:not(:first-child)]:mt-4">
        {children}
      </p>
    ),
    a: ({ href, children }) => {
      const isExternal = href?.startsWith('http')
      if (isExternal) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline"
          >
            {children}
          </a>
        )
      }
      return (
        <Link href={href || ''} className="text-[var(--accent)] hover:underline">
          {children}
        </Link>
      )
    },
    ul: ({ children }) => (
      <ul className="my-4 ml-6 list-disc text-muted-foreground [&>li]:mt-2">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="my-4 ml-6 list-decimal text-muted-foreground [&>li]:mt-2">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="leading-7">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="mt-6 border-l-4 border-border pl-4 italic text-muted-foreground">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-8 border-border" />,
    table: ({ children }) => (
      <div className="my-6 w-full overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-gray-50 dark:bg-gray-800">{children}</thead>
    ),
    tbody: ({ children }) => (
      <tbody className="divide-y divide-border">{children}</tbody>
    ),
    tr: ({ children }) => <tr>{children}</tr>,
    th: ({ children }) => (
      <th className="px-4 py-3 text-left font-semibold text-foreground border-b border-border">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-4 py-3 text-muted-foreground">{children}</td>
    ),
    pre: Pre,
    code: ({ children, className }) => {
      // Inline code (no className from syntax highlighter)
      if (!className) {
        return (
          <code className="px-1.5 py-0.5 mx-0.5 rounded-md bg-muted border border-border/50 text-sm font-mono text-foreground">
            {children}
          </code>
        )
      }
      // Code block (has className from syntax highlighter)
      return <code className={className}>{children}</code>
    },
    img: ({ src, alt, ...props }) => (
      <span className="block my-6">
        <Image
          src={src || ''}
          alt={alt || ''}
          width={800}
          height={400}
          className="rounded-lg max-w-full h-auto"
          {...props}
        />
      </span>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold text-foreground">{children}</strong>
    ),
    em: ({ children }) => <em className="italic">{children}</em>,
  }
}
