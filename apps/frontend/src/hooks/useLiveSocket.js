import { useEffect, useRef } from 'react';
import { useWebSocket } from '../context/WebSocketContext';

/**
 * Hook to subscribe to tournament-wide or global live WebSocket notifications.
 * @param {Function} onMessage - Callback function called when a message arrives: (message) => void
 * @param {string|null} tournamentId - Optional tournament ID to scope WebSocket traffic
 */
export function useLiveSocket(onMessage, tournamentId = null) {
  const { connected, isConnected, subscribe } = useWebSocket();
  const savedHandler = useRef(onMessage);

  useEffect(() => {
    savedHandler.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!savedHandler.current) return;
    const unsubscribe = subscribe((msg) => {
      if (savedHandler.current) {
        savedHandler.current(msg);
      }
    }, tournamentId);
    return unsubscribe;
  }, [subscribe, tournamentId]);

  return { connected: connected ?? isConnected, isConnected: connected ?? isConnected };
}

