// Shared by AdminLiveControlPage and MatchDetailPage — was previously
// defined identically in both files (found during the Timer/Half-Time audit).
export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
