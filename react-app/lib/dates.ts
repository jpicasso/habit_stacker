/** YYYY-MM-DD for <input type="date"> / API (local timezone). */
export function todayInputValue(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Format as D-MMM-YY (e.g. 15-Feb-25). Uses T00:00:00 for stable local day. */
export function formatDateShort(dateString: string | null | undefined): string {
  if (!dateString) return 'Not set';
  const date = new Date(dateString + 'T00:00:00');
  const d = date.getDate();
  const mmm = date.toLocaleDateString('en-US', { month: 'short' });
  const yy = String(date.getFullYear()).slice(-2);
  return `${d}-${mmm}-${yy}`;
}

/** Whole days from start date to today (non-negative). */
export function daysSince(dateString: string | null | undefined): number {
  if (!dateString) return 0;
  const start = new Date(dateString + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : 0;
}
