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
  sessionId?: string,
  /** Guided mode (src/guided): the tutor mode this session asked for. Omit to use the server default. */
  tutorMode?: string,
  /** Guided mode: slow | steady | quick. */
  pace?: string,
): string {
  const params = new URLSearchParams({
    topic,
    grade,
    ...(subjectId ? { subjectId } : {}),
    ...(conceptId ? { conceptId } : {}),
    ...(sessionId ? { sessionId } : { guest: '1' }),
    ...(tutorMode ? { mode: tutorMode } : {}),
    ...(pace ? { pace } : {}),
  });
  const queryString = params.toString();

  const explicit = (import.meta as any).env?.VITE_LIVE_WS_BASE as string | undefined;
  let base = explicit?.replace(/\/$/, '');

  if (!base && typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host.endsWith('.web.app') || host.endsWith('.firebaseapp.com')) {
      // Hosting rewrites have a 60-second request limit, so the voice WebSocket must connect straight to
      // Cloud Run. scripts/deploy-cloudrun.sh bakes that URL into the bundle at build time.
      throw new Error('VITE_LIVE_WS_BASE was not set when this bundle was built, so the voice tutor cannot connect. Rebuild with scripts/deploy-cloudrun.sh.');
    }
  }

  if (base) {
    const wsBase = base.replace(/^http/, 'ws');
    return `${wsBase}/ws/live?${queryString}`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/live?${queryString}`;
}
