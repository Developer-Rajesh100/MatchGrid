import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

const WebSocketContext = createContext({
  connected: false,
  subscribe: () => () => {},
});

export function WebSocketProvider({ children }) {
  const [connected, setConnected] = useState(false);
  const subscribersRef = useRef(new Set());
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const retryCountRef = useRef(0);
  const isUnmountedRef = useRef(false);

  const connect = () => {
    if (isUnmountedRef.current) return;

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/live`;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        setConnected(true);
        retryCountRef.current = 0;
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          subscribersRef.current.forEach((cb) => {
            try {
              cb(data);
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
  };

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
  }, []);

  const subscribe = (callback) => {
    subscribersRef.current.add(callback);
    return () => {
      subscribersRef.current.delete(callback);
    };
  };

  return (
    <WebSocketContext.Provider value={{ connected, subscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}
