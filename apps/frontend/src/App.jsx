import React from 'react';
import { useLocation } from 'react-router-dom';
import { NavBar } from './components/nav/NavBar';
import { OperationsBar } from './components/nav/OperationsBar';
import { Footer } from './components/layout/Footer';
import { AppRouter } from './routes/AppRouter';
import { WebSocketProvider } from './context/WebSocketContext';

// The tournament context is provided once, by TournamentLayout, for the /t/:slug/* subtree only.

// Matchday operation (/scorer, the live console) gets a focused shell: no public navigation or footer.
const OPERATIONS_PATH = /^\/scorer(\/|$)/;

function Shell() {
  const { pathname } = useLocation();

  if (OPERATIONS_PATH.test(pathname)) {
    return (
      <div className="ops-shell">
        <OperationsBar />
        <main className="ops-main">
          <AppRouter />
        </main>
      </div>
    );
  }

  return (
    <div className="matchgrid-app">
      <NavBar />
      <main>
        <AppRouter />
      </main>
      <Footer />
    </div>
  );
}

export function App() {
  return (
    <WebSocketProvider>
      <Shell />
    </WebSocketProvider>
  );
}
export default App;
