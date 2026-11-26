import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ExternalLink, LogOut } from 'lucide-react';
import { authApi } from '../../api/auth';
import { useWebSocket } from '../../context/WebSocketContext';

const ROLE_LABEL = { SUPER_ADMIN: 'Superadmin', ORGANIZER: 'Organizer', SCORER: 'Scorer' };

/**
 * Slim header for matchday operation (/scorer and the live console): who you are, whether live updates
 * are flowing, and a way out. No marketing banner, no tournament picker, no footer.
 */
export function OperationsBar() {
  const navigate = useNavigate();
  const { isConnected } = useWebSocket();
  const role = authApi.getRole();

  const handleLogout = () => {
    authApi.logout();
    navigate('/');
  };

  return (
    <header className="ops-bar">
      <div className="ops-bar__inner">
        <Link to="/scorer" className="ops-bar__brand" aria-label="MatchGrid scorer cockpit">
          <img src="/brand/matchgrid-logo.png" alt="" className="brand-logo-img" />
          <span className="ops-bar__wordmark">
            Match<span>Grid</span>
          </span>
        </Link>

        {/* The account name lives in the tooltip/label: pages show it where it matters (the cockpit header),
            and a second visible copy here would only duplicate it. */}
        <div
          className="ops-bar__who"
          title={`Signed in as ${authApi.getUsername()}`}
          aria-label={`Signed in as ${authApi.getUsername()}${role ? `, ${ROLE_LABEL[role] || role}` : ''}`}
        >
          <span className="ops-bar__role ops-bar__role--solid">{ROLE_LABEL[role] || 'Staff'}</span>
        </div>

        <div className="ops-bar__spacer" />

        <div
          className={`connection-indicator ${isConnected ? 'online' : ''}`}
          role="status"
          aria-label={isConnected ? 'Live updates connected' : 'Reconnecting to live updates'}
          title={isConnected ? 'Live updates connected' : 'Reconnecting to live updates…'}
        >
          <span className="connection-dot" />
        </div>

        <Link to="/" className="btn btn-sm btn-outline ops-bar__hub">
          <ExternalLink size={13} aria-hidden="true" /> <span className="ops-bar__hub-label">Public hub</span>
        </Link>
        <button type="button" onClick={handleLogout} className="btn btn-sm btn-danger" title="Logout" aria-label="Logout">
          <LogOut size={13} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

export default OperationsBar;
