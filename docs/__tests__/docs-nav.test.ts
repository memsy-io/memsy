import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DOCS_TABS,
  classifyTree,
  filterTreeByTab,
  tabForSeparator,
} from '@/lib/docs-tabs'
import type { Node, Root } from 'fumadocs-core/page-tree'

const CONTENT = path.resolve(__dirname, '../content/docs')

interface Meta {
  title: string
  pages: string[]
}

function readMeta(dir: string): Meta {
  return JSON.parse(readFileSync(path.join(dir, 'meta.json'), 'utf8')) as Meta
}

/** Every meta.json in the tree, as [relative dir, parsed meta]. */
function allMetas(dir = CONTENT, rel = ''): Array<[string, Meta]> {
  const out: Array<[string, Meta]> = []
  if (existsSync(path.join(dir, 'meta.json'))) out.push([rel || '.', readMeta(dir)])
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      out.push(...allMetas(path.join(dir, entry.name), path.join(rel, entry.name)))
    }
  }
  return out
}

/**
 * meta.json is the only thing that decides what appears in the sidebar, and
 * nothing validates it: a typo'd or deleted page reference is not a build
 * error, it is a nav entry that silently vanishes. These tests are the check.
 */
describe('meta.json page references', () => {
  const metas = allMetas()

  it('finds every meta.json in the content tree', () => {
    const dirs = metas.map(([dir]) => dir).sort()
    expect(dirs).toContain('.')
    expect(dirs).toContain('cookbooks')
    expect(dirs).toContain('reference')
  })

  it.each(metas)('every page listed in %s/meta.json resolves to a file or folder', (rel, meta) => {
    const dir = rel === '.' ? CONTENT : path.join(CONTENT, rel)
    // Separators are display-only labels, not page references.
    const pages = meta.pages.filter((p) => !p.startsWith('---'))

    for (const page of pages) {
      const asPage = path.join(dir, `${page}.mdx`)
      const asFolder = path.join(dir, page)
      expect(
        existsSync(asPage) || existsSync(asFolder),
        `${rel}/meta.json lists "${page}", which is neither ${page}.mdx nor a folder`,
      ).toBe(true)
    }
  })
})

/**
 * `filterTreeByTab` and `classifyTree` switch to the "api" tab at the separator
 * literally named "API Reference" and switch back at any differently-named one.
 * So the section that must not gain new pages by accident is the slice BETWEEN
 * "---API Reference---" and the separator after it: anything landing there is
 * filed under the API Reference tab, still builds, still renders, and is simply
 * missing from the sidebar most readers are looking at.
 */
describe('tab placement', () => {
  const rootPages = readMeta(CONTENT).pages
  const apiSeparator = rootPages.indexOf('---API Reference---')

  it('has an API Reference separator to divide the tabs', () => {
    expect(apiSeparator).toBeGreaterThan(-1)
  })

  it('files only the reference under the API Reference separator', () => {
    const after = rootPages.slice(apiSeparator + 1)
    const nextSeparator = after.findIndex((p) => p.startsWith('---'))
    const apiSlice = nextSeparator === -1 ? after : after.slice(0, nextSeparator)
    expect(apiSlice).toEqual(['reference'])
  })

  it('files every cookbook under the Cookbooks separator', () => {
    const start = rootPages.indexOf('---Cookbooks---')
    expect(start).toBeGreaterThan(-1)
    const after = rootPages.slice(start + 1)
    const next = after.findIndex((page) => page.startsWith('---'))
    const slice = next === -1 ? after : after.slice(0, next)

    // Listed as explicit paths rather than the folder: naming the folder nests
    // the recipes one level deeper under a heading that repeats the tab label.
    expect(slice).toEqual([
      'cookbooks/index',
      'cookbooks/nextjs-chat',
      'cookbooks/fastapi-support-agent',
      'cookbooks/slack-bot',
      'cookbooks/agent-memory-tool',
    ])
  })
})

/**
 * A tab whose link 404s is invisible until a reader clicks it -- nothing in the
 * build checks that `defaultUrl` goes anywhere.
 */
