import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const COOKBOOKS = path.resolve(__dirname, '../content/docs/cookbooks')
const LISTING_HEADING = '## Complete code'

interface Block {
  lang: string
  /** true once the "## Complete code" heading has been passed */
  listing: boolean
  code: string
}

/**
 * Fenced blocks, with the fence's own indentation stripped from every line --
 * blocks in these pages are indented to sit inside <Step>/<Tab>, so a naive
 * reader would see every Python block as one giant indentation error.
 */
function blocks(file: string): Block[] {
  const lines = readFileSync(path.join(COOKBOOKS, file), 'utf8').split('\n')
  const out: Block[] = []
  let inListing = false

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === LISTING_HEADING) inListing = true
    const open = /^(\s*)```(\w+)?\s*$/.exec(lines[i])
    if (!open) continue

    const [, indent, lang = 'text'] = open
    let j = i + 1
    while (j < lines.length && lines[j].trim() !== '```') j++
    const code = lines
      .slice(i + 1, j)
      .map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l.trimStart()))
      .join('\n')
    out.push({ lang, listing: inListing, code })
    i = j
  }
  return out
}

const CODE_LANGS = new Set(['python', 'ts', 'tsx'])
const firstLine = (b: Block) => b.code.split('\n')[0]

/**
 * A step block is either carried into the complete listing verbatim, or it is
 * listed here with the reason it is not. Anything else is a failure -- that is
 * what stops a NEW step being added and silently left out of the listing a
 * reader copies.
 */
const EXCLUDED: Record<string, Record<string, string>> = {
  'nextjs-chat.mdx': {
    'import { waitUntil } from "@vercel/functions";':
      'A fragment that replaces the tail of Step 4 rather than standing alone; its body is in the listing without the placeholder comment.',
    '// A stable id per chat thread, created when the thread is created.':
      'A one-line illustration of choosing a session id, not part of any file.',
    'const hits = await memsy.search("pricing", { actorId: "user_abc", limit: 5 });':
      'A throwaway verification snippet, deliberately run outside the app.',
  },
  'slack-bot.mdx': {
    'EventPayload(':
      'The optional team-wide recall variant, which the listing deliberately omits.',
    'recalled = memsy.search(':
      'The optional team-wide recall variant, which the listing deliberately omits.',
  },
  'agent-memory-tool.mdx': {
    'from memsy import EventPayload, MemsyClient':
      'An import line shown on its own; the listing collects all imports at the top.',
  },
  'fastapi-support-agent.mdx': {},
}

/**
 * Individual step lines that legitimately do not appear in the listing, with
 * the reason. Line-level rather than block-level on purpose: excluding the
 * whole `// app/api/chat/route.ts` block skipped ~60 lines to spare the 5
 * below, so the model name, system prompt, actor id and limit in Step 5 were
 * unchecked -- changing `"gpt-4o-mini"` to anything at all still passed.
 *
 * Keyed on the trimmed line. Every entry is asserted to match a real step line,
 * so an entry cannot go stale silently.
 */
const EXCLUDED_LINES: Record<string, Record<string, string>> = {
  'nextjs-chat.mdx': {
    '// 3. Record — both sides of the turn, in one batch.':
      "Step 4's narration of the await form; Step 5 supersedes it with waitUntil.",
    'await memsy.ingest([':
      'Step 4 awaits the ingest. The listing carries the Step 5 waitUntil form, which chains .ingest([ off memsy instead.',
    'content: message,':
      'The listing inlines each event as a single-line object, so this field ends the line as `content: message },`.',
    'content: reply,':
      'Same single-line object literal as above, for the assistant side.',
    ']);':
      "Closes Step 4's await form; the waitUntil form closes with `])` and a separate `);`.",
  },
}

const isImport = (l: string) =>
  /^(import |from )/.test(l) || /^import\s/.test(l.trim()) && !l.startsWith(' ')

