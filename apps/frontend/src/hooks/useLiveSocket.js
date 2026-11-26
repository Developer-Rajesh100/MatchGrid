import { useEffect, useRef } from 'react';
import { useWebSocket } from '../context/WebSocketContext';

// Server frames are cache-invalidation signals (see app/core/websocket.py). One user action can
// emit several (a goal: match_event_added, plus match_updated for every bracket slot it moves), so
// listeners that refetch are called once per burst, not once per frame.
export const LIVE_REFRESH_DELAY_MS = 250;

/**
 * Subscribes to live notifications for one tournament room (or the hub-level "global" room).
 *
 * @param {Function} onMessage  called with the last message of a burst: (message) => void
 * @param {string|null} tournamentId  the room; null = the global (hub) room
 * @param {object} [options]
 * @param {boolean} [options.enabled=true]  false = no subscription at all. Tournament pages pass
 *   `enabled: Boolean(tournamentId)` so they never join the global room while their tournament
 *   is still loading.
 * @param {string[]} [options.types]  only these message types (plus 'resync' after a reconnect)
 * @param {Function} [options.filter]  (message) => boolean, checked on every frame BEFORE coalescing
 *   (e.g. "is this about my match?"), so a burst ending with an unrelated frame still triggers
 * @param {number} [options.delayMs]  coalescing window; 0 delivers every message immediately
 */
export function useLiveSocket(onMessage, tournamentId = null, options = {}) {
  const { enabled = true, types = null, delayMs = LIVE_REFRESH_DELAY_MS } = options;
  const { connected, isConnected, subscribe } = useWebSocket();
  const savedHandler = useRef(onMessage);
  const savedFilter = useRef(options.filter);
  savedFilter.current = options.filter;
  const typesKey = types ? types.join(',') : '';

  useEffect(() => {
    savedHandler.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!enabled) return undefined;
    const accepted = typesKey ? new Set([...typesKey.split(','), 'resync']) : null;
    let timer = null;
    let pending = null;

    const deliver = () => {
      timer = null;
      const msg = pending;
      pending = null;
      if (savedHandler.current) savedHandler.current(msg);
    };

    const unsubscribe = subscribe((msg) => {
      if (accepted && !accepted.has(msg?.type)) return;
      if (msg?.type !== 'resync' && savedFilter.current && !savedFilter.current(msg)) return;
      if (delayMs <= 0) {
        if (savedHandler.current) savedHandler.current(msg);
        return;
      }
      pending = msg;
      if (timer === null) timer = setTimeout(deliver, delayMs);
    }, tournamentId);

    return () => {
      if (timer !== null) clearTimeout(timer);
      unsubscribe();
    };
  }, [subscribe, tournamentId, enabled, typesKey, delayMs]);

  return { connected: connected ?? isConnected, isConnected: connected ?? isConnected };
}
