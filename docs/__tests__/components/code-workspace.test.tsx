import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

import {
  CodeFile,
  CodeWorkspace,
} from '../../app/components/docs/mdx/code-workspace'

/**
 * The component reads its source text back off the rendered DOM, because that
 * is the only place it exists -- MDX hands it highlighted markup, not strings.
 * These fixtures stand in for Shiki's output: a <pre> whose textContent is the
 * file. Verified against the real thing separately, by pulling the <pre> out of
 * the prerendered HTML and comparing it to the file the docs harness builds.
 */
const ROUTE = 'export function GET() {\n  return new Response("ok");\n}'
const CHAT = '"use client";\n\nexport function Chat() {}'

function renderWorkspace(single = false) {
  return render(
    <CodeWorkspace title="my-app">
      <CodeFile name="app/api/chat/route.ts">
        <pre>{ROUTE}</pre>
      </CodeFile>
      {single ? null : (
        <CodeFile name="components/chat.tsx">
          <pre>{CHAT}</pre>
        </CodeFile>
      )}
    </CodeWorkspace>,
  )
}

let written: string[]
let downloads: Array<{
  name: string
  blob: Blob
  /** Captured at click time -- see the click mock. */
  inDocument: boolean
  revokedBeforeClick: boolean
}>

beforeEach(() => {
  written = []
  downloads = []

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn(async (text: string) => {
        written.push(text)
      }),
    },
  })

  const urls = new Map<string, Blob>()
  URL.createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:${urls.size}`
    urls.set(url, blob)
    return url
  })
  URL.revokeObjectURL = vi.fn()

  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push({
      name: this.download,
      blob: urls.get(this.href)!,
      // Both captured at click time, the only moment they mean anything.
      // Chrome starts the fetch synchronously inside click(), so a detached
      // anchor and a same-task revoke happen to work there. Firefox and Safari
      // read the blob on a later task and fail silently -- no error, nothing
      // in the console -- which a test that only inspects the Blob cannot see.
      inDocument: this.isConnected,
      revokedBeforeClick: (URL.revokeObjectURL as unknown as Mock).mock.calls.some(
        (c: unknown[]) => c[0] === this.href,
      ),
    })
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const click = (name: RegExp) =>
  fireEvent.click(screen.getByRole('button', { name }))

describe('CodeWorkspace actions', () => {
  it('copies the active file, with a trailing newline', async () => {
    renderWorkspace()
    click(/^Copy app\/api\/chat\/route\.ts/)
    expect(written).toEqual([`${ROUTE}\n`])
  })

  it('copies the file that is actually selected, not the first one', async () => {
    renderWorkspace()
    // Each file appears twice as a tab: once in the vertical tree, once in the
    // narrow-screen strip. In a browser one of the two is display:none, so
    // only one is ever exposed; with no stylesheet loaded, both are here.
    fireEvent.click(screen.getAllByRole('tab', { name: 'chat.tsx' })[0])
    click(/^Copy components\/chat\.tsx/)
    expect(written).toEqual([`${CHAT}\n`])
  })

  it('copies every file as markdown, with paths and fence languages', async () => {
    renderWorkspace()
    click(/^Copy all 2 files/)
    expect(written[0]).toBe(
      `## app/api/chat/route.ts\n\n\`\`\`ts\n${ROUTE}\n\`\`\`\n\n` +
        `## components/chat.tsx\n\n\`\`\`tsx\n${CHAT}\n\`\`\`\n`,
    )
  })

  it('downloads the active file under its bare filename', () => {
    renderWorkspace()
    click(/^Download route\.ts/)
    expect(downloads.map((d) => d.name)).toEqual(['route.ts'])
  })

  it('downloads a zip named after the workspace', async () => {
    renderWorkspace()
    click(/^Download all 2 files/)
    expect(downloads.map((d) => d.name)).toEqual(['my-app.zip'])
  })

  /**
   * End to end: the bytes the button hands the browser, read back by a reader
   * that is not this codebase.
   */
  it('the downloaded zip contains both files at their full paths', async () => {
    renderWorkspace()
    click(/^Download all 2 files/)

    const bytes = Buffer.from(await downloads[0].blob.arrayBuffer())
    const dir = mkdtempSync(path.join(tmpdir(), 'ws-zip-'))
    const file = path.join(dir, 'out.zip')
    writeFileSync(file, bytes)

    const listing = execFileSync(
      'python3',
      ['-c', 'import sys, zipfile; print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))', file],
      { encoding: 'utf8' },
    )
    expect(listing.trim().split('\n')).toEqual([
      'app/api/chat/route.ts',
      'components/chat.tsx',
    ])

    const extracted = execFileSync(
      'unzip',
      ['-p', file, 'components/chat.tsx'],
      { encoding: 'buffer' },
    )
    expect(extracted.equals(Buffer.from(`${CHAT}\n`, 'utf8'))).toBe(true)
  })

  it('offers no whole-set actions when there is only one file', () => {
    renderWorkspace(true)
    expect(screen.getByRole('button', { name: /^Copy app/ })).toBeDefined()
    expect(screen.queryByRole('button', { name: /^Copy all/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Download all/ })).toBeNull()
  })
})

