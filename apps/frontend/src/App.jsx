import React from 'react';
import { NavBar } from './components/nav/NavBar';
import { Footer } from './components/layout/Footer';
import { AppRouter } from './routes/AppRouter';
import { WebSocketProvider } from './context/WebSocketContext';
import { TournamentProvider } from './context/TournamentContext';

export function App() {
  return (
    <WebSocketProvider>
      <TournamentProvider>
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
      </TournamentProvider>
    </WebSocketProvider>
  );
}
export default App;
