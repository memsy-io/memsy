/**
 * Memsy module for NanoClaw.
 *
 * Self-registers at import time (imported by src/modules/index.ts for side effects).
 *
 * Registers a 'memsy_ingest_turn' delivery action so agents can emit completed
 * turns to Memsy's memory extraction pipeline. When MEMSY_TURN_SYNC=on, the
 * memsy-turn-sync container skill instructs the agent to emit this action after
 * each response; the host catches it here and calls the Memsy ingest API.
 *
 * Activation: set MEMSY_TURN_SYNC=on + MEMSY_API_KEY in host .env
 */

import { registerDeliveryAction } from '../../delivery.js';

const TRUTHY = new Set(['on', 'true', '1', 'yes', 'enabled']);
const BASE_URL = process.env.MEMSY_BASE_URL ?? 'https://api.memsy.io/v1';

interface IngestTurnPayload {
  user_content?: string;
  assistant_content: string;
  session_id?: string;
}

function isTurnSyncEnabled(): boolean {
  return TRUTHY.has((process.env.MEMSY_TURN_SYNC ?? '').toLowerCase());
}

async function handleIngestTurn(payload: IngestTurnPayload): Promise<void> {
  const apiKey = process.env.MEMSY_API_KEY;
  if (!apiKey || !payload.assistant_content || payload.assistant_content.length < 40) return;

  const events: Array<{ kind: string; content: string }> = [];
  if (payload.user_content?.trim()) {
    events.push({ kind: 'user_message', content: payload.user_content.slice(0, 32000) });
  }
  events.push({ kind: 'assistant_message', content: payload.assistant_content.slice(0, 32000) });

  try {
    await fetch(`${BASE_URL}/ingest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ events }),
    });
  } catch {
    // Fire and forget — never block NanoClaw delivery
  }
}

if (isTurnSyncEnabled()) {
  registerDeliveryAction('memsy_ingest_turn', handleIngestTurn);
}
