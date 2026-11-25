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
  // True while this socket sits in the server's hub-level "global" room (it receives only
  // hub events such as match_status_changed, never another tournament's traffic).
  const inGlobalRef = useRef(false);
  const hasOpenedBeforeRef = useRef(false);
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

  // Only listeners that did not name a tournament need the global room; leave it otherwise.
  const syncGlobalRoom = useCallback(() => {
    const needsGlobal = Array.from(subscribersRef.current).some((sub) => !sub.tournamentId);
    if (needsGlobal && !inGlobalRef.current) {
      inGlobalRef.current = true;
      sendRoomAction('subscribe', 'global');
    } else if (!needsGlobal && inGlobalRef.current) {
      inGlobalRef.current = false;
      sendRoomAction('unsubscribe', 'global');
    }
  }, [sendRoomAction]);

  const connect = useCallback(() => {
    if (isUnmountedRef.current) return;

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // Join the first tournament room straight from the URL; with no tournament known yet the
      // server places us in the hub room, and syncGlobalRoom() leaves it if nobody needs it.
      const rooms = Array.from(activeRoomsRef.current.keys());
      const query = rooms.length ? `?tournament_id=${encodeURIComponent(rooms[0])}` : '';
      const wsUrl = `${protocol}//${window.location.host}/ws/live${query}`;
      const socket = new WebSocket(wsUrl);
      inGlobalRef.current = rooms.length === 0;
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
        syncGlobalRoom();

        // Events broadcast while we were offline are gone for good: after a RE-connect, tell every
        // listener to refetch its data so pages never keep showing stale scores.
        if (hasOpenedBeforeRef.current) {
          subscribersRef.current.forEach((sub) => {
            try {
              sub.callback({ type: 'resync' });
            } catch (err) {
              console.error('Error in WebSocket resync callback:', err);
            }
          });
        }
        hasOpenedBeforeRef.current = true;
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
        // A stale socket (e.g. closed by StrictMode's remount) must not clobber the live one.
        if (socketRef.current !== socket) return;
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
  }, [syncGlobalRoom]);

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
    syncGlobalRoom();

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
      syncGlobalRoom();
    };
  }, [sendRoomAction, syncGlobalRoom]);

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

