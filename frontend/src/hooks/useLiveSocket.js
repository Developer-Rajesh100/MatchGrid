import { useEffect, useRef } from 'react';
import { useWebSocket } from '../context/WebSocketContext';

/**
 * Hook to subscribe to tournament-wide live WebSocket notifications.
 * @param {Function} onMessage - Callback function called when a message arrives: (message) => void
 */
export function useLiveSocket(onMessage) {
  const { connected, subscribe } = useWebSocket();
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
    });
    return unsubscribe;
  }, [subscribe]);

  return { connected };
}
