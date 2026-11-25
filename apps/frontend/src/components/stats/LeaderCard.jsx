import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../common/Avatar';
import { Trophy } from 'lucide-react';
import { useTournament } from '../../context/TournamentContext';
import { tPath } from '../../utils/paths';

export function LeaderCard({ title, icon: Icon = Trophy, unit = '', items = [], limit = 10 }) {
  const navigate = useNavigate();
  const { slug } = useTournament();

  return (
    <div className="card">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '16px',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '12px',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            background: 'var(--brand-primary-tint)',
            color: 'var(--brand-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={18} />
        </div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
          {title}
        </h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.slice(0, limit).map((item, idx) => {
          const isFirst = idx === 0;
          return (
            <div
              key={item.player_id || idx}
              onClick={() => item.player_id && navigate(tPath(slug, `players/${item.player_id}`))}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 12px',
                borderRadius: '8px',
                background: isFirst ? 'var(--accent-gold-tint)' : 'var(--bg-elevated)',
                border: `1px solid ${isFirst ? 'rgba(245, 158, 11, 0.4)' : 'var(--border-subtle)'}`,
                cursor: item.player_id ? 'pointer' : 'default',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: '14px',
                    width: '20px',
                    textAlign: 'center',
                    color: isFirst ? 'var(--accent-gold)' : 'var(--text-secondary)',
                  }}
                >
                  {idx + 1}
                </span>
                <Avatar
                  name={item.player_name}
                  photoUrl={item.photo_url}
                  size={30}
                  color={isFirst ? '#F59E0B' : '#10B981'}
                />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '13.5px',
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.player_name}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.team_name}
                  </div>
                </div>
              </div>

              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: '18px',
                  color: isFirst ? 'var(--accent-gold)' : 'var(--text-primary)',
                  textAlign: 'right',
                  flexShrink: 0,
                  marginLeft: '12px',
                }}
              >
                {item.value}{' '}
                {unit && (
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    {unit}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
            No stats recorded for this category yet.
          </div>
        )}
      </div>
    </div>
  );
}
export default LeaderCard;
