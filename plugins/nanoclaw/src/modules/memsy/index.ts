/**
 * Memsy module for NanoClaw — turn sync.
 *
 * When MEMSY_TURN_SYNC=on, wraps the delivery adapter so every outbound chat
 * message is mirrored to Memsy AFTER it has been delivered. Fire-and-forget —
 * never blocks WhatsApp/Telegram/etc delivery.
 *
 * Two hard-won learnings baked in here:
 *
 *  1. NanoClaw does NOT load .env into process.env. Always read config via
 *     readEnvFile() from ../../env.js — process.env.MEMSY_* is always undefined.
 *
 *  2. The /ingest endpoint REQUIRES actor_id AND session_id on every event.
 *     The MCP server fills these from its identity layer; a direct HTTP caller
 *     must supply them or the API returns 422 Unprocessable Entity.
 */

import {
  onDeliveryAdapterReady,
  type ChannelDeliveryAdapter,
} from '../../delivery.js';
import { readEnvFile } from '../../env.js';
import { log } from '../../log.js';

const TRUTHY = new Set(['on', 'true', '1', 'yes', 'enabled']);

function getEnv() {
  const env = readEnvFile(['MEMSY_TURN_SYNC', 'MEMSY_API_KEY', 'MEMSY_BASE_URL', 'MEMSY_ACTOR_ID']);
  return {
    turnSync: TRUTHY.has((env.MEMSY_TURN_SYNC ?? '').toLowerCase()),
    apiKey: env.MEMSY_API_KEY ?? '',
    baseUrl: env.MEMSY_BASE_URL ?? 'https://api.memsy.io/v1',
    actorId: env.MEMSY_ACTOR_ID || 'nanoclaw',
  };
}

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

async function ingest(text: string, sessionId: string): Promise<void> {
  const { apiKey, baseUrl, actorId } = getEnv();
  if (!apiKey || !text || text.length < 40) return;

  try {
    const res = await fetch(`${baseUrl}/ingest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          {
            kind: 'assistant_message',
            content: text.slice(0, 32000),
            actor_id: actorId,
            session_id: sessionId,
          },
        ],
      }),
    });
    log.info('Memsy turn ingested', { status: res.status });
  } catch (err) {
    log.debug('Memsy ingest failed (non-fatal)', { err });
  }
}

const _env = getEnv();
log.info('Memsy module loaded', { turnSync: _env.turnSync, hasKey: !!_env.apiKey });

if (_env.turnSync) {
  onDeliveryAdapterReady((adapter: ChannelDeliveryAdapter) => {
    const originalDeliver = adapter.deliver.bind(adapter);

    adapter.deliver = async (channelType, platformId, threadId, kind, content, files) => {
      const result = await originalDeliver(channelType, platformId, threadId, kind, content, files);

      // Group memories per chat thread (the adapter signature exposes no
      // NanoClaw session id; channelType+platformId+threadId is a stable proxy).
      if (kind === 'chat') {
        const sessionId = `${channelType}:${platformId}${threadId ? `:${threadId}` : ''}`;
        ingest(extractText(content), sessionId).catch(() => {});
      }

      return result;
    };
  });
}
