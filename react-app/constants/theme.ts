/**
 * Brand + layout tokens for Habit Stacker.
 * Primary blue matches the existing website ($blue / theme-color).
 */
export const Colors = {
  primary: '#136bfb',
  primaryDark: '#095498',
  background: '#ffffff',
  surface: '#f7f8fa',
  text: '#1a1a1a',
  textMuted: '#6b7280',
  border: '#dee2e6',
  danger: '#DE5D51',
  white: '#ffffff',
  black: '#000000',
};

/** Streak row styles — same thresholds as the web habits.js */
export function getStreakStyle(daysKept: number): { backgroundColor: string; color: string } {
  if (daysKept >= 365) return { backgroundColor: '#000000', color: '#ffffff' };
  if (daysKept >= 100) return { backgroundColor: '#006600', color: '#ffffff' };
  if (daysKept >= 21) return { backgroundColor: '#00b300', color: '#ffffff' };
  if (daysKept >= 1) return { backgroundColor: '#80ff80', color: '#000000' };
  return { backgroundColor: '#ffffff', color: '#000000' };
}
