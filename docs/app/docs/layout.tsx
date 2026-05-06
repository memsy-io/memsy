import { source } from '@/lib/docs-source'
import { DocsSidebar } from '../components/docs/docs-sidebar'
import { DocsHeader } from '../components/docs/docs-header'
import { DocsTabs } from '../components/docs/docs-tabs'
import { siteConfig } from '@/lib/theme-config'

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const tree = source.pageTree

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header with mobile navigation */}
      <DocsHeader tree={tree} />

      {/* Section tabs (desktop) — sticky under the header */}
      <div className="hidden lg:block sticky top-16 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <DocsTabs tree={tree} />
      </div>

      {/* Main content */}
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex gap-8">
            <DocsSidebar tree={tree} />
            <main className="flex-1 min-w-0">
              {children}
            </main>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">
              {siteConfig.footer.copyright}
            </p>
            <div className="flex items-center gap-4">
              {siteConfig.footer.links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <span className="text-muted-foreground/50">|</span>
              <span className="text-xs text-muted-foreground/70">For AI:</span>
              <a
                href="/llms.txt"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
              >
                llms.txt
              </a>
              <a
                href="/llms-full.txt"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
              >
                llms-full.txt
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
