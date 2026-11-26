import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreLine } from './ScoreLine';
import { TeamMark } from './TeamMark';
import { EventIcon } from './EventIcon';
import { Skeleton, SkeletonCard, SkeletonRows } from './Skeleton';

describe('ScoreLine', () => {
  it('reads as a score to assistive tech and marks penalty winners', () => {
    const { rerender } = render(<ScoreLine home={2} away={1} />);
    expect(screen.getByRole('img', { name: '2 to 1' })).toBeInTheDocument();
    expect(screen.queryByText(/\(P\)/)).not.toBeInTheDocument();
    rerender(<ScoreLine home={1} away={1} penaltyWinner="away" />);
    expect(screen.getByText(/\(P\)/)).toBeInTheDocument();
  });

  it('shows zero rather than blank for a missing score', () => {
    render(<ScoreLine />);
    expect(screen.getByRole('img', { name: '0 to 0' })).toHaveTextContent('0–0');
  });
});

describe('TeamMark', () => {
  it('draws the team colour as a bar variable, not a tinted background', () => {
    const { container } = render(<TeamMark name="Cedar Park FC" color="#EF4444" sub="Group A" />);
    const mark = container.querySelector('.team-mark');
    expect(mark).toHaveClass('team-mark--bar');
    expect(mark.style.getPropertyValue('--team-color')).toBe('#EF4444');
    expect(mark.style.background).toBe('');
    expect(screen.getByText('Cedar Park FC')).toBeInTheDocument();
    expect(screen.getByText('Group A')).toBeInTheDocument();
  });

  it('falls back to TBD and a neutral bar for an unknown team', () => {
    const { container } = render(<TeamMark name={null} color="not-a-hex" />);
    expect(screen.getByText('TBD')).toBeInTheDocument();
    expect(container.querySelector('.team-mark').style.getPropertyValue('--team-color')).toBe('#64748B');
  });
});

describe('EventIcon', () => {
  it('labels every event type with an svg, never an emoji', () => {
    const { container } = render(
      <div>
        {['goal', 'yellow', 'red', 'potm'].map((t) => <EventIcon key={t} type={t} />)}
      </div>
    );
    expect(screen.getByRole('img', { name: 'Goal' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Yellow card' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Red card' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Player of the match' })).toBeInTheDocument();
    expect(container.querySelectorAll('svg')).toHaveLength(4);
    expect(container.textContent).toBe('');
  });
});

describe('Skeleton', () => {
  it('renders hidden placeholders inside a polite status region', () => {
    render(
      <>
        <SkeletonRows rows={3} label="Loading fixtures" />
        <SkeletonCard lines={2} label="Loading card" />
      </>
    );
    expect(screen.getByRole('status', { name: 'Loading fixtures' }).children).toHaveLength(3);
    expect(screen.getByRole('status', { name: 'Loading card' })).toBeInTheDocument();
    const { container } = render(<Skeleton circle width={20} height={20} />);
    expect(container.firstChild).toHaveClass('skeleton--circle');
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});