/** Lines that carry no logic, or that only make sense in a step's narrative. */
function significant(code: string): string[] {
  return code
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '')
    .filter((l) => !isImport(l))
    .filter((l) => !/^(#|\/\/)\s*(main\.py|agent\.py|agent\.ts|identity\.py|app\.py|lib\/memsy\.ts|app\/api\/chat\/route\.ts)$/.test(l.trim()))
}

const files = readdirSync(COOKBOOKS)
  .filter((f) => f.endsWith('.mdx') && f !== 'index.mdx')
  .sort()

describe('cookbook complete-code listings', () => {
  it('finds every recipe page', () => {
    expect(files).toEqual([
      'agent-memory-tool.mdx',
      'fastapi-support-agent.mdx',
      'nextjs-chat.mdx',
      'slack-bot.mdx',
    ])
  })

  it.each(files)('%s has a "Complete code" section with code in it', (file) => {
    const source = readFileSync(path.join(COOKBOOKS, file), 'utf8')
    expect(source).toContain(LISTING_HEADING)

    const listings = blocks(file).filter((b) => b.listing && CODE_LANGS.has(b.lang))
    expect(listings.length).toBeGreaterThan(0)
    // A listing is a whole file, not a fragment.
    expect(Math.max(...listings.map((b) => b.code.split('\n').length))).toBeGreaterThan(10)
  })

  /**
   * The drift guard. The listing exists so a reader can copy one block instead
   * of stitching the steps together -- which only holds while the two say the
   * same thing. Editing a step and forgetting the listing is silent otherwise:
   * both render fine, and the copied code is the stale one.
   */
  it.each(files)('%s: every step line survives into the listing', (file) => {
    const all = blocks(file).filter((b) => CODE_LANGS.has(b.lang))
    const steps = all.filter((b) => !b.listing)
    const listingText = all
      .filter((b) => b.listing)
      .map((b) => b.code)
      .join('\n')

    expect(steps.length, 'no step blocks found -- the extractor is broken').toBeGreaterThan(0)
    expect(listingText.length).toBeGreaterThan(0)

    const excluded = EXCLUDED[file] ?? {}
    const excludedLines = EXCLUDED_LINES[file] ?? {}
    const missing: string[] = []

    for (const step of steps) {
      if (firstLine(step) in excluded) continue
      for (const line of significant(step.code)) {
        if (line.trim() in excludedLines) continue
        if (!listingText.includes(line.trim())) {
          missing.push(`[${firstLine(step).slice(0, 40)}] ${line.trim().slice(0, 70)}`)
        }
      }
    }

    expect(missing, `step lines absent from the complete listing:\n  ${missing.join('\n  ')}`).toEqual([])
  })

  /** Same honesty rule for the line-level exclusions: no entry may go stale. */
  it.each(files)('%s: every excluded line still appears in a step block', (file) => {
    const stepLines = new Set(
      blocks(file)
        .filter((b) => !b.listing && CODE_LANGS.has(b.lang))
        .flatMap((b) => significant(b.code))
        .map((l) => l.trim()),
    )
    for (const line of Object.keys(EXCLUDED_LINES[file] ?? {})) {
      expect(stepLines, `stale EXCLUDED_LINES entry in ${file}: ${line}`).toContain(line)
    }
  })

  /** Keeps the exclusion list honest: no stale entries, no silent additions. */
  it.each(files)('%s: every exclusion still refers to a real step block', (file) => {
    const stepFirstLines = new Set(
      blocks(file).filter((b) => !b.listing && CODE_LANGS.has(b.lang)).map(firstLine),
    )
    for (const [key, reason] of Object.entries(EXCLUDED[file] ?? {})) {
      expect(stepFirstLines, `stale exclusion "${key}"`).toContain(key)
      expect(reason.length, `exclusion "${key}" needs a reason`).toBeGreaterThan(20)
    }
  })
})
