import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { classifyTree, filterTreeByTab } from '@/lib/docs-tabs'
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

  it('keeps Cookbooks in the guides half of the nav', () => {
    expect(rootPages).toContain('cookbooks')
    expect(rootPages.indexOf('cookbooks')).toBeLessThan(apiSeparator)
    expect(rootPages.indexOf('---Cookbooks---')).toBeLessThan(apiSeparator)
  })
})

/** A minimal page tree, to pin the classifier's behaviour independently. */
function tree(children: Node[]): Root {
  return { name: 'docs', children } as Root
}
const separator = (name: string) => ({ type: 'separator', name }) as unknown as Node
const page = (url: string) => ({ type: 'page', name: url, url }) as unknown as Node

describe('classifyTree', () => {
  it('files a section before the API Reference separator under guides', () => {
    const t = tree([
      separator('Cookbooks'),
      page('/docs/cookbooks'),
      separator('API Reference'),
      page('/docs/reference/python/memsy-client'),
    ])

    const classification = classifyTree(t)
    expect(classification.get('/docs/cookbooks')).toBe('guides')
    expect(classification.get('/docs/reference/python/memsy-client')).toBe('api')
    expect(filterTreeByTab(t, 'guides')).toHaveLength(2)
    expect(filterTreeByTab(t, 'api')).toHaveLength(2)
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
