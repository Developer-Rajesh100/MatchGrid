import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../common/Avatar';

export function LeaderCard({ title, icon: Icon, unit = '', items = [], limit = 10 }) {
  const navigate = useNavigate();

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', borderBottom: '1px solid var(--line)', paddingBottom: '10px' }}>
        {Icon && <Icon size={18} color="var(--amber)" />}
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600 }}>{title}</h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.slice(0, limit).map((item, idx) => (
          <div
            key={item.player_id || idx}
            onClick={() => item.player_id && navigate(`/players/${item.player_id}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 10px',
              borderRadius: '6px',
              background: idx === 0 ? 'rgba(240, 165, 61, 0.08)' : 'var(--panel-alt)',
              border: `1px solid ${idx === 0 ? 'rgba(240, 165, 61, 0.3)' : 'var(--line)'}`,
              cursor: item.player_id ? 'pointer' : 'default',
              transition: 'background 0.15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: '14px',
                  width: '18px',
                  color: idx === 0 ? 'var(--amber)' : 'var(--chalk-dim)',
                }}
              >
                {idx + 1}
              </span>
              <Avatar name={item.player_name} size={28} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{item.player_name}</div>
                <div style={{ fontSize: '11px', color: 'var(--chalk-dim)' }}>{item.team_name}</div>
              </div>
            </div>

            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '18px',
                color: idx === 0 ? 'var(--amber)' : 'var(--chalk)',
              }}
            >
              {item.value} {unit && <span style={{ fontSize: '11px', color: 'var(--chalk-dim)' }}>{unit}</span>}
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '18px', color: 'var(--chalk-muted)', fontSize: '13px' }}>
            No stats recorded yet
          </div>
        )}
      </div>
    </div>
  );
}
