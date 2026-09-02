'use client'

import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Maximize2, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
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
  expanded,
  className,
  children,
}: {
  onClick: () => void
  /** Visible text. Empty for icon-only buttons, which are named by `title`. */
  label: string
  title: string
  expanded?: boolean
  className?: string
  children?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-expanded={expanded}
      className={cn(
        'flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-sans transition-colors',
        'text-muted-foreground hover:text-foreground hover:bg-foreground/5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        className,
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
  const [railOpen, setRailOpen] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [placeholderHeight, setPlaceholderHeight] = useState<number | null>(null)
  const current = Math.min(active, Math.max(files.length - 1, 0))

  const boxRef = useRef<HTMLDivElement | null>(null)
  const dialogRef = useRef<HTMLDialogElement | null>(null)

  /**
   * The workspace is MOVED into the dialog rather than duplicated inside it.
   * Rendering a second copy would put two <pre> elements per file on the page,
   * and since the source text is read back off the DOM, Copy and Download
   * would then be reading from whichever copy mounted last.
   *
   * Moving it leaves a hole in the page, so the placeholder is given the box's
   * measured height -- otherwise closing the dialog would land the reader
   * somewhere else on the page than where they opened it.
   */
  const expand = () => {
    const height = boxRef.current?.offsetHeight
    if (height) setPlaceholderHeight(height)
    setExpanded(true)
  }

  useEffect(() => {
    const dialog = dialogRef.current
    if (!expanded || !dialog) return

    // showModal gives Escape, focus containment and top-layer stacking for
    // free; it does not stop the page behind from scrolling.
    dialog.showModal?.()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previous
      if (dialog.open) dialog.close()
    }
  }, [expanded])

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

  const strip = files.length > 1 && (
    /* Flat switcher: always on narrow screens, and on wide ones when the rail
       is collapsed -- collapsing must not leave a multi-file workspace with no
       way to change files. */
    <div
      role="tablist"
      aria-orientation="horizontal"
      aria-label={title ? `${title} files` : 'Files'}
      className={cn(
        'flex overflow-x-auto border-b border-border/60 text-[13px] font-mono',
        railOpen && 'sm:hidden',
      )}
    >
      {files.map((file, i) => (
        <button
          key={file.path}
          role="tab"
          aria-selected={i === current}
          aria-controls={`${workspaceId}-panel-${i}`}
          tabIndex={i === current ? 0 : -1}
          onClick={() => setActive(i)}
          className={cn(
            'px-3 py-1.5 whitespace-nowrap border-b-2 -mb-px transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
            i === current
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {file.path.split('/').pop()}
        </button>
      ))}
    </div>
  )

  const workspace = (
    <div
      ref={boxRef}
      className={cn(
        'rounded-lg border border-border overflow-hidden bg-muted/20 dark:bg-[#0d0d0f]',
        expanded ? 'flex flex-col h-full min-h-0' : 'my-6',
      )}
    >
      <div className={cn('flex flex-col sm:flex-row', expanded && 'flex-1 min-h-0')}>
        {/* The tree. Hidden on narrow screens, where a rail leaves no usable
            width for code, and whenever the reader collapses it. */}
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label={title ? `${title} files` : 'Files'}
          className={cn(
            'hidden shrink-0 text-[13px] font-mono overflow-y-auto',
            'sm:border-r border-border bg-background/40 dark:bg-black/20',
            railOpen && 'sm:block',
            expanded ? 'sm:w-60' : 'sm:w-44 sm:max-h-[26rem]',
          )}
        >
          {title && (
            <div className="px-3 pt-2.5 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground font-sans">
              {title}
            </div>
          )}
          <ul className="py-2 px-1.5">{renderNodes(tree, 0)}</ul>
        </div>

        <div className={cn('min-w-0 flex-1 flex flex-col', expanded && 'min-h-0')}>
          {/* Path, the actions for the active file and the whole set, and the
              two view controls. */}
          <div className="flex items-center gap-1 px-2 sm:px-3 py-1.5 border-b border-border/60">
            {files.length > 1 && (
              <ActionButton
                onClick={() => setRailOpen((open) => !open)}
                label=""
                title={railOpen ? 'Hide the file list' : 'Show the file list'}
                expanded={railOpen}
                className="hidden sm:flex"
              >
                {railOpen ? (
                  <PanelLeftClose aria-hidden="true" className="w-3.5 h-3.5" />
                ) : (
                  <PanelLeftOpen aria-hidden="true" className="w-3.5 h-3.5" />
                )}
              </ActionButton>
            )}
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
            <span aria-hidden="true" className="mx-0.5 text-border">
              |
            </span>
            <ActionButton
              onClick={expanded ? () => setExpanded(false) : expand}
              label=""
              title={expanded ? 'Close the full-screen view' : 'Open full screen'}
            >
              {expanded ? (
                <X aria-hidden="true" className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 aria-hidden="true" className="w-3.5 h-3.5" />
              )}
            </ActionButton>
          </div>

          {strip}

          {/* Both panes are capped at the same height, so switching files does
              not resize the box and shove the rest of the page around. Full
              screen lifts the cap -- that is the point of it. */}
          <div
            className={cn(
              'min-w-0 overflow-auto',
              expanded ? 'flex-1' : 'max-h-[26rem]',
            )}
          >
            {files.map((file, i) => (
              <div
                key={file.path}
                ref={(node) => {
                  // Defensive, not load-bearing: React 19 detaches the old
                  // pane's ref before attaching the dialog's, so storing null
                  // would be harmless today. Ignoring it means the DOM read
                  // does not depend on that ordering holding.
                  if (node) panes.current[i] = node
                }}
                role="tabpanel"
                id={`${workspaceId}-panel-${i}`}
                aria-labelledby={`${workspaceId}-tab-${i}`}
                hidden={i !== current}
                tabIndex={0}
                className={cn(
                  'min-w-0 [&>div]:my-0 [&>div>div]:border-0 [&>div>div]:rounded-none [&>div>div]:bg-transparent',
                  // Pre ships its own hover copy button; the header bar has one
                  // that is always visible, so two would just compete.
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
    </div>
  )

  if (!expanded) return workspace

  return (
    <>
      <div
        aria-hidden="true"
        style={placeholderHeight ? { height: placeholderHeight } : undefined}
        className="my-6 grid place-items-center rounded-lg border border-dashed border-border text-xs text-muted-foreground"
      >
        Open in full screen
      </div>
      <dialog
        ref={dialogRef}
        aria-label={title ? `${title} files` : 'Files'}
        onClose={() => setExpanded(false)}
        onClick={(event) => {
          // A click that lands on the dialog itself is a click on the backdrop:
          // every part of the panel is covered by a child.
          if (event.target === dialogRef.current) setExpanded(false)
        }}
        className={cn(
          'p-3 sm:p-6 border-0 bg-transparent',
          // m-auto is what centres it. The UA centres a modal dialog with
          // `margin: auto`, and Tailwind's preflight resets `margin: 0` on
          // everything -- without this the panel pins to the top-left inset.
          'm-auto w-[96vw] h-[92vh] max-w-none max-h-none',
          'backdrop:bg-black/60 backdrop:backdrop-blur-sm',
        )}
      >
        {workspace}
      </dialog>
    </>
  )
}
