// Human dates for fixtures. The API sends 'YYYY-MM-DD' and 'HH:MM' strings (no time zone), so they are
// read as plain calendar values and never shifted by the viewer's time zone.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseDay(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dayDiff(day, now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((day - today) / 86400000);
}

/** "Today", "Tomorrow", "Yesterday", "Sat 28 Nov", or "28 Nov 2025" for another year. '' when unknown. */
export function formatDay(dateStr, now = new Date()) {
  const day = parseDay(dateStr);
  if (!day) return '';
  const diff = dayDiff(day, now);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const base = `${day.getDate()} ${MONTHS[day.getMonth()]}`;
  return day.getFullYear() === now.getFullYear() ? `${WEEKDAYS[day.getDay()]} ${base}` : `${base} ${day.getFullYear()}`;
}

/** "Today 18:30", "Sat 28 Nov · 16:00" style; the time is left out when the match has none. */
export function formatWhen(dateStr, timeStr, now = new Date()) {
  const day = formatDay(dateStr, now);
  if (!day) return timeStr || '';
  return timeStr ? `${day} ${timeStr}` : day;
}
