import type { Node, Root } from 'fumadocs-core/page-tree'

export type DocsTabId = 'guides' | 'api'

export interface DocsTab {
  id: DocsTabId
  label: string
  /** First page in the tab — used as the tab's link target. */
  defaultUrl: string
}

/**
 * Top-level tabs displayed above the sidebar.
 *
 * Today the docs are split between conceptual / how-to content
 * (`guides`) and the typed Python reference (`api`).
 */
export const DOCS_TABS: DocsTab[] = [
  { id: 'guides', label: 'Guides', defaultUrl: '/docs' },
  { id: 'api', label: 'API Reference', defaultUrl: '/docs/memsy-client' },
]

/**
 * Pages that live under the "API Reference" separator belong to the
 * `api` tab. Everything else (including pages before any separator)
 * belongs to `guides`.
 */
export function classifyTree(tree: Root): Map<string, DocsTabId> {
  const classification = new Map<string, DocsTabId>()
  let current: DocsTabId = 'guides'

  function visit(nodes: Node[]) {
    for (const node of nodes) {
      if (node.type === 'separator') {
        const name = typeof node.name === 'string' ? node.name : ''
        current = name === 'API Reference' ? 'api' : 'guides'
      } else if (node.type === 'page') {
        classification.set(node.url, current)
      } else if (node.type === 'folder' && node.children) {
        visit(node.children)
      }
    }
  }

  visit(tree.children)
  return classification
}

/**
 * Filter a tree's top-level children to only the slice belonging to
 * `tab`. The slice runs from the matching separator up to (but not
 * including) the next separator that belongs to a different tab.
 *
 * Pages that appear before any separator (e.g. `index`) are kept in
 * the `guides` slice.
 */
export function filterTreeByTab(tree: Root, tab: DocsTabId): Node[] {
  const out: Node[] = []
  let active: DocsTabId = 'guides' // before any separator

  for (const node of tree.children) {
    if (node.type === 'separator') {
      const name = typeof node.name === 'string' ? node.name : ''
      active = name === 'API Reference' ? 'api' : 'guides'
    }
    if (active === tab) out.push(node)
  }

  return out
}

/** Pick the active tab from the current pathname. Defaults to `guides`. */
export function activeTabForPath(
  classification: Map<string, DocsTabId>,
  pathname: string,
): DocsTabId {
  return classification.get(pathname) ?? 'guides'
}
