/**
 * Memsy module for NanoClaw.
 *
 * Self-registers at import time (imported by src/modules/index.ts for side effects).
 *
 * When MEMSY_TURN_SYNC=on, wraps the delivery adapter so every outbound chat
 * message is mirrored to Memsy AFTER it has been delivered to the channel.
 * This never blocks WhatsApp/Telegram/etc delivery — the ingest is fire-and-forget.
 *
 * Activation: set MEMSY_TURN_SYNC=on + MEMSY_API_KEY in host .env
 */

import {
  onDeliveryAdapterReady,
  type ChannelDeliveryAdapter,
} from '../../delivery.js';

const TRUTHY = new Set(['on', 'true', '1', 'yes', 'enabled']);
const BASE_URL = process.env.MEMSY_BASE_URL ?? 'https://api.memsy.io/v1';

function isTurnSyncEnabled(): boolean {
  return TRUTHY.has((process.env.MEMSY_TURN_SYNC ?? '').toLowerCase());
}

async function ingestMessage(kind: 'user_message' | 'assistant_message', content: string): Promise<void> {
  const apiKey = process.env.MEMSY_API_KEY;
  if (!apiKey) return;

  try {
    await fetch(`${BASE_URL}/ingest`, {
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

if (isTurnSyncEnabled()) {
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
