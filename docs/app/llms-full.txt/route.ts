import { source } from '@/lib/docs-source'
import { siteConfig, getSiteUrl } from '@/lib/theme-config'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-static'

// Strip MDX/JSX components and frontmatter for plain text
function stripMdxContent(content: string): string {
  return content
    // Remove frontmatter
    .replace(/^---[\s\S]*?---\n*/m, '')
    // Remove import statements
    .replace(/^import\s+.*$/gm, '')
    // Remove JSX components (self-closing and block)
    .replace(/<[A-Z][a-zA-Z]*[^>]*\/>/g, '')
    .replace(/<[A-Z][a-zA-Z]*[^>]*>[\s\S]*?<\/[A-Z][a-zA-Z]*>/g, '')
    // Remove remaining JSX tags but keep content
    .replace(/<\/?[A-Z][a-zA-Z]*[^>]*>/g, '')
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function GET() {
  const baseUrl = getSiteUrl()
  const pages = source.getPages()
  const contentDir = path.join(process.cwd(), 'content', 'docs')

  // Build llms-full.txt following llmstxt.org format
  let content = `# ${siteConfig.name}

> ${siteConfig.description}

This document contains the full content of all documentation pages for AI consumption.

---

`

  // Add full content of each documentation page
  for (const page of pages) {
    const title = page.data.title
    const description = page.data.description || ''
    const url = `${baseUrl}${page.url}`

    content += `## ${title}\n\n`
    content += `**URL:** ${url}\n`
    if (description) {
      content += `**Description:** ${description}\n`
    }
    content += `\n`

    // Try to read the raw MDX content
    // Page slugs map to file paths: /docs/foo/bar -> content/docs/foo/bar.mdx
    const slugPath = page.slugs.join('/')
    const mdxPath = slugPath
      ? path.join(contentDir, `${slugPath}.mdx`)
      : path.join(contentDir, 'index.mdx')

    try {
      if (fs.existsSync(mdxPath)) {
        const rawContent = fs.readFileSync(mdxPath, 'utf-8')
        const cleanedContent = stripMdxContent(rawContent)
        content += cleanedContent
      }
    } catch {
      // Skip if file can't be read
    }

    content += `\n\n---\n\n`
  }

  // Add links section if configured
  const hasLinks = siteConfig.links.github || siteConfig.links.discord || siteConfig.links.support
  if (hasLinks) {
    content += `## Links

`
    if (siteConfig.links.github) {
      content += `- [GitHub](${siteConfig.links.github})\n`
    }
    if (siteConfig.links.discord) {
      content += `- [Discord](${siteConfig.links.discord})\n`
    }
    if (siteConfig.links.support) {
      content += `- [Support](${siteConfig.links.support})\n`
    }
  }

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  })
}
