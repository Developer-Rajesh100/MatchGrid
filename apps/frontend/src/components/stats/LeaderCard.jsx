import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../common/Avatar';
import { Trophy } from 'lucide-react';
import { useTournament } from '../../context/TournamentContext';
import { tPath } from '../../utils/paths';

export function LeaderCard({ title, icon: Icon = Trophy, unit = '', items = [], limit = 10 }) {
  const navigate = useNavigate();
  const { slug } = useTournament();
  const rows = items.slice(0, limit);

  return (
    <section className="card leader-card">
      <h3 className="leader-card__title">
        <Icon size={17} aria-hidden="true" />
        {title}
      </h3>

      <ol className="leader-card__list">
        {rows.map((item, idx) => {
          const open = item.player_id ? () => navigate(tPath(slug, `players/${item.player_id}`)) : undefined;
          return (
            <li
              key={item.player_id || idx}
              className={`leader-row ${idx === 0 ? 'is-first' : ''} ${open ? 'is-link' : ''}`}
              onClick={open}
              onKeyDown={open ? (e) => { if (e.key === 'Enter') open(); } : undefined}
              tabIndex={open ? 0 : undefined}
              role={open ? 'link' : undefined}
            >
              <span className="leader-row__rank num">{idx + 1}</span>
              <Avatar name={item.player_name} crestUrl={item.photo_url} size={30} color={idx === 0 ? '#F59E0B' : '#64748B'} />
              <span className="leader-row__who">
                <span className="leader-row__name">{item.player_name}</span>
                <span className="leader-row__team">{item.team_name}</span>
              </span>
              <span className="leader-row__value">
                <span className="num">{item.value}</span>
                {unit && <span className="leader-row__unit">{unit}</span>}
              </span>
            </li>
          );
        })}
        {rows.length === 0 && <li className="leader-card__empty">No stats recorded for this category yet.</li>}
      </ol>
    </section>
  );
}
