'use client'

import {
  Children,
  isValidElement,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { cn } from '@/lib/utils'
import { zipStore } from '@/lib/zip'

interface CodeFileProps {
  /** Path as it should appear in the tree, e.g. "app/api/chat/route.ts". */
  name: string
  children: React.ReactNode
}

/** Data container. Rendering happens in CodeWorkspace, mirroring Tab/Tabs. */
export function CodeFile({ name: _name, children: _children }: CodeFileProps) {
  return null
}

interface FileEntry {
  path: string
  content: React.ReactNode
}

type TreeNode =
  | { kind: 'file'; name: string; path: string; index: number }
  | { kind: 'folder'; name: string; children: TreeNode[] }

/**
 * Group paths into a tree, keeping the order files were declared in. Sorting
 * alphabetically would fight the author: the listings are ordered to be read
 * top to bottom (the client module before the route that imports it), and that
 * sequence is information.
 */
function buildTree(files: FileEntry[]): TreeNode[] {
  const roots: TreeNode[] = []

  files.forEach((file, index) => {
    const segments = file.path.split('/').filter(Boolean)
    let level = roots

    segments.forEach((segment, depth) => {
      const isLeaf = depth === segments.length - 1
      if (isLeaf) {
        level.push({ kind: 'file', name: segment, path: file.path, index })
        return
      }
      let folder = level.find(
        (n): n is Extract<TreeNode, { kind: 'folder' }> =>
          n.kind === 'folder' && n.name === segment,
      )
      if (!folder) {
        folder = { kind: 'folder', name: segment, children: [] }
        level.push(folder)
      }
      level = folder.children
    })
  })

  return roots
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M1.75 2h3.63c.4 0 .78.16 1.06.44L7.5 3.5h6.75c.97 0 1.75.78 1.75 1.75v7c0 .97-.78 1.75-1.75 1.75H1.75C.78 14 0 13.22 0 12.25v-8.5C0 2.78.78 2 1.75 2z" />
    </svg>
  )
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden="true">
      <path d="M9.5 1.75H4a1.25 1.25 0 0 0-1.25 1.25v10A1.25 1.25 0 0 0 4 14.25h8A1.25 1.25 0 0 0 13.25 13V5.5L9.5 1.75z" />
      <path d="M9.25 2v3.5h3.5" />
    </svg>
  )
}

/** Fence language for a path, used only to label blocks in the copied bundle. */
const FENCE_LANG: Record<string, string> = {
  ts: 'ts',
  tsx: 'tsx',
  js: 'js',
  jsx: 'jsx',
  py: 'python',
  json: 'json',
  sh: 'bash',
}

function fenceLang(path: string): string {
  return FENCE_LANG[path.split('.').pop()?.toLowerCase() ?? ''] ?? ''
}

/**
 * Hand the browser a file. `download` only honours a bare filename -- a nested
 * path saves as its last segment either way -- so the caller passes the name it
 * wants rather than the archive path.
 */
function save(filename: string, body: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function ActionButton({
  onClick,
  label,
  title,
  children,
}: {
  onClick: () => void
  label: string
  title: string
  children?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        'flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-sans transition-colors',
        'text-muted-foreground hover:text-foreground hover:bg-foreground/5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
      )}
    >
      {children}
      {label}
    </button>
  )
}

interface CodeWorkspaceProps {
  children: React.ReactNode
  /** Optional label shown above the tree, e.g. "my-app". */
  title?: string
}

