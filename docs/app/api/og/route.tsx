import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { themeConfig, siteConfig } from '@/lib/theme-config'

// Default Node.js runtime (Fluid Compute on Vercel) — explicit edge
// runtime was hanging Turbopack production builds during page-data
// collection, and is no longer recommended.

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  let title = searchParams.get('title') || 'Documentation'
  const section = searchParams.get('section') || siteConfig.name

  // Truncate very long titles to prevent overflow
  if (title.length > 60) {
    title = title.slice(0, 57) + '...'
  }

  // Determine font size based on title length
  const fontSize = title.length > 40 ? 48 : title.length > 25 ? 56 : 64

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          background: themeConfig.ogImage.gradient,
          padding: '60px',
        }}
      >
        {/* Logo placeholder */}
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div
            style={{
              display: 'flex',
              width: '48px',
              height: '48px',
              background: `linear-gradient(135deg, ${themeConfig.colors.dark.accent} 0%, ${themeConfig.colors.light.accent} 100%)`,
              borderRadius: '12px',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: '24px', color: '#fff', fontWeight: 700 }}>
              {siteConfig.name.charAt(0)}
            </span>
          </div>
        </div>

        {/* Section name */}
        <div
          style={{
            display: 'flex',
            marginTop: 'auto',
          }}
        >
          <span
            style={{
              color: themeConfig.ogImage.sectionColor,
              fontSize: '28px',
              fontWeight: 500,
            }}
          >
            {section}
          </span>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: `${fontSize}px`,
            fontWeight: 700,
            color: themeConfig.ogImage.titleColor,
            marginTop: '16px',
            lineHeight: 1.1,
            maxWidth: '100%',
            overflow: 'hidden',
          }}
        >
          {title}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
