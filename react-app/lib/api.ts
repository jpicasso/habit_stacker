/**
 * Thin client for the existing Habit Stacker Express API.
 * Same endpoints as the website: /api/habits, /api/account/delete
 */

export type Habit = {
  id: number;
  task: string;
  event_date: string | null;
  user_id: string | null;
};

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ||
  'https://www.habitstackerapp.com';

function authHeaders(token: string | null | undefined, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.details || body.error || res.statusText;
  } catch {
    return res.statusText || 'Request failed';
  }
}

export async function fetchHabits(token: string): Promise<Habit[]> {
  const res = await fetch(`${API_BASE}/api/habits`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createHabit(
  token: string,
  task: string,
  eventDate: string,
  userId: string
): Promise<Habit> {
  const res = await fetch(`${API_BASE}/api/habits`, {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ task, event_date: eventDate, user_id: userId }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function updateHabit(
  token: string,
  id: number,
  task: string,
  eventDate: string,
  userId: string
): Promise<Habit> {
  const res = await fetch(`${API_BASE}/api/habits/${id}`, {
    method: 'PUT',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ task, event_date: eventDate, user_id: userId }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteHabit(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/habits/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function deleteAccount(token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/account/delete`, {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export { API_BASE };
