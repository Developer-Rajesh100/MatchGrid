import { useEffect, useState } from 'react';

/** Re-renders the caller every `intervalMs`, returning the current time (for minute labels and countdowns).
 *  Pass 0 to stand still (nothing is live, so there is nothing to tick). */
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!intervalMs) return undefined;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
