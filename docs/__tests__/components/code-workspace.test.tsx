import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
let downloads: Array<{ name: string; blob: Blob }>

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
    downloads.push({ name: this.download, blob: urls.get(this.href)! })
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
