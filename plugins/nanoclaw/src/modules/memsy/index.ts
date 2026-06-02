/**
 * Memsy module for NanoClaw.
 *
 * Turn sync is handled directly in delivery.ts via memsyIngestAfterDelivery()
 * which is called after every 'chat' message delivery. This module is kept
 * as a registration stub so it appears in the modules barrel.
 *
 * Key learning: NanoClaw does NOT load .env into process.env — always use
 * readEnvFile() from ../../env.js to read .env values.
 */

import { log } from '../../log.js';
import { readEnvFile } from '../../env.js';

const env = readEnvFile(['MEMSY_TURN_SYNC', 'MEMSY_API_KEY']);
const turnSync = ['on', 'true', '1', 'yes', 'enabled'].includes((env.MEMSY_TURN_SYNC ?? '').toLowerCase());

log.info('Memsy module loaded', { turnSync, hasKey: !!env.MEMSY_API_KEY });
