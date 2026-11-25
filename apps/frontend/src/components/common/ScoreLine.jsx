import React from 'react';

/**
 * "2 – 1" in the tabular score face. Digits have fixed width, so a live score never shifts its layout.
 * `penaltyWinner` ('home' | 'away') adds the (P) mark beside the side that went through on penalties.
 */
export function ScoreLine({ home, away, size = 'md', penaltyWinner = null, muted = false, label = null, className = '' }) {
  const aria = label || `${home ?? 0} to ${away ?? 0}`;
  return (
    <span className={`score-line score-line--${size} ${muted ? 'score-line--muted' : ''} ${className}`.trim()} role="img" aria-label={aria}>
      <span className="score-line__n">{home ?? 0}</span>
      <span className="score-line__sep" aria-hidden="true">–</span>
      <span className="score-line__n">{away ?? 0}</span>
      {penaltyWinner && (
        <span className="score-line__pens" title="Won on penalties">
          (P){penaltyWinner === 'home' ? ' ◂' : ' ▸'}
        </span>
      )}
    </span>
  );
}

export default ScoreLine;
