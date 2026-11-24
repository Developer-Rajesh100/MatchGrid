import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, Trophy, Check, Radio } from 'lucide-react';
import { tournamentApi } from '../../api/tournament';
import { useTournament } from '../../context/TournamentContext';

export function TournamentSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tournament } = useTournament();
  const [tournaments, setTournaments] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  const loadTournaments = async () => {
    try {
      setLoading(true);
      const data = await tournamentApi.getPublicTournaments();
      setTournaments(Array.isArray(data) ? data : []);
    } catch {
      // Graceful fallback
      setTournaments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTournaments();
  }, []);

  // Close dropdown on outside click or route change
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  const handleSelect = (slug) => {
    setIsOpen(false);
    if (slug) {
      navigate(`/t/${slug}`);
    } else {
      navigate('/');
    }
  };

  const match = location.pathname ? location.pathname.match(/\/t\/([^/]+)/) : null;
  const pathSlug = match ? match[1] : null;
  const activeTourney =
    tournament ||
    (pathSlug ? tournaments.find((t) => t.slug === pathSlug || t.id === pathSlug) : null);
  const currentLabel = activeTourney ? activeTourney.name : 'Tournaments';

  return (
    <div className="tournament-switcher" ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className={`tournament-switcher-btn ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Select tournament"
      >
        <Trophy size={14} className="switcher-icon" />
        <span className="switcher-label" title={currentLabel}>{currentLabel}</span>
        <ChevronDown size={13} className={`switcher-arrow ${isOpen ? 'rotate' : ''}`} />
      </button>

      {isOpen && (
        <div className="tournament-switcher-menu" role="listbox">
          <div className="switcher-header">
            <span>Competitions</span>
            <button
              type="button"
              className="switcher-hub-link"
              onClick={() => handleSelect(null)}
            >
              All Hub →
            </button>
          </div>

          <div className="switcher-list">
            {tournaments.length === 0 ? (
              <div className="switcher-empty">
                {loading ? 'Loading competitions...' : 'No public tournaments found'}
              </div>
            ) : (
              tournaments.map((t) => {
                const isSelected = activeTourney && (activeTourney.id === t.id || activeTourney.slug === t.slug);
                const status = (t.status || 'UPCOMING').toUpperCase();
                const isLive = t.live_matches_count > 0 || status === 'LIVE';

                return (
                  <button
                    key={t.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`switcher-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelect(t.slug)}
                  >
                    <div className="switcher-item-left">
                      {t.logo_url ? (
                        <img src={t.logo_url} alt="" className="switcher-crest" />
                      ) : (
                        <div className="switcher-crest-placeholder">
                          <Trophy size={12} />
                        </div>
                      )}
                      <div className="switcher-item-info">
                        <span className="switcher-item-name">{t.name}</span>
                        <span className="switcher-item-sub">
                          {t.season || 'Season 1'} &bull; {t.teams_count || 0} Clubs
                        </span>
                      </div>
                    </div>

                    <div className="switcher-item-right">
                      {isLive ? (
                        <span className="pill pill-live pill-xs">
                          <Radio size={9} className="pulse-icon" /> LIVE
                        </span>
                      ) : (
                        <span className={`pill pill-${status.toLowerCase()} pill-xs`}>
                          {status}
                        </span>
                      )}
                      {isSelected && <Check size={14} className="switcher-check" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TournamentSwitcher;