export function CodeWorkspace({ children, title }: CodeWorkspaceProps) {
  const workspaceId = useId()

  const files = useMemo(() => {
    const list: FileEntry[] = []
    Children.forEach(children, (child) => {
      if (isValidElement<CodeFileProps>(child) && child.props.name) {
        list.push({ path: child.props.name, content: child.props.children })
      }
    })
    return list
  }, [children])

  const tree = useMemo(() => buildTree(files), [files])
  const [active, setActive] = useState(0)
  const [copied, setCopied] = useState<'file' | 'all' | null>(null)
  const current = Math.min(active, Math.max(files.length - 1, 0))

  /**
   * One entry per panel of THIS workspace. The source text is only available
   * as rendered, highlighted markup, so it is read back off the DOM -- the
   * same thing Pre's own copy button does. Scoping the query to the panel ref
   * matters: a page-wide `document.querySelector('pre')` would return the
   * first block on the page, which is the bug CodeBlock still has.
   */
  const panes = useRef<Array<HTMLDivElement | null>>([])

  const textOf = (index: number): string => {
    const text = panes.current[index]?.querySelector('pre')?.textContent ?? ''
    // Shiki emits no trailing newline; files should end with one.
    return text.endsWith('\n') ? text : `${text}\n`
  }

  const flash = (which: 'file' | 'all') => {
    setCopied(which)
    setTimeout(() => setCopied(null), 2000)
  }

  const copyFile = async () => {
    await navigator.clipboard.writeText(textOf(current))
    flash('file')
  }

  /**
   * Markdown rather than raw concatenation: the common reason to want every
   * file at once is to paste the whole recipe somewhere, and a bare join loses
   * which lines belong to which file.
   */
  const copyAll = async () => {
    const bundle = files
      .map((file, i) => `## ${file.path}\n\n\`\`\`${fenceLang(file.path)}\n${textOf(i)}\`\`\`\n`)
      .join('\n')
    await navigator.clipboard.writeText(bundle)
    flash('all')
  }

  const downloadFile = () => {
    const path = files[current].path
    save(path.split('/').pop() ?? path, textOf(current), 'text/plain;charset=utf-8')
  }

  const downloadZip = () => {
    const entries = files.map((file, i) => ({ name: file.path, text: textOf(i) }))
    save(`${title || 'files'}.zip`, zipStore(entries), 'application/zip')
  }

  if (files.length === 0) return null

  const move = (delta: number) => {
    setActive((i) => (i + delta + files.length) % files.length)
  }

  function renderNodes(nodes: TreeNode[], depth: number): React.ReactNode {
    return nodes.map((node) => {
      if (node.kind === 'folder') {
        return (
          <li key={`${depth}-${node.name}`}>
            <div
              className="flex items-center gap-1.5 py-1 text-muted-foreground select-none"
              style={{ paddingLeft: `${depth * 0.75 + 0.5}rem` }}
            >
              <FolderIcon className="w-3.5 h-3.5 shrink-0 opacity-70" />
              <span className="truncate">{node.name}</span>
            </div>
            <ul>{renderNodes(node.children, depth + 1)}</ul>
          </li>
        )
      }

      const isActive = node.index === current
      return (
        <li key={node.path}>
          <button
            role="tab"
            id={`${workspaceId}-tab-${node.index}`}
            aria-selected={isActive}
            aria-controls={`${workspaceId}-panel-${node.index}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => setActive(node.index)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                e.preventDefault()
                move(1)
              } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                e.preventDefault()
                move(-1)
              }
            }}
            style={{ paddingLeft: `${depth * 0.75 + 0.5}rem` }}
            className={cn(
              'w-full flex items-center gap-1.5 py-1 pr-2 text-left rounded-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
              isActive
                ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5',
            )}
          >
            <FileIcon className="w-3.5 h-3.5 shrink-0 opacity-70" />
            <span className="truncate">{node.name}</span>
          </button>
        </li>
      )
    })
  }

  return (
    <div className="my-6 rounded-lg border border-border overflow-hidden bg-muted/20 dark:bg-[#0d0d0f]">
      <div className="flex flex-col sm:flex-row">
        {/* Sidebar on sm+, a horizontal strip below that — a 9rem rail leaves
            no usable width for code on a phone. */}
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label={title ? `${title} files` : 'Files'}
          className={cn(
            'shrink-0 text-[13px] font-mono',
            'border-b sm:border-b-0 sm:border-r border-border',
            'sm:w-56 sm:max-h-[32rem] sm:overflow-y-auto',
            'bg-background/40 dark:bg-black/20',
          )}
        >
          {title && (
            <div className="px-3 pt-2.5 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground font-sans">
              {title}
            </div>
          )}
          {/* Vertical tree on sm+ */}
          <ul className="hidden sm:block py-2 px-1.5">{renderNodes(tree, 0)}</ul>
          {/* Flat horizontal strip on narrow screens */}
          <div className="sm:hidden flex overflow-x-auto">
            {files.map((file, i) => (
              <button
                key={file.path}
                role="tab"
                aria-selected={i === current}
                aria-controls={`${workspaceId}-panel-${i}`}
                tabIndex={i === current ? 0 : -1}
                onClick={() => setActive(i)}
                className={cn(
                  'px-3 py-2 whitespace-nowrap border-b-2 -mb-px transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
                  i === current
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-transparent text-muted-foreground',
                )}
              >
                {file.path.split('/').pop()}
              </button>
            ))}
          </div>
        </div>

        {/* Content pane. Every panel stays mounted so Ctrl+F finds code in
            files that are not currently selected. */}
        <div className="min-w-0 flex-1">
          {/* Path, plus the actions for the active file and the whole set. */}
          <div className="flex items-center gap-1 px-2 sm:px-4 py-1.5 border-b border-border/60">
            <span className="min-w-0 flex-1 truncate text-[11px] font-mono text-muted-foreground">
              <span className="hidden sm:inline">{files[current]?.path}</span>
              <span className="sm:hidden">
                {files[current]?.path.split('/').pop()}
              </span>
            </span>
            <ActionButton
              onClick={copyFile}
              label={copied === 'file' ? 'Copied' : 'Copy'}
              title={`Copy ${files[current]?.path} to the clipboard`}
            />
            <ActionButton
              onClick={downloadFile}
              label="Download"
              title={`Download ${files[current]?.path.split('/').pop()}`}
            />
            {files.length > 1 && (
              <>
                <span aria-hidden="true" className="mx-0.5 text-border">
                  |
                </span>
                <ActionButton
                  onClick={copyAll}
                  label={copied === 'all' ? 'Copied' : 'Copy all'}
                  title={`Copy all ${files.length} files as markdown, with their paths`}
                />
                <ActionButton
                  onClick={downloadZip}
                  label=".zip"
                  title={`Download all ${files.length} files as ${title || 'files'}.zip`}
                />
              </>
            )}
          </div>
          {files.map((file, i) => (
            <div
              key={file.path}
              ref={(node) => {
                panes.current[i] = node
              }}
              role="tabpanel"
              id={`${workspaceId}-panel-${i}`}
              aria-labelledby={`${workspaceId}-tab-${i}`}
              hidden={i !== current}
              tabIndex={0}
              className={cn(
                'min-w-0 [&>div]:my-0 [&>div>div]:border-0 [&>div>div]:rounded-none [&>div>div]:bg-transparent',
                // Pre ships its own hover copy button; the header bar above now
                // has one that is always visible, so two would just compete.
                '[&>div>div>button]:hidden',
                i !== current && 'hidden',
              )}
            >
              {file.content}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
