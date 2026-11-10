import type { MetadataRoute } from 'next'
import { source } from '@/lib/docs-source'
import { getSiteUrl } from '@/lib/theme-config'

// Every docs page. "/" only redirects to /docs, so it is left out.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl()
  return source.getPages().map((page) => ({ url: `${base}${page.url}` }))
}
