/**
 * Memsy turn sync — shared ingest helper used by both the inbound router
 * (user messages) and the outbound delivery loop (assistant messages).
 *
 * Two hard-won learnings:
 *  1. NanoClaw does NOT load .env into process.env — always use readEnvFile().
 *  2. /ingest REQUIRES actor_id + session_id per event (the MCP server fills
 *     these from its identity layer; direct HTTP callers must supply them or
 *     the API returns 422).
 */

import { readEnvFile } from './env.js';
import { log } from './log.js';

const TRUTHY = new Set(['on', 'true', '1', 'yes', 'enabled']);

// Minimum content length to bother ingesting. Low floor — Memsy's extraction
// pipeline does the real "is this worth remembering" filtering. We only skip
// trivial acks ("ok", "yes", "thanks").
const MIN_CHARS = 10;

/** Extract plain text from NanoClaw's JSON-encoded message content. */
function extractText(rawContent: string): string {
  try {
    const parsed = JSON.parse(rawContent) as { text?: string; content?: string } | string;
    if (typeof parsed === 'string') return parsed;
    return parsed.text ?? parsed.content ?? rawContent;
  } catch {
    return rawContent;
  }
}

export function memsyTurnSyncEnabled(): boolean {
  const env = readEnvFile(['MEMSY_TURN_SYNC']);
  return TRUTHY.has((env.MEMSY_TURN_SYNC ?? '').toLowerCase());
}

/**
 * Mirror one conversation turn event to Memsy. Fire-and-forget — never throws.
 * Call with `await ... .catch(() => {})` from hot paths.
 */
export async function memsyIngest(
  kind: 'user_message' | 'assistant_message',
  rawContent: string,
  sessionId: string,
): Promise<void> {
  const env = readEnvFile(['MEMSY_TURN_SYNC', 'MEMSY_API_KEY', 'MEMSY_BASE_URL', 'MEMSY_ACTOR_ID']);
  if (!TRUTHY.has((env.MEMSY_TURN_SYNC ?? '').toLowerCase())) return;
  const apiKey = env.MEMSY_API_KEY;
  if (!apiKey) return;

  const text = extractText(rawContent);
  if (!text || text.length < MIN_CHARS) return;

  const baseUrl = env.MEMSY_BASE_URL ?? 'https://api.memsy.io/v1';
  const actorId = env.MEMSY_ACTOR_ID || 'nanoclaw';

  try {
    const res = await fetch(`${baseUrl}/ingest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [{ kind, content: text.slice(0, 32000), actor_id: actorId, session_id: sessionId }],
      }),
    });
    log.info('Memsy turn synced', { kind, status: res.status, contentLen: text.length });
  } catch (err) {
    log.debug('Memsy ingest failed (non-fatal)', { err });
  }
}
