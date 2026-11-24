import React, { useEffect } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { WebSocketProvider, useWebSocket } from './WebSocketContext';

// Mock WebSocket class
class MockWebSocket {
  static instances = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.send = vi.fn();
    this.close = vi.fn(() => {
      this.readyState = MockWebSocket.CLOSED;
      if (this.onclose) this.onclose();
    });
    MockWebSocket.instances.push(this);
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) this.onopen();
  }

  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data: typeof data === 'string' ? data : JSON.stringify(data) });
    }
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }
}

describe('WebSocketContext and Room Subscriptions', () => {
  let originalWebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    originalWebSocket = global.WebSocket;
    global.WebSocket = MockWebSocket;
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;
    vi.useRealTimers();
  });

  function TestConsumer({ tournamentId = null, onMessage = null }) {
    const { connected, isConnected, subscribe } = useWebSocket();

    useEffect(() => {
      if (onMessage) {
        const unsubscribe = subscribe(onMessage, tournamentId);
        return unsubscribe;
      }
    }, [subscribe, tournamentId, onMessage]);

    return (
      <div>
        <span data-testid="status">{connected && isConnected ? 'CONNECTED' : 'DISCONNECTED'}</span>
      </div>
    );
  }

  it('connects and reflects online status', () => {
    render(
      <WebSocketProvider>
        <TestConsumer />
      </WebSocketProvider>
    );

    const ws = MockWebSocket.instances[0];
    expect(ws).toBeDefined();
    expect(screen.getByTestId('status').textContent).toBe('DISCONNECTED');

    act(() => {
      ws.simulateOpen();
    });

    expect(screen.getByTestId('status').textContent).toBe('CONNECTED');
  });

  it('sends subscribe frame when a component subscribes to a tournament room', () => {
    const onMsg = vi.fn();
    render(
      <WebSocketProvider>
        <TestConsumer tournamentId="tourney_1" onMessage={onMsg} />
      </WebSocketProvider>
    );

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.simulateOpen();
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ action: 'subscribe', tournament_id: 'tourney_1' })
    );
  });

  it('routes room messages exclusively to room subscribers', () => {
    const onTourney1 = vi.fn();
    const onTourney2 = vi.fn();
    const onGlobal = vi.fn();

    render(
      <WebSocketProvider>
        <TestConsumer tournamentId="tourney_1" onMessage={onTourney1} />
        <TestConsumer tournamentId="tourney_2" onMessage={onTourney2} />
        <TestConsumer tournamentId={null} onMessage={onGlobal} />
      </WebSocketProvider>
    );

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.simulateOpen();
    });

    // 1. Message directed to tourney_1
    act(() => {
      ws.simulateMessage({
        type: 'match_started',
        tournament_id: 'tourney_1',
        match_id: 'm1',
      });
    });

    expect(onTourney1).toHaveBeenCalledTimes(1);
    expect(onTourney1).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'match_started', tournament_id: 'tourney_1' })
    );
    // tourney_2 should not receive it
    expect(onTourney2).not.toHaveBeenCalled();
    // global subscriber receives all
    expect(onGlobal).toHaveBeenCalledTimes(1);

    // 2. Message directed to tourney_2
    act(() => {
      ws.simulateMessage({
        type: 'goal_scored',
        tournament_id: 'tourney_2',
        match_id: 'm2',
      });
    });

    expect(onTourney1).toHaveBeenCalledTimes(1); // Still 1
    expect(onTourney2).toHaveBeenCalledTimes(1); // Received
    expect(onGlobal).toHaveBeenCalledTimes(2); // Received both
  });

  it('sends unsubscribe frame when the room subscriber unmounts', () => {
    const onMsg = vi.fn();
    function Wrapper({ showConsumer }) {
      return (
        <WebSocketProvider>
          {showConsumer && <TestConsumer tournamentId="tourney_99" onMessage={onMsg} />}
        </WebSocketProvider>
      );
    }

    const { rerender } = render(<Wrapper showConsumer={true} />);

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.simulateOpen();
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ action: 'subscribe', tournament_id: 'tourney_99' })
    );

    // Unmount consumer only
    rerender(<Wrapper showConsumer={false} />);

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ action: 'unsubscribe', tournament_id: 'tourney_99' })
    );
  });

  it('re-subscribes active rooms automatically after reconnection', () => {
    const onMsg = vi.fn();
    render(
      <WebSocketProvider>
        <TestConsumer tournamentId="tourney_active" onMessage={onMsg} />
      </WebSocketProvider>
    );

    const ws1 = MockWebSocket.instances[0];
    act(() => {
      ws1.simulateOpen();
    });
    expect(ws1.send).toHaveBeenCalledWith(
      JSON.stringify({ action: 'subscribe', tournament_id: 'tourney_active' })
    );

    // Simulate socket disconnect
    act(() => {
      ws1.simulateClose();
    });

    // Fast forward backoff timer
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // A second socket should have been created
    expect(MockWebSocket.instances.length).toBe(2);
    const ws2 = MockWebSocket.instances[1];

    act(() => {
      ws2.simulateOpen();
    });

    // Automatically re-subscribed to tourney_active
    expect(ws2.send).toHaveBeenCalledWith(
      JSON.stringify({ action: 'subscribe', tournament_id: 'tourney_active' })
    );
  });
});
