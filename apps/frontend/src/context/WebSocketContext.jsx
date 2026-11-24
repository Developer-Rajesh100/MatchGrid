import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

const WebSocketContext = createContext({
  connected: false,
  isConnected: false,
  subscribe: () => () => {},
  subscribeRoom: () => () => {},
});

export function WebSocketProvider({ children }) {
  const [connected, setConnected] = useState(false);
  const subscribersRef = useRef(new Set());
  const activeRoomsRef = useRef(new Map()); // tournamentId -> refCount
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const retryCountRef = useRef(0);
  const isUnmountedRef = useRef(false);

  const sendRoomAction = useCallback((action, tournamentId) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      try {
        socketRef.current.send(JSON.stringify({ action, tournament_id: tournamentId }));
      } catch (err) {
        console.error(`Failed to send WebSocket ${action} for tournament ${tournamentId}:`, err);
      }
    }
  }, []);

  const connect = useCallback(() => {
    if (isUnmountedRef.current) return;

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/live`;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        setConnected(true);
        retryCountRef.current = 0;

        // Automatically resubscribe all active tournament rooms
        activeRoomsRef.current.forEach((count, tournamentId) => {
          if (count > 0) {
            try {
              socket.send(JSON.stringify({ action: 'subscribe', tournament_id: tournamentId }));
            } catch (err) {
              console.error(`Error resubscribing to room ${tournamentId}:`, err);
            }
          }
        });
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          subscribersRef.current.forEach((sub) => {
            try {
              // If subscriber didn't specify a room, or message matches subscriber's tournamentId
              if (!sub.tournamentId || !data.tournament_id || sub.tournamentId === data.tournament_id) {
                sub.callback(data);
              }
            } catch (err) {
              console.error('Error in WebSocket subscriber callback:', err);
            }
          });
        } catch {
          // Ignore non-JSON frame (e.g. pong)
        }
      };

      socket.onclose = () => {
        setConnected(false);
        socketRef.current = null;
        if (!isUnmountedRef.current) {
          // Exponential backoff capped at 10 seconds
          const delay = Math.min(1000 * 2 ** retryCountRef.current, 10000);
          retryCountRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      socket.onerror = () => {
        socket.close();
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
    }
  }, []);

  useEffect(() => {
    isUnmountedRef.current = false;
    connect();

    // Heartbeat ping every 30s
    const pingInterval = setInterval(() => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send('ping');
      }
    }, 30000);

    return () => {
      isUnmountedRef.current = true;
      clearInterval(pingInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) socketRef.current.close();
    };
  }, [connect]);

  const subscribe = useCallback((callback, tournamentId = null) => {
    const subRecord = { callback, tournamentId: tournamentId ? String(tournamentId) : null };
    subscribersRef.current.add(subRecord);

    if (subRecord.tournamentId) {
      const tid = subRecord.tournamentId;
      const count = (activeRoomsRef.current.get(tid) || 0) + 1;
      activeRoomsRef.current.set(tid, count);
      if (count === 1) {
        sendRoomAction('subscribe', tid);
      }
    }

    return () => {
      subscribersRef.current.delete(subRecord);
      if (subRecord.tournamentId) {
        const tid = subRecord.tournamentId;
        const count = (activeRoomsRef.current.get(tid) || 1) - 1;
        if (count <= 0) {
          activeRoomsRef.current.delete(tid);
          sendRoomAction('unsubscribe', tid);
        } else {
          activeRoomsRef.current.set(tid, count);
        }
      }
    };
  }, [sendRoomAction]);

  const subscribeRoom = useCallback((tournamentId, callback) => {
    return subscribe(callback, tournamentId);
  }, [subscribe]);

  return (
    <WebSocketContext.Provider value={{ connected, isConnected: connected, subscribe, subscribeRoom }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}

