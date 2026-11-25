import React from 'react';
import { NavBar } from './components/nav/NavBar';
import { Footer } from './components/layout/Footer';
import { AppRouter } from './routes/AppRouter';
import { WebSocketProvider } from './context/WebSocketContext';

// The tournament context is provided once, by TournamentLayout, for the /t/:slug/* subtree only.
export function App() {
  return (
    <WebSocketProvider>
      <div className="matchgrid-app">
        <NavBar />
        <div className="brand-banner">
          <span className="brand-banner-badge">MATCHGRID LIVE</span>
          <span>Tournament Live Scoreboard &bull; Real-Time Match Clocks &bull; Standings &bull; Knockout Brackets</span>
        </div>
        <main>
          <AppRouter />
        </main>
        <Footer />
      </div>
    </WebSocketProvider>
  );
}
export default App;