describe('tab links', () => {
  // Parsed from source rather than imported: next.config.mjs pulls in the
  // fumadocs MDX plugin, which does not load outside a Next build.
  const config = readFileSync(path.resolve(__dirname, '../next.config.mjs'), 'utf8')
  const redirects = new Map(
    [...config.matchAll(/source:\s*'([^']+)',\s*destination:\s*'([^']+)'/g)].map(
      (m) => [m[1], m[2]],
    ),
  )

  /** The .mdx behind a docs URL, following a configured redirect first. */
  function pageFor(url: string): string | null {
    const target = redirects.get(url) ?? url
    const slug = target.replace(/^\/docs\/?/, '')
    const candidates = slug
      ? [`${slug}.mdx`, path.join(slug, 'index.mdx')]
      : ['index.mdx']
    return candidates.find((c) => existsSync(path.join(CONTENT, c))) ?? null
  }

  it.each(DOCS_TABS)('$label links to a page that exists', (tab) => {
    expect(pageFor(tab.defaultUrl)).not.toBeNull()
  })

  it('has a tab for every separator that opens one', () => {
    const opened = readMeta(CONTENT)
      .pages.filter((page) => page.startsWith('---'))
      .map((page) => page.replace(/^-+|-+$/g, ''))
      .map((name) => tabForSeparator(name))
      .filter((id): id is NonNullable<typeof id> => id !== undefined)

    expect(new Set(opened)).toEqual(new Set(['cookbooks', 'api']))
    for (const id of opened) {
      expect(DOCS_TABS.map((t) => t.id)).toContain(id)
    }
  })
})

/** A minimal page tree, to pin the classifier's behaviour independently. */
function tree(children: Node[]): Root {
  return { name: 'docs', children } as Root
}
const separator = (name: string) => ({ type: 'separator', name }) as unknown as Node
const page = (url: string) => ({ type: 'page', name: url, url }) as unknown as Node

describe('classifyTree', () => {
  it('files each tab-opening separator\'s pages under that tab', () => {
    const t = tree([
      page('/docs'),
      separator('Cookbooks'),
      page('/docs/cookbooks'),
      separator('API Reference'),
      page('/docs/reference/python/memsy-client'),
    ])

    const classification = classifyTree(t)
    expect(classification.get('/docs')).toBe('guides')
    expect(classification.get('/docs/cookbooks')).toBe('cookbooks')
    expect(classification.get('/docs/reference/python/memsy-client')).toBe('api')

    // Each slice is its pages WITHOUT the separator that names the tab.
    expect(filterTreeByTab(t, 'guides')).toHaveLength(1)
    expect(filterTreeByTab(t, 'cookbooks')).toHaveLength(1)
    expect(filterTreeByTab(t, 'api')).toHaveLength(1)
  })

  /**
   * The guides tab contains a separator literally named "Guides". If a
   * separator counted as a tab boundary whenever its name matched a tab label,
   * that heading would vanish and everything under it would be misfiled.
   */
  it('treats a section separator that shares a tab label as a heading', () => {
    expect(tabForSeparator('Guides')).toBeUndefined()
    expect(tabForSeparator('Cookbooks')).toBe('cookbooks')

    const t = tree([
      separator('Guides'),
      page('/docs/ingesting-events'),
    ])
    expect(classifyTree(t).get('/docs/ingesting-events')).toBe('guides')
    // Kept: the separator is a heading inside the tab, not its title.
    expect(filterTreeByTab(t, 'guides')).toHaveLength(2)
  })

  it('files pages with NO separator of their own under whatever tab is active', () => {
    // The actual hazard: a page appended straight after the reference, with no
    // separator to reset the tab, disappears from the guides sidebar.
    const t = tree([
      separator('API Reference'),
      page('/docs/reference/python/memsy-client'),
      page('/docs/cookbooks'),
    ])

    expect(classifyTree(t).get('/docs/cookbooks')).toBe('api')
    expect(filterTreeByTab(t, 'guides')).toHaveLength(0)
  })
})
