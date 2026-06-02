/**
 * Memsy module for NanoClaw.
 *
 * Self-registers at import time (imported by src/modules/index.ts for side effects).
 *
 * When MEMSY_TURN_SYNC=on in .env, wraps the delivery adapter so every outbound
 * chat message is mirrored to Memsy AFTER it has been delivered to the channel.
 * This never blocks WhatsApp/Telegram/etc delivery — the ingest is fire-and-forget.
 *
 * IMPORTANT: uses readEnvFile() — NanoClaw does NOT load .env into process.env.
 * Using process.env here would always return undefined and silently disable sync.
 */

import {
  onDeliveryAdapterReady,
  type ChannelDeliveryAdapter,
} from '../../delivery.js';
import { readEnvFile } from '../../env.js';

const TRUTHY = new Set(['on', 'true', '1', 'yes', 'enabled']);

function getEnv() {
  const env = readEnvFile(['MEMSY_TURN_SYNC', 'MEMSY_API_KEY', 'MEMSY_BASE_URL']);
  return {
    turnSync: TRUTHY.has((env.MEMSY_TURN_SYNC ?? '').toLowerCase()),
    apiKey: env.MEMSY_API_KEY ?? '',
    baseUrl: env.MEMSY_BASE_URL ?? 'https://api.memsy.io/v1',
  };
}

async function ingestMessage(kind: 'user_message' | 'assistant_message', content: string): Promise<void> {
  const { apiKey, baseUrl } = getEnv();
  if (!apiKey) return;

  try {
    await fetch(`${baseUrl}/ingest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        events: [{ kind, content: content.slice(0, 32000) }],
      }),
    });
  } catch {
    // Fire and forget — never surface ingest failures to delivery
  }
}

if (getEnv().turnSync) {
  onDeliveryAdapterReady((adapter: ChannelDeliveryAdapter) => {
    const originalDeliver = adapter.deliver.bind(adapter);

    // Wrap deliver: send to channel first, then mirror to Memsy in background.
    // The ingest never blocks delivery — if it fails, delivery already succeeded.
    adapter.deliver = async (channelType, platformId, threadId, kind, content, files) => {
      const result = await originalDeliver(channelType, platformId, threadId, kind, content, files);

      if (kind === 'chat' && content && content.length >= 40) {
        ingestMessage('assistant_message', content).catch(() => {});
      }

      return result;
    };
  });
}
