import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { zipStore } from '../../lib/zip'

/**
 * These assert against `unzip`, not against a second implementation of the
 * format. A hand-rolled writer that only agrees with its own reader is exactly
 * the archive that fails on someone else's machine.
 */
const FILES = [
  { name: 'lib/memsy.ts', text: 'export const memsy = 1;\n' },
  { name: 'middleware.ts', text: 'export default function () {}\n' },
  {
    name: 'app/api/chat/route.ts',
    // Deliberately awkward: blank lines, trailing whitespace, a tab, unicode,
    // and no trailing newline at all.
    text: 'line one\n\n  indented\t tabbed  \nquote "—" dash\nlast line without newline',
  },
  { name: 'components/chat.tsx', text: '"use client";\n' },
]

function write(entries: { name: string; text: string }[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'zip-test-'))
  const file = path.join(dir, 'out.zip')
  writeFileSync(file, zipStore(entries))
  return file
}

describe('zipStore', () => {
  it('produces an archive unzip considers valid', () => {
    const out = execFileSync('unzip', ['-t', write(FILES)], { encoding: 'utf8' })
    expect(out).toContain('No errors detected')
  })

  it('lists every entry under its full path', () => {
    const out = execFileSync('unzip', ['-Z1', write(FILES)], { encoding: 'utf8' })
    expect(out.trim().split('\n')).toEqual(FILES.map((f) => f.name))
  })

  it('round-trips each file byte for byte', () => {
    const file = write(FILES)
    for (const entry of FILES) {
      const got = execFileSync('unzip', ['-p', file, entry.name], {
        encoding: 'buffer',
      })
      // Buffer comparison, not trimmed strings: trailing-newline handling is
      // where a store-only writer goes wrong, and the last fixture has none.
      expect(got.equals(Buffer.from(entry.text, 'utf8'))).toBe(true)
    }
  })

  /**
   * Sizes read back from the CENTRAL directory, exactly, rather than grepped
   * out of `unzip -l` -- a loose regex there matched the date column and let a
   * deliberately wrong central size through.
   */
  it('records both sizes in the central directory', () => {
    const out = execFileSync(
      'python3',
      [
        '-c',
        'import sys, zipfile; print("\\n".join(f"{i.filename} {i.file_size} {i.compress_size}" '
          + 'for i in zipfile.ZipFile(sys.argv[1]).infolist()))',
        write(FILES),
      ],
      { encoding: 'utf8' },
    )
    expect(out.trim().split('\n')).toEqual(
      FILES.map((f) => {
        const bytes = Buffer.byteLength(f.text, 'utf8')
        // Stored, not deflated, so the two sizes must be equal.
        return `${f.name} ${bytes} ${bytes}`
      }),
    )
  })

  /**
   * A second, independent reader. `unzip -t` and `unzip -p` work from the local
   * file headers, so they pass even when the central directory disagrees --
   * verified by deliberately corrupting the central CRC, which every unzip
   * assertion above survived. Python's zipfile reads the central directory for
   * its entry list and CRCs, so it catches exactly that. python3 is a given in
   * this monorepo; the SDK and services are Python.
   */
  it('passes a reader that verifies against the central directory', () => {
    const file = write(FILES)
    const out = execFileSync(
      'python3',
      ['-c', 'import sys, zipfile; print(zipfile.ZipFile(sys.argv[1]).testzip())', file],
      { encoding: 'utf8' },
    )
    // testzip() returns the first entry whose data fails its recorded CRC.
    expect(out.trim()).toBe('None')
  })

  it('agrees with the central directory on the entry list', () => {
    const out = execFileSync(
      'python3',
      [
        '-c',
        'import sys, zipfile; print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))',
        write(FILES),
      ],
      { encoding: 'utf8' },
    )
    expect(out.trim().split('\n')).toEqual(FILES.map((f) => f.name))
  })

  it('is byte-identical across runs', () => {
    expect(readFileSync(write(FILES)).equals(readFileSync(write(FILES)))).toBe(true)
  })

  it('handles a single entry', () => {
    const file = write([FILES[0]])
    expect(execFileSync('unzip', ['-t', file], { encoding: 'utf8' })).toContain(
      'No errors detected',
    )
  })
})
