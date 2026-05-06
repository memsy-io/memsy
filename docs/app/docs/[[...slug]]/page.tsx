import { source } from '@/lib/docs-source'
import { notFound } from 'next/navigation'
import { DocsTOC } from '../../components/docs/docs-toc'
import { DocsPager } from '../../components/docs/docs-pager'
import { getMDXComponents } from '../../components/docs/mdx'
import { findNeighbour } from 'fumadocs-core/page-tree'
import type { Metadata } from 'next'
import type { Root, Node } from 'fumadocs-core/page-tree'
import { getSiteUrl } from '@/lib/theme-config'

interface PageProps {
  params: Promise<{ slug?: string[] }>
}

// Find the section separator that precedes this page in the tree
function findSectionName(tree: Root, pageUrl: string): string {
  let lastSeparator = 'Documentation'

  function traverse(nodes: Node[]): string | null {
    for (const node of nodes) {
      if (node.type === 'separator') {
        // node.name can be ReactNode, convert to string safely
        lastSeparator = typeof node.name === 'string' ? node.name : 'Documentation'
      } else if (node.type === 'page' && node.url === pageUrl) {
        return lastSeparator
      } else if (node.type === 'folder' && node.children) {
        const result = traverse(node.children)
        if (result) return result
      }
    }
    return null
  }

  return traverse(tree.children) || lastSeparator
}

export default async function DocsPage({ params }: PageProps) {
  const { slug } = await params
  const page = source.getPage(slug)

  if (!page) notFound()

  const MDXContent = page.data.body
  const toc = page.data.toc

  // Get prev/next navigation using fumadocs utility
  const tree = source.pageTree
  const neighbours = findNeighbour(tree, page.url)

  // Find section name for the header banner
  const sectionName = findSectionName(tree, page.url)

  return (
    <div className="flex gap-8">
      {/* Main content */}
      <article className="flex-1 min-w-0 max-w-3xl">
        {/* Header banner */}
        <header className="mb-8 pb-6 border-b border-border">
          <p className="text-sm text-[var(--accent)] font-medium mb-2">
            {sectionName}
          </p>
          <h1 className="text-3xl font-bold text-foreground">
            {page.data.title}
          </h1>
          {page.data.description && (
            <p className="mt-3 text-base text-muted-foreground">
              {page.data.description}
            </p>
          )}
        </header>

        {/* MDX content */}
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <MDXContent components={getMDXComponents()} />
        </div>

        <DocsPager
          previous={neighbours.previous ? {
            name: typeof neighbours.previous.name === 'string' ? neighbours.previous.name : 'Previous',
            url: neighbours.previous.url
          } : undefined}
          next={neighbours.next ? {
            name: typeof neighbours.next.name === 'string' ? neighbours.next.name : 'Next',
            url: neighbours.next.url
          } : undefined}
        />
      </article>

      {/* Table of contents */}
      <DocsTOC toc={toc} />
    </div>
  )
}

export async function generateStaticParams() {
  return source.generateParams()
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const page = source.getPage(slug)

  if (!page) return {}

  const tree = source.pageTree
  const section = findSectionName(tree, page.url)
  const title = page.data.title
  const description = page.data.description

  // Build OG image URL with query params
  // getSiteUrl() auto-detects Vercel deployments
  const baseUrl = getSiteUrl()
  const ogImageUrl = new URL(`${baseUrl}/api/og`)
  ogImageUrl.searchParams.set('title', title)
  ogImageUrl.searchParams.set('section', section)

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      url: `${baseUrl}${page.url}`,
      images: [
        {
          url: ogImageUrl.toString(),
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl.toString()],
    },
  }
}
