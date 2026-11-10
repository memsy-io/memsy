import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/theme-config'

// Everything is public; the file exists to point crawlers at the sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  }
}
