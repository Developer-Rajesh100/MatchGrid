import React from 'react';
import { NavBar } from './components/nav/NavBar';
import { AppRouter } from './routes/AppRouter';
import { WebSocketProvider } from './context/WebSocketContext';

export function App() {
  return (
    <WebSocketProvider>
      <div className="dcl-app">
        <NavBar />
        <div className="dcl-banner">
          <span className="dcl-banner-badge">OFFICIAL SCOREBOARD</span>
          <span>DCL Season 5 Football Tournament · 6 Teams · 2 Groups · Knockouts</span>
        </div>
        <main>
          <AppRouter />
        </main>
        <footer
          style={{
            borderTop: '1px solid var(--line)',
            padding: '24px 16px',
            textAlign: 'center',
            fontSize: '12px',
            color: 'var(--chalk-dim)',
            background: 'var(--base-dark)',
          }}
        >
          <p>DCL Season 5 Digital Scoreboard & Live Match Centre · Built for Football Tournaments</p>
        </footer>
      </div>
    </WebSocketProvider>
  );
}
export default App;