describe('CodeWorkspace views', () => {
  const railToggle = () => screen.getByRole('button', { name: /file list$/ })
  const expandButton = () => screen.getByRole('button', { name: 'Open full screen' })

  /** The horizontal switcher, which is in the DOM at every width. */
  function flatStrip(): HTMLElement {
    const lists = screen.getAllByRole('tablist', {
      name: 'my-app files',
      hidden: true,
    })
    const strip = lists.find(
      (el) => el.getAttribute('aria-orientation') === 'horizontal',
    )
    if (!strip) throw new Error('no horizontal tablist rendered')
    return strip
  }

  it('reports the rail state on the toggle', () => {
    renderWorkspace()
    expect(railToggle().getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(railToggle())
    expect(railToggle().getAttribute('aria-expanded')).toBe('false')
  })

  /**
   * The flat strip is what a reader switches files with once the tree is gone.
   * It is always in the DOM and hidden by a breakpoint class, so the guard is
   * that the class is dropped when the rail closes -- a collapse that left the
   * strip hidden would leave no way at all to change files.
   */
  it('reveals the flat switcher when the rail is collapsed', () => {
    renderWorkspace()
    expect(flatStrip().className).toContain('sm:hidden')

    fireEvent.click(railToggle())
    expect(flatStrip().className).not.toContain('sm:hidden')
    expect(within(flatStrip()).getAllByRole('tab', { hidden: true })).toHaveLength(2)
  })

  /**
   * Offered on a single-file workspace too. Closing a one-entry rail still
   * hands the code 11rem it did not have, and three of the four cookbooks
   * have single-file listings -- gating this on the file count left them
   * without the control entirely.
   */
  it('offers the rail toggle even with a single file', () => {
    renderWorkspace(true)
    expect(railToggle().getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(railToggle())
    expect(railToggle().getAttribute('aria-expanded')).toBe('false')
  })

  /**
   * The one that matters most. The workspace is moved into the dialog, not
   * copied: a second copy would put two <pre> per file on the page, and since
   * the text is read back off the DOM, Copy would start reading whichever one
   * mounted last.
   */
  it('keeps exactly one copy of each file when expanded', () => {
    const { baseElement } = renderWorkspace()
    expect(baseElement.querySelectorAll('pre')).toHaveLength(2)

    fireEvent.click(expandButton())
    expect(baseElement.querySelector('dialog')).not.toBeNull()
    expect(baseElement.querySelectorAll('pre')).toHaveLength(2)
  })

  it('still copies the right file once expanded', () => {
    renderWorkspace()
    fireEvent.click(expandButton())
    fireEvent.click(
      screen.getByRole('button', { name: /^Copy app\/api\/chat\/route\.ts/ }),
    )
    expect(written).toEqual([`${ROUTE}\n`])
  })

  it('leaves a placeholder at the height the box had', () => {
    const offsetHeight = vi
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockReturnValue(342)
    renderWorkspace()
    fireEvent.click(expandButton())
    offsetHeight.mockRestore()

    expect(screen.getByText('Open in full screen').style.height).toBe('342px')
  })

  it("closes on the dialog's own close event, which is what Escape fires", () => {
    const { baseElement } = renderWorkspace()
    fireEvent.click(expandButton())

    fireEvent(baseElement.querySelector('dialog')!, new Event('close'))
    expect(baseElement.querySelector('dialog')).toBeNull()
    expect(screen.queryByText('Open in full screen')).toBeNull()
  })

  it('closes on a click that lands on the backdrop, not the panel', () => {
    const { baseElement } = renderWorkspace()
    fireEvent.click(expandButton())
    const dialog = baseElement.querySelector('dialog')!

    // A click inside the panel must not close it.
    fireEvent.click(dialog.querySelector('[role="tabpanel"]')!)
    expect(baseElement.querySelector('dialog')).not.toBeNull()

    fireEvent.click(dialog)
    expect(baseElement.querySelector('dialog')).toBeNull()
  })
  /**
   * Without a cap the box is as tall as whichever file is selected, so
   * switching from an 8-line file to a 60-line one resizes it and shoves
   * everything below it down the page. Full screen is where the cap is lifted.
   */
  it('caps the code pane inline and lifts the cap in full screen', () => {
    const { baseElement } = renderWorkspace()
    const scroller = () => baseElement.querySelector('[role="tabpanel"]')!.parentElement!

    expect(scroller().className).toContain('max-h-[26rem]')
    fireEvent.click(expandButton())
    expect(scroller().className).not.toContain('max-h-[26rem]')
    expect(scroller().className).toContain('flex-1')
  })
  /**
   * The UA centres a modal dialog with `margin: auto`, and Tailwind's
   * preflight resets `margin: 0` on every element -- so without an explicit
   * m-auto the panel pins to the top-left corner of the viewport.
   */
  it('centres the dialog and sizes it to the viewport', () => {
    const { baseElement } = renderWorkspace()
    fireEvent.click(expandButton())

    const dialog = baseElement.querySelector('dialog')!
    expect(dialog.className).toContain('m-auto')
    expect(dialog.className).toContain('w-[96vw]')
    expect(dialog.className).toContain('h-[92vh]')
  })

  /**
   * The download only reaches the user if the anchor is in the document and the
   * blob URL is still alive when the browser gets round to reading it. Both
   * were previously invisible here, because the assertions only looked at the
   * Blob the component handed to createObjectURL.
   */
  it('clicks an anchor that is in the document, and revokes only afterwards', () => {
    renderWorkspace()
    click(/download .*\.ts/i)

    expect(downloads).toHaveLength(1)
    expect(downloads[0].inDocument, 'anchor was never appended to the document').toBe(true)
    expect(downloads[0].revokedBeforeClick, 'blob URL was revoked before the click').toBe(false)
  })

  it('applies the same anchor handling to the zip download', async () => {
    renderWorkspace()
    click(/download all/i)
    await waitFor(() => expect(downloads).toHaveLength(1))

    expect(downloads[0].inDocument).toBe(true)
    expect(downloads[0].revokedBeforeClick).toBe(false)
  })

  /**
   * The strip is the only visible switcher when the rail is collapsed or the
   * viewport is under `sm`, so it has to carry the same affordances the rail
   * does -- an id the panel can name itself by, and arrow keys.
   */
  it('names each panel by both switchers, so the visible one always labels it', () => {
    const { baseElement } = renderWorkspace()
    const panel = baseElement.querySelector('[role="tabpanel"]')!
    const ids = panel.getAttribute('aria-labelledby')!.split(' ')

    expect(ids).toHaveLength(2)
    for (const id of ids) {
      expect(baseElement.querySelector(`#${id}`), `no element with id ${id}`).not.toBeNull()
    }
  })

  it('moves the selection with arrow keys from the strip, not just the rail', () => {
    renderWorkspace()
    fireEvent.click(railToggle())

    // With the rail collapsed the strip is the only switcher left in the tree.
    // Both tablists stay in the DOM -- the rail is CSS-hidden, not removed,
    // which is exactly why the panels name themselves by both ids.
    const strip = screen
      .getAllByRole('tablist')
      .find((l) => l.getAttribute('aria-orientation') === 'horizontal')!
    const tabs = within(strip).getAllByRole('tab')
    expect(tabs.length).toBeGreaterThan(1)
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })

    expect(within(strip).getAllByRole('tab')[1].getAttribute('aria-selected')).toBe('true')
  })

  /** tabIndex is 0 only on the selected tab, so focus has to follow it or the
   *  next Tab press leaves the widget entirely. */
  it('keeps focus on the tab it just selected', () => {
    renderWorkspace()
    const tabs = screen.getAllByRole('tab')
    tabs[0].focus()
    fireEvent.keyDown(tabs[0], { key: 'ArrowDown' })

    const selected = screen
      .getAllByRole('tab')
      .find((t) => t.getAttribute('aria-selected') === 'true')!
    expect(document.activeElement).toBe(selected)
    expect(selected.getAttribute('tabindex')).toBe('0')
  })

  it('leaves no anchor behind in the document', () => {
    const { baseElement } = renderWorkspace()
    click(/download .*\.ts/i)
    expect(baseElement.querySelectorAll('a[download]')).toHaveLength(0)
  })
})
