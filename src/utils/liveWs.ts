/**
 * Construct the WebSocket URL for the Gemini Live voice session.
 *
 * Supports the dev server (same host), Firebase Hosting + Cloud Run,
 * and an explicit override via VITE_LIVE_WS_BASE.
 *
 * When subjectId and conceptId are provided they are appended as query
 * parameters so the server can load the curriculum intelligence context
 * and inject it into the Gemini system instruction.
 */
export function liveWebSocketUrl(
  topic: string,
  grade: string,
  subjectId?: string,
  conceptId?: string,
): string {
  const params = new URLSearchParams({
    topic,
    grade,
    ...(subjectId ? { subjectId } : {}),
    ...(conceptId ? { conceptId } : {}),
  });
  const queryString = params.toString();

  const explicit = (import.meta as any).env?.VITE_LIVE_WS_BASE as string | undefined;
  let base = explicit?.replace(/\/$/, '');

  if (!base && typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host.endsWith('.web.app') || host.endsWith('.firebaseapp.com')) {
      base = 'https://dr-marcus-live-45388528859.us-central1.run.app';
    }
  }

  if (base) {
    const wsBase = base.replace(/^http/, 'ws');
    return `${wsBase}/ws/live?${queryString}`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/live?${queryString}`;
}
