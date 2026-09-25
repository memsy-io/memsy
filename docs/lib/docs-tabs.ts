import type { Node, Root } from 'fumadocs-core/page-tree'

export type DocsTabId = 'guides' | 'cookbooks' | 'api'

export interface DocsTab {
  id: DocsTabId
  label: string
  /** First page in the tab — used as the tab's link target. */
  defaultUrl: string
}

/**
 * Top-level tabs displayed above the sidebar. Conceptual / how-to content
 * (`guides`), the end-to-end recipes (`cookbooks`), and the typed reference
 * (`api`). Order is the reading order: recipes sit next to the guides they
 * build on, reference last.
 */
export const DOCS_TABS: DocsTab[] = [
  { id: 'guides', label: 'Guides', defaultUrl: '/docs' },
  { id: 'cookbooks', label: 'Cookbooks', defaultUrl: '/docs/cookbooks' },
  { id: 'api', label: 'API Reference', defaultUrl: '/docs/memsy-client' },
]

/**
 * Separators that START a tab, by their exact name in meta.json.
 *
 * Only these names are boundaries. That distinction is load-bearing: the
 * guides tab contains a separator literally named "Guides", and treating any
 * separator whose name matches a tab label as a boundary would swallow it.
 */
const TAB_SEPARATORS: Record<string, DocsTabId> = {
  Cookbooks: 'cookbooks',
  'API Reference': 'api',
}

/** The tab a separator opens, or `undefined` if it is just a section heading. */
export function tabForSeparator(name: string): DocsTabId | undefined {
  return TAB_SEPARATORS[name]
}

function separatorName(node: Node): string {
  return typeof node.name === 'string' ? node.name : ''
}

/**
 * Which tab each page belongs to. A tab separator switches the current tab;
 * any other separator resets to `guides`, as do pages before any separator.
 */
export function classifyTree(tree: Root): Map<string, DocsTabId> {
  const classification = new Map<string, DocsTabId>()
  let current: DocsTabId = 'guides'

  function visit(nodes: Node[]) {
    for (const node of nodes) {
      if (node.type === 'separator') {
        current = tabForSeparator(separatorName(node)) ?? 'guides'
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
 * Filter a tree's top-level children to only the slice belonging to `tab`.
 * The slice runs from the separator that opens the tab up to the next
 * separator belonging to a different one.
 *
 * Pages that appear before any separator (e.g. `index`) are kept in the
 * `guides` slice.
 *
 * The separator that OPENS a tab is dropped from its own slice -- its name is
 * already the tab's label, so keeping it prints the same word twice, once in
 * the tab bar and once as a heading over everything below it. Section
 * separators inside a tab are kept.
 */
export function filterTreeByTab(tree: Root, tab: DocsTabId): Node[] {
  const out: Node[] = []
  let active: DocsTabId = 'guides' // before any separator

  for (const node of tree.children) {
    if (node.type === 'separator') {
      const opens = tabForSeparator(separatorName(node))
      active = opens ?? 'guides'
      if (opens === tab) continue
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
